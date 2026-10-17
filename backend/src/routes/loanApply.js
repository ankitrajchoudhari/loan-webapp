// Loan applications.
//   member : apply step by step (amount + months → EMI list, Aadhaar, PAN, bank), see status, cancel
//   staff  : (work area "loans") see applications, check each document, approve (creates the loan) or reject
// Interest terms always come from the admin's default settings, copied onto the application when applying.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, validate, moneyField, reasonField, blankToNull, dateField, isFutureDate, todayIST, iso, currentMonthYear, nextMonth } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { notifyStaffWith } from '../lib/notify.js';
import { can } from '../lib/staff.js';
import { emiFor, planNewLoan } from '../lib/loan.js';
import { createLoan } from '../lib/loans.js';
import { loadMember, loanPositions } from '../lib/ledger.js';
import { aadhaarValid, panValid, ifscValid, accountValid, lookupIfsc, decodePhoto, savePhoto, maskAadhaar, maskAccount, DOC_KINDS } from '../lib/kyc.js';

const router = Router();
const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const isMember = (req) => req.user?.role === 'member';
const isLoanStaff = (req) => req.user?.role === 'admin' && can(req.user, 'loans');
function requireMember(req) {
  if (!isMember(req)) throw new HttpError(403, 'forbidden');
  return req.user.id;
}
function requireLoanStaff(req) {
  if (!isLoanStaff(req)) throw new HttpError(403, 'forbidden');
}

/** The admin's default terms, as a loan-shaped object starting next month. */
async function defaultTerms() {
  const s = await getSettings();
  const { month, year } = currentMonthYear();
  const from = nextMonth(month, year);
  return {
    interestMethod: s.defaultInterestMethod,
    rateBp: s.defaultInterestMethod === 'fixed' ? 0 : s.defaultRateBp,
    ratePeriod: s.defaultRatePeriod,
    fixedInterestPaise: s.defaultInterestMethod === 'fixed' ? s.defaultFixedInterestPaise : 0,
    interestFromMonth: from.month,
    interestFromYear: from.year,
    maxPaise: s.loanApplyMaxPaise,
    maxMonths: s.loanApplyMaxMonths,
  };
}

/**
 * A new loan can be asked for only when every running loan is at least 80% repaid (principal).
 * Returns each running loan with how much is repaid, and how much more is needed to reach 80%.
 */
export const REPAID_NEEDED_PCT = 80;
async function eligibility(memberId) {
  const m = await loadMember(memberId);
  const { month, year } = currentMonthYear();
  const loans = loanPositions(m, month, year).filter((p) => !p.closed).map((p) => {
    const repaid = p.principalPaise - p.principalOutstandingPaise;
    const needed = Math.ceil((p.principalPaise * REPAID_NEEDED_PCT) / 100);
    return {
      loanNo: p.loanNo,
      principalPaise: p.principalPaise,
      repaidPaise: repaid,
      repaidPct: p.principalPaise ? Math.floor((repaid * 100) / p.principalPaise) : 100,
      morePaise: Math.max(0, needed - repaid),
    };
  });
  return { ok: loans.every((l) => l.morePaise === 0), neededPct: REPAID_NEEDED_PCT, loans };
}

/** EMI and month-by-month list for `amountPaise` over `months`, using the same maths as real loans. */
function plan(terms, amountPaise, months) {
  const loan = { ...terms, principalPaise: amountPaise, openingInterestPaise: 0, termMonths: months };
  const emi = emiFor(loan, months);
  const p = planNewLoan(loan, emi);
  return {
    emiPaise: emi,
    months: p.months ?? months,
    totalInterestPaise: p.totalInterest ?? 0,
    totalPayablePaise: p.totalPayable ?? amountPaise,
    rows: p.rows.map((r, i) => ({ n: i + 1, month: r.month, year: r.year, paymentPaise: r.payment, interestPaise: r.toInterest, principalPaise: r.toPrincipal, balancePaise: r.balance })),
  };
}

const amountMonths = (terms) => ({
  amountPaise: moneyField({ min: 100000, max: terms.maxPaise > 0 ? terms.maxPaise : 1_000_000_000 }), // at least ₹1,000
  months: z.coerce.number().int('months_invalid').min(1, 'months_invalid').max(terms.maxMonths, 'months_invalid'),
});

function docView(req, a, kind) {
  const d = a.documents?.[kind];
  if (!d) return null;
  return { status: d.status, note: d.note ?? null, checkedAt: d.checkedAt ?? null, url: `/loan-apply/${a.id}/doc/${kind}?v=${d.file.slice(-8)}` };
}

/** What the member / staff see. Staff with the loans work area see the full Aadhaar and account numbers. */
function view(req, a, { full = false } = {}) {
  const showFull = full && isLoanStaff(req);
  return {
    id: a.id,
    applicationNo: a.applicationNo,
    memberId: a.memberId,
    member: a.member ? { id: a.member.id, fullName: a.member.fullName, memberNo: a.member.memberNo, mobileNumber: a.member.mobileNumber } : undefined,
    amountPaise: a.amountPaise,
    months: a.months,
    interestMethod: a.interestMethod,
    rateBp: a.rateBp,
    ratePeriod: a.ratePeriod,
    fixedInterestPaise: a.fixedInterestPaise,
    emiPaise: a.emiPaise,
    totalInterestPaise: a.totalInterestPaise,
    purpose: a.purpose,
    aadhaar: showFull ? a.aadhaarNumber : maskAadhaar(a.aadhaarNumber),
    aadhaarChecksumOk: aadhaarValid(a.aadhaarNumber),
    pan: a.panNumber,
    panFormatOk: panValid(a.panNumber),
    bank: {
      name: a.bankName,
      branch: a.bankBranch,
      holder: a.accountHolder,
      account: showFull || isMember(req) ? a.accountNumber : maskAccount(a.accountNumber),
      ifsc: a.ifsc,
      ifscVerified: a.ifscVerified,
    },
    documents: Object.fromEntries(DOC_KINDS.map((k) => [k, docView(req, a, k)])),
    status: a.status,
    loanId: a.loanId,
    reviewedAt: a.reviewedAt,
    rejectReason: a.rejectReason,
    createdAt: a.createdAt,
  };
}

async function findApp(id) {
  const a = await prisma.loanApplication.findUnique({ where: { id }, include: { member: true } });
  if (!a) throw new HttpError(404, 'not_found');
  return a;
}

// --- Both ----------------------------------------------------------------------------------------

/** IFSC lookup for the bank step: fills bank name + branch. */
router.get('/ifsc/:code', async (req, res) => {
  if (!isMember(req) && !isLoanStaff(req)) throw new HttpError(403, 'forbidden');
  const code = String(req.params.code).toUpperCase();
  if (!ifscValid(code)) throw new HttpError(400, 'ifsc_invalid');
  const found = await lookupIfsc(code);
  if (found === null) throw new HttpError(404, 'ifsc_not_found');
  res.json({ ifsc: code, found: Boolean(found), ...(found ?? {}) });
});

/** Document photo: only the member who applied, or staff with the loans work area. */
router.get('/:id/doc/:kind', async (req, res) => {
  if (!DOC_KINDS.includes(req.params.kind)) throw new HttpError(404, 'not_found');
  const a = await prisma.loanApplication.findUnique({ where: { id: req.params.id } });
  if (!a || !(isLoanStaff(req) || (isMember(req) && a.memberId === req.user.id))) throw new HttpError(404, 'not_found');
  const d = a.documents?.[req.params.kind];
  if (!d) throw new HttpError(404, 'not_found');
  const doc = await prisma.loanDocument.findUnique({ where: { applicationId_kind: { applicationId: a.id, kind: req.params.kind } } });
  if (!doc) throw new HttpError(404, 'not_found');
  const buf = Buffer.from(doc.data);
  res.set({ 'Content-Type': doc.contentType, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  res.send(buf);
});

// --- Member --------------------------------------------------------------------------------------

/** Terms the member will get (from the admin's defaults) + limits. */
router.get('/terms', async (req, res) => {
  requireMember(req);
  const t = await defaultTerms();
  res.json({ terms: t, eligibility: await eligibility(req.user.id) });
});

/** EMI list for an amount and number of months (changes live as the member types). */
router.post('/plan', async (req, res) => {
  requireMember(req);
  const terms = await defaultTerms();
  const body = validate(z.object(amountMonths(terms)), req.body);
  res.json({ plan: plan(terms, body.amountPaise, body.months) });
});

router.get('/mine', async (req, res) => {
  const memberId = requireMember(req);
  const rows = await prisma.loanApplication.findMany({ where: { memberId }, include: { member: true }, orderBy: { createdAt: 'desc' }, take: 20 });
  res.json({ applications: rows.map((a) => view(req, a)) });
});

const photo = z.string().min(100, 'photo_required');

router.post('/', async (req, res) => {
  const memberId = requireMember(req);
  const terms = await defaultTerms();
  const body = validate(z.object({
    ...amountMonths(terms),
    purpose: blankToNull(z.string().trim().max(300)),
    aadhaarNumber: z.string().transform((v) => v.replace(/\s/g, '')).refine(aadhaarValid, 'aadhaar_invalid'),
    panNumber: z.string().trim().transform((v) => v.toUpperCase()).refine(panValid, 'pan_invalid'),
    bankName: z.string().trim().min(2, 'bank_required').max(120),
    accountHolder: z.string().trim().min(2, 'holder_required').max(100),
    accountNumber: z.string().transform((v) => v.replace(/\s/g, '')).refine(accountValid, 'account_invalid'),
    ifsc: z.string().trim().transform((v) => v.toUpperCase()).refine(ifscValid, 'ifsc_invalid'),
    photos: z.object({ aadhaarFront: photo, aadhaarBack: photo, pan: photo }),
    agree: z.literal(true, { message: 'agree_required' }),
  }), req.body);

  if (await prisma.loanApplication.findFirst({ where: { memberId, status: 'pending' } })) throw new HttpError(409, 'application_pending');
  const elig = await eligibility(memberId);
  if (!elig.ok) throw new HttpError(400, 'previous_loan_not_repaid', { pct: REPAID_NEEDED_PCT });
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  const photos = Object.fromEntries(DOC_KINDS.map((k) => [k, decodePhoto(body.photos[k])]));
  const ifscInfo = await lookupIfsc(body.ifsc);
  if (ifscInfo === null) throw new HttpError(400, 'validation', [{ field: 'ifsc', message: 'ifsc_not_found' }]);
  const p = plan(terms, body.amountPaise, body.months);

  const created = await prisma.$transaction(async (tx) => {
    const top = await tx.loanApplication.aggregate({ _max: { applicationNo: true } });
    const a = await tx.loanApplication.create({
      data: {
        applicationNo: (top._max.applicationNo ?? 0) + 1,
        memberId,
        amountPaise: body.amountPaise,
        months: body.months,
        interestMethod: terms.interestMethod,
        rateBp: terms.rateBp,
        ratePeriod: terms.ratePeriod,
        fixedInterestPaise: terms.fixedInterestPaise,
        emiPaise: p.emiPaise,
        totalInterestPaise: p.totalInterestPaise,
        purpose: body.purpose,
        aadhaarNumber: body.aadhaarNumber,
        panNumber: body.panNumber,
        bankName: ifscInfo?.bank || body.bankName,
        bankBranch: ifscInfo ? [ifscInfo.branch, ifscInfo.city].filter(Boolean).join(', ') : null,
        accountHolder: body.accountHolder,
        accountNumber: body.accountNumber,
        ifsc: body.ifsc,
        ifscVerified: Boolean(ifscInfo),
      },
    });
    const documents = {};
    for (const k of DOC_KINDS) documents[k] = { ...(await savePhoto(tx, a.id, k, photos[k])), status: 'pending' };
    const saved = await tx.loanApplication.update({ where: { id: a.id }, data: { documents } });
    await audit(req, { action: 'loan_applied', entity: 'loan_application', entityId: a.id, memberId, after: { applicationNo: a.applicationNo, amountPaise: a.amountPaise, months: a.months, emiPaise: a.emiPaise } }, tx);
    return saved;
  }).catch(async (e) => {
    if (e?.code === 'P2002') throw new HttpError(409, 'application_pending');
    throw e;
  });

  await notifyStaffWith('loans', {
    title: `📝 कर्ज़ का आवेदन #${created.applicationNo} — ${member.fullName}`,
    body: `${rupees(created.amountPaise)} · ${created.months} महीने · किस्त ${rupees(created.emiPaise)}। दस्तावेज़ जाँचकर मंज़ूर या अस्वीकार करें।`,
    link: `/admin/loan-applications/${created.id}`,
  }).catch(() => {});
  res.status(201).json({ application: view(req, created) });
});

router.post('/:id/cancel', async (req, res) => {
  const memberId = requireMember(req);
  const a = await prisma.loanApplication.findUnique({ where: { id: req.params.id } });
  if (!a || a.memberId !== memberId) throw new HttpError(404, 'not_found');
  if (a.status !== 'pending') throw new HttpError(400, 'application_closed');
  const u = await prisma.loanApplication.update({ where: { id: a.id }, data: { status: 'cancelled' } });
  await audit(req, { action: 'loan_application_cancelled', entity: 'loan_application', entityId: a.id, memberId });
  res.json({ application: view(req, u) });
});

// --- Staff ---------------------------------------------------------------------------------------

router.get('/', async (req, res) => {
  requireLoanStaff(req);
  const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  const rows = await prisma.loanApplication.findMany({ where: status ? { status } : {}, include: { member: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  const pending = await prisma.loanApplication.count({ where: { status: 'pending' } });
  res.json({ applications: rows.map((a) => view(req, a)), pending });
});

router.get('/:id', async (req, res) => {
  requireLoanStaff(req);
  const a = await findApp(req.params.id);
  const terms = { interestMethod: a.interestMethod, rateBp: a.rateBp, ratePeriod: a.ratePeriod, fixedInterestPaise: a.fixedInterestPaise };
  const from = nextMonth(currentMonthYear().month, currentMonthYear().year);
  res.json({ application: view(req, a, { full: true }), eligibility: await eligibility(a.memberId), plan: plan({ ...terms, interestFromMonth: from.month, interestFromYear: from.year }, a.amountPaise, a.months) });
});

/** Mark one document as checked (verified) or not acceptable (rejected, with a note the member sees). */
router.post('/:id/documents/:kind', async (req, res) => {
  requireLoanStaff(req);
  if (!DOC_KINDS.includes(req.params.kind)) throw new HttpError(404, 'not_found');
  const body = validate(z.object({ status: z.enum(['verified', 'rejected', 'pending']), note: blankToNull(z.string().trim().max(300)) }), req.body);
  if (body.status === 'rejected' && !body.note) throw new HttpError(400, 'validation', [{ field: 'note', message: 'reason_required' }]);
  const a = await findApp(req.params.id);
  if (a.status !== 'pending') throw new HttpError(400, 'application_closed');
  const documents = { ...a.documents, [req.params.kind]: { ...a.documents[req.params.kind], status: body.status, note: body.note, checkedAt: new Date().toISOString(), checkedById: req.user.id } };
  const u = await prisma.$transaction(async (tx) => {
    const x = await tx.loanApplication.update({ where: { id: a.id }, data: { documents }, include: { member: true } });
    await audit(req, { action: 'loan_document_checked', entity: 'loan_application', entityId: a.id, memberId: a.memberId, reason: body.note, after: { document: req.params.kind, status: body.status } }, tx);
    return x;
  });
  res.json({ application: view(req, u, { full: true }) });
});

/** Approve: every document must be verified; creates the loan with the applied terms and the EMI as its installment. */
router.post('/:id/approve', async (req, res) => {
  requireLoanStaff(req);
  const body = validate(z.object({ takenOn: dateField('taken_on_invalid').refine((v) => !isFutureDate(v), 'date_in_future').optional(), note: blankToNull(z.string().trim().max(500)) }), req.body);
  const a = await findApp(req.params.id);
  if (a.status !== 'pending') throw new HttpError(400, 'application_closed');
  if (a.member.status !== 'active') throw new HttpError(400, 'member_inactive');
  if (DOC_KINDS.some((k) => a.documents?.[k]?.status !== 'verified')) throw new HttpError(400, 'documents_not_verified');

  const u = await prisma.$transaction(async (tx) => {
    const loan = await createLoan(tx, a.member, {
      takenOn: body.takenOn ?? todayIST(),
      principalPaise: a.amountPaise,
      interestMethod: a.interestMethod,
      rateBp: a.rateBp,
      ratePeriod: a.ratePeriod,
      fixedInterestPaise: a.fixedInterestPaise,
      installmentPaise: a.emiPaise,
      termMonths: a.months,
      openingInterestPaise: 0,
      note: body.note ?? `ऑनलाइन आवेदन #${a.applicationNo} से (${a.months} महीने)`,
    });
    const x = await tx.loanApplication.update({ where: { id: a.id }, data: { status: 'approved', loanId: loan.id, reviewedById: req.user.id, reviewedAt: new Date() }, include: { member: true } });
    await audit(req, { action: 'loan_application_approved', entity: 'loan_application', entityId: a.id, memberId: a.memberId, after: { applicationNo: a.applicationNo, loanNo: loan.loanNo, amountPaise: a.amountPaise, takenOn: iso(loan.takenOn) } }, tx);
    return x;
  });
  res.json({ application: view(req, u, { full: true }) });
});

router.post('/:id/reject', async (req, res) => {
  requireLoanStaff(req);
  const body = validate(z.object({ reason: reasonField }), req.body);
  const a = await findApp(req.params.id);
  if (a.status !== 'pending') throw new HttpError(400, 'application_closed');
  const u = await prisma.$transaction(async (tx) => {
    const x = await tx.loanApplication.update({ where: { id: a.id }, data: { status: 'rejected', rejectReason: body.reason, reviewedById: req.user.id, reviewedAt: new Date() }, include: { member: true } });
    await audit(req, { action: 'loan_application_rejected', entity: 'loan_application', entityId: a.id, memberId: a.memberId, reason: body.reason }, tx);
    return x;
  });
  res.json({ application: view(req, u, { full: true }) });
});

export default router;

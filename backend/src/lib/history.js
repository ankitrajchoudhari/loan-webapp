// Historical records (spec §4.5): rows are entered or imported into a batch, checked against the
// old register, marked verified, and only then posted into the real records — all in one transaction.
import { prisma } from './db.js';
import { HttpError, toPaise, iso, ym, ymOfDate, parseDate } from './util.js';
import { installmentEntry, createInstallment } from './installments.js';
import { loanEntry, loanData, checkLoanTerms, createLoan, repaymentEntry, createRepayment } from './loans.js';
import { checkRepayment } from './loan.js';
import { installmentApplies } from './ledger.js';

export const KINDS = ['installment', 'loan', 'repayment'];

/** Fields per record type, in the order shown on screen and in the import column mapping. */
export const FIELDS = {
  installment: ['memberNo', 'month', 'year', 'amount', 'paidOn', 'method', 'note'],
  loan: ['memberNo', 'takenOn', 'principal', 'interestMethod', 'rate', 'ratePeriod', 'fixedInterest', 'interestFromMonth', 'interestFromYear', 'installment', 'openingInterest', 'note'],
  repayment: ['memberNo', 'loanNo', 'paidOn', 'total', 'principal', 'interest', 'method', 'note'],
};
export const REQUIRED = {
  installment: ['memberNo', 'month', 'year', 'amount', 'paidOn'],
  loan: ['memberNo', 'takenOn', 'principal', 'interestMethod'],
  repayment: ['memberNo', 'paidOn', 'total', 'principal', 'interest'],
};

// --- Normalising raw spreadsheet values ------------------------------------------------

const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const fold = (s) => String(s ?? '').trim().toLowerCase().normalize('NFC').replace(/़/g, ''); // ignore nukta

export function normMonth(v) {
  const s = fold(v);
  if (!s) return '';
  if (/^\d{1,2}$/.test(s)) return String(Number(s));
  const hi = HI_MONTHS.findIndex((m) => fold(m) === s || s.startsWith(fold(m)));
  if (hi >= 0) return String(hi + 1);
  const en = EN_MONTHS.findIndex((m) => s.startsWith(m));
  if (en >= 0) return String(en + 1);
  if (s === 'फरवरी') return '2';
  if (s === 'सितम्बर') return '9';
  if (s === 'नवम्बर') return '11';
  if (s === 'दिसम्बर') return '12';
  return String(v).trim();
}

/** DD/MM/YYYY, D-M-YYYY, DD.MM.YYYY, YYYY-MM-DD or a spreadsheet date → "YYYY-MM-DD". */
export function normDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

export function normMethod(v) {
  const s = fold(v);
  if (!s) return '';
  if (['cash', 'नकद', 'नगद', 'कैश'].some((x) => s.includes(x))) return 'cash';
  if (['upi', 'यूपीआई', 'phonepe', 'gpay', 'paytm', 'online', 'ऑनलाइन'].some((x) => s.includes(x))) return 'upi';
  if (['bank', 'बैंक', 'cheque', 'चेक', 'neft', 'rtgs', 'imps'].some((x) => s.includes(x))) return 'bank';
  return 'other';
}

export function normInterestMethod(v) {
  const s = fold(v);
  if (!s) return '';
  if (['reducing', 'घटत', 'बाकी', 'baki', 'remaining', 'diminishing'].some((x) => s.includes(x))) return 'reducing';
  if (['flat', 'फ्लैट', 'मूल', 'original', 'simple'].some((x) => s.includes(x))) return 'flat';
  if (['fixed', 'तय', 'निश्चित', 'fix'].some((x) => s.includes(x))) return 'fixed';
  return s;
}

const normPeriod = (v) => {
  const s = fold(v);
  if (!s) return '';
  return ['year', 'साल', 'वार्षिक', 'annual', 'yearly', 'p.a'].some((x) => s.includes(x)) ? 'year' : 'month';
};

const NORMALISERS = {
  month: normMonth, interestFromMonth: normMonth,
  paidOn: normDate, takenOn: normDate,
  method: normMethod, interestMethod: normInterestMethod, ratePeriod: normPeriod,
  rate: (v) => String(v ?? '').replace(/%/g, '').trim(),
};

/** Turns one row of raw values into a clean data object for the given record type. */
export function normaliseRow(kind, raw) {
  const out = {};
  for (const f of FIELDS[kind]) {
    const v = raw[f];
    if (v === undefined || v === null || v === '') continue;
    out[f] = NORMALISERS[f] ? NORMALISERS[f](v) : String(v).trim();
  }
  // "04/2023" or "अप्रैल 2023" in the month column, with no year column
  // (also when month and year were both mapped to that same column)
  if (kind === 'installment' && out.month) {
    const m = /^(.+?)[\s/-]+(\d{4})$/.exec(String(raw.month).trim());
    if (m && (!out.year || String(raw.year).trim() === String(raw.month).trim())) {
      out.month = normMonth(m[1]);
      out.year = m[2];
    }
  }
  return out;
}

// --- Checking rows -----------------------------------------------------------------------

const zodCodes = (r) => (r.success ? [] : [...new Set(r.error.issues.map((i) => (/^[a-z_]+$/.test(i.message) ? i.message : `${i.path[0]}_invalid`)))]);

/** Everything needed to check rows without hitting the database per row. */
export async function loadContext(batchId) {
  const [members, installments, loans, rows] = await Promise.all([
    prisma.member.findMany(),
    prisma.installment.findMany({ where: { voidedAt: null }, select: { memberId: true, month: true, year: true } }),
    prisma.loan.findMany({ where: { voidedAt: null }, include: { repayments: { where: { voidedAt: null } } } }),
    batchId ? prisma.historyRow.findMany({ where: { batchId }, orderBy: { lineNo: 'asc' } }) : [],
  ]);
  return {
    byNo: new Map(members.map((m) => [String(m.memberNo), m])),
    byMobile: new Map(members.map((m) => [m.mobileNumber, m])),
    instKeys: new Set(installments.map((i) => `${i.memberId}:${i.year}:${i.month}`)),
    loans,
    rows,
  };
}

function findMember(ctx, data) {
  const key = String(data.memberNo ?? '').trim();
  return ctx.byNo.get(key) ?? (/^\d{10}$/.test(key) ? ctx.byMobile.get(key) : undefined);
}

/**
 * Checks one row. `self` is the row's own id/lineNo (to skip it in duplicate checks).
 * Returns { errors, warnings, memberName, loanNo }.
 */
export function checkRow(ctx, kind, data, self = {}) {
  const errors = [];
  const warnings = [];
  for (const f of REQUIRED[kind]) if (data[f] === undefined || data[f] === '') errors.push(`missing_${f}`);
  const member = findMember(ctx, data);
  if (data.memberNo && !member) errors.push('member_not_found');
  const others = ctx.rows.filter((r) => r.id !== self.id && r.status !== 'posted');
  const sameMember = (r) => member && findMember(ctx, r.data)?.id === member.id;

  if (kind === 'installment') {
    const r = installmentEntry.safeParse({ ...data, memberId: member?.id ?? '00000000-0000-0000-0000-000000000000', amountPaise: data.amount });
    errors.push(...zodCodes(r).filter((c) => c !== 'member_required'));
    if (member && r.success) {
      const { month, year } = r.data;
      if (ym(year, month) < ymOfDate(member.joinDate)) errors.push('month_before_joining');
      else if (!installmentApplies(member, month, year)) errors.push('month_after_inactive');
      if (ctx.instKeys.has(`${member.id}:${year}:${month}`)) errors.push('installment_exists');
      if (others.some((o) => o.kind === 'installment' && sameMember(o) && Number(o.data.month) === month && Number(o.data.year) === year)) {
        errors.push('duplicate_in_batch');
      }
      if (r.data.amountPaise !== member.monthlyInstallmentPaise) warnings.push(r.data.amountPaise < member.monthlyInstallmentPaise ? 'amount_less_than_due' : 'amount_more_than_due');
    }
  }

  if (kind === 'loan') {
    const r = loanEntry.safeParse({
      ...data,
      memberId: member?.id ?? '00000000-0000-0000-0000-000000000000',
      principalPaise: data.principal, rateBp: data.rate, fixedInterestPaise: data.fixedInterest,
      installmentPaise: data.installment, openingInterestPaise: data.openingInterest,
    });
    errors.push(...zodCodes(r).filter((c) => c !== 'member_required'));
    if (member && r.success) {
      const d = loanData(r.data);
      errors.push(...checkLoanTerms(d));
      if (ctx.loans.some((l) => l.memberId === member.id && iso(l.takenOn) === iso(d.takenOn) && l.principalPaise === d.principalPaise)) errors.push('loan_exists');
      if (others.some((o) => o.kind === 'loan' && sameMember(o) && o.data.takenOn === data.takenOn && toPaise(o.data.principal) === d.principalPaise)) errors.push('duplicate_in_batch');
    }
  }

  let loanNo = null;
  if (kind === 'repayment') {
    const r = repaymentEntry.safeParse({
      ...data, loanId: '00000000-0000-0000-0000-000000000000',
      totalPaise: data.total, principalPaise: data.principal, interestPaise: data.interest,
    });
    errors.push(...zodCodes(r).filter((c) => c !== 'loan_required'));
    if (r.success && r.data.principalPaise + r.data.interestPaise !== r.data.totalPaise) errors.push('split_mismatch');
    if (member && r.success) {
      const existing = ctx.loans.filter((l) => l.memberId === member.id);
      const inBatch = others.filter((o) => o.kind === 'loan' && sameMember(o));
      let loan = null;
      if (data.loanNo) {
        loan = existing.find((l) => String(l.loanNo) === String(data.loanNo));
        if (!loan) errors.push('loan_not_found');
      } else if (existing.length + inBatch.length === 1) {
        loan = existing[0] ?? null; // null → the loan is in this batch, checked when posting
      } else {
        errors.push(existing.length + inBatch.length ? 'loan_ambiguous' : 'loan_not_found');
      }
      if (loan) {
        loanNo = loan.loanNo;
        const c = checkRepayment(loan, loan.repayments, { ...r.data, paidOn: parseDate(r.data.paidOn) });
        errors.push(...c.errors.filter((e) => e !== 'split_mismatch'));
        warnings.push(...c.warnings);
        const dupInBatch = others.some((o) => o.kind === 'repayment' && sameMember(o) && o.data.paidOn === data.paidOn && toPaise(o.data.total) === r.data.totalPaise);
        if (dupInBatch) warnings.push('possible_duplicate');
      }
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], memberName: member?.fullName ?? null, memberId: member?.id ?? null, loanNo };
}

// --- Posting --------------------------------------------------------------------------------

/**
 * Saves every verified row of a batch into the real tables in one transaction.
 * Order: loans → installments → repayments (oldest first), so repayments can find loans
 * created in the same batch. If any row fails, nothing is saved.
 */
export async function postBatch(tx, batchId, audit) {
  const rows = await tx.historyRow.findMany({ where: { batchId, status: 'verified' }, orderBy: { lineNo: 'asc' } });
  if (!rows.length) throw new HttpError(400, 'nothing_verified');
  const members = await tx.member.findMany();
  const byNo = new Map(members.map((m) => [String(m.memberNo), m]));
  const byMobile = new Map(members.map((m) => [m.mobileNumber, m]));
  const memberOf = (d) => byNo.get(String(d.memberNo).trim()) ?? byMobile.get(String(d.memberNo).trim());

  const order = { loan: 0, installment: 1, repayment: 2 };
  rows.sort((a, b) => order[a.kind] - order[b.kind] || String(a.data.paidOn ?? '').localeCompare(String(b.data.paidOn ?? '')) || a.lineNo - b.lineNo);

  const failures = [];
  const posted = { installment: 0, loan: 0, repayment: 0 };
  for (const row of rows) {
    const d = row.data;
    const member = memberOf(d);
    try {
      if (!member) throw new HttpError(400, 'member_not_found');
      let created;
      if (row.kind === 'installment') {
        const entry = installmentEntry.parse({ ...d, memberId: member.id, amountPaise: d.amount });
        created = await createInstallment(tx, member, entry, { source: 'history', batchId });
      } else if (row.kind === 'loan') {
        const entry = loanEntry.parse({
          ...d, memberId: member.id, principalPaise: d.principal, rateBp: d.rate, fixedInterestPaise: d.fixedInterest,
          installmentPaise: d.installment, openingInterestPaise: d.openingInterest,
        });
        created = await createLoan(tx, member, entry, { source: 'history', batchId });
      } else {
        const loans = await tx.loan.findMany({ where: { memberId: member.id, voidedAt: null } });
        const loan = d.loanNo ? loans.find((l) => String(l.loanNo) === String(d.loanNo)) : loans.length === 1 ? loans[0] : null;
        if (!loan) throw new HttpError(400, loans.length ? 'loan_ambiguous' : 'loan_not_found');
        const entry = repaymentEntry.parse({ ...d, loanId: loan.id, totalPaise: d.total, principalPaise: d.principal, interestPaise: d.interest });
        created = await createRepayment(tx, loan, entry, { source: 'history', batchId, allowDuplicate: true });
      }
      await tx.historyRow.update({ where: { id: row.id }, data: { status: 'posted', postedId: created.id } });
      await audit({ action: `history_${row.kind}_posted`, entity: row.kind, entityId: created.id, memberId: member.id, after: { batchId, lineNo: row.lineNo, ...d } });
      posted[row.kind]++;
    } catch (err) {
      failures.push({ lineNo: row.lineNo, code: err.code ?? err.issues?.[0]?.message ?? 'invalid' });
    }
  }
  if (failures.length) throw new HttpError(400, 'post_failed', { failures });
  return posted;
}

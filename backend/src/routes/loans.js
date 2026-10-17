import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, validate, parseDate, reasonField, ym, ymOfDate, currentMonthYear, iso, todayIST } from '../lib/util.js';
import { audit, changes } from '../lib/audit.js';
import { publicMember } from '../lib/ledger.js';
import { maskActors } from '../lib/notify.js';
import { loanLedger, loanPosition, checkRepayment, suggestSplit, interestForMonth, repaymentView, loanInsights, emiFor, planNewLoan } from '../lib/loan.js';
import {
  loanEntry, loanTermFields, loanData, checkLoanTerms, loanRow, createLoan,
  repaymentFields, createRepayment, positionsAround,
} from '../lib/loans.js';

export const loans = Router(); // mounted behind requireAdmin
export const repayments = Router(); // mounted behind requireAdmin

const nowK = () => {
  const n = currentMonthYear();
  return ym(n.year, n.month);
};

async function getLoan(id) {
  const loan = await prisma.loan.findUnique({ where: { id }, include: { member: true, repayments: { orderBy: { paidOn: 'asc' } } } });
  if (!loan) throw new HttpError(404, 'loan_not_found');
  return loan;
}

const liveReps = (loan) => loan.repayments.filter((r) => !r.voidedAt);

function loanSummary(loan, { withPlan = false } = {}) {
  const k = Math.max(nowK(), ymOfDate(loan.takenOn));
  const insights = loanInsights(loan, liveReps(loan), k);
  if (!withPlan) insights.plan = { ...insights.plan, rows: undefined };
  return { ...loanRow(loan), member: publicMember(loan.member), position: loanPosition(loan, liveReps(loan), k), insights };
}

loans.get('/', async (req, res) => {
  const where = { voidedAt: null, ...(req.query.memberId ? { memberId: String(req.query.memberId) } : {}) };
  const rows = await prisma.loan.findMany({ where, include: { member: true, repayments: { where: { voidedAt: null } } }, orderBy: { loanNo: 'desc' } });
  let list = rows.map(loanSummary);
  if (req.query.status === 'active') list = list.filter((l) => !l.position.closed);
  if (req.query.status === 'closed') list = list.filter((l) => l.position.closed);
  res.json({ loans: list });
});

/** Shows the terms in words and the first interest amounts before a loan is saved. */
loans.post('/preview', async (req, res) => {
  const entry = validate(loanEntry, req.body);
  const member = await prisma.member.findUnique({ where: { id: entry.memberId } });
  if (!member) throw new HttpError(404, 'member_not_found');
  const data = loanData(entry);
  const errors = checkLoanTerms(data);
  if (iso(data.takenOn) < iso(member.joinDate)) errors.push('loan_before_joining');
  const firstMonthInterestPaise = interestForMonth(data, data.principalPaise);
  const plan = data.installmentPaise > 0 ? planNewLoan(data, data.installmentPaise) : null;
  if (plan && !plan.feasible) errors.push('installment_too_low');
  res.json({ member: publicMember(member), loan: { ...data, takenOn: iso(data.takenOn) }, firstMonthInterestPaise, plan, errors });
});

/**
 * Loan calculator (bank style): give the amount, rate and method, plus either the number of months
 * (→ EMI is worked out) or the monthly installment (→ number of months is worked out).
 * Returns the EMI, the month-by-month schedule, total interest and payoff month. Nothing is saved.
 */
loans.post('/calculator', async (req, res) => {
  const body = validate(z.object({
    principalPaise: loanTermFields.principalPaise,
    interestMethod: loanTermFields.interestMethod,
    rateBp: loanTermFields.rateBp,
    ratePeriod: loanTermFields.ratePeriod,
    fixedInterestPaise: loanTermFields.fixedInterestPaise,
    takenOn: loanTermFields.takenOn.optional(),
    months: z.coerce.number().int().min(1, 'months_invalid').max(360, 'months_invalid').optional().or(z.literal('').transform(() => undefined)),
    installmentPaise: loanTermFields.installmentPaise,
  }), req.body);
  const data = loanData({ ...body, takenOn: body.takenOn ?? todayIST(), openingInterestPaise: 0, note: null });
  const errors = checkLoanTerms(data);
  if (errors.length) throw new HttpError(400, errors[0], { errors });
  const emi = body.months ? emiFor(data, body.months) : null;
  const installment = emi ?? body.installmentPaise;
  if (!installment) throw new HttpError(400, 'months_or_installment');
  const plan = planNewLoan(data, installment);
  res.json({ emiPaise: emi, installmentPaise: installment, firstMonthInterestPaise: interestForMonth(data, data.principalPaise), plan });
});

loans.post('/', async (req, res) => {
  const entry = validate(loanEntry, req.body);
  const member = await prisma.member.findUnique({ where: { id: entry.memberId } });
  if (member?.status !== 'active') throw new HttpError(400, 'member_inactive');
  const loan = await prisma.$transaction(async (tx) => {
    const l = await createLoan(tx, member, entry);
    await audit(req, { action: 'loan_added', entity: 'loan', entityId: l.id, memberId: member.id, after: loanRow(l) }, tx);
    return l;
  });
  res.status(201).json({ loan: loanRow(loan) });
});

/** Full loan account: terms, month-by-month ledger, every repayment (cancelled ones too), change history. */
loans.get('/:id', async (req, res) => {
  const loan = await getLoan(req.params.id);
  const k = Math.max(nowK(), ymOfDate(loan.takenOn));
  const ledger = loanLedger(loan, liveReps(loan), k);
  const history = await prisma.auditLog.findMany({
    where: { OR: [{ entity: 'loan', entityId: loan.id }, { entity: 'repayment', entityId: { in: loan.repayments.map((r) => r.id) } }] },
    orderBy: { at: 'desc' },
  });
  res.json({
    loan: loanSummary(loan, { withPlan: true }),
    ledger: ledger.rows.reverse(),
    repayments: loan.repayments.map(repaymentView).reverse(),
    history: maskActors(history, req.user),
  });
});

/** Change loan terms. Reason required; ?preview=1 shows the balances before and after. */
loans.put('/:id', async (req, res) => {
  const body = validate(z.object({ ...loanTermFields, reason: reasonField }), req.body);
  const loan = await getLoan(req.params.id);
  if (loan.voidedAt) throw new HttpError(404, 'loan_not_found');
  const data = loanData(body);
  const errors = checkLoanTerms(data, loan.repayments);
  const next = { ...loan, ...data };
  const effect = positionsAround(loan, liveReps(loan), liveReps(loan), next);
  if (req.query.preview === '1') return res.json({ ...effect, errors, changes: changes(loan, data) });
  if (errors.length) throw new HttpError(400, errors[0], { errors });

  const u = await prisma.$transaction(async (tx) => {
    const row = await tx.loan.update({ where: { id: loan.id }, data });
    await audit(req, {
      action: 'loan_terms_changed', entity: 'loan', entityId: loan.id, memberId: loan.memberId, reason: body.reason,
      before: loanRow(loan), after: { changes: changes(loan, data), balancesBefore: pick(effect.before), balancesAfter: pick(effect.after) },
    }, tx);
    return row;
  });
  res.json({ loan: loanRow(u) });
});

const pick = (p) => p && { principalOutstandingPaise: p.principalOutstandingPaise, interestOutstandingPaise: p.interestOutstandingPaise, totalOutstandingPaise: p.totalOutstandingPaise };

/**
 * Cancels a loan entered by mistake. If repayments were recorded on it, they must be cancelled too:
 * the screen says how many and asks again (withRepayments: true), then both are cancelled together.
 */
loans.post('/:id/void', async (req, res) => {
  const body = validate(z.object({ reason: reasonField, withRepayments: z.boolean().optional() }), req.body);
  const loan = await getLoan(req.params.id);
  if (loan.voidedAt) throw new HttpError(404, 'loan_not_found');
  const reps = liveReps(loan);
  if (reps.length && !body.withRepayments) {
    throw new HttpError(400, 'loan_has_repayments', { count: reps.length, amount: reps.reduce((s, r) => s + r.totalPaise, 0) });
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (reps.length) {
      await tx.loanRepayment.updateMany({ where: { id: { in: reps.map((r) => r.id) } }, data: { voidedAt: now, voidReason: `कर्ज रद्द: ${body.reason}` } });
    }
    await tx.loan.update({ where: { id: loan.id }, data: { voidedAt: now, voidReason: body.reason } });
    // a loan made from an online application: the application shows it was cancelled
    await tx.loanApplication.updateMany({ where: { loanId: loan.id, status: 'approved' }, data: { status: 'cancelled', rejectReason: body.reason } });
    await audit(req, { action: 'loan_voided', entity: 'loan', entityId: loan.id, memberId: loan.memberId, reason: body.reason, before: loanRow(loan), after: { repaymentsCancelled: reps.length } }, tx);
  });
  res.json({ ok: true, repaymentsCancelled: reps.length });
});

// --- Repayments ------------------------------------------------------------------------

/** "Interest first, rest to principal" split for a total, as of the payment date. */
loans.post('/:id/split', async (req, res) => {
  const body = validate(z.object({ paidOn: repaymentFields.paidOn, totalPaise: repaymentFields.totalPaise }), req.body);
  const loan = await getLoan(req.params.id);
  res.json(suggestSplit(loan, liveReps(loan), parseDate(body.paidOn), body.totalPaise));
});

loans.post('/:id/repayments/preview', async (req, res) => {
  const entry = validate(z.object(repaymentFields), req.body);
  const loan = await getLoan(req.params.id);
  const reps = liveReps(loan);
  const draft = { ...entry, id: 'new', paidOn: parseDate(entry.paidOn) };
  const check = checkRepayment(loan, reps, draft);
  res.json({ member: publicMember(loan.member), loan: loanRow(loan), entry, ...check, ...positionsAround(loan, reps, [...reps, draft]) });
});

loans.post('/:id/repayments', async (req, res) => {
  const body = validate(z.object({ ...repaymentFields, confirmDuplicate: z.boolean().optional() }), req.body);
  const loan = await getLoan(req.params.id);
  const saved = await prisma.$transaction(async (tx) => {
    const r = await createRepayment(tx, loan, body, { allowDuplicate: body.confirmDuplicate === true });
    await audit(req, { action: 'repayment_added', entity: 'repayment', entityId: r.id, memberId: loan.memberId, after: { loanNo: loan.loanNo, ...repaymentView(r) } }, tx);
    return r;
  });
  const fresh = await getLoan(loan.id);
  res.status(201).json({ repayment: repaymentView(saved), loan: loanSummary(fresh) });
});

/** Correct a repayment. Reason required; ?preview=1 shows balances before and after. */
repayments.put('/:id', async (req, res) => {
  const body = validate(z.object({ ...repaymentFields, reason: reasonField }), req.body);
  const before = await prisma.loanRepayment.findUnique({ where: { id: req.params.id } });
  if (!before || before.voidedAt) throw new HttpError(404, 'not_found');
  const loan = await getLoan(before.loanId);
  const others = liveReps(loan).filter((r) => r.id !== before.id);
  const draft = { ...body, id: before.id, paidOn: parseDate(body.paidOn) };
  const check = checkRepayment(loan, others, draft);
  check.warnings = check.warnings.filter((w) => w !== 'possible_duplicate');
  const effect = positionsAround(loan, liveReps(loan), [...others, draft]);
  if (req.query.preview === '1') return res.json({ before: repaymentView(before), after: { ...body }, ...check, ...effect });
  if (check.errors.length) throw new HttpError(400, check.errors[0], check);

  const u = await prisma.$transaction(async (tx) => {
    const row = await tx.loanRepayment.update({
      where: { id: before.id },
      data: { paidOn: draft.paidOn, totalPaise: body.totalPaise, principalPaise: body.principalPaise, interestPaise: body.interestPaise, method: body.method, note: body.note },
    });
    await audit(req, {
      action: 'repayment_corrected', entity: 'repayment', entityId: row.id, memberId: loan.memberId, reason: body.reason,
      before: { loanNo: loan.loanNo, ...repaymentView(before), balances: pick(effect.before) },
      after: { loanNo: loan.loanNo, ...repaymentView(row), balances: pick(effect.after) },
    }, tx);
    return row;
  });
  res.json({ repayment: repaymentView(u) });
});

repayments.post('/:id/void', async (req, res) => {
  const body = validate(z.object({ reason: reasonField }), req.body);
  const before = await prisma.loanRepayment.findUnique({ where: { id: req.params.id } });
  if (!before || before.voidedAt) throw new HttpError(404, 'not_found');
  const loan = await getLoan(before.loanId);
  const effect = positionsAround(loan, liveReps(loan), liveReps(loan).filter((r) => r.id !== before.id));
  if (req.query.preview === '1') return res.json(effect);
  await prisma.$transaction(async (tx) => {
    await tx.loanRepayment.update({ where: { id: before.id }, data: { voidedAt: new Date(), voidReason: body.reason } });
    await audit(req, {
      action: 'repayment_voided', entity: 'repayment', entityId: before.id, memberId: loan.memberId, reason: body.reason,
      before: { loanNo: loan.loanNo, ...repaymentView(before), balances: pick(effect.before) }, after: { balances: pick(effect.after) },
    }, tx);
  });
  res.json({ ok: true });
});

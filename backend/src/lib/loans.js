// Write-side loan logic, shared by the loan screens and historical posting.
import { z } from 'zod';
import { HttpError, moneyField, dateField, monthField, yearField, blankToNull, parseDate, isFutureDate, toBp, ym, ymOfDate, iso, currentMonthYear } from './util.js';
import { METHODS } from './installments.js';
import { checkRepayment, defaultInterestFrom, loanPosition, repaymentView } from './loan.js';

const rateField = z.any().transform((v, ctx) => {
  const bp = toBp(v);
  if (bp === null) return 0;
  if (Number.isNaN(bp) || bp > 10000) {
    ctx.addIssue({ code: 'custom', message: 'rate_invalid' });
    return z.NEVER;
  }
  return bp;
});

export const loanTermFields = {
  takenOn: dateField('taken_on_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  principalPaise: moneyField({ min: 100, max: 1_000_000_000 }), // up to ₹1 crore
  interestMethod: z.enum(['reducing', 'flat', 'fixed'], { message: 'method_required' }),
  rateBp: rateField,
  ratePeriod: z.enum(['month', 'year']).default('month'),
  fixedInterestPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
  interestFromMonth: monthField.optional().or(z.literal('').transform(() => undefined)),
  interestFromYear: yearField.optional().or(z.literal('').transform(() => undefined)),
  installmentPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
  openingInterestPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
  note: blankToNull(z.string().trim().max(500)),
};

export const loanEntry = z.object({ memberId: z.string().uuid('member_required'), ...loanTermFields });

/** Normalise a validated loan entry into DB columns, filling the default "interest from" month. */
export function loanData(entry) {
  const takenOn = parseDate(entry.takenOn);
  const from = entry.interestFromMonth && entry.interestFromYear
    ? { month: entry.interestFromMonth, year: entry.interestFromYear }
    : defaultInterestFrom(takenOn);
  return {
    takenOn,
    principalPaise: entry.principalPaise,
    interestMethod: entry.interestMethod,
    rateBp: entry.interestMethod === 'fixed' ? 0 : entry.rateBp,
    ratePeriod: entry.ratePeriod ?? 'month',
    fixedInterestPaise: entry.interestMethod === 'fixed' ? entry.fixedInterestPaise : 0,
    interestFromMonth: from.month,
    interestFromYear: from.year,
    installmentPaise: entry.installmentPaise ?? 0,
    openingInterestPaise: entry.openingInterestPaise ?? 0,
    note: entry.note ?? null,
  };
}

export function checkLoanTerms(data, repayments = []) {
  const errors = [];
  if (data.interestMethod !== 'fixed' && data.rateBp <= 0) errors.push('rate_required');
  if (data.interestMethod === 'fixed' && data.fixedInterestPaise <= 0) errors.push('fixed_interest_required');
  if (ym(data.interestFromYear, data.interestFromMonth) < ymOfDate(data.takenOn)) errors.push('interest_from_before_loan');
  const live = repayments.filter((r) => !r.voidedAt);
  if (live.some((r) => iso(r.paidOn) < iso(data.takenOn))) errors.push('repayment_before_loan');
  if (live.reduce((s, r) => s + r.principalPaise, 0) > data.principalPaise) errors.push('principal_less_than_repaid');
  return errors;
}

export function loanRow(l) {
  return {
    id: l.id,
    loanNo: l.loanNo,
    memberId: l.memberId,
    takenOn: iso(l.takenOn),
    principalPaise: l.principalPaise,
    interestMethod: l.interestMethod,
    rateBp: l.rateBp,
    ratePeriod: l.ratePeriod,
    fixedInterestPaise: l.fixedInterestPaise,
    interestFromMonth: l.interestFromMonth,
    interestFromYear: l.interestFromYear,
    installmentPaise: l.installmentPaise,
    openingInterestPaise: l.openingInterestPaise,
    note: l.note,
    source: l.source,
    voided: Boolean(l.voidedAt),
    voidReason: l.voidReason,
  };
}

export async function nextLoanNo(tx) {
  const top = await tx.loan.aggregate({ _max: { loanNo: true } });
  return (top._max.loanNo ?? 0) + 1;
}

export async function createLoan(tx, member, entry, { source = 'entry', batchId = null } = {}) {
  if (!member) throw new HttpError(404, 'member_not_found');
  const data = loanData(entry);
  if (iso(data.takenOn) < iso(member.joinDate) && source === 'entry') {
    // old loans from before joining are allowed only through historical entry
    throw new HttpError(400, 'loan_before_joining');
  }
  const errors = checkLoanTerms(data);
  if (errors.length) throw new HttpError(400, errors[0], { errors });
  const dup = await tx.loan.findFirst({
    where: { memberId: member.id, takenOn: data.takenOn, principalPaise: data.principalPaise, voidedAt: null },
  });
  if (dup && source === 'history') throw new HttpError(409, 'loan_exists', { loanNo: dup.loanNo });
  return tx.loan.create({ data: { ...data, memberId: member.id, loanNo: await nextLoanNo(tx), source, batchId } });
}

// --- Repayments ----------------------------------------------------------------------

export const repaymentFields = {
  paidOn: dateField('paid_on_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  totalPaise: moneyField({ min: 1 }),
  principalPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
  interestPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
  method: blankToNull(z.enum(METHODS)),
  note: blankToNull(z.string().trim().max(500)),
};

export const repaymentEntry = z.object({ loanId: z.string().uuid('loan_required'), ...repaymentFields });

/** Position of the loan now, with and without a change — so the admin sees the effect before saving. */
export function positionsAround(loan, currentRepayments, nextRepayments, nextLoan = loan) {
  const now = currentMonthYear();
  const k = Math.max(ym(now.year, now.month), ymOfDate(loan.takenOn), ymOfDate(nextLoan.takenOn));
  return {
    before: loanPosition(loan, currentRepayments, k),
    after: loanPosition(nextLoan, nextRepayments, k),
  };
}

export async function createRepayment(tx, loan, entry, { source = 'entry', batchId = null, allowDuplicate = false } = {}) {
  if (!loan || loan.voidedAt) throw new HttpError(404, 'loan_not_found');
  const others = await tx.loanRepayment.findMany({ where: { loanId: loan.id, voidedAt: null } });
  const check = checkRepayment(loan, others, { ...entry, paidOn: parseDate(entry.paidOn) });
  if (check.errors.length) throw new HttpError(400, check.errors[0], check);
  if (check.warnings.includes('possible_duplicate') && !allowDuplicate) throw new HttpError(409, 'possible_duplicate', check);
  return tx.loanRepayment.create({
    data: {
      loanId: loan.id,
      paidOn: parseDate(entry.paidOn),
      totalPaise: entry.totalPaise,
      principalPaise: entry.principalPaise,
      interestPaise: entry.interestPaise,
      method: entry.method ?? null,
      note: entry.note ?? null,
      source,
      batchId,
    },
  });
}

export { repaymentView };

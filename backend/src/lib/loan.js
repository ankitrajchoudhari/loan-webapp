// Loan ledger — principal and interest are tracked separately, all in integer paise.
//
// Interest is charged once per month, from the loan's "interest from" month onwards:
//   reducing : rate% × principal still outstanding at the start of that month
//   flat     : rate% × original principal, every month while any principal is outstanding
//   fixed    : a fixed amount every month while any principal is outstanding
// A yearly rate is divided by 12. A repayment's principal part lowers the balance from the next month.
//
//   interest outstanding  = opening interest + interest charged so far − interest paid so far
//   principal outstanding = principal − principal paid so far
import { pctOf, ym, ymOfDate, fromYm, iso } from './util.js';

const live = (rows) => rows.filter((r) => !r.voidedAt);

/** Interest charged in one month, given the principal outstanding at the start of it. */
export function interestForMonth(loan, openingPrincipal) {
  if (openingPrincipal <= 0) return 0;
  const divisor = loan.ratePeriod === 'year' ? 12 : 1;
  switch (loan.interestMethod) {
    case 'reducing':
      return pctOf(openingPrincipal, loan.rateBp, divisor);
    case 'flat':
      return pctOf(loan.principalPaise, loan.rateBp, divisor);
    case 'fixed':
      return loan.fixedInterestPaise;
    default:
      throw new Error(`Unknown interest method ${loan.interestMethod}`);
  }
}

export const interestStartYm = (loan) => ym(loan.interestFromYear, loan.interestFromMonth);

/**
 * Month-by-month ledger from the month the loan was taken up to `asOfYm` (inclusive).
 * Each row: opening principal, interest charged, principal/interest paid in that month, closing balances.
 */
export function loanLedger(loan, repayments, asOfYm) {
  const pays = live(repayments)
    .map((r) => ({ ...r, k: ymOfDate(r.paidOn) }))
    .sort((a, b) => a.k - b.k || new Date(a.paidOn) - new Date(b.paidOn));
  const startK = ymOfDate(loan.takenOn);
  const fromK = interestStartYm(loan);
  const rows = [];

  let principalLeft = loan.principalPaise;
  let interestDue = loan.openingInterestPaise;
  let totalCharged = 0;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;

  for (let k = startK; k <= asOfYm; k++) {
    const opening = principalLeft;
    const charged = k >= fromK ? interestForMonth(loan, opening) : 0;
    const inMonth = pays.filter((p) => p.k === k);
    const pPaid = inMonth.reduce((s, p) => s + p.principalPaise, 0);
    const iPaid = inMonth.reduce((s, p) => s + p.interestPaise, 0);

    principalLeft -= pPaid;
    interestDue += charged - iPaid;
    totalCharged += charged;
    totalPrincipalPaid += pPaid;
    totalInterestPaid += iPaid;

    rows.push({
      ...fromYm(k),
      openingPrincipal: opening,
      interestCharged: charged,
      principalPaid: pPaid,
      interestPaid: iPaid,
      payments: inMonth.map(repaymentView),
      closingPrincipal: principalLeft,
      interestDue,
    });
  }

  return {
    rows,
    totals: {
      interestCharged: totalCharged,
      principalPaid: totalPrincipalPaid,
      interestPaid: totalInterestPaid,
      principalOutstanding: principalLeft,
      interestOutstanding: interestDue,
      totalOutstanding: principalLeft + interestDue,
    },
  };
}

export function repaymentView(r) {
  return {
    id: r.id,
    paidOn: iso(r.paidOn),
    totalPaise: r.totalPaise,
    principalPaise: r.principalPaise,
    interestPaise: r.interestPaise,
    method: r.method,
    note: r.note,
    source: r.source,
    voided: Boolean(r.voidedAt),
    voidReason: r.voidReason ?? null,
  };
}

/**
 * Loan position as of the end of month `asOfYm`: the figures shown on statements.
 * Loans taken after asOfYm return null (they did not exist yet).
 */
export function loanPosition(loan, repayments, asOfYm) {
  if (ymOfDate(loan.takenOn) > asOfYm) return null;
  const { rows, totals } = loanLedger(loan, repayments, asOfYm);
  const month = rows.at(-1);
  return {
    loanId: loan.id,
    loanNo: loan.loanNo,
    takenOn: iso(loan.takenOn),
    principalPaise: loan.principalPaise,
    interestMethod: loan.interestMethod,
    rateBp: loan.rateBp,
    ratePeriod: loan.ratePeriod,
    fixedInterestPaise: loan.fixedInterestPaise,
    installmentPaise: loan.installmentPaise,
    openingInterestPaise: loan.openingInterestPaise,
    interestFrom: { month: loan.interestFromMonth, year: loan.interestFromYear },
    // this month
    monthInterestPaise: month.interestCharged,
    monthPrincipalPaidPaise: month.principalPaid,
    monthInterestPaidPaise: month.interestPaid,
    monthPaidPaise: month.principalPaid + month.interestPaid,
    monthPayments: month.payments,
    // to date
    principalPaidPaise: totals.principalPaid,
    interestPaidPaise: totals.interestPaid,
    interestChargedPaise: totals.interestCharged,
    principalOutstandingPaise: totals.principalOutstanding,
    interestOutstandingPaise: totals.interestOutstanding,
    totalOutstandingPaise: totals.totalOutstanding,
    // what next month's interest would be on today's balance
    nextMonthInterestPaise: interestForMonth(loan, totals.principalOutstanding),
    closed: totals.principalOutstanding <= 0 && totals.interestOutstanding <= 0,
  };
}

/**
 * Checks a repayment against the loan before it is saved.
 * `others` are the loan's other live repayments (excluding the one being edited).
 * Returns { errors: [...codes], warnings: [...codes], after: position as of the payment month }.
 */
export function checkRepayment(loan, others, entry) {
  const errors = [];
  const warnings = [];
  const k = ymOfDate(entry.paidOn);
  if (iso(entry.paidOn) < iso(loan.takenOn)) errors.push('repayment_before_loan');
  if (entry.principalPaise + entry.interestPaise !== entry.totalPaise) errors.push('split_mismatch');
  if (entry.totalPaise <= 0) errors.push('amount_invalid');

  const all = [...live(others), { ...entry, id: entry.id ?? 'new' }];
  const principalPaid = all.reduce((s, r) => s + r.principalPaise, 0);
  if (principalPaid > loan.principalPaise) errors.push('principal_exceeds');

  // interest paid up to that month should not run ahead of interest charged by then
  const asOf = Math.max(k, ymOfDate(loan.takenOn));
  const ledger = loanLedger(loan, all, asOf);
  if (ledger.totals.interestOutstanding < 0) warnings.push('interest_advance');

  const dup = live(others).find(
    (r) => iso(r.paidOn) === iso(entry.paidOn) && r.totalPaise === entry.totalPaise,
  );
  if (dup) warnings.push('possible_duplicate');

  return { errors, warnings };
}

/** Default "interest from" month: the month after the loan is taken. */
export function defaultInterestFrom(takenOn) {
  const d = new Date(takenOn);
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  return m === 12 ? { month: 1, year: y + 1 } : { month: m + 1, year: y };
}

/** Suggested split for a payment: clear interest due first, the rest goes to principal. */
export function suggestSplit(loan, repayments, paidOn, totalPaise) {
  const k = ymOfDate(paidOn);
  const { totals } = loanLedger(loan, repayments, Math.max(k, ymOfDate(loan.takenOn)));
  const interest = Math.max(0, Math.min(totalPaise, totals.interestOutstanding));
  const principal = Math.min(totalPaise - interest, Math.max(0, totals.principalOutstanding));
  return { interestPaise: interest, principalPaise: principal, extraPaise: totalPaise - interest - principal, ...totals };
}

// --- Bank-style automatic maths ----------------------------------------------------------

const roundUpRupee = (paise) => Math.ceil(paise / 100) * 100;

/** Monthly rate as a fraction (for the EMI formula only; the ledger itself uses integer paise). */
const monthlyRate = (loan) => loan.rateBp / 10000 / (loan.ratePeriod === 'year' ? 12 : 1);

/**
 * Monthly installment (EMI) that repays a loan in `months`, rounded up to the next rupee.
 *   reducing: P·r·(1+r)^n / ((1+r)^n − 1)   (standard bank formula)
 *   flat    : P/n + flat monthly interest
 *   fixed   : P/n + the fixed monthly interest
 */
export function emiFor(loan, months) {
  const P = loan.principalPaise;
  const n = Math.max(1, Math.floor(months));
  if (loan.interestMethod === 'reducing') {
    const r = monthlyRate(loan);
    if (r === 0) return roundUpRupee(P / n);
    const f = (1 + r) ** n;
    return roundUpRupee((P * r * f) / (f - 1));
  }
  const monthlyInterest = loan.interestMethod === 'flat' ? interestForMonth(loan, P) : loan.fixedInterestPaise;
  return roundUpRupee(P / n) + monthlyInterest;
}

/**
 * Month-by-month future plan if `installment` is paid every month (interest first, rest to principal),
 * using exactly the same interest rules as the ledger. Stops when everything is repaid.
 * state: { principal, interestDue, startK, chargeFirst } — chargeFirst=false when the first month's
 * interest is already included in interestDue (the current month).
 */
export function simulate(loan, state, installment, { maxMonths = 600, firstPayment } = {}) {
  const rows = [];
  let principal = state.principal;
  let interestDue = state.interestDue;
  let totalInterest = 0;
  const fromK = interestStartYm(loan);
  if (installment <= 0) return { feasible: false, rows, months: null, totalInterest: null, totalPayable: null, payoff: null };
  for (let i = 0, k = state.startK; i < maxMonths && (principal > 0 || interestDue > 0); i++, k++) {
    const charge = (i > 0 || state.chargeFirst) && k >= fromK ? interestForMonth(loan, principal) : 0;
    interestDue += charge;
    totalInterest += charge;
    const pay = Math.min(i === 0 && firstPayment != null ? firstPayment : installment, principal + interestDue);
    const toInterest = Math.min(pay, interestDue);
    const toPrincipal = Math.min(pay - toInterest, principal);
    interestDue -= toInterest;
    principal -= toPrincipal;
    rows.push({ ...fromYm(k), interest: charge, payment: toInterest + toPrincipal, toInterest, toPrincipal, balance: principal, interestDue });
    // the installment never catches up with interest → loan would never end
    if (i >= 2 && principal >= state.principal && toPrincipal === 0) return { feasible: false, rows: rows.slice(0, 12), months: null, totalInterest: null, totalPayable: null, payoff: null };
  }
  const done = principal <= 0 && interestDue <= 0;
  const last = rows.at(-1);
  return {
    feasible: done,
    rows,
    months: done ? rows.length : null,
    totalInterest,
    totalPayable: rows.reduce((s, r) => s + r.payment, 0),
    payoff: done && last ? { month: last.month, year: last.year } : null,
  };
}

/** Plan for a brand-new loan (calculator / new-loan form). */
export function planNewLoan(loan, installment) {
  const k = interestStartYm(loan);
  return simulate(loan, { principal: loan.principalPaise, interestDue: loan.openingInterestPaise ?? 0, startK: k, chargeFirst: true }, installment);
}

/**
 * What a bank shows on a running loan, as of month nowK:
 *  - payoff amount today, repaid %, overdue installments, months behind,
 *  - the projected schedule if the agreed installment is paid every month.
 */
export function loanInsights(loan, repayments, nowK) {
  const pos = loanPosition(loan, repayments, nowK);
  if (!pos) return null;
  const installment = loan.installmentPaise;
  const dueStart = interestStartYm(loan);
  const outstanding = Math.max(0, pos.totalOutstandingPaise);
  const paid = pos.principalPaidPaise + pos.interestPaidPaise;
  const has = installment > 0 && !pos.closed;
  // months whose installment is due (first one in the "interest from" month), up to and including now
  const monthsDue = Math.max(0, nowK - dueStart + 1);
  // overdue = installments of months that have already ENDED and are not paid (like a bank's DPD)
  const overduePaise = has ? Math.max(0, Math.min(installment * Math.max(0, monthsDue - 1) - paid, outstanding)) : 0;
  // to be fully up to date now = overdue + this month's installment still unpaid
  const dueNowPaise = has ? Math.max(0, Math.min(installment * monthsDue - paid, outstanding)) : 0;
  const thisMonthPaid = pos.monthPaidPaise;
  const startThisMonth = installment > 0 && thisMonthPaid < installment && outstanding > 0;
  const plan = pos.closed
    ? { feasible: true, rows: [], months: 0, totalInterest: 0, totalPayable: 0, payoff: null }
    : simulate(loan, {
        principal: pos.principalOutstandingPaise,
        interestDue: Math.max(0, pos.interestOutstandingPaise),
        startK: startThisMonth ? nowK : nowK + 1,
        chargeFirst: !startThisMonth, // this month's interest is already in interestDue
      }, installment, { firstPayment: startThisMonth ? installment - thisMonthPaid : undefined });
  return {
    payoffTodayPaise: outstanding,
    repaidPercent: loan.principalPaise ? Math.min(100, Math.round((pos.principalPaidPaise / loan.principalPaise) * 1000) / 10) : 0,
    monthsDue,
    overduePaise,
    monthsBehind: has && overduePaise > 0 ? Math.ceil(overduePaise / installment) : 0,
    dueNowPaise,
    status: pos.closed ? 'closed' : overduePaise > 0 ? 'overdue' : 'regular',
    plan: { feasible: plan.feasible, months: plan.months, payoff: plan.payoff, futureInterestPaise: plan.totalInterest, futurePayablePaise: plan.totalPayable, rows: plan.rows.slice(0, 120) },
  };
}

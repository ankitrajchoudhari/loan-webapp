// Read-side business logic: member statements, installment status and dues, samiti totals.
// Everything is computed from saved rows on every request — nothing is cached or hand-typed.
import { prisma } from './db.js';
import { loanPosition, repaymentView, loanInsights } from './loan.js';
import { HttpError, ym, ymOfDate, fromYm, iso, currentMonthYear } from './util.js';

const LIVE = { voidedAt: null };

/** Member with all live installments, loans and repayments. */
export async function loadMember(memberId) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      installments: { where: LIVE, orderBy: [{ year: 'asc' }, { month: 'asc' }] },
      loans: { where: LIVE, orderBy: { takenOn: 'asc' }, include: { repayments: { where: LIVE, orderBy: { paidOn: 'asc' } } } },
    },
  });
  if (!member) throw new HttpError(404, 'member_not_found');
  return member;
}

/** All members (optionally filtered) with the same includes — for reports and dashboard. */
export function loadMembers(where = {}) {
  return prisma.member.findMany({
    where,
    include: {
      installments: { where: LIVE },
      loans: { where: LIVE, include: { repayments: { where: LIVE } } },
    },
    orderBy: { memberNo: 'asc' },
  });
}

export function publicMember(m) {
  return {
    id: m.id,
    memberNo: m.memberNo,
    fullName: m.fullName,
    mobileNumber: m.mobileNumber,
    joinDate: iso(m.joinDate),
    monthlyInstallmentPaise: m.monthlyInstallmentPaise,
    status: m.status,
    inactiveSince: iso(m.inactiveSince),
    note: m.note ?? null,
    dateOfBirth: iso(m.dateOfBirth),
    creditPaise: m.creditPaise ?? 0,
  };
}

/** Is an installment due from this member for this month? (joined by then, not yet inactive) */
export function installmentApplies(member, month, year) {
  const k = ym(year, month);
  if (k < ymOfDate(member.joinDate)) return false;
  if (member.inactiveSince && k > ymOfDate(member.inactiveSince)) return false;
  return true;
}

export function installmentView(member, month, year, now = currentMonthYear()) {
  const rec = member.installments.find((i) => i.month === month && i.year === year && !i.voidedAt);
  const applies = installmentApplies(member, month, year);
  const isFuture = ym(year, month) > ym(now.year, now.month);
  const duePaise = rec?.duePaise ?? (applies ? member.monthlyInstallmentPaise : 0);
  const paidPaise = rec?.amountPaise ?? 0;
  let status;
  if (rec) status = paidPaise >= duePaise ? 'paid' : 'partial';
  else if (!applies) status = 'not_due';
  else if (isFuture) status = 'future';
  else status = 'pending';
  return {
    id: rec?.id ?? null,
    month,
    year,
    duePaise,
    paidPaise,
    pendingPaise: status === 'future' || status === 'not_due' ? 0 : Math.max(0, duePaise - paidPaise),
    paidOn: iso(rec?.paidOn),
    method: rec?.method ?? null,
    note: rec?.note ?? null,
    source: rec?.source ?? null,
    status,
  };
}

/** Months from joining up to `upTo` (inclusive) with their installment state. */
export function installmentMonths(member, upTo = currentMonthYear()) {
  const start = ymOfDate(member.joinDate);
  const end = ym(upTo.year, upTo.month);
  const out = [];
  for (let k = start; k <= end; k++) {
    const { month, year } = fromYm(k);
    out.push(installmentView(member, month, year));
  }
  return out;
}

/** Total installment money still owed up to and including the given month. */
export function installmentArrears(member, upTo = currentMonthYear()) {
  const months = installmentMonths(member, upTo).filter((m) => m.pendingPaise > 0);
  return { months: months.length, amountPaise: months.reduce((s, m) => s + m.pendingPaise, 0), list: months };
}

function sumLoans(positions) {
  const s = (k) => positions.reduce((t, p) => t + p[k], 0);
  return {
    principalPaise: s('principalPaise'),
    monthInterestPaise: s('monthInterestPaise'),
    monthPaidPaise: s('monthPaidPaise'),
    monthPrincipalPaidPaise: s('monthPrincipalPaidPaise'),
    monthInterestPaidPaise: s('monthInterestPaidPaise'),
    principalPaidPaise: s('principalPaidPaise'),
    interestPaidPaise: s('interestPaidPaise'),
    principalOutstandingPaise: s('principalOutstandingPaise'),
    interestOutstandingPaise: s('interestOutstandingPaise'),
    totalOutstandingPaise: s('totalOutstandingPaise'),
  };
}

export function loanPositions(member, month, year) {
  const k = ym(year, month);
  return member.loans.map((l) => loanPosition(l, l.repayments, k)).filter(Boolean);
}

/** Spec §5 — one member's statement for one month (as of the end of that month). */
export function monthStatement(member, month, year) {
  const now = currentMonthYear();
  const installment = installmentView(member, month, year, now);
  // arrears from earlier months (not counting this one)
  const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const earlier = ym(prev.year, prev.month) >= ymOfDate(member.joinDate) ? installmentArrears(member, prev) : { months: 0, amountPaise: 0 };
  const loans = loanPositions(member, month, year);
  return {
    member: publicMember(member),
    month,
    year,
    isFuture: ym(year, month) > ym(now.year, now.month),
    beforeJoining: ym(year, month) < ymOfDate(member.joinDate),
    installment,
    earlierArrears: { months: earlier.months, amountPaise: earlier.amountPaise, list: (earlier.list ?? []).map((m) => ({ month: m.month, year: m.year, pendingPaise: m.pendingPaise, partial: m.status === 'partial' })) },
    loans,
    loanTotals: sumLoans(loans),
    hasLoans: member.loans.length > 0,
  };
}

/** Member home screen — the seven essentials (spec §3A). */
export function memberHome(member) {
  const { month, year } = currentMonthYear();
  const st = monthStatement(member, month, year);
  const k = ym(year, month);
  const insights = member.loans.map((l) => loanInsights(l, l.repayments, k)).filter(Boolean).filter((i) => i.status !== 'closed');
  return {
    member: st.member,
    month,
    year,
    loanStatus: {
      overduePaise: insights.reduce((s, i) => s + i.overduePaise, 0),
      dueNowPaise: insights.reduce((s, i) => s + i.dueNowPaise, 0),
      monthsBehind: Math.max(0, ...insights.map((i) => i.monthsBehind)),
      payoff: insights.map((i) => i.plan.payoff).filter(Boolean).sort((a, b) => ym(b.year, b.month) - ym(a.year, a.month))[0] ?? null,
    },
    installment: st.installment,
    earlierArrears: st.earlierArrears,
    hasLoans: st.hasLoans,
    loanTotals: st.loanTotals,
  };
}

/** Old account: every month since joining + a combined list of all money deposited. */
export function memberHistory(member) {
  const months = installmentMonths(member).reverse();
  const deposits = [
    ...member.installments.map((i) => ({
      kind: 'installment',
      id: i.id,
      date: iso(i.paidOn),
      month: i.month,
      year: i.year,
      amountPaise: i.amountPaise,
      method: i.method,
    })),
    ...member.loans.flatMap((l) =>
      l.repayments.map((r) => ({ kind: 'repayment', loanNo: l.loanNo, ...repaymentView(r), date: iso(r.paidOn), amountPaise: r.totalPaise })),
    ),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const now = currentMonthYear();
  const loans = loanPositions(member, now.month, now.year);
  const totals = {
    installmentsPaise: member.installments.reduce((s, i) => s + i.amountPaise, 0),
    principalPaidPaise: loans.reduce((s, l) => s + l.principalPaidPaise, 0),
    interestPaidPaise: loans.reduce((s, l) => s + l.interestPaidPaise, 0),
    arrears: installmentArrears(member),
  };
  return { member: publicMember(member), months, deposits, loans, totals };
}

/** Samiti-wide figures for the admin home screen (spec §4.1). */
export async function dashboardFigures() {
  const { month, year } = currentMonthYear();
  const members = await loadMembers();
  const active = members.filter((m) => m.status === 'active');
  let installmentThisMonth = 0;
  let loanCollectedThisMonth = 0;
  let arrears = 0;
  let arrearsMembers = 0;
  let principalOut = 0;
  let interestOut = 0;
  let activeLoans = 0;
  let overdueLoans = 0;
  let overduePaise = 0;
  let totalInstallments = 0;
  let interestEarned = 0;
  let principalReturned = 0;
  let loansGiven = 0;

  for (const m of members) {
    installmentThisMonth += m.installments.filter((i) => i.month === month && i.year === year).reduce((s, i) => s + i.amountPaise, 0);
    const a = installmentArrears(m);
    arrears += a.amountPaise;
    if (a.amountPaise > 0) arrearsMembers++;
    totalInstallments += m.installments.reduce((s, i) => s + i.amountPaise, 0);
    for (const l of m.loans) {
      const ins = loanInsights(l, l.repayments, ym(year, month));
      if (!ins) continue;
      if (ins.status === 'overdue') { overdueLoans++; overduePaise += ins.overduePaise; }
      loansGiven += l.principalPaise; // money lent out of the samiti's cash
      principalReturned += l.repayments.reduce((s, r) => s + r.principalPaise, 0);
      interestEarned += l.repayments.reduce((s, r) => s + r.interestPaise, 0);
    }
    for (const p of loanPositions(m, month, year)) {
      loanCollectedThisMonth += p.monthPaidPaise;
      principalOut += p.principalOutstandingPaise;
      interestOut += p.interestOutstandingPaise;
      if (!p.closed) activeLoans++;
    }
  }
  const paidThisMonth = active.filter((m) => installmentView(m, month, year).status === 'paid').length;
  const dueThisMonth = active.filter((m) => installmentApplies(m, month, year)).length;

  return {
    month,
    year,
    totalMembers: active.length,
    inactiveMembers: members.length - active.length,
    installmentThisMonthPaise: installmentThisMonth,
    loanCollectedThisMonthPaise: loanCollectedThisMonth,
    installmentArrearsPaise: arrears,
    arrearsMembers,
    principalOutstandingPaise: principalOut,
    interestOutstandingPaise: interestOut,
    activeLoans,
    overdueLoans,
    overduePaise,
    totalInstallmentsPaise: totalInstallments,
    interestEarnedPaise: interestEarned,
    principalReturnedPaise: principalReturned,
    loansGivenPaise: loansGiven,
    // cash the samiti should hold: all money in − money lent out
    cashInHandPaise: totalInstallments + principalReturned + interestEarned - loansGiven,
    paidThisMonth,
    dueThisMonth,
  };
}

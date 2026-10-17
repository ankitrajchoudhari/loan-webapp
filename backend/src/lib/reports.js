// Report builders (spec §4.6). Filters: month + year, optional member.
import { loadMembers, loadMember, publicMember, installmentView, installmentArrears, loanPositions, installmentMonths } from './ledger.js';
import { loanLedger, loanPosition } from './loan.js';
import { ym, ymOfDate } from './util.js';

const memberWhere = (memberId) => (memberId ? { id: memberId } : {});
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);

/** महीने की जमा रकम — installments and loan repayments received in a month. */
export async function monthlyDeposits({ month, year, memberId }) {
  const members = await loadMembers(memberWhere(memberId));
  const rows = members
    .map((m) => {
      const inst = installmentView(m, month, year);
      const loans = loanPositions(m, month, year);
      return {
        member: publicMember(m),
        installment: inst,
        loanPrincipalPaise: sum(loans, (l) => l.monthPrincipalPaidPaise),
        loanInterestPaise: sum(loans, (l) => l.monthInterestPaidPaise),
      };
    })
    .filter((r) => r.installment.status !== 'not_due' || r.installment.paidPaise || r.loanPrincipalPaise || r.loanInterestPaise);
  for (const r of rows) r.totalPaise = r.installment.paidPaise + r.loanPrincipalPaise + r.loanInterestPaise;
  return {
    month,
    year,
    rows,
    totals: {
      installmentDuePaise: sum(rows, (r) => r.installment.duePaise),
      installmentPaidPaise: sum(rows, (r) => r.installment.paidPaise),
      loanPrincipalPaise: sum(rows, (r) => r.loanPrincipalPaise),
      loanInterestPaise: sum(rows, (r) => r.loanInterestPaise),
      totalPaise: sum(rows, (r) => r.totalPaise),
    },
  };
}

/** किस्त बाकी रहने वाले सदस्य — members with unpaid installments up to the chosen month. */
export async function pendingInstallments({ month, year, memberId }) {
  const members = await loadMembers({ ...memberWhere(memberId) });
  const rows = members
    .map((m) => {
      const thisMonth = installmentView(m, month, year);
      const arrears = installmentArrears(m, { month, year });
      return { member: publicMember(m), thisMonth, months: arrears.list.map((x) => ({ month: x.month, year: x.year, pendingPaise: x.pendingPaise })), pendingPaise: arrears.amountPaise };
    })
    .filter((r) => r.pendingPaise > 0);
  return { month, year, rows, totals: { members: rows.length, pendingPaise: sum(rows, (r) => r.pendingPaise) } };
}

/** कर्ज की बाकी मूल राशि + बाकी ब्याज — every loan's position at the end of the chosen month. */
export async function loansOutstanding({ month, year, memberId }) {
  const members = await loadMembers(memberWhere(memberId));
  const rows = members.flatMap((m) =>
    loanPositions(m, month, year)
      .filter((p) => !p.closed)
      .map((p) => ({ member: publicMember(m), ...p })),
  );
  return {
    month,
    year,
    rows,
    totals: {
      loans: rows.length,
      principalPaise: sum(rows, (r) => r.principalPaise),
      principalOutstandingPaise: sum(rows, (r) => r.principalOutstandingPaise),
      interestOutstandingPaise: sum(rows, (r) => r.interestOutstandingPaise),
      totalOutstandingPaise: sum(rows, (r) => r.totalOutstandingPaise),
    },
  };
}

/** सदस्यवार पूरा हिसाब — one member's whole account up to the chosen month. */
export async function memberFullAccount({ month, year, memberId }) {
  const m = await loadMember(memberId);
  const upTo = { month, year };
  const k = ym(year, month);
  const months = ym(year, month) >= ymOfDate(m.joinDate) ? installmentMonths(m, upTo) : [];
  const loans = m.loans
    .filter((l) => ymOfDate(l.takenOn) <= k)
    .map((l) => {
      const ledger = loanLedger(l, l.repayments, k);
      return { loanNo: l.loanNo, position: loanPosition(l, l.repayments, k), rows: ledger.rows };
    });
  return {
    month,
    year,
    member: publicMember(m),
    months,
    loans,
    totals: {
      installmentDuePaise: sum(months, (x) => (x.status === 'future' ? 0 : x.duePaise)),
      installmentPaidPaise: sum(months, (x) => x.paidPaise),
      installmentPendingPaise: sum(months, (x) => x.pendingPaise),
      principalOutstandingPaise: sum(loans, (l) => l.position.principalOutstandingPaise),
      interestOutstandingPaise: sum(loans, (l) => l.position.interestOutstandingPaise),
      totalOutstandingPaise: sum(loans, (l) => l.position.totalOutstandingPaise),
    },
  };
}


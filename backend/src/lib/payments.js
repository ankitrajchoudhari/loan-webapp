// Member payments: what is due, the platform fee, and how a confirmed payment is applied.
//
// Order of application (oldest money owed first, like a bank):
//   1. unpaid / part-paid samiti installments, oldest month first
//   2. loan dues (this month's + overdue installment), interest first, then principal
//   3. anything left over → the member's advance credit (used first on the next payment)
// The platform fee is recorded on the payment only; it never touches the samiti's books.
import { prisma } from './db.js';
import { HttpError, ym, iso, todayIST, currentMonthYear, parseDate } from './util.js';
import { installmentArrears, publicMember } from './ledger.js';
import { loanInsights, suggestSplit } from './loan.js';
import { createInstallment } from './installments.js';
import { createRepayment } from './loans.js';
import { audit } from './audit.js';

export const platformFeePaise = () => {
  const v = Number(process.env.PLATFORM_FEE_PAISE ?? 1245); // ₹12.45 per transaction
  return Number.isInteger(v) && v >= 0 ? v : 1245;
};

const LIVE = { voidedAt: null };

export async function loadMemberForPay(db, memberId) {
  const m = await db.member.findUnique({
    where: { id: memberId },
    include: {
      installments: { where: LIVE },
      loans: { where: LIVE, orderBy: { takenOn: 'asc' }, include: { repayments: { where: LIVE } } },
    },
  });
  if (!m) throw new HttpError(404, 'member_not_found');
  return m;
}

/** Everything the member owes right now, item by item. */
export function duesOf(member) {
  const now = currentMonthYear();
  const k = ym(now.year, now.month);
  const arrears = installmentArrears(member, now);
  const installments = arrears.list.map((m) => ({ month: m.month, year: m.year, pendingPaise: m.pendingPaise, partial: m.status === 'partial' }));
  const loans = member.loans
    .map((l) => ({ loan: l, ins: loanInsights(l, l.repayments, k) }))
    .filter(({ ins }) => ins && ins.status !== 'closed' && ins.dueNowPaise > 0)
    .map(({ loan, ins }) => ({ loanId: loan.id, loanNo: loan.loanNo, dueNowPaise: ins.dueNowPaise, overduePaise: ins.overduePaise }));
  const installmentPaise = installments.reduce((s, i) => s + i.pendingPaise, 0);
  const loanPaise = loans.reduce((s, l) => s + l.dueNowPaise, 0);
  const grossPaise = installmentPaise + loanPaise;
  return {
    installments,
    loans,
    installmentPaise,
    loanPaise,
    grossPaise,
    creditPaise: member.creditPaise,
    // what to pay now after using the advance credit
    payablePaise: Math.max(0, grossPaise - member.creditPaise),
  };
}

export function paymentView(p, { names } = {}) {
  return {
    id: p.id,
    paymentNo: p.paymentNo,
    memberId: p.memberId,
    member: p.member ? publicMember(p.member) : undefined,
    method: p.method,
    amountPaise: p.amountPaise,
    feePaise: p.feePaise,
    totalPaise: p.totalPaise,
    status: p.status,
    utr: p.utr,
    upiId: p.upiId,
    dueSnapshot: p.dueSnapshot,
    allocation: p.allocation,
    confirmedBy: p.gateway ? { name: 'Razorpay (ऑनलाइन)', role: 'system' } : p.confirmedById && names ? names.get(p.confirmedById) ?? null : undefined,
    gateway: p.gateway ?? null,
    gatewayPaymentId: p.gatewayPaymentId ?? null,
    confirmedAt: p.confirmedAt,
    rejectReason: p.rejectReason,
    submittedAt: p.submittedAt,
    receiptPrintedAt: p.receiptPrintedAt,
    createdAt: p.createdAt,
  };
}

export async function nextPaymentNo(db) {
  const top = await db.payment.aggregate({ _max: { paymentNo: true } });
  return (top._max.paymentNo ?? 0) + 1;
}

/**
 * Applies a confirmed payment inside a transaction. Creates installment rows / loan repayments,
 * moves any surplus into credit, and returns the allocation lines. `paidOn` = when the member paid.
 */
export async function applyPayment(tx, req, payment, paidOn) {
  const member = await loadMemberForPay(tx, payment.memberId);
  const creditBefore = member.creditPaise;
  let available = payment.amountPaise + creditBefore;
  const lines = [];
  const note = `भुगतान #${payment.paymentNo} (${payment.method === 'upi' ? 'UPI' : 'नकद'})`;
  const method = payment.method === 'upi' ? 'upi' : 'cash';
  const dues = duesOf(member);
  const date = iso(paidOn);

  // 1. samiti installments, oldest first
  for (const due of dues.installments) {
    if (available <= 0) break;
    const pay = Math.min(available, due.pendingPaise);
    const existing = member.installments.find((i) => i.month === due.month && i.year === due.year);
    if (existing) {
      const updated = await tx.installment.update({
        where: { id: existing.id },
        data: { amountPaise: existing.amountPaise + pay, note: [existing.note, note].filter(Boolean).join(' · ') },
      });
      await audit(req, {
        action: 'installment_corrected', entity: 'installment', entityId: existing.id, memberId: member.id,
        reason: `${note} — बाकी किस्त में जोड़ा`, before: { amountPaise: existing.amountPaise }, after: { amountPaise: updated.amountPaise },
      }, tx);
    } else {
      const row = await createInstallment(tx, member, { month: due.month, year: due.year, amountPaise: pay, paidOn: date, method, note });
      await audit(req, { action: 'installment_added', entity: 'installment', entityId: row.id, memberId: member.id, after: { month: due.month, year: due.year, amountPaise: pay, note } }, tx);
    }
    lines.push({ kind: 'installment', month: due.month, year: due.year, amountPaise: pay, full: pay === due.pendingPaise });
    available -= pay;
  }

  // 2. loan dues, interest first
  for (const due of dues.loans) {
    if (available <= 0) break;
    const loan = member.loans.find((l) => l.id === due.loanId);
    const pay = Math.min(available, due.dueNowPaise);
    const split = suggestSplit(loan, loan.repayments, parseDate(date), pay);
    const principalPaise = Math.min(split.principalPaise, pay - split.interestPaise);
    const r = await createRepayment(tx, loan, {
      paidOn: date, totalPaise: split.interestPaise + principalPaise, principalPaise, interestPaise: split.interestPaise, method, note,
    }, { allowDuplicate: true });
    await audit(req, { action: 'repayment_added', entity: 'repayment', entityId: r.id, memberId: member.id, after: { loanNo: loan.loanNo, totalPaise: r.totalPaise, note } }, tx);
    lines.push({ kind: 'loan', loanNo: loan.loanNo, amountPaise: r.totalPaise, principalPaise, interestPaise: split.interestPaise });
    available -= r.totalPaise;
  }

  // 3. surplus → advance credit
  if (available !== creditBefore) {
    await tx.member.update({ where: { id: member.id }, data: { creditPaise: available } });
  }
  if (available > creditBefore) lines.push({ kind: 'advance', amountPaise: available - creditBefore });
  return { lines, creditBeforePaise: creditBefore, creditAfterPaise: available, usedCreditPaise: Math.max(0, creditBefore - available) };
}

/** Date the member actually paid (UPI submission time or creation time), in India. */
export const paidDateOf = (p) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(p.submittedAt ?? p.createdAt ?? new Date()) || todayIST();

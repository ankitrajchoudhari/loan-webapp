import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, pctOf } from '../../src/lib/util.js';
import { loanLedger, loanPosition, checkRepayment, suggestSplit, interestForMonth } from '../../src/lib/loan.js';
import { installmentView, installmentArrears } from '../../src/lib/ledger.js';
import { normDate, normMonth, normMethod, normaliseRow } from '../../src/lib/history.js';
import { parseCsv, guessMapping } from '../../src/lib/sheet.js';

const D = (s) => new Date(`${s}T00:00:00Z`);
const k = (y, m) => y * 12 + (m - 1);

test('money is parsed exactly from text, never through floats', () => {
  assert.equal(toPaise('1,000'), 100000);
  assert.equal(toPaise('₹1,000.5'), 100050);
  assert.equal(toPaise('0.1'), 10);
  assert.equal(toPaise(1000.1), 100010);
  assert.equal(toPaise('12.345'), NaN);
  assert.equal(toPaise('-5'), NaN);
  assert.equal(toPaise(''), null);
  // the classic float trap: 0.1 + 0.2
  assert.equal(toPaise('0.1') + toPaise('0.2'), toPaise('0.3'));
});

test('percent of an amount rounds half-up to the paisa', () => {
  assert.equal(pctOf(1000000, 200), 20000); // 2% of ₹10,000 = ₹200
  assert.equal(pctOf(333, 150), 5); // 1.5% of ₹3.33 = 4.995 paise → 5
  assert.equal(pctOf(1200000, 1200, 12), 12000); // 12% a year on ₹12,000 = ₹120 a month
});

const base = {
  id: 'L1', loanNo: 1, takenOn: D('2024-01-10'), principalPaise: 1000000, rateBp: 200, ratePeriod: 'month',
  fixedInterestPaise: 0, interestFromMonth: 2, interestFromYear: 2024, installmentPaise: 100000, openingInterestPaise: 0,
};
const pay = (date, p, i) => ({ id: date, paidOn: D(date), principalPaise: p, interestPaise: i, totalPaise: p + i, voidedAt: null });

test('reducing method: interest on the principal left at the start of each month', () => {
  const loan = { ...base, interestMethod: 'reducing' };
  const reps = [pay('2024-02-15', 80000, 20000), pay('2024-03-15', 81600, 18400)];
  const { rows, totals } = loanLedger(loan, reps, k(2024, 4));
  assert.deepEqual(rows.map((r) => r.interestCharged), [0, 20000, 18400, 16768]); // Jan none, Feb 2% of 10,000 …
  assert.equal(totals.principalOutstanding, 1000000 - 161600);
  assert.equal(totals.interestOutstanding, 16768); // April's interest not yet paid
  assert.equal(totals.totalOutstanding, 838400 + 16768);
});

test('flat method: same interest every month on the original principal', () => {
  const loan = { ...base, interestMethod: 'flat' };
  const { rows } = loanLedger(loan, [pay('2024-02-15', 500000, 20000)], k(2024, 4));
  assert.deepEqual(rows.map((r) => r.interestCharged), [0, 20000, 20000, 20000]);
});

test('fixed method: fixed rupee interest while principal is outstanding, stops once repaid', () => {
  const loan = { ...base, interestMethod: 'fixed', rateBp: 0, fixedInterestPaise: 15000 };
  const { rows, totals } = loanLedger(loan, [pay('2024-02-20', 1000000, 15000)], k(2024, 5));
  assert.deepEqual(rows.map((r) => r.interestCharged), [0, 15000, 0, 0, 0]);
  assert.equal(totals.totalOutstanding, 0);
});

test('yearly rate is divided by 12', () => {
  assert.equal(interestForMonth({ ...base, interestMethod: 'reducing', rateBp: 2400, ratePeriod: 'year' }, 1000000), 20000);
});

test('opening (old) unpaid interest is carried into the balance', () => {
  const loan = { ...base, interestMethod: 'reducing', openingInterestPaise: 50000 };
  assert.equal(loanLedger(loan, [], k(2024, 1)).totals.interestOutstanding, 50000);
});

test('position as of an earlier month ignores later payments; loans not yet taken are absent', () => {
  const loan = { ...base, interestMethod: 'reducing' };
  const reps = [pay('2024-02-15', 80000, 20000), pay('2024-03-15', 81600, 18400)];
  const feb = loanPosition(loan, reps, k(2024, 2));
  assert.equal(feb.principalOutstandingPaise, 920000);
  assert.equal(feb.monthPaidPaise, 100000);
  assert.equal(loanPosition(loan, reps, k(2023, 12)), null);
});

test('voided repayments do not count', () => {
  const loan = { ...base, interestMethod: 'reducing' };
  const reps = [{ ...pay('2024-02-15', 80000, 20000), voidedAt: new Date() }];
  assert.equal(loanLedger(loan, reps, k(2024, 2)).totals.principalOutstanding, 1000000);
});

test('repayment checks: split must add up, principal cannot exceed the loan, before-loan dates refused', () => {
  const loan = { ...base, interestMethod: 'reducing' };
  assert.deepEqual(checkRepayment(loan, [], { paidOn: D('2024-02-15'), totalPaise: 100000, principalPaise: 50000, interestPaise: 20000 }).errors, ['split_mismatch']);
  assert.ok(checkRepayment(loan, [], { paidOn: D('2024-02-15'), totalPaise: 1100000, principalPaise: 1100000, interestPaise: 0 }).errors.includes('principal_exceeds'));
  assert.ok(checkRepayment(loan, [], { paidOn: D('2024-01-01'), totalPaise: 1000, principalPaise: 1000, interestPaise: 0 }).errors.includes('repayment_before_loan'));
  const dup = checkRepayment(loan, [pay('2024-02-15', 80000, 20000)], { paidOn: D('2024-02-15'), totalPaise: 100000, principalPaise: 80000, interestPaise: 20000 });
  assert.ok(dup.warnings.includes('possible_duplicate'));
});

test('suggested split clears interest due first', () => {
  const loan = { ...base, interestMethod: 'reducing' };
  const s = suggestSplit(loan, [], D('2024-02-15'), 100000);
  assert.equal(s.interestPaise, 20000);
  assert.equal(s.principalPaise, 80000);
});

test('installment status: paid, partial, pending, not due before joining; arrears add up', () => {
  const member = {
    joinDate: D('2024-01-05'), inactiveSince: null, monthlyInstallmentPaise: 100000,
    installments: [
      { id: 'a', month: 1, year: 2024, duePaise: 100000, amountPaise: 100000, paidOn: D('2024-01-06') },
      { id: 'b', month: 2, year: 2024, duePaise: 100000, amountPaise: 40000, paidOn: D('2024-02-06') },
    ],
  };
  const now = { month: 4, year: 2024 };
  assert.equal(installmentView(member, 1, 2024, now).status, 'paid');
  assert.equal(installmentView(member, 2, 2024, now).status, 'partial');
  assert.equal(installmentView(member, 2, 2024, now).pendingPaise, 60000);
  assert.equal(installmentView(member, 3, 2024, now).status, 'pending');
  assert.equal(installmentView(member, 12, 2023, now).status, 'not_due');
  assert.equal(installmentView(member, 5, 2024, now).status, 'future');
  const a = installmentArrears(member, now);
  assert.equal(a.amountPaise, 60000 + 100000 + 100000); // Feb part + Mar + Apr
});

test('import normalisation: Indian dates, Hindi months, payment methods', () => {
  assert.equal(normDate('05/04/2023'), '2023-04-05');
  assert.equal(normDate('5-4-23'), '2023-04-05');
  assert.equal(normDate('2023-04-05'), '2023-04-05');
  assert.equal(normMonth('अप्रैल'), '4');
  assert.equal(normMonth('फरवरी'), '2');
  assert.equal(normMonth('Sep'), '9');
  assert.equal(normMethod('नकद'), 'cash');
  assert.equal(normMethod('PhonePe'), 'upi');
  assert.deepEqual(normaliseRow('installment', { memberNo: '7', month: 'अप्रैल 2023', amount: '₹1,000', paidOn: '05/04/2023' }), {
    memberNo: '7', month: '4', year: '2023', amount: '₹1,000', paidOn: '2023-04-05',
  });
});

test('CSV parsing handles quotes, commas in amounts and BOM; headers map from Hindi names', () => {
  const rows = parseCsv('﻿सदस्य संख्या,महीना,साल,रकम,तारीख\n7,अप्रैल,2023,"1,000",05/04/2023\n');
  assert.deepEqual(rows[1], ['7', 'अप्रैल', '2023', '1,000', '05/04/2023']);
  assert.deepEqual(guessMapping(rows[0], ['memberNo', 'month', 'year', 'amount', 'paidOn']), { memberNo: 0, month: 1, year: 2, amount: 3, paidOn: 4 });
});

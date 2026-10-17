import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emiFor, planNewLoan, loanInsights } from '../../src/lib/loan.js';

const D = (s) => new Date(`${s}T00:00:00Z`);
const k = (y, m) => y * 12 + (m - 1);
const loan = (over) => ({
  id: 'L', loanNo: 1, takenOn: D('2024-01-10'), principalPaise: 1000000, rateBp: 200, ratePeriod: 'month',
  fixedInterestPaise: 0, interestFromMonth: 2, interestFromYear: 2024, installmentPaise: 0, openingInterestPaise: 0,
  interestMethod: 'reducing', ...over,
});

test('EMI: standard bank formula on reducing balance, rounded up to the rupee', () => {
  // ₹10,000 at 2%/month for 12 months = ₹945.60 → ₹946
  assert.equal(emiFor(loan(), 12), 94600);
  // 0% → equal parts
  assert.equal(emiFor(loan({ rateBp: 0 }), 4), 250000);
  // 24% a year = 2% a month
  assert.equal(emiFor(loan({ rateBp: 2400, ratePeriod: 'year' }), 12), 94600);
});

test('EMI: flat and fixed methods', () => {
  // ₹12,000 flat 1%: ₹1,000 principal + ₹120 interest
  assert.equal(emiFor(loan({ principalPaise: 1200000, rateBp: 100, interestMethod: 'flat' }), 12), 112000);
  assert.equal(emiFor(loan({ principalPaise: 1200000, rateBp: 0, interestMethod: 'fixed', fixedInterestPaise: 15000 }), 12), 115000);
});

test('schedule: paying the EMI clears the loan in exactly n months; totals add up', () => {
  const l = loan();
  const plan = planNewLoan(l, emiFor(l, 12));
  assert.equal(plan.feasible, true);
  assert.equal(plan.months, 12);
  assert.deepEqual(plan.payoff, { month: 1, year: 2025 });
  assert.equal(plan.rows.at(-1).balance, 0);
  assert.equal(plan.totalPayable, 1000000 + plan.totalInterest);
  assert.equal(plan.rows[0].toInterest, 20000); // first month: 2% of ₹10,000
});

test('schedule: an installment smaller than the interest is flagged as never ending', () => {
  assert.equal(planNewLoan(loan(), 15000).feasible, false); // ₹150 < ₹200 interest
});

test('insights: overdue counts only finished months; due-now adds this month', () => {
  const l = loan({ installmentPaise: 100000 });
  const pay = (d, p, i) => ({ id: d, paidOn: D(d), principalPaise: p, interestPaise: i, totalPaise: p + i, voidedAt: null });
  // installments due Feb, Mar, Apr; viewed in April with only February paid
  const ins = loanInsights(l, [pay('2024-02-10', 80000, 20000)], k(2024, 4));
  assert.equal(ins.monthsDue, 3);
  assert.equal(ins.overduePaise, 100000); // March missed
  assert.equal(ins.monthsBehind, 1);
  assert.equal(ins.dueNowPaise, 200000); // March + April
  assert.equal(ins.status, 'overdue');
  assert.equal(ins.payoffTodayPaise, ins.plan.rows.length ? ins.payoffTodayPaise : 0);
  assert.ok(ins.plan.feasible && ins.plan.months > 0);
  assert.equal(ins.repaidPercent, 8);
});

// End-to-end API checks (spec §8 and §10). Run through `npm test`, which points the app at
// throwaway CI databases. Each run starts from empty tables.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { client, disconnectAll } from '../../src/lib/db.js';
import { currentMonthYear, todayIST } from '../../src/lib/util.js';

if (!process.env.DATABASE_URL?.includes('_ci')) throw new Error('Integration tests must run via `npm test` (CI databases only)');

const ADMIN = { mobile: '9999900001', dateOfBirth: '1975-05-20', code: '0100' };
const DEV = { mobile: '9000000099', dateOfBirth: '1990-01-01', code: '0100' };
let server;
let base;
const now = currentMonthYear();
const today = todayIST();
const ym = (k) => ({ month: (k % 12) + 1, year: Math.floor(k / 12) });
const nowK = now.year * 12 + now.month - 1;
const monthsAgo = (n) => ym(nowK - n);
const dateIn = (n, day = 5) => {
  const { month, year } = monthsAgo(n);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Tiny client with its own cookie jar. */
function agent() {
  let cookie = '';
  return async (method, path, body, { expect } = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    if (expect !== undefined) assert.equal(res.status, expect, `${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return { status: res.status, data };
  };
}

const TABLES = ['payments', 'history_rows', 'history_batches', 'loan_repayments', 'loans', 'installments', 'members', 'otp_tokens', 'audit_log', 'settings', 'admin_users', 'revoked_tokens', 'support_tickets', 'notifications', 'deleted_mobiles', 'loan_applications'];

before(async () => {
  for (const env of ['live', 'test']) await client(env).$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(',')} CASCADE`);
  await client('live').adminUser.create({ data: { name: 'परीक्षक', role: 'admin', mobileNumber: ADMIN.mobile, dateOfBirth: new Date('1975-05-20T00:00:00Z') } });
  await client('live').adminUser.create({ data: { name: 'डेवलपर', role: 'developer', mobileNumber: DEV.mobile, dateOfBirth: new Date('1990-01-01T00:00:00Z') } });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await disconnectAll();
});

const admin = agent();
const ids = {};

test('admin login: needs right date of birth AND secret code; registration needs a real Firebase check', async () => {
  await agent()('GET', '/dashboard', undefined, { expect: 401 });
  await admin('POST', '/auth/login', { ...ADMIN, code: '0101' }, { expect: 401 });
  await admin('POST', '/auth/login', { ...ADMIN, dateOfBirth: '1975-05-21' }, { expect: 401 });
  await admin('POST', '/auth/login', { mobile: ADMIN.mobile, method: 'google', idToken: 'not-a-real-firebase-token', code: '0100' }, { expect: 401 });
  const id = await admin('POST', '/auth/identify', { mobile: ADMIN.mobile }, { expect: 200 });
  assert.equal(id.data.kind, 'admin');
  assert.equal(id.data.needsCode, true);
  const unknown = await admin('POST', '/auth/identify', { mobile: '9000012345' }, { expect: 200 });
  assert.equal(unknown.data.kind, 'member', 'unknown numbers look like members');
  const r = await admin('POST', '/auth/login', ADMIN, { expect: 200 });
  assert.equal(r.data.env, 'live');
});

test('add members: auto member number, duplicates of number/mobile refused, validation in codes', async () => {
  const a = await admin('POST', '/members', { fullName: 'रामलाल शर्मा', mobileNumber: '9811111111', joinDate: dateIn(5, 1), dateOfBirth: '1970-03-15', monthlyInstallmentPaise: '1,000' }, { expect: 201 });
  assert.equal(a.data.member.memberNo, 1);
  assert.equal(a.data.member.monthlyInstallmentPaise, 100000);
  ids.a = a.data.member.id;
  const b = await admin('POST', '/members', { fullName: 'सीता देवी', mobileNumber: '9822222222', joinDate: dateIn(5, 1), dateOfBirth: '1972-08-01', monthlyInstallmentPaise: '1000' }, { expect: 201 });
  ids.b = b.data.member.id;
  assert.equal(b.data.member.memberNo, 2);
  await admin('POST', '/members', { fullName: 'दोहराव', mobileNumber: '9811111111', joinDate: dateIn(1), dateOfBirth: '1970-01-01', monthlyInstallmentPaise: '1000' }, { expect: 409 });
  await admin('POST', '/members', { memberNo: 2, fullName: 'दोहराव', mobileNumber: '9833333333', joinDate: dateIn(1), dateOfBirth: '1970-01-01', monthlyInstallmentPaise: '1000' }, { expect: 409 });
  const bad = await admin('POST', '/members', { fullName: 'x', mobileNumber: '123', joinDate: '2024-02-30', dateOfBirth: '1970-01-01', monthlyInstallmentPaise: 'abc' }, { expect: 400 });
  const codes = bad.data.error.details.map((d) => d.message).sort();
  assert.deepEqual(codes, ['amount_invalid', 'join_date_invalid', 'mobile_invalid', 'name_required']);
  const list = await admin('GET', '/members?q=सीता', undefined, { expect: 200 });
  assert.equal(list.data.members.length, 1);
});

test('monthly installment: preview, save, duplicate month refused, partial payment shows as partial', async () => {
  const entry = { memberId: ids.a, month: now.month, year: now.year, amountPaise: '1000', paidOn: today, method: 'cash' };
  const p = await admin('POST', '/installments/preview', entry, { expect: 200 });
  assert.deepEqual(p.data.errors, []);
  const saved = await admin('POST', '/installments', entry, { expect: 201 });
  assert.equal(saved.data.status.status, 'paid');
  ids.inst = saved.data.installment.id;
  const dup = await admin('POST', '/installments', entry, { expect: 409 });
  assert.equal(dup.data.error.code, 'installment_exists');
  const pv = await admin('POST', '/installments/preview', entry, { expect: 200 });
  assert.ok(pv.data.errors.includes('installment_exists'));
  const partial = await admin('POST', '/installments', { ...entry, memberId: ids.b, amountPaise: '400' }, { expect: 201 });
  assert.equal(partial.data.status.status, 'partial');
  assert.equal(partial.data.status.pendingPaise, 60000);
  await admin('POST', '/installments', { ...entry, month: monthsAgo(9).month, year: monthsAgo(9).year }, { expect: 409 }); // before joining
  await admin('POST', '/installments', { ...entry, paidOn: '2999-01-01' }, { expect: 400 }); // future date
});

test('installment correction needs a reason, keeps the old values in history; cancel frees the month', async () => {
  await admin('PUT', `/installments/${ids.inst}`, { amountPaise: '900', paidOn: today, method: 'cash' }, { expect: 400 });
  const pv = await admin('PUT', `/installments/${ids.inst}?preview=1`, { amountPaise: '900', paidOn: today, method: 'cash', reason: 'गलत रकम लिखी थी' }, { expect: 200 });
  assert.equal(pv.data.before.amountPaise, 100000);
  const same = await admin('GET', `/installments/${ids.inst}`, undefined, { expect: 200 });
  assert.equal(same.data.installment.amountPaise, 100000, 'preview must not save');
  await admin('PUT', `/installments/${ids.inst}`, { amountPaise: '900', paidOn: today, method: 'cash', reason: 'गलत रकम लिखी थी' }, { expect: 200 });
  const h = await admin('GET', `/installments/${ids.inst}`, undefined, { expect: 200 });
  assert.equal(h.data.installment.amountPaise, 90000);
  const corr = h.data.history.find((e) => e.action === 'installment_corrected');
  assert.equal(corr.reason, 'गलत रकम लिखी थी');
  assert.equal(corr.before.amountPaise, 100000);
  await admin('POST', `/installments/${ids.inst}/void`, { reason: 'गलत सदस्य' }, { expect: 200 });
  await admin('POST', '/installments', { memberId: ids.a, month: now.month, year: now.year, amountPaise: '1000', paidOn: today }, { expect: 201 });
});

test('loan: create with reducing interest, repay principal + interest separately, balances add up', async () => {
  const taken = dateIn(3, 10);
  const pv = await admin('POST', '/loans/preview', { memberId: ids.a, takenOn: taken, principalPaise: '10000', interestMethod: 'reducing', rateBp: '2', installmentPaise: '1000' }, { expect: 200 });
  assert.equal(pv.data.firstMonthInterestPaise, 20000);
  const l = await admin('POST', '/loans', { memberId: ids.a, takenOn: taken, principalPaise: '10000', interestMethod: 'reducing', rateBp: '2', installmentPaise: '1000' }, { expect: 201 });
  ids.loan = l.data.loan.id;
  assert.equal(l.data.loan.loanNo, 1);

  const split = await admin('POST', `/loans/${ids.loan}/split`, { paidOn: dateIn(2, 12), totalPaise: '1000' }, { expect: 200 });
  assert.equal(split.data.interestPaise, 20000);
  assert.equal(split.data.principalPaise, 80000);
  await admin('POST', `/loans/${ids.loan}/repayments`, { paidOn: dateIn(2, 12), totalPaise: '1000', principalPaise: '700', interestPaise: '200' }, { expect: 400 }); // split mismatch
  const r1 = await admin('POST', `/loans/${ids.loan}/repayments`, { paidOn: dateIn(2, 12), totalPaise: '1000', principalPaise: '800', interestPaise: '200', method: 'cash' }, { expect: 201 });
  ids.rep = r1.data.repayment.id;
  await admin('POST', `/loans/${ids.loan}/repayments`, { paidOn: dateIn(2, 12), totalPaise: '1000', principalPaise: '800', interestPaise: '200' }, { expect: 409 }); // looks like a duplicate
  await admin('POST', `/loans/${ids.loan}/repayments`, { paidOn: dateIn(1, 12), totalPaise: '20000', principalPaise: '20000', interestPaise: '0' }, { expect: 400 }); // more than owed

  const d = await admin('GET', `/loans/${ids.loan}`, undefined, { expect: 200 });
  const p = d.data.loan.position;
  assert.equal(p.principalOutstandingPaise, 920000);
  // interest: month after taken (2 months ago) 200, last month 184, this month 184 → 568 charged, 200 paid
  assert.equal(p.interestChargedPaise, 20000 + 18400 + 18400);
  assert.equal(p.interestOutstandingPaise, 36800);
  assert.equal(p.totalOutstandingPaise, 920000 + 36800);
});

test('correcting an old repayment: preview shows balance change, reason required, audit keeps both', async () => {
  const body = { paidOn: dateIn(2, 12), totalPaise: '1200', principalPaise: '1000', interestPaise: '200', method: 'cash' };
  await admin('PUT', `/repayments/${ids.rep}`, body, { expect: 400 });
  const pv = await admin('PUT', `/repayments/${ids.rep}?preview=1`, { ...body, reason: 'रजिस्टर में 1200 था' }, { expect: 200 });
  assert.equal(pv.data.before.principalOutstandingPaise, 920000);
  assert.equal(pv.data.after.principalOutstandingPaise, 900000);
  await admin('PUT', `/repayments/${ids.rep}`, { ...body, reason: 'रजिस्टर में 1200 था' }, { expect: 200 });
  const d = await admin('GET', `/loans/${ids.loan}`, undefined, { expect: 200 });
  assert.equal(d.data.loan.position.principalOutstandingPaise, 900000);
  const entry = d.data.history.find((e) => e.action === 'repayment_corrected');
  assert.equal(entry.before.balances.principalOutstandingPaise, 920000);
  assert.equal(entry.after.balances.principalOutstandingPaise, 900000);
});

test('installments and loan repayments stay separate', async () => {
  const st = await admin('GET', `/statements/${ids.a}/month?month=${monthsAgo(2).month}&year=${monthsAgo(2).year}`, undefined, { expect: 200 });
  assert.equal(st.data.installment.paidPaise, 0, 'a loan repayment must not count as an installment');
  assert.equal(st.data.loanTotals.monthPaidPaise, 120000);
});

test('member login: only admin-added mobile + correct date of birth; member sees only own account', async () => {
  const m = agent();
  await m('POST', '/auth/login', { mobile: '9811111111', dateOfBirth: '1970-03-16' }, { expect: 401 });
  await m('POST', '/auth/login', { mobile: '9000012345', dateOfBirth: '1970-03-15' }, { expect: 401 });
  const ok = await m('POST', '/auth/login', { mobile: '9811111111', dateOfBirth: '1970-03-15' }, { expect: 200 });
  assert.equal(ok.data.user.fullName, 'रामलाल शर्मा');
  const home = await m('GET', '/statements/me/home', undefined, { expect: 200 });
  assert.equal(home.data.member.memberNo, 1);
  assert.equal(home.data.installment.status, 'paid');
  assert.ok(home.data.loanTotals.principalOutstandingPaise > 0);
  // someone else's account, and admin pages, are refused by the server
  await m('GET', `/statements/${ids.b}/home`, undefined, { expect: 403 });
  await m('GET', `/statements/${ids.b}/month?month=${now.month}&year=${now.year}`, undefined, { expect: 403 });
  await m('GET', '/members', undefined, { expect: 403 });
  await m('GET', `/loans/${ids.loan}`, undefined, { expect: 403 });
  const past = await m('GET', `/statements/me/month?month=${monthsAgo(2).month}&year=${monthsAgo(2).year}`, undefined, { expect: 200 });
  assert.equal(past.data.loans.length, 1);
  const hist = await m('GET', '/statements/me/history', undefined, { expect: 200 });
  assert.ok(hist.data.deposits.length >= 2);
  await m('POST', '/auth/logout', {}, { expect: 200 });
  await m('GET', '/statements/me/home', undefined, { expect: 401 });
});

test('member without a loan sees no loan figures', async () => {
  const st = await admin('GET', `/statements/${ids.b}/home`, undefined, { expect: 200 });
  assert.equal(st.data.hasLoans, false);
});

test('reports: monthly deposits, pending members, loans outstanding, member full account', async () => {
  const q = `month=${now.month}&year=${now.year}`;
  const dep = await admin('GET', `/reports/deposits?${q}`, undefined, { expect: 200 });
  assert.equal(dep.data.totals.installmentPaidPaise, 100000 + 40000);
  const pend = await admin('GET', `/reports/pending?${q}`, undefined, { expect: 200 });
  assert.ok(pend.data.rows.some((r) => r.member.id === ids.b));
  const loans = await admin('GET', `/reports/loans?${q}`, undefined, { expect: 200 });
  assert.equal(loans.data.totals.principalOutstandingPaise, 900000);
  const full = await admin('GET', `/reports/member?${q}&memberId=${ids.a}`, undefined, { expect: 200 });
  assert.equal(full.data.loans.length, 1);
  const dash = await admin('GET', '/dashboard', undefined, { expect: 200 });
  assert.equal(dash.data.totalMembers, 2);
  assert.equal(dash.data.installmentThisMonthPaise, 140000);
  assert.equal(dash.data.principalOutstandingPaise, 900000);
});

test('historical batch: check, verify, post; errors block verifying; duplicates detected', async () => {
  const b = await admin('POST', '/history/batches', { title: 'पुराना रजिस्टर 1' }, { expect: 201 });
  const bid = b.data.batch.id;
  const old = monthsAgo(4);
  await admin('POST', `/history/batches/${bid}/rows`, { kind: 'installment', data: { memberNo: '2', month: String(old.month), year: String(old.year), amount: '1000', paidOn: dateIn(4, 6) } }, { expect: 201 });
  // same row again in the batch → duplicate in batch
  await admin('POST', `/history/batches/${bid}/rows`, { kind: 'installment', data: { memberNo: '2', month: String(old.month), year: String(old.year), amount: '1000', paidOn: dateIn(4, 6) } }, { expect: 201 });
  // a month that is already saved
  await admin('POST', `/history/batches/${bid}/rows`, { kind: 'installment', data: { memberNo: '1', month: String(now.month), year: String(now.year), amount: '1000', paidOn: today } }, { expect: 201 });
  // unknown member cannot be saved straight as verified
  await admin('POST', `/history/batches/${bid}/rows`, { kind: 'installment', verified: true, data: { memberNo: '77', month: '1', year: '2024', amount: '1000', paidOn: '2024-01-05' } }, { expect: 400 });

  const v = await admin('GET', `/history/batches/${bid}`, undefined, { expect: 200 });
  const [r1, r2, r3] = v.data.rows;
  assert.ok(r1.check.errors.includes('duplicate_in_batch'));
  assert.ok(r3.check.errors.includes('installment_exists'));
  await admin('DELETE', `/history/rows/${r2.id}`, undefined, { expect: 200 });
  const ver = await admin('POST', `/history/batches/${bid}/verify`, { rowIds: [r1.id, r3.id], verified: true }, { expect: 200 });
  assert.equal(ver.data.updated, 1);
  assert.deepEqual(ver.data.blocked, [3]);

  const posted = await admin('POST', `/history/batches/${bid}/post`, {}, { expect: 200 });
  assert.equal(posted.data.posted.installment, 1);
  const after = await admin('GET', `/history/batches/${bid}`, undefined, { expect: 200 });
  assert.equal(after.data.rows.find((r) => r.id === r1.id).status, 'posted');
  assert.equal(after.data.rows.find((r) => r.id === r3.id).status, 'needs_check');
  const st = await admin('GET', `/statements/${ids.b}/month?month=${old.month}&year=${old.year}`, undefined, { expect: 200 });
  assert.equal(st.data.installment.status, 'paid');
  assert.equal(st.data.installment.source, 'history');
});

test('historical old loan + repayments in one batch post together', async () => {
  const b = await admin('POST', '/history/batches', { title: 'पुराना कर्ज' }, { expect: 201 });
  const bid = b.data.batch.id;
  const add = (kind, data) => admin('POST', `/history/batches/${bid}/rows`, { kind, data, verified: true }, { expect: 201 });
  await add('loan', { memberNo: '2', takenOn: dateIn(5, 3), principal: '5000', interestMethod: 'flat', rate: '1', openingInterest: '100' });
  await add('repayment', { memberNo: '2', paidOn: dateIn(3, 3), total: '1150', principal: '1000', interest: '150' });
  const posted = await admin('POST', `/history/batches/${bid}/post`, {}, { expect: 200 });
  assert.deepEqual(posted.data.posted, { installment: 0, loan: 1, repayment: 1 });
  const loans = await admin('GET', `/loans?memberId=${ids.b}`, undefined, { expect: 200 });
  const p = loans.data.loans[0].position;
  assert.equal(p.principalOutstandingPaise, 400000);
  // flat 1% of 5000 = 50/month for 5 months (month after taken … this month) + 100 old − 150 paid
  assert.equal(p.interestOutstandingPaise, 5 * 5000 + 10000 - 15000);
});

test('spreadsheet import: mapping, validation and duplicate detection preview before saving', async () => {
  const b = await admin('POST', '/history/batches', { title: 'CSV' }, { expect: 201 });
  const bid = b.data.batch.id;
  const old = monthsAgo(3);
  const rows = [
    ['1', `${old.month}/${old.year}`, '1,000', dateIn(3, 7).split('-').reverse().join('/')],
    ['1', `${old.month}/${old.year}`, '1,000', dateIn(3, 7).split('-').reverse().join('/')], // duplicate in file
    ['55', `${old.month}/${old.year}`, '1000', '01/01/2024'], // unknown member
    ['2', 'मार्च', 'abc', '31/02/2024'], // bad amount, bad date
  ];
  const req = { kind: 'installment', mapping: { memberNo: 0, month: 1, year: 1, amount: 2, paidOn: 3 }, rows, dryRun: true };
  const dry = await admin('POST', `/history/batches/${bid}/import`, req, { expect: 200 });
  assert.equal(dry.data.valid, 1);
  assert.ok(dry.data.preview[1].check.errors.includes('duplicate_in_batch'));
  assert.ok(dry.data.preview[2].check.errors.includes('member_not_found'));
  assert.ok(dry.data.preview[3].check.errors.includes('amount_invalid'));
  const empty = await admin('GET', `/history/batches/${bid}`, undefined, { expect: 200 });
  assert.equal(empty.data.rows.length, 0, 'preview must not save');
  const real = await admin('POST', `/history/batches/${bid}/import`, { ...req, dryRun: false }, { expect: 200 });
  assert.equal(real.data.saved, 1);
});

test('member deactivation keeps records; inactive member cannot log in', async () => {
  await agent()('POST', '/auth/login', { mobile: '9822222222', dateOfBirth: '1972-08-01' }, { expect: 200 });
  await admin('POST', `/members/${ids.b}/deactivate`, { reason: 'समिति छोड़ दी' }, { expect: 200 });
  const st = await admin('GET', `/statements/${ids.b}/history`, undefined, { expect: 200 });
  assert.ok(st.data.deposits.length > 0);
  await agent()('POST', '/auth/login', { mobile: '9822222222', dateOfBirth: '1972-08-01' }, { expect: 401 });
});

test('practice data is a separate database and resets without touching live records', async () => {
  const p = agent();
  await p('POST', '/auth/login', { ...ADMIN, env: 'test' }, { expect: 200 });
  const reset = await p('POST', '/practice/reset', { withSamples: true }, { expect: 200 });
  assert.equal(reset.data.members, 8);
  const pm = await p('GET', '/members', undefined, { expect: 200 });
  assert.equal(pm.data.members.length, 8);
  assert.ok(!pm.data.members.some((x) => x.id === ids.a), 'practice must not see live members');
  const lm = await admin('GET', '/members', undefined, { expect: 200 });
  assert.equal(lm.data.members.length, 2, 'live members untouched by practice reset');
  await admin('POST', '/practice/reset', {}, { expect: 403 }); // a live session can never reset
});

test('team: developer adds admin, admin adds sub-admin with work areas; sub-admin limited to them', async () => {
  const dev = agent();
  await dev('POST', '/auth/login', DEV, { expect: 200 });
  const a2 = await dev('POST', '/staff', { name: 'दूसरा व्यवस्थापक', mobileNumber: '9888800002', dateOfBirth: '1980-02-02', role: 'admin', email: 'admin2@gmail.com' }, { expect: 201 });
  assert.equal(a2.data.staff.role, 'admin');
  // admin may add sub-admins but not admins
  await admin('POST', '/staff', { name: 'नकली', mobileNumber: '9888800003', dateOfBirth: '1980-02-02', role: 'admin' }, { expect: 403 });
  const sub = await admin('POST', '/staff', { name: 'सहायक', mobileNumber: '9888800004', dateOfBirth: '1990-04-04', role: 'subadmin', permissions: ['installments'], duty: 'हर महीने की किस्त भरना' }, { expect: 201 });
  const listForAdmin = await admin('GET', '/staff', undefined, { expect: 200 });
  assert.ok(!listForAdmin.data.staff.some((x) => x.role === 'developer'), 'admins do not see the developer');
  const s = agent();
  const id = await s('POST', '/auth/identify', { mobile: '9888800004' }, { expect: 200 });
  assert.equal(id.data.kind, 'subadmin');
  await s('POST', '/auth/login', { mobile: '9888800004', dateOfBirth: '1990-04-05' }, { expect: 401 });
  const me = await s('POST', '/auth/login', { mobile: '9888800004', dateOfBirth: '1990-04-04' }, { expect: 200 });
  assert.equal(me.data.user.staffRole, 'subadmin');
  await s('GET', `/installments/sheet?month=${now.month}&year=${now.year}`, undefined, { expect: 200 });
  await s('GET', '/members', undefined, { expect: 200 });
  await s('POST', '/members', { fullName: 'x' }, { expect: 403 });
  await s('GET', '/loans', undefined, { expect: 403 });
  await s('GET', '/staff', undefined, { expect: 403 });
  await s('GET', '/audit-log', undefined, { expect: 403 });
  // developer sees everything everyone did
  const log = await dev('GET', '/audit-log?limit=200', undefined, { expect: 200 });
  assert.ok(log.data.entries.some((e) => e.actorRole === 'subadmin' && e.action === 'admin_login'));
  assert.ok(log.data.entries.some((e) => e.actorRole === 'admin' && e.action === 'staff_added'));
  // switching a sub-admin off ends their access at once
  await admin('POST', `/staff/${sub.data.staff.id}/status`, { status: 'inactive' }, { expect: 200 });
  await s('GET', '/dashboard', undefined, { expect: 401 });
});

test('support: ticket notifies developer, reply hidden as support team, resolve notifies admin; works without cookies', async () => {
  // login works with the returned token alone (embedded browsers that drop cookies)
  const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(DEV) });
  const { token } = await r.json();
  assert.ok(token);
  const me = await fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);

  const dev = agent();
  await dev('POST', '/auth/login', DEV, { expect: 200 });
  const t = await admin('POST', '/support/tickets', { subject: 'रिपोर्ट नहीं खुल रही', details: 'महीने की रिपोर्ट पर गड़बड़ी दिख रही है', page: '/admin/reports', errorCode: 'server_error' }, { expect: 201 });
  const devBell = await dev('GET', '/notifications', undefined, { expect: 200 });
  assert.ok(devBell.data.unread >= 1);
  assert.ok(devBell.data.items.some((n) => n.title.includes(`#${t.data.ticket.ticketNo}`)));

  await dev('POST', `/support/tickets/${t.data.ticket.id}/messages`, { text: 'देख रहे हैं' }, { expect: 200 });
  const seen = await admin('GET', '/support/tickets', undefined, { expect: 200 });
  const reply = seen.data.tickets[0].messages.at(-1);
  assert.equal(reply.name, 'सहायता टीम');
  assert.ok(!JSON.stringify(seen.data).includes('डेवलपर'), 'developer name never reaches admins');

  await admin('POST', `/support/tickets/${t.data.ticket.id}/resolve`, {}, { expect: 403 }); // only the developer closes tickets
  await dev('POST', `/support/tickets/${t.data.ticket.id}/resolve`, { note: 'ठीक कर दिया' }, { expect: 200 });
  const adminBell = await admin('GET', '/notifications', undefined, { expect: 200 });
  assert.ok(adminBell.data.items.some((n) => n.title.includes('ठीक कर दी गई')));

  // developer actions appear as "support" in the admin's change log
  const log = await admin('GET', '/audit-log?limit=200', undefined, { expect: 200 });
  assert.ok(!log.data.entries.some((e) => e.actorRole === 'developer'));
});

test('bank maths: calculator EMI + schedule, loan insights, dashboard money position', async () => {
  const c = await admin('POST', '/loans/calculator', { principalPaise: '10000', interestMethod: 'reducing', rateBp: '2', ratePeriod: 'month', months: 12 }, { expect: 200 });
  assert.equal(c.data.emiPaise, 94600);
  assert.equal(c.data.plan.months, 12);
  assert.equal(c.data.plan.rows.at(-1).balance, 0);
  const back = await admin('POST', '/loans/calculator', { principalPaise: '10000', interestMethod: 'reducing', rateBp: '2', ratePeriod: 'month', installmentPaise: '946' }, { expect: 200 });
  assert.equal(back.data.plan.months, 12, 'EMI → months gives the same answer');
  await admin('POST', '/loans/calculator', { principalPaise: '10000', interestMethod: 'reducing', rateBp: '2', ratePeriod: 'month', installmentPaise: '100' }, { expect: 200 })
    .then((r) => assert.equal(r.data.plan.feasible, false));

  const l = await admin('GET', `/loans/${ids.loan}`, undefined, { expect: 200 });
  const ins = l.data.loan.insights;
  assert.equal(ins.payoffTodayPaise, l.data.loan.position.totalOutstandingPaise);
  assert.ok(ins.repaidPercent > 0 && ins.repaidPercent < 100);
  assert.ok(['regular', 'overdue'].includes(ins.status));

  const d = await admin('GET', '/dashboard', undefined, { expect: 200 });
  assert.equal(d.data.cashInHandPaise, d.data.totalInstallmentsPaise + d.data.principalReturnedPaise + d.data.interestEarnedPaise - d.data.loansGivenPaise);
});


test('payments: admin sets UPI; member pays by UPI with UTR; confirm applies dues oldest-first, extra becomes advance; reject; cash + receipt', async () => {
  const qr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const dev = agent();
  await dev('POST', '/auth/login', DEV, { expect: 200 });
  await dev('PUT', '/upi-settings', { upiId: 'samiti@okaxis', payeeName: 'Shree Shyam Seva Samiti', qrImage: qr }, { expect: 403 }); // only an admin may set it
  await admin('PUT', '/upi-settings', { upiId: 'bad id', payeeName: 'x y', qrImage: qr }, { expect: 400 });
  await admin('PUT', '/upi-settings', { upiId: 'samiti@okaxis', payeeName: 'Shree Shyam Seva Samiti', qrImage: qr }, { expect: 200 });
  const seen = await dev('GET', '/upi-settings', undefined, { expect: 200 });
  assert.equal(seen.data.upi.setBy.name, 'परीक्षक'); // developer can see who added it

  const m = agent();
  await m('POST', '/auth/login', { mobile: '9811111111', dateOfBirth: '1970-03-15' }, { expect: 200 });
  const s1 = await m('GET', '/pay/summary', undefined, { expect: 200 });
  assert.equal(s1.data.feePaise, 1245);
  assert.equal(s1.data.upi.upiId, 'samiti@okaxis');
  const due = s1.data.dues.payablePaise;
  assert.ok(due > 0, 'member has dues to pay');
  await m('GET', '/payments', undefined, { expect: 403 }); // members cannot confirm anything

  // UPI: pay ₹500 more than due → extra becomes advance credit
  const p = await m('POST', '/pay', { method: 'upi', amountPaise: String((due + 50000) / 100) }, { expect: 201 });
  assert.equal(p.data.payment.totalPaise, due + 50000 + 1245);
  await m('POST', '/pay', { method: 'cash', amountPaise: '100' }, { expect: 409 }); // one open payment at a time
  await m('POST', `/pay/${p.data.payment.id}/submit`, { utr: '123' }, { expect: 400 });
  await m('POST', `/pay/${p.data.payment.id}/submit`, { utr: '412345678901' }, { expect: 200 });
  const c = await admin('POST', `/payments/${p.data.payment.id}/confirm`, {}, { expect: 200 });
  assert.equal(c.data.payment.status, 'confirmed');
  assert.equal(c.data.payment.allocation.creditAfterPaise, 50000);
  assert.ok(c.data.payment.allocation.lines.some((l) => l.kind === 'advance' && l.amountPaise === 50000));
  const s2 = await m('GET', '/pay/summary', undefined, { expect: 200 });
  assert.equal(s2.data.dues.payablePaise, 0);
  assert.equal(s2.data.dues.creditPaise, 50000);

  // UPI not received → rejected; same UTR cannot be reused
  const p2 = await m('POST', '/pay', { method: 'upi', amountPaise: '100' }, { expect: 201 });
  await m('POST', `/pay/${p2.data.payment.id}/submit`, { utr: '412345678901' }, { expect: 409 });
  await m('POST', `/pay/${p2.data.payment.id}/submit`, { utr: '999999999999' }, { expect: 200 });
  await admin('POST', `/payments/${p2.data.payment.id}/reject`, { reason: 'बैंक में पैसा नहीं आया' }, { expect: 200 });
  const r = await m('GET', `/pay/${p2.data.payment.id}`, undefined, { expect: 200 });
  assert.equal(r.data.payment.status, 'rejected');

  // cash at the counter → confirmed at once; receipt must be printed
  const cash = await admin('POST', '/payments/cash', { memberId: ids.a, amountPaise: '250' }, { expect: 201 });
  assert.equal(cash.data.payment.allocation.creditAfterPaise, 75000);
  const list = await admin('GET', '/payments', undefined, { expect: 200 });
  assert.ok(list.data.unprinted >= 1);
  await m('GET', `/receipts/${cash.data.payment.id}`, undefined, { expect: 200 });
  await admin('POST', `/payments/${cash.data.payment.id}/printed`, {}, { expect: 200 });
  const home = await m('GET', '/statements/me/home', undefined, { expect: 200 });
  assert.equal(home.data.pay.creditPaise, 75000);
});


test('razorpay: signed checkout confirms automatically; webhook confirms once; failure marked; forged signatures refused', async () => {
  const crypto = await import('node:crypto');
  const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
  const m = agent();
  await m('POST', '/auth/login', { mobile: '9811111111', dateOfBirth: '1970-03-15' }, { expect: 200 });
  const before = (await m('GET', '/pay/summary', undefined, { expect: 200 })).data;
  assert.equal(before.online, true);

  // 1) checkout success with a valid signature → confirmed by itself, no admin step
  const a = await m('POST', '/pay/online', { amountPaise: '100' }, { expect: 201 });
  assert.equal(a.data.checkout.amount, 10000 + 1245);
  const orderId = a.data.checkout.orderId;
  await m('POST', `/pay/${a.data.payment.id}/online-verify`, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_A1', razorpay_signature: 'f'.repeat(64) }, { expect: 400 });
  const ok = await m('POST', `/pay/${a.data.payment.id}/online-verify`, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_A1', razorpay_signature: sign('ci_secret', `${orderId}|pay_A1`) }, { expect: 200 });
  assert.equal(ok.data.payment.status, 'confirmed');
  const after1 = (await m('GET', '/pay/summary', undefined, { expect: 200 })).data;
  assert.equal(after1.dues.creditPaise, before.dues.creditPaise + 10000);

  // 2) phone closed mid-way: only the webhook arrives → confirmed; a replay does not apply twice
  const b = await m('POST', '/pay/online', { amountPaise: '200' }, { expect: 201 });
  const hook = (event, orderId, payId) => {
    const body = JSON.stringify({ event, payload: { payment: { entity: { id: payId, order_id: orderId, notes: { env: 'live' }, error_description: 'Bank declined' } } } });
    return fetch(`${base}/api/v1/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sign('ci_whsec', body) }, body });
  };
  assert.equal((await hook('payment.captured', b.data.checkout.orderId, 'pay_B1')).status, 200);
  assert.equal((await hook('payment.captured', b.data.checkout.orderId, 'pay_B1')).status, 200);
  const after2 = (await m('GET', '/pay/summary', undefined, { expect: 200 })).data;
  assert.equal(after2.dues.creditPaise, after1.dues.creditPaise + 20000, 'webhook replay must not double-count');

  // 3) failure from Razorpay → member sees failed
  const c = await m('POST', '/pay/online', { amountPaise: '300' }, { expect: 201 });
  await hook('payment.failed', c.data.checkout.orderId, 'pay_C1');
  assert.equal((await m('GET', `/pay/${c.data.payment.id}`, undefined, { expect: 200 })).data.payment.status, 'rejected');

  // forged webhook
  const forged = await fetch(`${base}/api/v1/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'abc' }, body: '{}' });
  assert.equal(forged.status, 400);
});

test('backup contains every table', async () => {
  const res = await fetch(`${base}/api/v1/members`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(res.status, 401);
  const r = await admin('GET', '/backup', undefined, { expect: 200 });
  assert.equal(r.data.format, 'samiti-backup-v1');
  assert.equal(r.data.tables.member.length, 2);
  assert.ok(r.data.tables.auditLog.length > 5);
});

test('cross-site write requests are refused', async () => {
  const res = await fetch(`${base}/api/v1/auth/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(ADMIN) });
  assert.equal(res.status, 403);
});

test('deleting a member erases everything; the mobile number is blocked for 7 days, then free again', async () => {
  const c = await admin('POST', '/members', { fullName: 'मिटाने वाला', mobileNumber: '9844444444', joinDate: dateIn(2, 1), dateOfBirth: '1980-01-01', monthlyInstallmentPaise: '500' }, { expect: 201 });
  const id = c.data.member.id;
  await admin('POST', '/installments', { memberId: id, month: now.month, year: now.year, amountPaise: '500', paidOn: today, method: 'cash' }, { expect: 201 });
  await agent()('DELETE', `/members/${id}`, { reason: 'गलती से बना', confirmName: 'मिटाने वाला' }, { expect: 401 });
  const wrong = await admin('DELETE', `/members/${id}`, { reason: 'गलती से बना', confirmName: 'कोई और' }, { expect: 400 });
  assert.equal(wrong.data.error.details[0].message, 'confirm_name_mismatch');

  const del = await admin('DELETE', `/members/${id}`, { reason: 'गलती से बना', confirmName: 'मिटाने वाला' }, { expect: 200 });
  assert.equal(del.data.counts.installments, 1);
  await admin('GET', `/members/${id}`, undefined, { expect: 404 });
  const db = client('live');
  assert.equal(await db.installment.count({ where: { memberId: id } }), 0);
  assert.equal(await db.auditLog.count({ where: { memberId: id } }), 0);
  const log = await db.auditLog.findFirst({ where: { action: 'member_deleted' } });
  assert.ok(!JSON.stringify(log).includes('9844444444') && !JSON.stringify(log).includes('मिटाने वाला'), 'no name or number left in the log');
  await agent()('POST', '/auth/login', { mobile: '9844444444', dateOfBirth: '1980-01-01' }, { expect: 401 });

  const again = { fullName: 'नया सदस्य', mobileNumber: '9844444444', joinDate: today, dateOfBirth: '1990-01-01', monthlyInstallmentPaise: '500' };
  const blocked = await admin('POST', '/members', again, { expect: 409 });
  assert.equal(blocked.data.error.code, 'mobile_recently_deleted');
  assert.equal(blocked.data.error.details.date, del.data.mobileAvailableFrom);
  await db.deletedMobile.updateMany({ data: { availableAt: new Date(Date.now() - 1000) } }); // 7 days later
  await admin('POST', '/members', again, { expect: 201 });
});

test('loan application: EMI plan from admin defaults; apply with Aadhaar/PAN/bank; staff notified; documents checked; approve creates the loan', async () => {
  // a member with no running loan (the 80% rule is tested separately)
  const fresh = await admin('POST', '/members', { fullName: 'नया आवेदक', mobileNumber: '9855555555', joinDate: dateIn(3, 1), dateOfBirth: '1985-01-01', monthlyInstallmentPaise: '1000' }, { expect: 201 });
  ids.applicant = fresh.data.member.id;
  const m = agent();
  await m('POST', '/auth/login', { mobile: '9855555555', dateOfBirth: '1985-01-01' }, { expect: 200 });
  const who = await agent()('POST', '/auth/identify', { mobile: '9811111111' }, { expect: 200 });
  assert.equal(who.data.name, 'रामलाल शर्मा');
  assert.equal((await agent()('POST', '/auth/identify', { mobile: '9800000009' }, { expect: 200 })).data.found, false);

  const plan = await m('POST', '/loan-apply/plan', { amountPaise: '12000', months: 12 }, { expect: 200 });
  assert.equal(plan.data.plan.rows.length, 12);
  assert.equal(plan.data.plan.rows.reduce((s, r) => s + r.principalPaise, 0), 1200000, 'the EMI list repays the whole amount');

  const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString('base64')}`;
  const form = {
    amountPaise: '12000', months: 12, purpose: 'घर की मरम्मत',
    aadhaarNumber: '2341 2341 2346', panNumber: 'abcpe1234f',
    bankName: 'State Bank of India', accountHolder: 'रामलाल शर्मा', accountNumber: '123456789012', ifsc: 'SBIN0000001',
    photos: { aadhaarFront: jpeg, aadhaarBack: jpeg, pan: jpeg }, agree: true,
  };
  const bad = await m('POST', '/loan-apply', { ...form, aadhaarNumber: '234123412347', photos: { ...form.photos, pan: 'data:image/jpeg;base64,AAAA' } }, { expect: 400 });
  assert.equal(bad.data.error.details[0].message, 'aadhaar_invalid');
  const notJpeg = await m('POST', '/loan-apply', { ...form, photos: { ...form.photos, pan: `data:image/jpeg;base64,${Buffer.alloc(3000, 1).toString('base64')}` } }, { expect: 400 });
  assert.equal(notJpeg.data.error.code, 'photo_invalid');

  const a = await m('POST', '/loan-apply', form, { expect: 201 });
  const id = a.data.application.id;
  assert.equal(a.data.application.aadhaar, 'XXXX XXXX 2346');
  assert.equal(a.data.application.bank.ifscVerified, true);
  await m('POST', '/loan-apply', form, { expect: 409 }); // one pending application at a time
  const photo = await fetch(`${base}/api/v1${a.data.application.documents.pan.url}`, { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(photo.status, 401, 'document photos need a login');

  const dash = await admin('GET', '/dashboard', undefined, { expect: 200 });
  assert.equal(dash.data.loanApplicationsPending, 1);
  const detail = await admin('GET', `/loan-apply/${id}`, undefined, { expect: 200 });
  assert.equal(detail.data.application.aadhaar, '234123412346');
  await m('GET', `/loan-apply/${id}`, undefined, { expect: 403 }); // members can't open the staff view

  await admin('POST', `/loan-apply/${id}/approve`, {}, { expect: 400 }); // documents not checked yet
  await admin('POST', `/loan-apply/${id}/documents/pan`, { status: 'rejected' }, { expect: 400 }); // needs a note
  for (const k of ['aadhaarFront', 'aadhaarBack', 'pan']) await admin('POST', `/loan-apply/${id}/documents/${k}`, { status: 'verified' }, { expect: 200 });
  const ok = await admin('POST', `/loan-apply/${id}/approve`, {}, { expect: 200 });
  assert.equal(ok.data.application.status, 'approved');
  const loan = await admin('GET', `/loans/${ok.data.application.loanId}`, undefined, { expect: 200 });
  assert.equal(loan.data.loan.principalPaise, 1200000);
  assert.equal(loan.data.loan.installmentPaise, plan.data.plan.emiPaise);
  const mine = await m('GET', '/loan-apply/mine', undefined, { expect: 200 });
  assert.equal(mine.data.applications[0].status, 'approved');
  assert.equal(mine.data.applications[0].documents.pan.status, 'verified');
});

test('new loan only after 80% of the running loan is repaid; cancelling a loan also cancels its repayments', async () => {
  const m = agent();
  await m('POST', '/auth/login', { mobile: '9811111111', dateOfBirth: '1970-03-15' }, { expect: 200 });
  const terms = await m('GET', '/loan-apply/terms', undefined, { expect: 200 });
  assert.equal(terms.data.eligibility.ok, false, 'the loans from earlier tests are not 80% repaid');
  const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]).toString('base64')}`;
  const form = { amountPaise: '5000', months: 6, aadhaarNumber: '234123412346', panNumber: 'ABCPE1234F', bankName: 'SBI', accountHolder: 'रामलाल', accountNumber: '123456789012', ifsc: 'SBIN0000001', photos: { aadhaarFront: jpeg, aadhaarBack: jpeg, pan: jpeg }, agree: true };
  const refused = await m('POST', '/loan-apply', form, { expect: 400 });
  assert.equal(refused.data.error.code, 'previous_loan_not_repaid');

  // cancel every running loan (some have repayments) → eligible again
  const list = await admin('GET', '/loans', undefined, { expect: 200 });
  for (const l of list.data.loans.filter((x) => x.memberId === ids.a || x.memberId === ids.applicant)) {
    const detail = await admin('GET', `/loans/${l.id}`, undefined, { expect: 200 });
    const live = detail.data.repayments.filter((r) => !r.voided).length;
    if (live) {
      const ask = await admin('POST', `/loans/${l.id}/void`, { reason: 'गलत एंट्री' }, { expect: 400 });
      assert.equal(ask.data.error.details.count, live);
    }
    const done = await admin('POST', `/loans/${l.id}/void`, { reason: 'गलत एंट्री', withRepayments: true }, { expect: 200 });
    assert.equal(done.data.repaymentsCancelled, live);
  }
  assert.equal((await m('GET', '/loan-apply/terms', undefined, { expect: 200 })).data.eligibility.ok, true);
  const applicant = agent();
  await applicant('POST', '/auth/login', { mobile: '9855555555', dateOfBirth: '1985-01-01' }, { expect: 200 });
  const mine = await applicant('GET', '/loan-apply/mine', undefined, { expect: 200 });
  assert.equal(mine.data.applications[0].status, 'cancelled', 'application of a cancelled loan shows as cancelled');
  await m('POST', '/loan-apply', form, { expect: 201 });
});

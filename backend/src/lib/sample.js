// Sample (dummy) data for the practice database only. Never called against live data.
import { client, testEnvAvailable } from './db.js';
import { createInstallment } from './installments.js';
import { createLoan, createRepayment } from './loans.js';
import { suggestSplit } from './loan.js';
import { currentMonthYear, ym, fromYm, parseDate } from './util.js';

const TABLES = ['payments', 'history_rows', 'history_batches', 'loan_repayments', 'loans', 'installments', 'members', 'otp_tokens', 'audit_log', 'settings', 'loan_applications', 'deleted_mobiles'];

const SAMPLE_MEMBERS = [
  ['रामलाल शर्मा', 'cash'],
  ['सीता देवी', 'upi'],
  ['मोहन लाल यादव', 'cash'],
  ['गीता बाई', 'cash'],
  ['श्यामसुंदर गुप्ता', 'bank'],
  ['कमला देवी', 'upi'],
  ['राजेश कुमार', 'cash'],
  ['सुनीता यादव', 'upi'],
];

function testDb() {
  if (!testEnvAvailable()) throw new Error('Practice database is not configured');
  return client('test');
}

/** Empties every record in the practice database. Admin accounts live in the live DB and are untouched. */
export async function wipeTestData() {
  const db = testDb();
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

const d = (k, day) => {
  const { month, year } = fromYm(k);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Fills the practice database with 8 members, 8 months of installments, 3 loans and an old-records batch. */
export async function seedTestData() {
  const db = testDb();
  const now = currentMonthYear();
  const nowK = ym(now.year, now.month);
  const startK = nowK - 7;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const safeDay = (k, day) => (k === nowK ? Math.min(day, Number(today.slice(8, 10))) : day);

  return db.$transaction(async (tx) => {
    const members = [];
    for (const [i, [fullName]] of SAMPLE_MEMBERS.entries()) {
      members.push(await tx.member.create({
        data: {
          memberNo: 101 + i,
          fullName,
          mobileNumber: `90000000${String(i + 1).padStart(2, '0')}`,
          joinDate: parseDate(d(startK, 1)),
          monthlyInstallmentPaise: i === 4 ? 150000 : 100000,
          dateOfBirth: parseDate(`${1960 + i}-01-0${(i % 9) + 1}`),
          note: 'परीक्षण सदस्य',
        },
      }));
    }

    let installments = 0;
    for (const [i, m] of members.entries()) {
      for (let k = startK; k <= nowK; k++) {
        if (k === nowK && i % 3 === 0) continue; // some still pending this month
        if (i === 7 && k > startK + 4) continue; // one member behind for a few months
        const partial = i === 6 && k === nowK - 1;
        await createInstallment(tx, m, {
          month: fromYm(k).month, year: fromYm(k).year,
          amountPaise: partial ? 50000 : m.monthlyInstallmentPaise,
          paidOn: d(k, safeDay(k, 5 + (i % 4) * 3)),
          method: SAMPLE_MEMBERS[i][1],
          note: partial ? 'आधी किस्त जमा' : null,
        });
        installments++;
      }
    }

    const loanSpecs = [
      { m: 0, principal: 2000000, method: 'reducing', rate: 200, inst: 200000 },
      { m: 2, principal: 5000000, method: 'flat', rate: 150, inst: 500000 },
      { m: 5, principal: 1000000, method: 'fixed', fixed: 15000, inst: 100000 },
    ];
    let repayments = 0;
    for (const s of loanSpecs) {
      const takenK = startK + 1;
      const loan = await createLoan(tx, members[s.m], {
        takenOn: d(takenK, 10), principalPaise: s.principal, interestMethod: s.method,
        rateBp: s.rate ?? 0, ratePeriod: 'month', fixedInterestPaise: s.fixed ?? 0,
        installmentPaise: s.inst, openingInterestPaise: 0, note: 'परीक्षण कर्ज',
      });
      for (let k = takenK + 1; k < nowK; k++) {
        const reps = await tx.loanRepayment.findMany({ where: { loanId: loan.id, voidedAt: null } });
        const paidOn = d(k, 12);
        const split = suggestSplit(loan, reps, parseDate(paidOn), s.inst);
        await createRepayment(tx, loan, {
          paidOn, totalPaise: split.interestPaise + split.principalPaise,
          principalPaise: split.principalPaise, interestPaise: split.interestPaise, method: 'cash',
        });
        repayments++;
      }
    }

    const batch = await tx.historyBatch.create({ data: { title: 'पुराना रजिस्टर (नमूना)', note: 'जाँच के लिए नमूना पंक्तियाँ' } });
    const old = startK - 1;
    const rows = [
      { kind: 'installment', data: { memberNo: '101', month: String(fromYm(old).month), year: String(fromYm(old).year), amount: '1000', paidOn: d(old, 6), method: 'cash' } },
      { kind: 'installment', data: { memberNo: '102', month: String(fromYm(old).month), year: String(fromYm(old).year), amount: '1000', paidOn: d(old, 8), method: 'upi' } },
      { kind: 'installment', data: { memberNo: '999', month: String(fromYm(old).month), year: String(fromYm(old).year), amount: '1000', paidOn: d(old, 8) } },
    ];
    await tx.historyRow.createMany({ data: rows.map((r, i) => ({ batchId: batch.id, lineNo: i + 1, ...r })) });

    return { members: members.length, installments, loans: loanSpecs.length, repayments, historyRows: rows.length };
  }, { timeout: 60000 });
}

'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, MoneyInput, Segmented, TextArea, Input } from './ui';
import MemberPicker from './MemberPicker';
import DateField, { MonthYearSelect } from './DateField';
import LoanTerms from './LoanTerms';
import { METHOD_OPTIONS } from './InstallmentEdit';
import { nowMonthYear, todayIST, fmtDate } from '@/lib/format';

export const KINDS = ['installment', 'loan', 'repayment'];

export function blankRow(kind) {
  const now = nowMonthYear();
  if (kind === 'installment') return { memberNo: '', month: String(now.month), year: String(now.year - 1), amount: '1000', paidOn: `${now.year - 1}-${String(now.month).padStart(2, '0')}-05`, method: 'cash', note: '' };
  if (kind === 'loan') return { memberNo: '', takenOn: todayIST(), principal: '', interestMethod: 'reducing', rate: '2', ratePeriod: 'month', fixedInterest: '', interestFromMonth: '', interestFromYear: '', installment: '', openingInterest: '', note: '' };
  return { memberNo: '', loanNo: '', paidOn: todayIST(), total: '', principal: '', interest: '', method: 'cash', note: '' };
}

/** One-line description of a row for tables. */
export function describeRow(t, kind, d) {
  if (kind === 'installment') return `${t(`m${d.month}`, { defaultValue: d.month })} ${d.year ?? ''} · ${d.amount ? `₹${d.amount}` : '—'} · ${fmtDate(d.paidOn)}`;
  if (kind === 'loan') {
    const rule = d.interestMethod === 'fixed' ? `₹${d.fixedInterest ?? ''}` : `${d.rate ?? ''}%`;
    return `${fmtDate(d.takenOn)} · ₹${d.principal ?? '—'} · ${t(`loan.method.${d.interestMethod}`, { defaultValue: d.interestMethod ?? '' })} ${rule}`;
  }
  return `${fmtDate(d.paidOn)} · ₹${d.total ?? '—'} (${t('loans.toPrincipal')} ₹${d.principal ?? 0} + ${t('loans.toInterest')} ₹${d.interest ?? 0})${d.loanNo ? ` · ${t('loan.no', { n: d.loanNo })}` : ''}`;
}

/** The fields for one old record. `d` is the row's data object (strings), setD updates it. */
export default function HistoryRowForm({ kind, d, setD }) {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState(null);
  const set = (k) => (v) => setD((s) => ({ ...s, [k]: v }));

  // LoanTerms works with its own shape; map to/from the row fields
  const loanF = {
    takenOn: d.takenOn, principal: d.principal, interestMethod: d.interestMethod, rate: d.rate, ratePeriod: d.ratePeriod || 'month',
    fixedInterest: d.fixedInterest, customFrom: Boolean(d.interestFromMonth),
    interestFrom: d.interestFromMonth ? { month: Number(d.interestFromMonth), year: Number(d.interestFromYear) } : null,
    installment: d.installment, openingInterest: d.openingInterest, note: d.note,
  };
  const setLoanF = (fn) => setD((s) => {
    const n = fn(loanF);
    return {
      ...s, takenOn: n.takenOn, principal: n.principal, interestMethod: n.interestMethod, rate: n.rate, ratePeriod: n.ratePeriod,
      fixedInterest: n.fixedInterest, interestFromMonth: n.customFrom && n.interestFrom ? String(n.interestFrom.month) : '',
      interestFromYear: n.customFrom && n.interestFrom ? String(n.interestFrom.year) : '', installment: n.installment,
      openingInterest: n.openingInterest, note: n.note,
    };
  });

  return (
    <div className="space-y-5">
      <Field label={t('inst.pickMember')} required>
        <MemberPicker key={memberId ?? d.memberNo ?? 'none'} value={memberId} matchNo={d.memberNo} status="" onChange={(id, m) => { setMemberId(id); set('memberNo')(m ? String(m.memberNo) : ''); }} />
      </Field>

      {kind === 'installment' && (
        <>
          <Field label={t('history.oldMonth')} required>
            <MonthYearSelect month={Number(d.month) || 1} year={Number(d.year) || nowMonthYear().year} onChange={({ month, year }) => setD((s) => ({ ...s, month: String(month), year: String(year) }))} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('history.oldAmount')} required><MoneyInput value={d.amount} onChange={set('amount')} /></Field>
            <Field label={t('inst.paidOn')} required><DateField value={d.paidOn} onChange={set('paidOn')} /></Field>
          </div>
          <Field label={t('inst.method')}><Segmented value={d.method || 'cash'} onChange={set('method')} options={METHOD_OPTIONS(t)} size="sm" /></Field>
        </>
      )}

      {kind === 'loan' && <LoanTerms f={loanF} setF={setLoanF} autoEmi={false} />}

      {kind === 'repayment' && (
        <>
          <Field label={t('history.loanNo')} hint={t('history.loanNoHint')}>
            <Input inputMode="numeric" value={d.loanNo} onChange={(e) => set('loanNo')(e.target.value.replace(/\D/g, ''))} className="num" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('loans.paidOn')} required><DateField value={d.paidOn} onChange={set('paidOn')} /></Field>
            <Field label={t('loans.totalPaid')} required><MoneyInput value={d.total} onChange={set('total')} /></Field>
            <Field label={t('loans.toPrincipalLong')} required><MoneyInput value={d.principal} onChange={set('principal')} /></Field>
            <Field label={t('loans.toInterestLong')} required><MoneyInput value={d.interest} onChange={set('interest')} /></Field>
          </div>
          <Field label={t('field.method')}><Segmented value={d.method || 'cash'} onChange={set('method')} options={METHOD_OPTIONS(t)} size="sm" /></Field>
        </>
      )}

      {kind !== 'loan' && (
        <Field label={t('field.note')}><TextArea value={d.note ?? ''} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={500} /></Field>
      )}
    </div>
  );
}


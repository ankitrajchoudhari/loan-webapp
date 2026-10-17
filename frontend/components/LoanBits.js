'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Field, Input, Kpi, MoneyInput, Notice, Segmented, TableWrap } from './ui';
import { api } from '@/lib/api';
import { money, toPaise } from '@/lib/format';

/** Bank-style status chip: regular / overdue (months behind) / fully repaid. */
export function LoanStatus({ ins }) {
  const { t } = useTranslation();
  if (!ins) return null;
  if (ins.status === 'closed') return <Badge tone="ok" icon="check">{t('loan.closed')}</Badge>;
  if (ins.status === 'overdue') return <Badge tone="bad" icon="alert">{t('loanx.overdueMonths', { n: ins.monthsBehind })}</Badge>;
  return <Badge tone="ok">{t('loanx.regular')}</Badge>;
}

const ym = (p) => (p ? `${p.month}/${p.year}` : '—');

/** Summary of a repayment plan: installment, months, total interest, total payable, payoff month. */
export function PlanSummary({ plan, installmentPaise, principalPaise }) {
  const { t } = useTranslation();
  if (!plan) return null;
  if (!plan.feasible) return <Notice>{t('err.installment_too_low')}</Notice>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {installmentPaise != null && <Kpi label={t('calc.emi')} value={money(installmentPaise)} tone="brand" />}
      <Kpi label={t('calc.months')} value={plan.months} />
      <Kpi label={t('calc.totalInterest')} value={money(plan.totalInterest ?? plan.futureInterestPaise)} tone="warn" />
      <Kpi label={t('calc.payoff')} value={<MonthName p={plan.payoff} />} tone="ok"
        sub={principalPaise != null ? `${t('calc.totalPayable')} ${money(plan.totalPayable ?? plan.futurePayablePaise)}` : null} />
    </div>
  );
}

function MonthName({ p }) {
  const { t } = useTranslation();
  return p ? `${t(`m${p.month}`)} ${p.year}` : ym(p);
}

/** Month-by-month schedule table (how each installment splits into interest and principal). */
export function ScheduleTable({ rows, limit = 360 }) {
  const { t } = useTranslation();
  if (!rows?.length) return <p className="text-muted">{t('common.empty')}</p>;
  return (
    <TableWrap min={600}>
      <thead>
        <tr>
          <th>#</th>
          <th>{t('common.month')}</th>
          <th className="r">{t('calc.installment')}</th>
          <th className="r">{t('loans.toInterest')}</th>
          <th className="r">{t('loans.toPrincipal')}</th>
          <th className="r">{t('calc.balance')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((r, i) => (
          <tr key={`${r.year}-${r.month}`}>
            <td className="num text-muted">{i + 1}</td>
            <td className="font-semibold">{t(`m${r.month}`)} {r.year}</td>
            <td className="r font-semibold">{money(r.payment)}</td>
            <td className="r text-warn">{money(r.toInterest)}</td>
            <td className="r text-ok">{money(r.toPrincipal)}</td>
            <td className="r">{money(r.balance)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/**
 * EMI calculator form. Type amount + rate + method, then either months (→ EMI) or EMI (→ months).
 * Calls the server so the numbers are exactly the ones the ledger will use.
 */
export function EmiCalculator({ initial, onResult, compact }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ principal: '', interestMethod: 'reducing', rate: '2', ratePeriod: 'month', fixedInterest: '', by: 'months', months: '12', installment: '', ...initial });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!toPaise(f.principal)) {
      setRes(null);
      return;
    }
    const id = setTimeout(() => {
      api('/loans/calculator', {
        method: 'POST',
        body: {
          principalPaise: f.principal, interestMethod: f.interestMethod, rateBp: f.interestMethod === 'fixed' ? '0' : f.rate,
          ratePeriod: f.ratePeriod, fixedInterestPaise: f.interestMethod === 'fixed' ? f.fixedInterest : '',
          months: f.by === 'months' ? f.months : '', installmentPaise: f.by === 'emi' ? f.installment : '',
        },
      })
        .then((r) => { setRes(r); setErr(null); onResult?.(r, f); })
        .catch((e) => { setRes(null); setErr(e.details?.[0]?.message ?? e.code); });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('loans.principal')}><MoneyInput value={f.principal} onChange={set('principal')} /></Field>
        <Field label={t('loans.method')}>
          <Segmented value={f.interestMethod} onChange={set('interestMethod')} size="sm"
            options={['reducing', 'flat', 'fixed'].map((m) => ({ value: m, label: t(`loan.methodShort.${m}`) }))} />
        </Field>
        {f.interestMethod === 'fixed' ? (
          <Field label={t('loans.fixedInterest')}><MoneyInput value={f.fixedInterest} onChange={set('fixedInterest')} /></Field>
        ) : (
          <Field label={t('loans.rate')}>
            <div className="flex gap-2">
              <Input inputMode="decimal" value={f.rate} onChange={(e) => set('rate')(e.target.value.replace(/[^\d.]/g, ''))} className="num" />
              <div className="w-48 shrink-0">
                <Segmented value={f.ratePeriod} onChange={set('ratePeriod')} size="sm" options={[{ value: 'month', label: t('loan.perMonth') }, { value: 'year', label: t('loan.perYear') }]} />
              </div>
            </div>
          </Field>
        )}
        <Field label={t('calc.findBy')}>
          <Segmented value={f.by} onChange={set('by')} size="sm" options={[{ value: 'months', label: t('calc.byMonths') }, { value: 'emi', label: t('calc.byEmi') }]} />
          <div className="mt-2">
            {f.by === 'months' ? (
              <Input inputMode="numeric" value={f.months} onChange={(e) => set('months')(e.target.value.replace(/\D/g, '').slice(0, 3))} className="num" placeholder={t('calc.months')} aria-label={t('calc.months')} />
            ) : (
              <MoneyInput value={f.installment} onChange={set('installment')} aria-label={t('calc.emi')} />
            )}
          </div>
        </Field>
      </div>
      {err && <Notice>{t(`err.${err}`, { defaultValue: t('err.generic') })}</Notice>}
      {res && (
        <>
          <PlanSummary plan={res.plan} installmentPaise={res.installmentPaise} principalPaise={toPaise(f.principal)} />
          {!compact && res.plan.feasible && (
            <details className="rounded-2xl border border-line bg-white p-3" open>
              <summary className="cursor-pointer font-semibold text-maroon">{t('calc.schedule')}</summary>
              <div className="mt-3"><ScheduleTable rows={res.plan.rows} /></div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

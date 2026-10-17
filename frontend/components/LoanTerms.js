'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, MoneyInput, Input, Segmented, TextArea } from './ui';
import DateField, { MonthYearSelect } from './DateField';
import { PlanSummary } from './LoanBits';
import { api } from '@/lib/api';
import { rupeesText, toPaise } from '@/lib/format';

export const emptyTerms = (settings, today) => ({
  takenOn: today,
  principal: '',
  interestMethod: settings?.defaultInterestMethod ?? 'reducing',
  rate: settings ? String(settings.defaultRateBp / 100) : '2',
  ratePeriod: settings?.defaultRatePeriod ?? 'month',
  fixedInterest: '',
  customFrom: false,
  interestFrom: null,
  installment: '',
  openingInterest: '',
  note: '',
});

export const termsFromLoan = (l) => ({
  takenOn: l.takenOn,
  principal: rupeesText(l.principalPaise),
  interestMethod: l.interestMethod,
  rate: String(l.rateBp / 100),
  ratePeriod: l.ratePeriod,
  fixedInterest: rupeesText(l.fixedInterestPaise),
  customFrom: true,
  interestFrom: { month: l.interestFromMonth, year: l.interestFromYear },
  installment: rupeesText(l.installmentPaise),
  openingInterest: rupeesText(l.openingInterestPaise),
  note: l.note ?? '',
});

/** Form values → API body (amounts as typed text; the server converts them exactly). */
export const termsBody = (f) => ({
  takenOn: f.takenOn,
  principalPaise: f.principal,
  interestMethod: f.interestMethod,
  rateBp: f.interestMethod === 'fixed' ? '0' : f.rate,
  ratePeriod: f.ratePeriod,
  fixedInterestPaise: f.interestMethod === 'fixed' ? f.fixedInterest : '',
  interestFromMonth: f.customFrom && f.interestFrom ? f.interestFrom.month : '',
  interestFromYear: f.customFrom && f.interestFrom ? f.interestFrom.year : '',
  installmentPaise: f.installment,
  openingInterestPaise: f.openingInterest,
  note: f.note,
});

/**
 * "In how many months?" → the EMI is worked out by the server (bank formula) and filled into the
 * loan installment, with the payoff month and total interest shown right away.
 */
function AutoEmi({ f, setF }) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState(null);
  useEffect(() => {
    if (!f.months || !toPaise(f.principal)) {
      setPlan(null);
      return;
    }
    const id = setTimeout(() => {
      api('/loans/calculator', {
        method: 'POST',
        body: {
          principalPaise: f.principal, interestMethod: f.interestMethod, rateBp: f.interestMethod === 'fixed' ? '0' : f.rate,
          ratePeriod: f.ratePeriod, fixedInterestPaise: f.interestMethod === 'fixed' ? f.fixedInterest : '', months: f.months, takenOn: f.takenOn,
        },
      })
        .then((r) => {
          setPlan(r);
          setF((s) => ({ ...s, installment: rupeesText(r.installmentPaise) }));
        })
        .catch(() => setPlan(null));
    }, 350);
    return () => clearTimeout(id);
  }, [f.months, f.principal, f.interestMethod, f.rate, f.ratePeriod, f.fixedInterest, f.takenOn, setF]);

  return (
    <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50/50 p-4">
      <Field label={t('calc.monthsQuestion')} hint={t('calc.monthsHint')}>
        <Input inputMode="numeric" value={f.months ?? ''} placeholder="12" onChange={(e) => setF((s) => ({ ...s, months: e.target.value.replace(/\D/g, '').slice(0, 3) }))} className="num" />
      </Field>
      {plan && <div className="mt-3"><PlanSummary plan={plan.plan} installmentPaise={plan.installmentPaise} principalPaise={toPaise(f.principal)} /></div>}
    </div>
  );
}

/** The agreed loan terms. Every interest method is explained in words so the choice is clear. */
export default function LoanTerms({ f, setF, showOld = true, autoEmi = true }) {
  const { t } = useTranslation();
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const [ty, tm] = (f.takenOn || '').split('-').map(Number);
  const nextAfterTaken = tm === 12 ? { month: 1, year: ty + 1 } : { month: tm + 1, year: ty };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('loans.takenOn')} required>
          <DateField value={f.takenOn} onChange={set('takenOn')} />
        </Field>
        <Field label={t('loans.principal')} required>
          <MoneyInput value={f.principal} onChange={set('principal')} />
        </Field>
      </div>

      <Field label={t('loans.method')} required>
        <div className="grid gap-2">
          {['reducing', 'flat', 'fixed'].map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${f.interestMethod === m ? 'border-maroon bg-brand-50' : 'border-line bg-white'}`}>
              <input type="radio" name="method" className="mt-1.5 size-5 accent-[#7a1f2b]" checked={f.interestMethod === m} onChange={() => set('interestMethod')(m)} />
              <span>
                <span className="block font-semibold">{t(`loan.method.${m}`)}</span>
                <span className="block text-sm text-muted">{t(`loan.methodHelp.${m}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {f.interestMethod === 'fixed' ? (
        <Field label={t('loans.fixedInterest')} required>
          <MoneyInput value={f.fixedInterest} onChange={set('fixedInterest')} />
        </Field>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('loans.rate')} required hint={t('loans.rateHint')}>
            <div className="relative">
              <Input inputMode="decimal" value={f.rate} onChange={(e) => set('rate')(e.target.value.replace(/[^\d.]/g, ''))} className="num pr-10" />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted">%</span>
            </div>
          </Field>
          <Field label={t('loans.ratePeriod')}>
            <Segmented value={f.ratePeriod} onChange={set('ratePeriod')} options={[{ value: 'month', label: t('loan.perMonth') }, { value: 'year', label: t('loan.perYear') }]} />
          </Field>
        </div>
      )}

      <Field label={t('loans.interestFrom')} hint={!f.customFrom ? t('loans.interestFromDefault', { month: t(`m${nextAfterTaken.month}`), year: nextAfterTaken.year }) : null}>
        <Segmented
          value={f.customFrom ? 'custom' : 'default'}
          onChange={(v) => setF((s) => ({ ...s, customFrom: v === 'custom', interestFrom: s.interestFrom ?? nextAfterTaken }))}
          options={[{ value: 'default', label: t('loans.fromNextMonth') }, { value: 'custom', label: t('loans.fromChosen') }]}
          size="sm"
        />
        {f.customFrom && (
          <div className="mt-2">
            <MonthYearSelect month={f.interestFrom?.month ?? nextAfterTaken.month} year={f.interestFrom?.year ?? nextAfterTaken.year} onChange={set('interestFrom')} />
          </div>
        )}
      </Field>

      {autoEmi && <AutoEmi f={f} setF={setF} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('loans.installment')} hint={t('loans.installmentHint')}>
          <MoneyInput value={f.installment} onChange={(v) => setF((s) => ({ ...s, installment: v, months: '' }))} />
        </Field>
        {showOld && (
          <Field label={t('loans.openingInterest')} hint={t('loans.openingInterestHint')}>
            <MoneyInput value={f.openingInterest} onChange={set('openingInterest')} />
          </Field>
        )}
      </div>

      <Field label={t('field.note')}>
        <TextArea value={f.note} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={500} />
      </Field>
    </div>
  );
}

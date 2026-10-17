'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ButtonLink, Card, ErrorBox, Field, Input, Loading, MoneyInput, Notice, Row } from '@/components/ui';
import { Icon } from '@/components/icons';
import { BankCard, DocumentsList, EmiTable, APP_TONE } from '@/components/LoanApplication';
import { interestRule } from '@/components/statement';
import { useApi } from '@/lib/hooks';
import { api, getWho } from '@/lib/api';
import { errorText } from '@/lib/i18n';
import { fmtDate, money, toPaise } from '@/lib/format';
import { compressPhoto } from '@/lib/image';
import { searchBanks, BANK_TYPES } from '@/lib/banks';

/** Member: apply for a loan step by step, then follow the decision here. */
export default function LoanPage() {
  const { t } = useTranslation();
  const mine = useApi('/loan-apply/mine');
  const [applying, setApplying] = useState(false);

  if (mine.error) return <ErrorBox error={mine.error} onRetry={mine.reload} />;
  if (!mine.data) return <Loading />;
  const latest = mine.data.applications.find((a) => a.status !== 'cancelled');

  if (!applying && latest) {
    return <Status app={latest} onApplyAgain={() => setApplying(true)} onChange={mine.reload} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-maroon">{t('apply.title')}</h1>
      <Wizard onDone={() => { setApplying(false); mine.reload(); }} />
      <ButtonLink href="/member" variant="ghost" icon="back" full>{t('common.back')}</ButtonLink>
    </div>
  );
}

// --- After applying ---------------------------------------------------------------------------

function Status({ app, onApplyAgain, onChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cancel = async () => {
    if (!window.confirm(t('apply.cancelConfirm'))) return;
    setBusy(true);
    try {
      await api(`/loan-apply/${app.id}/cancel`, { method: 'POST', body: {} });
      onChange();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  const banner = {
    pending: ['bg-warn-bg text-warn border-warn/30', 'clock', t('apply.pendingTitle'), t('apply.pendingText')],
    approved: ['bg-ok-bg text-ok border-ok/30', 'checkCircle', t('apply.approvedTitle'), t('apply.approvedText')],
    rejected: ['bg-bad-bg text-bad border-bad/30', 'alert', t('apply.rejectedTitle'), app.rejectReason],
  }[app.status];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-maroon">{t('apply.myApplication')}</h1>
      <div className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${banner[0]}`}>
        <Icon name={banner[1]} className="mt-0.5 size-7 shrink-0" />
        <div>
          <div className="text-lg font-bold">{banner[2]}</div>
          {banner[3] && <p className="mt-0.5">{banner[3]}</p>}
        </div>
      </div>

      <BankCard bank={app.bank} name={app.member?.fullName} mobile={app.member?.mobileNumber} status={app.status} />

      <Card title={t('apply.summary', { n: app.applicationNo })} icon="handCoins">
        <Row label={t('apply.amount')} value={money(app.amountPaise)} strong />
        <Row label={t('apply.months')} value={t('apply.nMonths', { n: app.months })} />
        <Row label={t('apply.emi')} value={money(app.emiPaise)} tone="warn" />
        <Row label={t('apply.totalInterest')} value={money(app.totalInterestPaise)} />
        <Row label={t('apply.interestRule')} value={<span className="text-right text-sm">{interestRule(t, app)}</span>} />
        <Row label={t('apply.appliedOn')} value={fmtDate(app.createdAt)} />
        <Row label={t('apply.statusLabel')} value={<Badge tone={APP_TONE[app.status]}>{t(`apply.status.${app.status}`)}</Badge>} />
      </Card>

      <Card title={t('apply.documents')} icon="idCard">
        <div className="mb-3 grid gap-x-6 text-sm sm:grid-cols-2">
          <Row label={t('apply.aadhaar')} value={<span className="num">{app.aadhaar}</span>} />
          <Row label={t('apply.pan')} value={<span className="num">{app.pan}</span>} />
        </div>
        <DocumentsList app={app} />
      </Card>

      {error && <ErrorBox error={error} />}
      {app.status === 'pending' && <Button variant="secondary" icon="x" full loading={busy} onClick={cancel}>{t('apply.cancel')}</Button>}
      {app.status === 'rejected' && <Button icon="send" full onClick={onApplyAgain}>{t('apply.again')}</Button>}
      {app.status === 'approved' && <ButtonLink href="/member/month" icon="file" full variant="secondary">{t('member.viewMonth')}</ButtonLink>}
      <ButtonLink href="/member" variant="ghost" icon="back" full>{t('common.back')}</ButtonLink>
    </div>
  );
}

// --- The step-by-step form ----------------------------------------------------------------------

const STEPS = ['loan', 'aadhaar', 'pan', 'bank', 'review'];
const STEP_ICON = { loan: 'calculator', aadhaar: 'idCard', pan: 'file', bank: 'bank', review: 'checkCircle' };
// which step to go back to when the server finds a problem with a field
const FIELD_STEP = { amountPaise: 'loan', months: 'loan', purpose: 'loan', aadhaarNumber: 'aadhaar', panNumber: 'pan', bankName: 'bank', accountHolder: 'bank', accountNumber: 'bank', ifsc: 'bank', photos: 'aadhaar' };

// Aadhaar check digit (Verhoeff) — catches a mistyped number before sending
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const aadhaarOk = (n) => /^[2-9]\d{11}$/.test(n) && [...n].reverse().reduce((c, d, i) => VD[c][VP[i % 8][Number(d)]], 0) === 0;
const panOk = (n) => /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/.test(n);
const ifscOk = (n) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(n);

function Wizard({ onDone }) {
  const { t } = useTranslation();
  const termsApi = useApi('/loan-apply/terms');
  const myName = getWho()?.user?.fullName ?? '';
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ amount: '', months: 12, purpose: '', aadhaar: '', aadhaarFront: null, aadhaarBack: null, pan: '', panPhoto: null, bankName: '', holder: myName, account: '', account2: '', ifsc: '', agree: false });
  const [plan, setPlan] = useState(null);
  const [ifscInfo, setIfscInfo] = useState(null); // { state: 'checking' | 'ok' | 'notFound' | 'unknown', ... }
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF((s) => ({ ...s, [k]: v })); setProblem(null); };
  const terms = termsApi.data?.terms;
  const amountPaise = toPaise(f.amount) ?? 0;

  // live EMI list as the amount / months change
  useEffect(() => {
    if (!terms || amountPaise < 100000 || !f.months) return setPlan(null);
    let stale = false;
    const id = setTimeout(() => {
      api('/loan-apply/plan', { method: 'POST', body: { amountPaise: f.amount, months: f.months } })
        .then((r) => !stale && setPlan(r.plan))
        .catch(() => !stale && setPlan(null));
    }, 250);
    return () => { stale = true; clearTimeout(id); };
  }, [terms, f.amount, f.months, amountPaise]);

  // IFSC: look the branch up as soon as all 11 characters are typed
  useEffect(() => {
    if (!ifscOk(f.ifsc)) return setIfscInfo(null);
    let stale = false;
    setIfscInfo({ state: 'checking' });
    api(`/loan-apply/ifsc/${f.ifsc}`)
      .then((r) => {
        if (stale) return;
        setIfscInfo(r.found ? { state: 'ok', ...r } : { state: 'unknown' });
        if (r.found && r.bank) setF((s) => ({ ...s, bankName: r.bank }));
      })
      .catch((e) => !stale && setIfscInfo({ state: e.code === 'ifsc_not_found' ? 'notFound' : 'unknown' }));
    return () => { stale = true; };
  }, [f.ifsc]);

  if (termsApi.error) return <ErrorBox error={termsApi.error} onRetry={termsApi.reload} />;
  if (!terms) return <Loading />;
  if (!termsApi.data.eligibility.ok) return <NotEligible elig={termsApi.data.eligibility} />;

  const name = STEPS[step];
  const check = () => {
    if (name === 'loan') {
      if (amountPaise < 100000) return 'amount_min';
      if (terms.maxPaise > 0 && amountPaise > terms.maxPaise) return 'amount_too_much';
      if (!f.months || f.months > terms.maxMonths) return 'months_invalid';
      if (!plan) return 'plan_wait';
    }
    if (name === 'aadhaar') {
      if (!aadhaarOk(f.aadhaar)) return 'aadhaar_invalid';
      if (!f.aadhaarFront || !f.aadhaarBack) return 'photo_required';
    }
    if (name === 'pan') {
      if (!panOk(f.pan)) return 'pan_invalid';
      if (!f.panPhoto) return 'photo_required';
    }
    if (name === 'bank') {
      if (f.bankName.trim().length < 2) return 'bank_required';
      if (f.holder.trim().length < 2) return 'holder_required';
      if (!/^\d{9,18}$/.test(f.account)) return 'account_invalid';
      if (f.account !== f.account2) return 'account_mismatch';
      if (!ifscOk(f.ifsc)) return 'ifsc_invalid';
      if (ifscInfo?.state === 'notFound') return 'ifsc_not_found';
      if (ifscInfo?.state === 'checking') return 'plan_wait';
    }
    if (name === 'review' && !f.agree) return 'agree_required';
    // the three photos travel in one request; hosting limits a request to about 4.5 MB
    if (name === 'review' && [f.aadhaarFront, f.aadhaarBack, f.panPhoto].reduce((s, x) => s + (x?.length ?? 0), 0) > 4_000_000) return 'photos_too_big';
    return null;
  };

  const next = async () => {
    const err = check();
    if (err) return setProblem(err);
    if (name !== 'review') {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);
    try {
      await api('/loan-apply', {
        method: 'POST',
        body: {
          amountPaise: f.amount, months: f.months, purpose: f.purpose,
          aadhaarNumber: f.aadhaar, panNumber: f.pan,
          bankName: f.bankName, accountHolder: f.holder, accountNumber: f.account, ifsc: f.ifsc,
          photos: { aadhaarFront: f.aadhaarFront, aadhaarBack: f.aadhaarBack, pan: f.panPhoto }, agree: true,
        },
      });
      onDone();
    } catch (e) {
      const field = e.code === 'validation' ? e.details?.[0]?.field : null;
      if (field && FIELD_STEP[field.split('.')[0]]) setStep(STEPS.indexOf(FIELD_STEP[field.split('.')[0]]));
      setProblem(e);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* progress */}
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button key={s} type="button" disabled={i >= step} onClick={() => setStep(i)} aria-label={t(`apply.step.${s}`)}
              className={`grid size-9 shrink-0 place-items-center rounded-full border-2 transition ${i < step ? 'border-ok bg-ok text-white' : i === step ? 'border-maroon bg-maroon text-white' : 'border-line bg-white text-muted'}`}>
              <Icon name={i < step ? 'check' : STEP_ICON[s]} className="size-4.5" />
            </button>
          )).flatMap((el, i) => (i ? [<span key={`l${i}`} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-ok' : 'bg-line'}`} />, el] : [el]))}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold text-maroon">{t(`apply.step.${name}`)}</span>
          <span className="text-sm text-muted">{t('apply.stepOf', { n: step + 1, total: STEPS.length })}</span>
        </div>
      </div>

      <Card>
        {name === 'loan' && <StepLoan f={f} set={set} terms={terms} plan={plan} amountPaise={amountPaise} />}
        {name === 'aadhaar' && <StepAadhaar f={f} set={set} />}
        {name === 'pan' && <StepPan f={f} set={set} />}
        {name === 'bank' && <StepBank f={f} set={set} ifscInfo={ifscInfo} />}
        {name === 'review' && <StepReview f={f} set={set} plan={plan} terms={terms} goTo={(s) => setStep(STEPS.indexOf(s))} />}
      </Card>

      {problem && <ErrorBox error={typeof problem === 'string' ? t(`apply.err.${problem}`, { defaultValue: errorText(t, problem) }) : problem} />}

      <div className="sticky bottom-2 z-10 grid grid-cols-[auto_1fr] gap-2 rounded-2xl bg-cream/90 p-1 backdrop-blur">
        <Button variant="secondary" icon="chevronLeft" disabled={step === 0 || busy} onClick={() => { setStep((s) => s - 1); setProblem(null); }}>{t('common.back')}</Button>
        <Button variant={name === 'review' ? 'success' : 'primary'} icon={name === 'review' ? 'send' : 'chevronRight'} loading={busy} onClick={next}>
          {name === 'review' ? t('apply.submit') : t('apply.next')}
        </Button>
      </div>
    </div>
  );
}

/** A running loan is not yet 80% repaid: show how far along each one is. */
function NotEligible({ elig }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border-2 border-warn/30 bg-warn-bg p-4 text-warn">
          <Icon name="lock" className="mt-0.5 size-7 shrink-0" />
          <div>
            <div className="text-lg font-bold">{t('apply.notEligibleTitle')}</div>
            <p className="mt-0.5">{t('apply.notEligibleText', { pct: elig.neededPct })}</p>
          </div>
        </div>
        {elig.loans.map((l) => (
          <div key={l.loanNo} className="rounded-2xl border border-line p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-bold">{t('loan.no', { n: l.loanNo })} · {money(l.principalPaise)}</span>
              <span className={`num font-bold ${l.morePaise ? 'text-warn' : 'text-ok'}`}>{l.repaidPct}%</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-stone-200">
              <div className={`h-full rounded-full ${l.morePaise ? 'bg-brand' : 'bg-ok'}`} style={{ width: `${Math.min(100, l.repaidPct)}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${elig.neededPct}%` }} title={`${elig.neededPct}%`} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm">
              <span className="text-muted">{t('apply.repaidSoFar', { amount: money(l.repaidPaise) })}</span>
              {l.morePaise > 0
                ? <span className="font-semibold text-warn">{t('apply.payMoreToApply', { amount: money(l.morePaise) })}</span>
                : <span className="font-semibold text-ok">{t('apply.thisLoanOk')}</span>}
            </div>
          </div>
        ))}
        <ButtonLink href="/member/pay" icon="wallet" variant="success" full>{t('apply.payNowToApply')}</ButtonLink>
      </div>
    </Card>
  );
}

function StepLoan({ f, set, terms, plan, amountPaise }) {
  const { t } = useTranslation();
  const choices = [6, 12, 18, 24, 36, 48, 60].filter((m) => m <= terms.maxMonths);
  return (
    <div className="space-y-4">
      <Field label={t('apply.howMuch')} hint={terms.maxPaise > 0 ? t('apply.maxHint', { amount: money(terms.maxPaise) }) : t('apply.minHint')} required>
        <MoneyInput value={f.amount} onChange={set("amount")} autoFocus placeholder="50,000" />
      </Field>
      <Field label={t('apply.forHowLong')} required>
        <div className="flex flex-wrap gap-2">
          {choices.map((m) => (
            <button key={m} type="button" onClick={() => set('months')(m)}
              className={`min-h-11 rounded-xl border-2 px-3.5 font-semibold ${f.months === m ? 'border-maroon bg-maroon text-white' : 'border-line bg-white hover:bg-brand-50'}`}>
              {t('apply.nMonths', { n: m })}
            </button>
          ))}
          <Input inputMode="numeric" aria-label={t('apply.otherMonths')} placeholder={t('apply.otherMonths')} className="num !w-32"
            value={choices.includes(f.months) ? '' : String(f.months || '')}
            onChange={(e) => set('months')(Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0)} />
        </div>
      </Field>
      <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-dark">
        <Icon name="shield" className="size-4.5 shrink-0" />
        <span>{t('apply.interestBySamiti')}: <b>{interestRule(t, terms)}</b></span>
      </div>
      {plan && amountPaise >= 100000 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ok-bg p-2"><div className="text-xs text-ok">{t('apply.emi')}</div><div className="num text-lg font-bold text-ok">{money(plan.emiPaise)}</div></div>
            <div className="rounded-xl bg-warn-bg p-2"><div className="text-xs text-warn">{t('apply.totalInterest')}</div><div className="num text-lg font-bold text-warn">{money(plan.totalInterestPaise)}</div></div>
            <div className="rounded-xl bg-stone-100 p-2"><div className="text-xs text-muted">{t('apply.totalPay')}</div><div className="num text-lg font-bold">{money(plan.totalPayablePaise)}</div></div>
          </div>
          <EmiTable plan={plan} />
        </div>
      )}
      <Field label={t('apply.purpose')}>
        <Input value={f.purpose} onChange={(e) => set('purpose')(e.target.value)} maxLength={300} placeholder={t('apply.purposeHint')} />
      </Field>
    </div>
  );
}

function PhotoPick({ label, value, onChange }) {
  const { t } = useTranslation();
  const camera = useRef(null);
  const gallery = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await compressPhoto(file));
    } catch {
      setError(t('err.photo_invalid'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="mb-1.5 font-semibold">{label}</div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={pick} />
      {value ? (
        <div className="overflow-hidden rounded-2xl border-2 border-ok/40 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="h-40 w-full bg-stone-100 object-contain" />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="checkCircle" className="size-4.5" />{t('apply.photoAdded')}</span>
            <button type="button" onClick={() => gallery.current?.click()} className="text-sm font-semibold text-maroon underline underline-offset-4">{t('common.change')}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-dashed border-line bg-stone-50 p-3">
          <Button variant="secondary" size="md" icon="camera" loading={busy} onClick={() => camera.current?.click()}>{t('apply.takePhoto')}</Button>
          <Button variant="secondary" size="md" icon="upload" disabled={busy} onClick={() => gallery.current?.click()}>{t('apply.choosePhoto')}</Button>
        </div>
      )}
      {error && <p className="mt-1 text-sm font-semibold text-bad">{error}</p>}
    </div>
  );
}

function StepAadhaar({ f, set }) {
  const { t } = useTranslation();
  const shown = f.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ');
  const full = f.aadhaar.length === 12;
  return (
    <div className="space-y-4">
      <Field label={t('apply.aadhaar')} hint={t('apply.aadhaarHint')} required>
        <Input inputMode="numeric" autoComplete="off" value={shown} placeholder="XXXX XXXX XXXX" autoFocus
          onChange={(e) => set('aadhaar')(e.target.value.replace(/\D/g, '').slice(0, 12))} className="num text-xl tracking-wider" />
      </Field>
      {full && (aadhaarOk(f.aadhaar)
        ? <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="checkCircle" className="size-4.5" />{t('apply.aadhaarLooksOk')}</p>
        : <p className="flex items-center gap-1.5 text-sm font-semibold text-bad"><Icon name="alert" className="size-4.5" />{t('apply.err.aadhaar_invalid')}</p>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoPick label={t('apply.doc.aadhaarFront')} value={f.aadhaarFront} onChange={set('aadhaarFront')} />
        <PhotoPick label={t('apply.doc.aadhaarBack')} value={f.aadhaarBack} onChange={set('aadhaarBack')} />
      </div>
      <p className="text-sm text-muted">{t('apply.photoTip')}</p>
    </div>
  );
}

function StepPan({ f, set }) {
  const { t } = useTranslation();
  const full = f.pan.length === 10;
  return (
    <div className="space-y-4">
      <Field label={t('apply.pan')} hint={t('apply.panHint')} required>
        <Input autoComplete="off" autoCapitalize="characters" value={f.pan} placeholder="ABCDE1234F" autoFocus maxLength={10}
          onChange={(e) => set('pan')(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} className="num text-xl tracking-widest" />
      </Field>
      {full && (panOk(f.pan)
        ? <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="checkCircle" className="size-4.5" />{t('apply.panLooksOk')}</p>
        : <p className="flex items-center gap-1.5 text-sm font-semibold text-bad"><Icon name="alert" className="size-4.5" />{t('err.pan_invalid')}</p>)}
      <PhotoPick label={t('apply.doc.pan')} value={f.panPhoto} onChange={set('panPhoto')} />
      <p className="text-sm text-muted">{t('apply.photoTip')}</p>
    </div>
  );
}

function BankSearch({ value, onChange }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const lang = i18n.language === 'en' ? 1 : 0;
  const list = searchBanks(value);
  return (
    <div className="relative">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t('apply.bankSearch')} autoComplete="off" className="pl-12" role="combobox" aria-expanded={open} aria-controls="bank-list" />
      </div>
      {open && list.length > 0 && (
        <ul id="bank-list" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-line bg-white p-1 shadow-xl">
          {list.map(([bank, code, type]) => (
            <li key={`${bank}-${code}`}>
              <button type="button" role="option" aria-selected={value === bank} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(bank); setOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-dark"><Icon name="bank" className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{bank}</span>
                  <span className="block text-xs text-muted">{BANK_TYPES[type][lang]} · {code}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepBank({ f, set, ifscInfo }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Field label={t('apply.bankName')} required>
        <BankSearch value={f.bankName} onChange={set('bankName')} />
      </Field>
      <Field label={t('apply.ifsc')} hint={t('apply.ifscHint')} required>
        <Input autoComplete="off" autoCapitalize="characters" value={f.ifsc} placeholder="SBIN0001234" maxLength={11}
          onChange={(e) => set('ifsc')(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} className="num text-lg tracking-widest" />
      </Field>
      {ifscInfo?.state === 'checking' && <p className="text-sm text-muted">{t('apply.ifscChecking')}</p>}
      {ifscInfo?.state === 'ok' && (
        <div className="flex items-start gap-2 rounded-xl bg-ok-bg px-3 py-2 text-sm text-ok">
          <Icon name="checkCircle" className="mt-0.5 size-4.5 shrink-0" />
          <span><b>{ifscInfo.bank}</b><br />{[ifscInfo.branch, ifscInfo.city, ifscInfo.state].filter(Boolean).join(', ')}</span>
        </div>
      )}
      {ifscInfo?.state === 'notFound' && <p className="flex items-center gap-1.5 text-sm font-semibold text-bad"><Icon name="alert" className="size-4.5" />{t('err.ifsc_not_found')}</p>}
      {ifscInfo?.state === 'unknown' && <p className="text-sm text-warn">{t('apply.ifscUnknown')}</p>}
      <Field label={t('apply.holder')} hint={t('apply.holderHint')} required>
        <Input value={f.holder} onChange={(e) => set('holder')(e.target.value)} maxLength={100} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('apply.account')} required>
          <Input inputMode="numeric" autoComplete="off" value={f.account} onChange={(e) => set('account')(e.target.value.replace(/\D/g, '').slice(0, 18))} className="num text-lg tracking-wider" />
        </Field>
        <Field label={t('apply.account2')} required>
          <Input inputMode="numeric" autoComplete="off" value={f.account2} onChange={(e) => set('account2')(e.target.value.replace(/\D/g, '').slice(0, 18))} onPaste={(e) => e.preventDefault()}
            className={`num text-lg tracking-wider ${f.account2 && f.account2 !== f.account ? '!border-bad' : ''}`} />
        </Field>
      </div>
      {f.account2.length > 0 && f.account2 === f.account && <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="checkCircle" className="size-4.5" />{t('apply.accountMatch')}</p>}
    </div>
  );
}

function StepReview({ f, set, plan, terms, goTo }) {
  const { t } = useTranslation();
  const Edit = ({ to }) => <button type="button" onClick={() => goTo(to)} className="text-sm font-semibold text-maroon underline underline-offset-4">{t('common.change')}</button>;
  return (
    <div className="space-y-4">
      <BankCard bank={{ name: f.bankName, holder: f.holder, account: f.account, ifsc: f.ifsc }} name={f.holder} />
      <div className="rounded-2xl bg-stone-50 p-3">
        <div className="mb-1 flex items-center justify-between"><span className="font-bold text-maroon">{t('apply.step.loan')}</span><Edit to="loan" /></div>
        <Row label={t('apply.amount')} value={money(toPaise(f.amount))} strong />
        <Row label={t('apply.months')} value={t('apply.nMonths', { n: f.months })} />
        {plan && <Row label={t('apply.emi')} value={money(plan.emiPaise)} tone="warn" />}
        {plan && <Row label={t('apply.totalInterest')} value={money(plan.totalInterestPaise)} />}
        <Row label={t('apply.interestRule')} value={<span className="text-right text-sm">{interestRule(t, terms)}</span>} />
      </div>
      <div className="rounded-2xl bg-stone-50 p-3">
        <div className="mb-1 flex items-center justify-between"><span className="font-bold text-maroon">{t('apply.documents')}</span><Edit to="aadhaar" /></div>
        <Row label={t('apply.aadhaar')} value={<span className="num">XXXX XXXX {f.aadhaar.slice(-4)}</span>} />
        <Row label={t('apply.pan')} value={<span className="num">{f.pan}</span>} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {[f.aadhaarFront, f.aadhaarBack, f.panPhoto].map((src, i) => <img key={i} src={src} alt="" className="h-20 w-full rounded-lg bg-white object-cover" />)}
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line bg-white p-3">
        <input type="checkbox" checked={f.agree} onChange={(e) => set('agree')(e.target.checked)} className="mt-1 size-5 shrink-0 accent-maroon" />
        <span className="text-sm">{t('apply.agree')}</span>
      </label>
      <Notice tone="brand" icon="shield">{t('apply.privacy')}</Notice>
    </div>
  );
}

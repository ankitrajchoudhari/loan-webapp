'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ButtonLink, Card, ErrorBox, Field, Input, Loading, MoneyInput, Notice, Row } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';
import { fmtDateTime, money, rupeesText, toPaise } from '@/lib/format';
import { LIVE_MS } from '@/lib/hooks';
import { compressPhoto } from '@/lib/image';

const STATUS_TONE = { initiated: 'warn', submitted: 'brand', confirmed: 'ok', rejected: 'bad', cancelled: 'neutral' };

/**
 * Pay dues: the amount is filled in automatically (editable).
 * UPI: QR + UPI id + "open UPI app"; after paying, the member uploads the payment screenshot and the
 * page keeps checking until staff confirm (dues cleared, receipt) or reject (failed). Or choose to pay cash.
 */
export default function Pay() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async (silent = false) => {
    try {
      const [s, h] = await Promise.all([api('/pay/summary'), api('/pay/history')]);
      setData(s);
      setHistory(h.payments);
      setError(null);
    } catch (e) {
      if (silent !== true) setError(e); // a quiet refresh that fails keeps what is on screen
    }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => document.visibilityState === 'visible' && load(true);
    const id = setInterval(refresh, LIVE_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const open = data.open[0];
  const latest = history[0];

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-2xl font-bold text-maroon">{t('pay.title')}</h1>
      {open ? (
        <OpenPayment key={`${open.id}-${open.amountPaise}`} payment={open} upi={data.upi} dues={data.dues} onChange={load} />
      ) : (
        <>
          {latest && ['confirmed', 'rejected'].includes(latest.status) && Date.now() - new Date(latest.confirmedAt ?? latest.createdAt).getTime() < 30 * 60 * 1000 && (
            <Outcome payment={latest} />
          )}
          <NewPayment data={data} onCreated={load} />
        </>
      )}
      <History items={history} />
    </div>
  );
}

function Outcome({ payment }) {
  const { t } = useTranslation();
  if (payment.status === 'confirmed') {
    return (
      <div className="rounded-2xl border-2 border-ok/40 bg-ok-bg p-4 text-ok">
        <div className="flex items-center gap-2 text-lg font-bold"><Icon name="checkCircle" className="size-6" />{t('pay.success', { amount: money(payment.totalPaise) })}</div>
        <Link href={`/receipt/${payment.id}`} className="mt-1 inline-block font-semibold underline underline-offset-4">{t('pay.viewReceipt')}</Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-bad/40 bg-bad-bg p-4 text-bad" role="alert">
      <div className="flex items-center gap-2 text-lg font-bold"><Icon name="alert" className="size-6" />{t('pay.failed')}</div>
      {payment.rejectReason && <div className="mt-1 text-sm">{payment.rejectReason}</div>}
    </div>
  );
}

/**
 * Pay screen: a summary of what is due, then one list of choices (installment, each loan's EMI,
 * EMIs ahead, settlement, everything) — tap one — and a checkout bar at the bottom (UPI or cash).
 */
function NewPayment({ data, onCreated }) {
  const { t } = useTranslation();
  const { dues } = data;
  const loans = data.loans ?? [];
  const feePaise = data.feePaise ?? 0;
  const credit = dues.creditPaise ?? 0;
  const instNet = Math.max(0, dues.installmentPaise - Math.min(credit, dues.installmentPaise));
  const loanDue = loans.reduce((t, l) => t + l.dueNowPaise, 0);
  const loanLeft = loans.reduce((t, l) => t + l.payoffPaise, 0);
  const [ahead, setAhead] = useState({}); // loanId → EMIs to pay ahead
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // every choice the member can tap
  const options = [];
  if (instNet > 0) options.push({ key: 'inst', purpose: 'installment', amountPaise: Math.max(100, instNet), label: t('pay.instTitle') });
  for (const l of loans) {
    if (l.dueNowPaise > 0) options.push({ key: `emi-${l.loanId}`, purpose: 'loan', loanId: l.loanId, amountPaise: l.dueNowPaise, label: t('pay.emiTitle', { n: l.loanNo }) });
    const n = ahead[l.loanId] ?? 1;
    if (l.installmentPaise > 0 && l.payoffPaise > l.installmentPaise) options.push({ key: `ahead-${l.loanId}`, purpose: 'loan', loanId: l.loanId, amountPaise: Math.min(l.payoffPaise, l.installmentPaise * n), label: t('pay.advanceFor', { n: l.loanNo, count: n }) });
    if (l.payoffPaise > 0) options.push({ key: `settle-${l.loanId}`, purpose: 'loan', loanId: l.loanId, amountPaise: l.payoffPaise, label: t('pay.settleTitle', { n: l.loanNo }) });
  }
  if (instNet > 0 && loanDue > 0) options.push({ key: 'all', purpose: 'all', amountPaise: dues.payablePaise, label: t('pay.allTitle') });
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));

  // start with what the link asked for (home "Pay EMI" → ?loan=…), else the first thing due
  useEffect(() => {
    if (sel) return;
    const q = new URLSearchParams(window.location.search);
    const firstOf = (prefix) => options.find((o) => o.key.startsWith(prefix))?.key;
    const ask = q.get('loan');
    const want = ask === 'settle' ? firstOf('settle-') : ask === 'ahead' ? (firstOf('ahead-') || firstOf('settle-')) : ask ? (firstOf('emi-') || firstOf('ahead-') || firstOf('settle-')) : null;
    setSel(want || (byKey.inst && 'inst') || firstOf('emi-') || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chosen = sel ? byKey[sel] : null;

  const start = async (method) => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api('/pay', { method: 'POST', body: { method, amountPaise: rupeesText(chosen.amountPaise), purpose: chosen.purpose, loanId: chosen.loanId } });
      await onCreated();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-36">
      {/* summary */}
      {dues.payablePaise > 0 ? (
        <section className="hero-card relative overflow-hidden rounded-[1.6rem] p-5 text-white">
          <p className="eyebrow text-gold">{t('pay.dueNowTitle')}</p>
          <p className="num mt-1 text-[2.4rem] font-extrabold leading-none tracking-tight">{money(dues.payablePaise)}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            {instNet > 0 && <span className="rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15">{t('pay.chipInst', { amount: money(instNet) })}</span>}
            {loanDue > 0 && <span className="rounded-full bg-white/12 px-3 py-1 ring-1 ring-white/15">{t('pay.chipEmi', { amount: money(loanDue) })}</span>}
            {credit > 0 && <span className="rounded-full bg-gold px-3 py-1 text-[#3a0c14]">{t('pay.chipCredit', { amount: money(credit) })}</span>}
          </div>
        </section>
      ) : (
        <section className="surface flex items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ok text-white"><Icon name="check" className="size-7" strokeWidth={3} /></span>
          <div>
            <p className="text-lg font-bold">{t('pay.upToDate')}</p>
            <p className="text-sm text-muted">{loanLeft > 0 ? t('pay.upToDateLoan', { amount: money(loanLeft) }) : t('pay.upToDateNoLoan')}</p>
          </div>
        </section>
      )}

      <div>
        <h2 className="eyebrow mb-2 px-1 text-muted">{t('pay.whatToPay')}</h2>
        <div className="space-y-2.5" role="radiogroup" aria-label={t('pay.whatToPay')}>
          {/* installment */}
          {instNet > 0 ? (
            <Choice selected={sel === 'inst'} onSelect={() => setSel('inst')} icon="calendar" title={t('pay.instTitle')}
              sub={dues.installments.map((i) => `${t(`m${i.month}`)} ${i.year}`).slice(0, 3).join(', ') + (dues.installments.length > 3 ? ` +${dues.installments.length - 3}` : '')}
              amount={instNet} tone="bad" />
          ) : (
            <Done icon="calendar" title={t('pay.instTitle')} sub={t('pay.instPaidShort')} />
          )}

          {/* each loan */}
          {loans.map((l) => {
            const pct = l.principalPaise ? Math.floor(((l.principalPaise - l.principalOutstandingPaise) * 100) / l.principalPaise) : 0;
            const n = ahead[l.loanId] ?? 1;
            const maxN = l.installmentPaise ? Math.max(1, Math.ceil(l.payoffPaise / l.installmentPaise)) : 1;
            return (
              <div key={l.loanId} className="surface overflow-hidden">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-maroon"><Icon name="handCoins" className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold">{t('pay.loanTitle', { n: l.loanNo })}</span>
                      <span className="num text-sm font-semibold text-muted">{t('pay.leftShort', { amount: money(l.payoffPaise) })}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1 text-xs text-muted">{t('pay.repaidPct', { pct })}{l.installmentPaise ? ` · ${t('pay.emiIs', { amount: money(l.installmentPaise) })}` : ''}</div>
                  </div>
                </div>
                <div className="space-y-2 p-2.5">
                  {l.dueNowPaise > 0 ? (
                    <Choice flat selected={sel === `emi-${l.loanId}`} onSelect={() => setSel(`emi-${l.loanId}`)} icon="calendarCheck"
                      title={l.overduePaise > 0 ? t('pay.emisDue', { n: l.monthsBehind }) : t('pay.thisMonthEmi')}
                      sub={l.overduePaise > 0 ? t('pay.overdueSub') : t('pay.emiSub')} amount={l.dueNowPaise} tone="bad" />
                  ) : (
                    <Done flat icon="calendarCheck" title={t('pay.thisMonthEmi')} sub={t('pay.emiPaidShort')} />
                  )}
                  {byKey[`ahead-${l.loanId}`] && (
                    <Choice flat selected={sel === `ahead-${l.loanId}`} onSelect={() => setSel(`ahead-${l.loanId}`)} icon="clock" title={t('pay.payAhead')}
                      sub={t('pay.payAheadSub')} amount={byKey[`ahead-${l.loanId}`].amountPaise}
                      extra={(
                        <span className="inline-flex items-center rounded-xl border border-line bg-white" onClick={(e) => e.stopPropagation()}>
                          <button type="button" aria-label="−" disabled={n <= 1} onClick={() => { setAhead((a) => ({ ...a, [l.loanId]: Math.max(1, n - 1) })); setSel(`ahead-${l.loanId}`); }}
                            className="grid size-9 place-items-center text-lg font-bold text-maroon disabled:opacity-30">−</button>
                          <span className="num w-14 text-center text-sm font-bold">{t('pay.nEmis', { n })}</span>
                          <button type="button" aria-label="+" disabled={n >= maxN} onClick={() => { setAhead((a) => ({ ...a, [l.loanId]: Math.min(maxN, n + 1) })); setSel(`ahead-${l.loanId}`); }}
                            className="grid size-9 place-items-center text-lg font-bold text-maroon disabled:opacity-30">+</button>
                        </span>
                      )} />
                  )}
                  <Choice flat selected={sel === `settle-${l.loanId}`} onSelect={() => setSel(`settle-${l.loanId}`)} icon="shield" title={t('pay.settleShort')}
                    sub={t('pay.settleHint', { principal: money(l.principalOutstandingPaise), interest: money(Math.max(0, l.interestOutstandingPaise)) })} amount={l.payoffPaise} />
                </div>
              </div>
            );
          })}

          {byKey.all && (
            <Choice selected={sel === 'all'} onSelect={() => setSel('all')} icon="receipt" title={t('pay.allTitle')} sub={t('pay.allSub')} amount={dues.payablePaise} />
          )}
        </div>
      </div>

      {chosen?.key.startsWith('settle-') && (
        <Notice tone="brand" icon="shield">{t('pay.settleNote')}</Notice>
      )}
      {error && <ErrorBox error={error} />}

      {/* checkout */}
      {chosen && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2">
          <div className="hero-card mx-auto max-w-lg rounded-[1.4rem] p-3 text-white">
            <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
              <span className="min-w-0 truncate text-sm text-white/75">{chosen.label}</span>
              <span className="num shrink-0 text-xl font-extrabold">{money(chosen.amountPaise + feePaise)}</span>
            </div>
            {feePaise > 0 && <p className="-mt-2 mb-2 px-1 text-right text-xs text-white/60">{t('pay.feeNote', { dues: money(chosen.amountPaise), fee: money(feePaise) })}</p>}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              {data.upi ? (
                <button type="button" disabled={busy} onClick={() => start('upi')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-4 font-bold text-[#3a0c14] transition active:scale-[.98] disabled:opacity-60">
                  <Icon name="wallet" className="size-5" />{busy ? '...' : t('pay.byUpiShort')}
                </button>
              ) : (
                <span className="flex items-center rounded-2xl bg-white/10 px-3 text-xs text-white/70">{t('pay.upiNotSet')}</span>
              )}
              <button type="button" disabled={busy} onClick={() => start('cash')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/12 px-4 font-semibold ring-1 ring-white/20 transition active:scale-[.98] disabled:opacity-60">
                <Icon name="handCoins" className="size-5" />{t('pay.cashShort')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One tappable choice (radio row): icon, title, one line of detail, amount. */
function Choice({ selected, onSelect, icon, title, sub, amount, tone, extra, flat }) {
  return (
    <div role="radio" aria-checked={selected} tabIndex={0} onClick={onSelect} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-3 transition active:scale-[.99] ${
        selected ? 'border-maroon bg-maroon/[.035] shadow-[0_0_0_4px_rgba(122,31,43,.07)]' : `${flat ? 'border-transparent bg-paper/55 hover:border-line' : 'surface border-transparent hover:border-line'}`
      }`}>
      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-maroon' : 'border-stone-300'}`}>
        {selected && <span className="size-2.5 rounded-full bg-maroon" />}
      </span>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? 'bg-maroon text-white' : 'bg-white text-maroon ring-1 ring-line'}`}><Icon name={icon} className="size-4.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
        {extra && <span className="mt-2 block">{extra}</span>}
      </span>
      <span className={`num shrink-0 text-right font-bold ${tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{money(amount)}</span>
    </div>
  );
}

/** A row that is already paid — shown so the member sees it, but not tappable. */
function Done({ icon, title, sub, flat }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${flat ? 'bg-ok-bg/50' : 'surface'}`}>
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white"><Icon name="check" className="size-3.5" strokeWidth={3} /></span>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-ok ring-1 ring-ok/20"><Icon name={icon} className="size-4.5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight text-ok">{title}</span>
        <span className="mt-0.5 block text-xs text-ok/80">{sub}</span>
      </span>
    </div>
  );
}

function OpenPayment({ payment, upi, dues, onChange }) {
  const { t } = useTranslation();
  const [p, setP] = useState(payment);
  const [utr, setUtr] = useState('');
  const [shot, setShot] = useState(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // keep checking until staff confirm or reject
  useEffect(() => {
    if (p.status !== 'submitted') return;
    const id = setInterval(async () => {
      try {
        const r = await api(`/pay/${p.id}`);
        if (r.payment.status !== 'submitted') {
          clearInterval(id);
          onChange();
        }
      } catch {}
    }, 10_000);
    return () => clearInterval(id);
  }, [p.id, p.status, onChange]);

  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => act(async () => {
    const r = await api(`/pay/${p.id}/submit`, { method: 'POST', body: { screenshot: shot, utr } });
    setP(r.payment);
  });
  const cancel = () => act(async () => {
    await api(`/pay/${p.id}/cancel`, { method: 'POST', body: {} });
    onChange();
  });

  const rupees = (p.totalPaise / 100).toFixed(2);
  const link = upi ? `upi://pay?pa=${encodeURIComponent(upi.upiId)}&pn=${encodeURIComponent(upi.payeeName)}&am=${rupees}&cu=INR&tn=${encodeURIComponent(`Samiti #${p.paymentNo}`)}` : null;

  return (
    <Card title={t('pay.paymentNo', { n: p.paymentNo })} icon="receipt" action={<Badge tone={STATUS_TONE[p.status]}>{t(`payStatus.${p.status}`)}</Badge>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          {p.feePaise > 0 && <Row label={t('pay.toSamiti')} value={money(p.amountPaise)} />}
          {p.feePaise > 0 && <Row label={t('pay.fee')} value={money(p.feePaise)} />}
          <Row label={t('pay.total')} value={money(p.totalPaise)} strong />
        </div>

        {p.status === 'initiated' && (p.purpose ?? 'all') === 'all' && dues && dues.payablePaise !== p.amountPaise && (
          <Notice tone="brand" icon="alert">
            {t('pay.duesNow', { dues: money(dues.payablePaise), amount: money(p.amountPaise) })}{' '}
            <button type="button" onClick={cancel} className="font-semibold underline underline-offset-4">{t('pay.changeAmount')}</button>
          </Notice>
        )}
        {p.method === 'upi' && p.status === 'initiated' && upi && (
          <>
            <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
              {upi.qrImage && <img src={upi.qrImage} alt={t('pay.qrAlt')} className="mx-auto size-48 rounded-2xl border-2 border-line bg-white object-contain p-2" />}
              <div className="space-y-2">
                <p className="text-sm text-muted">{t('pay.scanOrPay', { amount: money(p.totalPaise) })}</p>
                <div className="flex items-center gap-2 rounded-xl border-2 border-line bg-white px-3 py-2">
                  <span className="num flex-1 break-all font-semibold">{upi.upiId}</span>
                  <button type="button" className="text-sm font-semibold text-maroon underline" onClick={() => { navigator.clipboard?.writeText(upi.upiId); setCopied(true); }}>
                    {copied ? t('pay.copied') : t('pay.copy')}
                  </button>
                </div>
                <div className="text-sm text-muted">{upi.payeeName}</div>
                <a href={link} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-maroon px-4 font-semibold text-white">
                  <Icon name="wallet" className="size-5" />{t('pay.openUpiApp', { amount: money(p.totalPaise) })}
                </a>
              </div>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50/50 p-3">
              <div className="mb-2 flex items-center gap-2 font-bold text-maroon"><Icon name="upload" className="size-5" />{t('pay.shotTitle')}</div>
              <p className="mb-2 text-sm text-muted">{t('pay.shotHint')}</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try { setShot(await compressPhoto(f)); setError(null); } catch { setError('photo_invalid'); }
              }} />
              {shot ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot} alt={t('pay.shotTitle')} className="h-28 w-20 rounded-lg border border-line bg-white object-cover" />
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><Icon name="checkCircle" className="size-4.5" />{t('pay.shotAdded')}</p>
                    <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold text-maroon underline underline-offset-4">{t('common.change')}</button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" icon="upload" full onClick={() => fileRef.current?.click()}>{t('pay.shotChoose')}</Button>
              )}
            </div>
            <Field label={t('pay.utrOptional')} hint={t('pay.utrHint')}>
              <Input inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} className="num tracking-widest" />
            </Field>
            {error && <ErrorBox error={error} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="success" icon="send" loading={busy} disabled={!shot || (utr.length > 0 && utr.length !== 12)} onClick={submit}>{t('pay.iHavePaid')}</Button>
              <Button variant="secondary" loading={busy} onClick={cancel}>{t('pay.cancel')}</Button>
            </div>
          </>
        )}

        {p.status === 'submitted' && (
          <Notice tone="brand" icon="clock">
            {p.method === 'upi' ? t('pay.checkingShot') : t('pay.cashWaiting', { amount: money(p.totalPaise) })}
          </Notice>
        )}
        {p.status === 'submitted' && (
          <Button variant="ghost" size="sm" loading={busy} onClick={cancel}>{t('pay.cancel')}</Button>
        )}
      </div>
    </Card>
  );
}

function History({ items }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <Card title={t('pay.history')} icon="log">
      <ul className="divide-y divide-line">
        {items.slice(0, 10).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-semibold">#{p.paymentNo}</span>
            <span className="num">{money(p.totalPaise)}</span>
            <span className="text-sm text-muted">{p.method === 'upi' ? 'UPI' : t('pay.cash')} · {fmtDateTime(p.createdAt)}</span>
            <Badge tone={STATUS_TONE[p.status]} className="ml-auto">{t(`payStatus.${p.status}`)}</Badge>
            {p.status === 'confirmed' && <Link href={`/receipt/${p.id}`} className="text-sm font-semibold text-maroon underline">{t('pay.receipt')}</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

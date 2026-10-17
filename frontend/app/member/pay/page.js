'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ButtonLink, Card, ErrorBox, Field, Input, Loading, MoneyInput, Notice, Row } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';
import { fmtDateTime, money, rupeesText, toPaise } from '@/lib/format';

/** Loads Razorpay's checkout script once, only when the member chooses to pay online. */
function loadCheckoutScript() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(Object.assign(new Error('network'), { code: 'online_script' }));
    document.body.appendChild(s);
  });
}

const STATUS_TONE = { initiated: 'warn', submitted: 'brand', confirmed: 'ok', rejected: 'bad', cancelled: 'neutral' };

/**
 * Pay dues: amount is filled in automatically (editable), plus the platform fee.
 * UPI: QR + UPI id + "open UPI app"; after paying, the member gives the UPI transaction id and the
 * page keeps checking until staff confirm (success) or reject (failed). Or choose to pay cash.
 */
export default function Pay() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api('/pay/summary'), api('/pay/history')]);
      setData(s);
      setHistory(h.payments);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const open = data.open[0];
  const latest = history[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-maroon">{t('pay.title')}</h1>
      {open ? (
        <OpenPayment payment={open} upi={data.upi} onChange={load} />
      ) : (
        <>
          {latest && ['confirmed', 'rejected'].includes(latest.status) && Date.now() - new Date(latest.confirmedAt ?? latest.createdAt).getTime() < 30 * 60 * 1000 && (
            <Outcome payment={latest} />
          )}
          <NewPayment data={data} onCreated={load} />
        </>
      )}
      <History items={history} />
      <ButtonLink href="/member" variant="secondary" icon="back" full>{t('common.back')}</ButtonLink>
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

function NewPayment({ data, onCreated }) {
  const { t } = useTranslation();
  const { dues, feePaise } = data;
  const [amount, setAmount] = useState(dues.payablePaise ? rupeesText(dues.payablePaise) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const amountPaise = toPaise(amount) ?? 0;
  const diff = amountPaise - dues.payablePaise;

  const start = async (method) => {
    setBusy(true);
    setError(null);
    try {
      await api('/pay', { method: 'POST', body: { method, amountPaise: amount } });
      await onCreated();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Razorpay Checkout: the server makes the order; Razorpay's window takes the money; the signed
   * reply is checked by the server, which confirms and applies the payment by itself.
   */
  const payOnline = async (upiFirst) => {
    setBusy(true);
    setError(null);
    try {
      const { payment, checkout } = await api('/pay/online', { method: 'POST', body: { amountPaise: amount } });
      await loadCheckoutScript();
      let failed = null;
      const rz = new window.Razorpay({
        key: checkout.key,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        prefill: checkout.prefill,
        theme: { color: '#7a1f2b' },
        // UPI first: on a phone Razorpay lists the installed apps (PhonePe, Google Pay, Paytm …); on a computer it shows a QR.
        // Razorpay detects the payment itself — no transaction id to type.
        ...(upiFirst ? {
          config: {
            display: {
              blocks: { upi: { name: t('pay.upiAppSub'), instruments: [{ method: 'upi' }] } },
              sequence: ['block.upi'],
              preferences: { show_default_blocks: true },
            },
          },
        } : {}),
        handler: async (resp) => {
          try {
            await api(`/pay/${payment.id}/online-verify`, { method: 'POST', body: resp });
          } catch (e) {
            setError(e);
          }
          await onCreated();
        },
        modal: {
          // closed without paying: a failure is recorded as failed, otherwise simply cancelled
          ondismiss: async () => {
            await api(`/pay/${payment.id}/${failed ? 'online-failed' : 'cancel'}`, { method: 'POST', body: failed ? { reason: failed } : {} }).catch(() => {});
            setBusy(false);
            await onCreated();
          },
        },
      });
      rz.on('payment.failed', (r) => {
        failed = r?.error?.description || 'failed';
      });
      rz.open();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <>
      <Card title={t('pay.dues')} icon="wallet">
        {dues.installments.map((i) => (
          <Row key={`${i.year}-${i.month}`} label={`${t('history.installmentFor', { month: t(`m${i.month}`), year: i.year })}${i.partial ? ` (${t('status.partial')})` : ''}`} value={money(i.pendingPaise)} />
        ))}
        {dues.loans.map((l) => (
          <Row key={l.loanId} label={t('pay.loanDue', { n: l.loanNo })} sub={l.overduePaise ? t('pay.loanOverdue', { amount: money(l.overduePaise) }) : null} value={money(l.dueNowPaise)} />
        ))}
        {dues.creditPaise > 0 && <Row label={t('pay.creditUsed')} value={`− ${money(Math.min(dues.creditPaise, dues.grossPaise))}`} tone="ok" />}
        <Row label={t('pay.payable')} value={money(dues.payablePaise)} strong tone={dues.payablePaise ? 'bad' : 'ok'} />
        {dues.grossPaise === 0 && <p className="mt-2 font-semibold text-ok">{t('pay.nothingDue')}</p>}
        {dues.creditPaise > dues.grossPaise && <p className="mt-2 text-sm text-ok">{t('pay.creditLeft', { amount: money(dues.creditPaise - dues.grossPaise) })}</p>}
      </Card>

      <Card title={t('pay.howMuch')} icon="calculator">
        <div className="space-y-3">
          <Field label={t('pay.amount')} hint={t('pay.amountHint')}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          {amountPaise > 0 && diff > 0 && <Notice tone="ok" icon="check">{t('pay.moreThanDue', { amount: money(diff) })}</Notice>}
          {amountPaise > 0 && diff < 0 && <Notice>{t('pay.lessThanDue', { amount: money(-diff) })}</Notice>}
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <Row label={t('pay.toSamiti')} value={money(amountPaise)} />
            <Row label={t('pay.fee')} value={money(feePaise)} />
            <Row label={t('pay.total')} value={money(amountPaise + feePaise)} strong />
          </div>
          {error && <ErrorBox error={error} />}
          {data.online ? (
            <div className="space-y-2 pt-1">
              <button type="button" disabled={busy || amountPaise < 100} onClick={() => payOnline(true)}
                className="flex w-full items-center gap-3 rounded-2xl bg-ok px-4 py-3.5 text-left text-white shadow-md transition hover:brightness-95 disabled:opacity-60">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><Icon name={busy ? 'clock' : 'wallet'} className="size-6" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold leading-tight">{t('pay.upiApp', { amount: money(amountPaise + feePaise) })}</span>
                  <span className="block text-sm text-white/85">{t('pay.upiAppSub')}</span>
                </span>
                <Icon name="chevronRight" className="size-5 shrink-0" />
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" icon="shield" loading={busy} disabled={amountPaise < 100} onClick={() => payOnline(false)}>{t('pay.otherOnline')}</Button>
                <Button variant="secondary" icon="handCoins" loading={busy} disabled={amountPaise < 100} onClick={() => start('cash')}>{t('pay.byCash')}</Button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-center text-sm text-ok"><Icon name="shield" className="size-4 shrink-0" />{t('pay.onlineHint')}</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.upi && <Button icon="wallet" loading={busy} disabled={amountPaise < 100} onClick={() => start('upi')}>{t('pay.byUpi')}</Button>}
              <Button variant="secondary" icon="handCoins" loading={busy} disabled={amountPaise < 100} onClick={() => start('cash')}>{t('pay.byCash')}</Button>
            </div>
          )}
          {!data.upi && !data.online && <p className="text-sm text-muted">{t('pay.upiNotSet')}</p>}
        </div>
      </Card>
    </>
  );
}

function OpenPayment({ payment, upi, onChange }) {
  const { t } = useTranslation();
  const [p, setP] = useState(payment);
  const [utr, setUtr] = useState('');
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
    const r = await api(`/pay/${p.id}/submit`, { method: 'POST', body: { utr } });
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
          <Row label={t('pay.toSamiti')} value={money(p.amountPaise)} />
          <Row label={t('pay.fee')} value={money(p.feePaise)} />
          <Row label={t('pay.total')} value={money(p.totalPaise)} strong />
        </div>

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
            <Field label={t('pay.utr')} hint={t('pay.utrHint')}>
              <Input inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} className="num tracking-widest" />
            </Field>
            {error && <ErrorBox error={error} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="check" loading={busy} disabled={utr.length !== 12} onClick={submit}>{t('pay.iHavePaid')}</Button>
              <Button variant="secondary" loading={busy} onClick={cancel}>{t('pay.cancel')}</Button>
            </div>
          </>
        )}

        {p.status === 'submitted' && (
          <Notice tone="brand" icon="clock">
            {p.method === 'upi' ? t('pay.checking', { utr: p.utr }) : t('pay.cashWaiting', { amount: money(p.totalPaise) })}
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
            <span className="text-sm text-muted">{p.method === 'online' ? t('pay.onlineShort') : p.method === 'upi' ? 'UPI' : t('pay.cash')} · {fmtDateTime(p.createdAt)}</span>
            <Badge tone={STATUS_TONE[p.status]} className="ml-auto">{t(`payStatus.${p.status}`)}</Badge>
            {p.status === 'confirmed' && <Link href={`/receipt/${p.id}`} className="text-sm font-semibold text-maroon underline">{t('pay.receipt')}</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

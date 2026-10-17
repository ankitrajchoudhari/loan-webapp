'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorBox, Field, Input, Modal, Notice } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api, getWho } from '@/lib/api';
import { fmtDateTime, money } from '@/lib/format';
import { compressPhoto } from '@/lib/image';

export const BILL_TONE = { due: 'bad', submitted: 'brand', paid: 'ok', rejected: 'bad' };

/** "Oct 2026: 12 days × ₹12.45" */
export function billLine(t, b) {
  const rates = [...new Set((b.breakdown ?? []).map((x) => x.ratePaise))];
  return t('platform.billLine', { month: t(`m${b.month}`), year: b.year, days: b.days, rate: rates.length === 1 ? money(rates[0]) : rates.map(money).join(' / ') });
}

/** Admin pays one platform bill: developer's QR + UPI id, then the payment screenshot. */
export function PayBill({ bill, payee, onDone }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [shot, setShot] = useState(null);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const rupees = (bill.amountPaise / 100).toFixed(2);
  const link = payee ? `upi://pay?pa=${encodeURIComponent(payee.upiId)}&pn=${encodeURIComponent(payee.payeeName)}&am=${rupees}&cu=INR&tn=${encodeURIComponent(`Platform bill #${bill.billNo}`)}` : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api(`/platform/bills/${bill.id}/submit`, { method: 'POST', body: { screenshot: shot, utr } });
      onDone?.(r.bill);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-maroon to-maroon-dark p-4 text-white">
        <div className="text-sm text-white/80">{t('platform.billNo', { n: bill.billNo })} · {billLine(t, bill)}</div>
        <div className="num mt-1 text-3xl font-bold">{money(bill.amountPaise)}</div>
      </div>
      {bill.status === 'rejected' && bill.rejectReason && <Notice tone="bad" icon="alert">{t('platform.rejectedBecause', { reason: bill.rejectReason })}</Notice>}
      {payee ? (
        <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {payee.qrImage && <img src={payee.qrImage} alt="QR" className="mx-auto size-48 rounded-2xl border-2 border-line bg-white object-contain p-2" />}
          <div className="space-y-2">
            <p className="text-sm text-muted">{t('platform.scanToPay', { amount: money(bill.amountPaise) })}</p>
            <div className="flex items-center gap-2 rounded-xl border-2 border-line bg-white px-3 py-2">
              <span className="num flex-1 break-all font-semibold">{payee.upiId}</span>
              <button type="button" className="text-sm font-semibold text-maroon underline" onClick={() => { navigator.clipboard?.writeText(payee.upiId); setCopied(true); }}>{copied ? t('pay.copied') : t('pay.copy')}</button>
            </div>
            <div className="text-sm text-muted">{payee.payeeName}</div>
            <a href={link} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-maroon px-4 font-semibold text-white"><Icon name="wallet" className="size-5" />{t('pay.openUpiApp', { amount: money(bill.amountPaise) })}</a>
          </div>
        </div>
      ) : (
        <Notice>{t('platform.noPayee')}</Notice>
      )}
      <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50/50 p-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-maroon"><Icon name="upload" className="size-5" />{t('pay.shotTitle')}</div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { setShot(await compressPhoto(f)); setError(null); } catch { setError('photo_invalid'); }
        }} />
        {shot ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot} alt="" className="h-28 w-20 rounded-lg border border-line bg-white object-cover" />
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
      <Button variant="success" full icon="send" loading={busy} disabled={!shot || (utr.length > 0 && utr.length !== 12)} onClick={submit}>{t('platform.sendProof')}</Button>
    </div>
  );
}

/**
 * Admin panel: when a platform bill is waiting to be paid, a pop-up with the developer's QR appears
 * (once per browser session if closed with "later"). Not shown to the developer.
 */
export function PlatformBillPopup() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const who = getWho()?.user;

  useEffect(() => {
    if (who?.staffRole !== 'admin') return;
    let later = false;
    try { later = sessionStorage.getItem('samiti.billLater') === '1'; } catch {}
    api('/platform').then((r) => {
      setData(r);
      if (!later && r.bills.some((b) => b.status === 'due' || b.status === 'rejected')) setOpen(true);
    }).catch(() => {});
  }, [who?.staffRole]);

  if (!data || !open) return null;
  const bill = [...data.bills].reverse().find((b) => b.status === 'due' || b.status === 'rejected');
  if (!bill) return null;
  const later = () => {
    try { sessionStorage.setItem('samiti.billLater', '1'); } catch {}
    setOpen(false);
  };
  return (
    <Modal open onClose={later} title={t('platform.popupTitle')} wide
      footer={<Button variant="secondary" size="md" onClick={later}>{t('platform.later')}</Button>}>
      <div className="space-y-3">
        <p className="text-muted">{t('platform.popupText', { n: data.unpaidCount, amount: money(data.unpaidPaise) })}</p>
        <PayBill bill={bill} payee={data.payee} onDone={() => setOpen(false)} />
      </div>
    </Modal>
  );
}

export function BillRow({ b, children }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-maroon">{t('platform.billNo', { n: b.billNo })}</span>
        <span className="font-semibold">{t(`m${b.month}`)} {b.year}</span>
        <Badge tone={BILL_TONE[b.status]} className="ml-auto">{t(`platform.status.${b.status}`)}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted">{billLine(t, b)} · {t('platform.madeOn', { date: fmtDateTime(b.generatedAt) })}</span>
        <span className="num text-xl font-bold">{money(b.amountPaise)}</span>
      </div>
      {b.submittedAt && <div className="mt-1 text-sm text-muted">{t('platform.proofSent', { date: fmtDateTime(b.submittedAt) })}{b.utr ? ` · UTR ${b.utr}` : ''}</div>}
      {b.paidAt && <div className="mt-1 text-sm font-semibold text-ok">{t('platform.paidOn', { date: fmtDateTime(b.paidAt) })}</div>}
      {b.status === 'rejected' && b.rejectReason && <div className="mt-1 text-sm text-bad">{b.rejectReason}</div>}
      {children}
    </li>
  );
}


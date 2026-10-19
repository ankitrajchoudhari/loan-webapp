'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, MoneyInput, Notice, PageTitle, Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';
import { ReasonModal, useAction } from '@/components/admin';
import { BillRow, PayBill, billLine } from '@/components/Platform';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api, getWho } from '@/lib/api';
import { fmtDateTime, money, rupeesText } from '@/lib/format';
import { compressPhoto } from '@/lib/image';

/**
 * Platform fee (developer ↔ samiti) — developer only: switch charging on/off, rate per day, the QR to be
 * paid to, bills, confirm payments. The admin only gets the pay pop-up (month + amount + QR).
 */
export default function PlatformPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const isDev = getWho()?.user?.staffRole === 'developer';
  const { data, error, reload } = useApi(isDev ? '/platform' : null);
  const [state, setState] = useState(null);
  const [pay, setPay] = useState(null);
  const [reject, setReject] = useState(null);
  const [shot, setShot] = useState(null);
  const d = state ?? data;
  useEffect(() => setState(null), [data]);

  if (!isDev) return <Notice>{t('err.developer_only')}</Notice>;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!d) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle title={t('platform.title')} subtitle={isDev ? t('platform.subtitleDev') : t('platform.subtitleAdmin')} />

      {isDev ? <DevControls d={d} onChange={setState} /> : (
        <Card>
          <div className="flex items-center gap-3">
            <span className={`grid size-11 place-items-center rounded-xl ${d.on ? 'bg-ok-bg text-ok' : 'bg-stone-100 text-muted'}`}><Icon name={d.on ? 'checkCircle' : 'clock'} className="size-6" /></span>
            <div>
              <div className="font-bold">{d.on ? t('platform.onSince', { date: fmtDateTime(d.since) }) : t('platform.off')}</div>
              <div className="text-sm text-muted">{t('platform.ratePerDay', { amount: money(d.ratePaise) })}</div>
            </div>
          </div>
        </Card>
      )}

      {/* running charge this month */}
      <div className="surface p-4">
        <div className="text-sm font-semibold text-muted">{t('platform.thisMonth', { month: t(`m${d.current.month}`), year: d.current.year })}</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-lg">{t('platform.daysSoFar', { n: d.current.days, rate: money(d.ratePaise) })}</span>
          <span className="num text-3xl font-bold text-maroon">{money(d.current.amountPaise)}</span>
        </div>
        <div className="mt-1 text-sm text-muted">{t('platform.asOf', { date: fmtDateTime(d.current.asOf) })} · {t('platform.billAtMonthEnd')}</div>
      </div>

      {d.unpaidCount > 0 && (
        <Notice tone="bad" icon="alert">{t('platform.unpaid', { n: d.unpaidCount, amount: money(d.unpaidPaise) })}</Notice>
      )}

      <Card title={t('platform.bills')} icon="receipt">
        {d.bills.length === 0 ? <Empty icon="receipt">{t('platform.noBills')}</Empty> : (
          <ul className="space-y-2">
            {d.bills.map((b) => (
              <BillRow key={b.id} b={b}>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.hasScreenshot && <Button size="sm" variant="secondary" icon="file" onClick={() => setShot(b)}>{t('pay.seeShot')}</Button>}
                  {!isDev && (b.status === 'due' || b.status === 'rejected') && <Button size="sm" variant="success" icon="wallet" onClick={() => setPay(b)}>{t('platform.payNow')}</Button>}
                  {isDev && b.status !== 'paid' && (
                    <Button size="sm" variant="success" icon="check" onClick={async () => {
                      await api(`/platform/bills/${b.id}/confirm`, { method: 'POST', body: {} });
                      toast(t('platform.markedPaid'));
                      reload();
                    }}>{t('platform.markPaid')}</Button>
                  )}
                  {isDev && b.status === 'submitted' && <Button size="sm" variant="secondary" icon="x" onClick={() => setReject(b)}>{t('platform.notReceived')}</Button>}
                </div>
              </BillRow>
            ))}
          </ul>
        )}
      </Card>

      {pay && (
        <Modal open onClose={() => setPay(null)} title={t('platform.payTitle')} wide>
          <PayBill bill={pay} payee={d.payee} onDone={() => { setPay(null); toast(t('platform.proofSentToast')); reload(); }} />
        </Modal>
      )}
      {shot && (
        <Modal open onClose={() => setShot(null)} title={`${t('platform.billNo', { n: shot.billNo })} · ${billLine(t, shot)}`} wide>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/platform/bills/${shot.id}/screenshot`} alt={t('pay.shotTitle')} className="mx-auto max-h-[70vh] rounded-xl" />
        </Modal>
      )}
      {reject && (
        <ReasonModal open danger title={t('platform.notReceived')} confirmLabel={t('platform.notReceived')} onClose={() => setReject(null)}
          onConfirm={async (reason) => {
            await api(`/platform/bills/${reject.id}/reject`, { method: 'POST', body: { reason } });
            setReject(null);
            reload();
          }}>
          <p className="text-muted">{t('platform.rejectHint')}</p>
        </ReasonModal>
      )}
    </div>
  );
}

function DevControls({ d, onChange }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rate, setRate] = useState(rupeesText(d.ratePaise));
  const toggle = useAction(toast);
  const payee = useAction(toast);
  const [f, setF] = useState({ upiId: d.payee?.upiId ?? '', payeeName: d.payee?.payeeName ?? '', qrImage: d.payee?.qrImage ?? '' });

  const flip = async (on) => {
    if (!on && !window.confirm(t('platform.offConfirm'))) return;
    const r = await toggle.run(() => api('/platform/toggle', { method: 'POST', body: { on, ratePaise: rate } }), on ? t('platform.turnedOn') : t('platform.turnedOff'));
    if (r) onChange(r);
  };
  const savePayee = async () => {
    const r = await payee.run(() => api('/platform/payee', { method: 'PUT', body: f }), t('common.savedOk'));
    if (r) onChange(r);
  };
  const removePayee = async () => {
    if (!window.confirm(t('platform.removeQrConfirm'))) return;
    const r = await payee.run(() => api('/platform/payee', { method: 'DELETE' }), t('platform.qrRemoved'));
    if (r) {
      setF({ upiId: '', payeeName: '', qrImage: '' });
      onChange(r);
    }
  };

  return (
    <>
      <Card title={t('platform.chargeTitle')} icon="settings">
        <div className="space-y-4">
          <Toggle checked={d.on} onChange={flip} label={t('platform.chargeToggle')}
            description={d.on ? t('platform.onSince', { date: fmtDateTime(d.since) }) : t('platform.chargeToggleHint')} />
          <Field label={t('platform.rate')} hint={d.on ? t('platform.rateLocked') : t('platform.rateHint')}>
            <MoneyInput value={rate} onChange={setRate} disabled={d.on} />
          </Field>
          {toggle.error && <ErrorBox error={toggle.error} />}
          {d.periods.length > 0 && (
            <div className="rounded-xl bg-stone-50 p-3 text-sm">
              <div className="mb-1 font-semibold text-muted">{t('platform.history')}</div>
              {d.periods.map((p, i) => (
                <div key={i} className="num">{fmtDateTime(p.startedAt)} → {p.endedAt ? fmtDateTime(p.endedAt) : t('platform.now')} · {money(p.ratePaise)}/{t('platform.day')}</div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <Card title={t('platform.payeeTitle')} icon="wallet">
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('platform.payeeHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('upi.id')}><Input value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value.trim() })} placeholder="name@okaxis" autoComplete="off" /></Field>
            <Field label={t('upi.payee')}><Input value={f.payeeName} onChange={(e) => setF({ ...f, payeeName: e.target.value })} maxLength={100} /></Field>
          </div>
          <Field label={t('upi.qr')} hint={t('upi.qrHint')}>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.qrImage && (
                <div className="relative">
                  <img src={f.qrImage} alt="QR" className="size-32 rounded-xl border border-line bg-white object-contain p-1" />
                  <button type="button" onClick={() => setF((s) => ({ ...s, qrImage: '' }))} aria-label={t('platform.removeQr')} title={t('platform.removeQr')}
                    className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-bad text-white shadow"><Icon name="x" className="size-4" /></button>
                </div>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { setF((s) => ({ ...s, qrImage: '' })); const qrImage = await compressPhoto(file, { maxSide: 700, quality: 0.9 }); setF((s) => ({ ...s, qrImage })); } catch { payee.setError('qr_invalid'); }
              }} className="text-base file:mr-3 file:rounded-lg file:border-0 file:bg-maroon file:px-4 file:py-2 file:font-semibold file:text-white" />
            </div>
          </Field>
          {payee.error && <ErrorBox error={payee.error} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button icon="check" loading={payee.busy} disabled={!f.upiId || !f.payeeName || !f.qrImage} onClick={savePayee}>{t('label.saveChanges')}</Button>
            {d.payee && <Button variant="danger" icon="trash" disabled={payee.busy} onClick={removePayee}>{t('platform.removeQr')}</Button>}
          </div>
        </div>
      </Card>
    </>
  );
}

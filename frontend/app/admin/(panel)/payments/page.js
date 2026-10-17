'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, MoneyInput, Notice, PageTitle, Row, Segmented } from '@/components/ui';
import MemberPicker from '@/components/MemberPicker';
import { ReasonModal, useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDateTime, money, rupeesText, toPaise } from '@/lib/format';

const TONE = { initiated: 'warn', submitted: 'brand', confirmed: 'ok', rejected: 'bad', cancelled: 'neutral' };

/** Payments: check UPI payments against the bank, accept cash, print receipts. */
export default function Payments() {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState('submitted');
  const { data, error, loading, reload } = useApi('/payments', { status: tab === 'all' ? '' : tab });
  const unprinted = useApi('/payments', { status: 'confirmed' });
  const [confirm, setConfirm] = useState(null);
  const [reject, setReject] = useState(null);

  useEffect(() => {
    const id = setInterval(reload, 30_000); // new payments show up on their own
    return () => clearInterval(id);
  }, [reload]);

  const afterConfirm = (p) => {
    setConfirm(null);
    toast(t('payAdmin.confirmed', { n: p.paymentNo }));
    if (p.method === 'cash') router.push(`/receipt/${p.id}?print=1`);
    else { reload(); unprinted.reload(); }
  };
  const needPrint = (unprinted.data?.payments ?? []).filter((p) => !p.receiptPrintedAt);

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.payments')} subtitle={t('payAdmin.subtitle')} />

      {needPrint.length > 0 && (
        <div className="rounded-2xl border-2 border-bad/40 bg-bad-bg p-4 text-bad">
          <div className="font-bold">{t('payAdmin.printPending', { n: needPrint.length })}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {needPrint.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/receipt/${p.id}?print=1`} className="rounded-full bg-white px-3 py-1 text-sm font-semibold underline">#{p.paymentNo} · {p.member?.fullName}</Link>
            ))}
          </div>
        </div>
      )}

      <CashCounter onDone={(p) => router.push(`/receipt/${p.id}?print=1`)} />

      <Segmented value={tab} onChange={setTab} size="sm" options={[
        { value: 'submitted', label: `${t('payAdmin.toCheck')}${data?.counts?.submitted ? ` (${data.counts.submitted})` : ''}` },
        { value: 'confirmed', label: t('payStatus.confirmed') },
        { value: 'rejected', label: t('payStatus.rejected') },
        { value: 'all', label: t('common.all') },
      ]} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data?.payments.length === 0 ? (
        <p className="text-muted">{t('payAdmin.none')}</p>
      ) : (
        <ul className="space-y-2">
          {data?.payments.map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-maroon">#{p.paymentNo}</span>
                <span className="font-semibold">{p.member?.fullName}</span>
                <span className="num text-sm text-muted">({t('field.memberNo')} {p.member?.memberNo})</span>
                <Badge tone={TONE[p.status]} className="ml-auto">{t(`payStatus.${p.status}`)}</Badge>
              </div>
              <div className="num mt-1 text-sm text-muted">
                {p.method === 'upi' ? `UPI${p.utr ? ` · UTR ${p.utr}` : ''}` : t('pay.cash')} · {fmtDateTime(p.submittedAt ?? p.createdAt)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span>{t('pay.total')}: <b className="num text-base">{money(p.totalPaise)}</b></span>
                {p.hasScreenshot && <ShotThumb id={p.id} />}
              </div>
              {p.rejectReason && <div className="mt-1 text-sm text-bad">{p.rejectReason}</div>}
              {p.status === 'submitted' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="success" icon="check" onClick={() => setConfirm(p)}>{p.method === 'cash' ? t('payAdmin.cashReceived') : t('payAdmin.upiReceived')}</Button>
                  <Button size="sm" variant="secondary" icon="x" onClick={() => setReject(p)}>{t('payAdmin.notReceived')}</Button>
                </div>
              )}
              {p.status === 'confirmed' && (
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <Link href={`/receipt/${p.id}${p.receiptPrintedAt ? '' : '?print=1'}`} className="font-semibold text-maroon underline">{t('pay.receipt')}</Link>
                  {!p.receiptPrintedAt && <Badge tone="bad">{t('payAdmin.notPrinted')}</Badge>}
                  {p.confirmedBy && <span className="text-muted">{t('audit.by', { name: p.confirmedBy.name })}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirm && <ConfirmModal p={confirm} onClose={() => setConfirm(null)} onDone={afterConfirm} />}
      {reject && (
        <ReasonModal open danger title={t('payAdmin.rejectTitle', { n: reject.paymentNo })} confirmLabel={t('payAdmin.notReceived')} onClose={() => setReject(null)}
          onConfirm={async (reason) => {
            await api(`/payments/${reject.id}/reject`, { method: 'POST', body: { reason } });
            setReject(null);
            toast(t('payAdmin.rejected'));
            reload();
          }}>
          <p>{t('payAdmin.rejectHint')}</p>
        </ReasonModal>
      )}
    </div>
  );
}

function ConfirmModal({ p, onClose, onDone }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const go = async () => {
    const r = await run(() => api(`/payments/${p.id}/confirm`, { method: 'POST', body: {} }));
    if (r) onDone(r.payment);
  };
  return (
    <Modal open onClose={onClose} title={t('payAdmin.confirmTitle', { n: p.paymentNo })}
      footer={<><Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button><Button variant="success" size="md" icon="check" loading={busy} onClick={go}>{t('payAdmin.yesReceived')}</Button></>}>
      <div className="space-y-3">
        <Notice tone="brand" icon="shield">
          {p.method === 'upi' ? t('payAdmin.checkUpiShot', { amount: money(p.totalPaise), utr: p.utr ? ` · UTR ${p.utr}` : '' }) : t('payAdmin.checkCash', { amount: money(p.totalPaise) })}
        </Notice>
        {p.hasScreenshot && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/v1/receipts/${p.id}/screenshot`} alt={t('pay.shotTitle')} className="mx-auto max-h-[45vh] rounded-xl border border-line" />
        )}
        <Row label={t('field.memberName')} value={p.member?.fullName} />
        <Row label={t('pay.total')} value={money(p.totalPaise)} strong />
        <p className="text-sm text-muted">{t('payAdmin.applyNote')}</p>
        {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

/** Cash taken at the counter: choose member → dues filled in → save → receipt is printed. */
function CashCounter({ onDone }) {
  const { t } = useTranslation();
  const [memberId, setMemberId] = useState(null);
  const [due, setDue] = useState(null);
  const [amount, setAmount] = useState('');
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!memberId) return setDue(null);
    api(`/payments/due/${memberId}`).then((r) => {
      setDue(r);
      setAmount(r.dues.payablePaise ? rupeesText(r.dues.payablePaise) : '');
    }).catch(() => setDue(null));
  }, [memberId]);

  const save = async () => {
    const r = await run(() => api('/payments/cash', { method: 'POST', body: { memberId, amountPaise: amount } }));
    if (r) onDone(r.payment);
  };
  const amt = toPaise(amount) ?? 0;

  return (
    <Card title={t('payAdmin.counter')} icon="handCoins">
      <div className="space-y-3">
        <Field label={t('inst.pickMember')}>
          <MemberPicker key={memberId ?? 'none'} value={memberId} onChange={(id) => setMemberId(id)} allowClear />
        </Field>
        {due && (
          <>
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <Row label={t('pay.dues')} value={money(due.dues.grossPaise)} />
              {due.dues.creditPaise > 0 && <Row label={t('pay.creditUsed')} value={`− ${money(Math.min(due.dues.creditPaise, due.dues.grossPaise))}`} tone="ok" />}
              <Row label={t('pay.payable')} value={money(due.dues.payablePaise)} strong />
            </div>
            <Field label={t('pay.amount')} hint={t('pay.amountHint')}><MoneyInput value={amount} onChange={setAmount} /></Field>
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <Row label={t('payAdmin.collect')} value={money(amt)} strong />
            </div>
            {error && <ErrorBox error={error} />}
            <Button full icon="check" loading={busy} disabled={amt < 100} onClick={save}>{t('payAdmin.saveAndPrint')}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** Small picture of the member's payment screenshot; tap to see it full size. */
function ShotThumb({ id }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const src = `/api/v1/receipts/${id}/screenshot`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg border border-line bg-stone-50 p-1 pr-3 font-semibold text-maroon hover:bg-brand-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-12 w-9 rounded object-cover" loading="lazy" />
        {t('pay.seeShot')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('pay.shotTitle')} wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t('pay.shotTitle')} className="mx-auto max-h-[75vh] rounded-xl" />
      </Modal>
    </>
  );
}

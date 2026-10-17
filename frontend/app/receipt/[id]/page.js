'use client';
import { use, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBox, Loading } from '@/components/ui';
import { api, getWho } from '@/lib/api';
import { fmtDate, fmtDateTime, money } from '@/lib/format';

/** Printable payment receipt (रसीद). Staff opening it after a cash collection prints it at once. */
export default function Receipt({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const isStaff = getWho()?.role === 'admin';

  useEffect(() => {
    api(`/receipts/${id}`).then((r) => setP(r.payment)).catch(setError);
  }, [id]);

  const print = async () => {
    window.print();
    if (isStaff) await api(`/payments/${id}/printed`, { method: 'POST', body: {} }).catch(() => {});
  };

  // after a cash collection the admin must print: open the print window straight away
  useEffect(() => {
    if (p && isStaff && !p.receiptPrintedAt && new URLSearchParams(window.location.search).get('print') === '1') {
      setTimeout(print, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  if (error) return <div className="p-4"><ErrorBox error={error} /></div>;
  if (!p) return <Loading />;
  const a = p.allocation ?? { lines: [] };

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="rounded-2xl border-2 border-maroon/30 bg-white p-5 print:border-black">
        <div className="text-center">
          <div className="font-brand text-2xl text-maroon">{t('app.name')}</div>
          <div className="text-lg font-bold">{t('receipt.title')}</div>
          <div className="num text-sm text-muted">{t('receipt.no', { n: p.paymentNo })} · {fmtDateTime(p.confirmedAt)}</div>
        </div>
        <hr className="my-3 border-dashed border-line" />
        <Line label={t('field.memberName')} value={p.member?.fullName} />
        <Line label={t('field.memberNo')} value={p.member?.memberNo} />
        <Line label={t('receipt.method')} value={p.method === 'online' ? `${t('pay.onlineShort')} · ${p.gatewayPaymentId ?? ''}` : p.method === 'upi' ? `UPI · ${p.utr ?? ''}` : t('pay.cash')} />
        <hr className="my-3 border-dashed border-line" />
        {a.lines.map((l, i) => (
          <Line key={i} label={
            l.kind === 'installment' ? t('history.installmentFor', { month: t(`m${l.month}`), year: l.year })
              : l.kind === 'loan' ? t('receipt.loanLine', { n: l.loanNo })
              : t('receipt.advance')
          } value={money(l.amountPaise)} />
        ))}
        {a.usedCreditPaise > 0 && <Line label={t('pay.creditUsed')} value={money(a.usedCreditPaise)} />}
        <hr className="my-3 border-dashed border-line" />
        <Line label={t('pay.toSamiti')} value={money(p.amountPaise)} />
        <Line label={t('pay.fee')} value={money(p.feePaise)} />
        <Line label={t('pay.total')} value={money(p.totalPaise)} strong />
        {a.creditAfterPaise > 0 && <Line label={t('receipt.creditNow')} value={money(a.creditAfterPaise)} />}
        <hr className="my-3 border-dashed border-line" />
        <div className="text-center text-sm text-muted">
          {t('receipt.receivedBy', { name: p.confirmedBy?.name ?? '—' })} · {fmtDate(p.confirmedAt?.slice(0, 10))}
        </div>
      </div>
      <div className="no-print mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" icon="back" onClick={() => history.back()}>{t('common.back')}</Button>
        <Button icon="printer" onClick={print}>{t('receipt.print')}</Button>
      </div>
    </div>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className={`flex justify-between gap-3 py-0.5 ${strong ? 'text-lg font-bold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="num text-right font-semibold">{value}</span>
    </div>
  );
}

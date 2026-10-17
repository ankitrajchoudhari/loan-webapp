'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBox, Loading } from '@/components/ui';
import { api, getWho } from '@/lib/api';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { downloadPdf, pdfFile } from '@/lib/pdf';

/** Payment receipt (रसीद): print, save as PDF, or send (WhatsApp / any app). Staff opening it after a cash collection prints it at once. */
export default function Receipt({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const isStaff = getWho()?.role === 'admin';
  const sheet = useRef(null);
  const [busy, setBusy] = useState(null);

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
  const fileName = `${t('receipt.title')} ${p.paymentNo} - ${p.member?.fullName ?? ''}`;
  const lineText = (l) => (l.kind === 'installment' ? t('history.installmentFor', { month: t(`m${l.month}`), year: l.year })
    : l.kind === 'loan' ? t('receipt.loanLine', { n: l.loanNo }) : t('receipt.advance'));
  const text = [
    `*${t('app.name')}* — ${t('receipt.title')} #${p.paymentNo}`,
    `${t('field.memberName')}: ${p.member?.fullName} (${t('field.memberNo')} ${p.member?.memberNo})`,
    ...a.lines.map((l) => `• ${lineText(l)}: ${money(l.amountPaise)}`),
    `*${t('pay.total')}: ${money(p.totalPaise)}*`,
    `${t('receipt.method')}: ${p.method === 'upi' ? `UPI${p.utr ? ` · ${p.utr}` : ''}` : t('pay.cash')}`,
    `${fmtDateTime(p.confirmedAt)}`,
  ].join('\n');

  const savePdf = async () => {
    setBusy('pdf');
    try { await downloadPdf(sheet.current, fileName); } finally { setBusy(null); }
  };
  // phone: share the PDF itself (WhatsApp, Gmail …); otherwise WhatsApp with the receipt as text
  const send = async () => {
    setBusy('send');
    try {
      const file = await pdfFile(sheet.current, fileName).catch(() => null);
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text }).catch(() => {});
        return;
      }
      const to = isStaff && p.member?.mobileNumber ? `91${p.member.mobileNumber}` : '';
      window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-md p-4">
      <div ref={sheet} className="rounded-2xl border-2 border-maroon/30 bg-white p-5 print:border-black">
        <div className="text-center">
          <div className="font-brand text-2xl text-maroon">{t('app.name')}</div>
          <div className="text-lg font-bold">{t('receipt.title')}</div>
          <div className="num text-sm text-muted">{t('receipt.no', { n: p.paymentNo })} · {fmtDateTime(p.confirmedAt)}</div>
        </div>
        <hr className="my-3 border-dashed border-line" />
        <Line label={t('field.memberName')} value={p.member?.fullName} />
        <Line label={t('field.memberNo')} value={p.member?.memberNo} />
        <Line label={t('receipt.method')} value={p.method === 'upi' ? `UPI${p.utr ? ` · ${p.utr}` : ''}` : t('pay.cash')} />
        <hr className="my-3 border-dashed border-line" />
        {a.lines.map((l, i) => <Line key={i} label={lineText(l)} value={money(l.amountPaise)} />)}
        {a.usedCreditPaise > 0 && <Line label={t('pay.creditUsed')} value={money(a.usedCreditPaise)} />}
        <hr className="my-3 border-dashed border-line" />
        {p.feePaise > 0 && <Line label={t('pay.toSamiti')} value={money(p.amountPaise)} />}
        {p.feePaise > 0 && <Line label={t('pay.fee')} value={money(p.feePaise)} />}
        <Line label={t('pay.total')} value={money(p.totalPaise)} strong />
        {a.creditAfterPaise > 0 && <Line label={t('receipt.creditNow')} value={money(a.creditAfterPaise)} />}
        <hr className="my-3 border-dashed border-line" />
        <div className="text-center text-sm text-muted">
          {t('receipt.receivedBy', { name: p.confirmedBy?.name ?? '—' })} · {fmtDate(p.confirmedAt?.slice(0, 10))}
        </div>
      </div>
      <div className="no-print mt-4 space-y-2">
        <Button variant="success" full icon="send" loading={busy === 'send'} disabled={Boolean(busy)} onClick={send}>{t('receipt.send')}</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button icon="printer" onClick={print}>{t('receipt.print')}</Button>
          <Button variant="secondary" icon="download" loading={busy === 'pdf'} disabled={Boolean(busy)} onClick={savePdf}>{t('reports.downloadPdf')}</Button>
        </div>
        <Button variant="ghost" full icon="back" onClick={() => history.back()}>{t('common.back')}</Button>
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

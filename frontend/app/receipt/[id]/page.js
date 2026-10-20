'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBox, Loading } from '@/components/ui';
import { api, getWho } from '@/lib/api';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { amountInWords } from '@/lib/words';
import { downloadPdf, pdfFile } from '@/lib/pdf';

/** Payment receipt (रसीद): print, save as PDF, or send (WhatsApp / any app). Staff opening it after a cash collection prints it at once. */
export default function Receipt({ params }) {
  const { id } = use(params);
  const { t, i18n } = useTranslation();
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
    : l.kind === 'loan' ? (l.settled ? t('receipt.loanSettleLine', { n: l.loanNo }) : t('receipt.loanLine', { n: l.loanNo })) : t('receipt.advance'));
  const text = [
    `*${t('app.name')}* — ${t('receipt.title')} #${p.paymentNo}`,
    `${t('field.memberName')}: ${p.member?.fullName} (${t('field.memberNo')} ${p.member?.memberNo})`,
    `${t('receipt.forWhat')}: ${t(`receipt.purpose.${p.purpose ?? 'all'}`)}`,
    ...a.lines.map((l) => `• ${lineText(l)}: ${money(l.amountPaise)}${l.kind === 'loan' ? ` (${t('loans.toPrincipal')} ${money(l.principalPaise)} + ${t('loans.toInterest')} ${money(l.interestPaise)})` : ''}${l.settled ? ` — ${t('receipt.loanClosed')}` : ''}`),
    ...(p.feePaise > 0 ? [`${t('pay.fee')}: ${money(p.feePaise)}`] : []),
    `*${t('receipt.totalPaid')}: ${money(p.totalPaise)}*`,
    `(${amountInWords(p.totalPaise, i18n.language)})`,
    ...(a.after ? [`${t('receipt.afterTitle')}: ${t('receipt.instLeft')} ${a.after.installmentPendingPaise ? money(a.after.installmentPendingPaise) : t('receipt.nothing')}${a.after.loans.filter((x) => !x.closed).map((x) => ` · ${t('receipt.loanLeft', { n: x.loanNo })} ${money(x.principalOutstandingPaise)}`).join('')}`] : []),
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
      <div ref={sheet} className="overflow-hidden rounded-2xl border border-line bg-white print:rounded-none print:border-black">
        {/* header */}
        <div className="border-b-2 border-maroon px-5 pb-4 pt-5 text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full border-2 border-maroon font-brand text-xl text-maroon">श्री</div>
          <div className="font-brand text-2xl leading-tight text-maroon">{t('app.name')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('app.tagline')}</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-maroon px-4 py-1 text-sm font-bold uppercase tracking-wider text-white">{t('receipt.title')}</div>
        </div>

        <div className="space-y-4 p-5">
          {/* receipt no · date · paid stamp */}
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">
              <div><span className="text-muted">{t('receipt.no2')}</span> <b className="num">#{p.paymentNo}</b></div>
              <div><span className="text-muted">{t('receipt.date')}</span> <b className="num">{fmtDateTime(p.confirmedAt)}</b></div>
            </div>
            <div className="rotate-[-6deg] rounded-lg border-2 border-ok px-3 py-1 text-center text-ok">
              <div className="text-sm font-extrabold uppercase tracking-widest">{t('receipt.paidStamp')}</div>
            </div>
          </div>

          {/* member */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-paper/70 p-3 text-sm">
            <div className="col-span-2"><span className="text-muted">{t('field.memberName')}</span><div className="text-base font-bold">{p.member?.fullName}</div></div>
            <div><span className="text-muted">{t('field.memberNo')}</span><div className="num font-semibold">{p.member?.memberNo}</div></div>
            <div><span className="text-muted">{t('field.mobile')}</span><div className="num font-semibold">{p.member?.mobileNumber}</div></div>
            <div><span className="text-muted">{t('receipt.method')}</span><div className="font-semibold">{p.method === 'upi' ? 'UPI' : t('pay.cash')}</div></div>
            <div><span className="text-muted">{t('receipt.forWhat')}</span><div className="font-semibold">{t(`receipt.purpose.${p.purpose ?? 'all'}`)}</div></div>
            {p.utr && <div className="col-span-2"><span className="text-muted">{t('receipt.utr')}</span><div className="num font-semibold">{p.utr}</div></div>}
          </div>

          {/* what was paid */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink/80 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 font-bold">{t('receipt.details')}</th>
                <th className="py-1.5 text-right font-bold">{t('loans.toPrincipal')}</th>
                <th className="py-1.5 text-right font-bold">{t('loans.toInterest')}</th>
                <th className="py-1.5 text-right font-bold">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {a.lines.map((l, i) => (
                <tr key={i} className="border-b border-line align-top">
                  <td className="py-2 pr-2">
                    <div className="font-semibold">{lineText(l)}</div>
                    {l.kind === 'installment' && !l.full && <div className="text-xs text-warn">{t('receipt.partPaid')}</div>}
                    {l.settled && <div className="text-xs font-bold text-ok">{t('receipt.loanClosed')}</div>}
                  </td>
                  <td className="num py-2 text-right">{l.kind === 'loan' ? money(l.principalPaise) : '—'}</td>
                  <td className="num py-2 text-right">{l.kind === 'loan' ? money(l.interestPaise) : '—'}</td>
                  <td className="num py-2 text-right font-semibold">{money(l.amountPaise)}</td>
                </tr>
              ))}
              {a.usedCreditPaise > 0 && (
                <tr className="border-b border-line text-ok"><td className="py-2" colSpan={3}>{t('receipt.creditUsedLine')}</td><td className="num py-2 text-right">− {money(a.usedCreditPaise)}</td></tr>
              )}
            </tbody>
          </table>

          {/* totals */}
          <div className="rounded-xl border-2 border-maroon/30 p-3">
            <Line label={t('receipt.toSamiti')} value={money(p.amountPaise)} />
            {p.feePaise > 0 && <Line label={t('pay.fee')} value={money(p.feePaise)} />}
            <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2">
              <span className="font-bold">{t('receipt.totalPaid')}</span>
              <span className="num text-2xl font-extrabold text-maroon">{money(p.totalPaise)}</span>
            </div>
            <div className="mt-1 text-right text-xs italic text-muted">{amountInWords(p.totalPaise, i18n.language)}</div>
          </div>

          {/* balances right after this payment */}
          {a.after && (
            <div className="rounded-xl bg-paper/70 p-3 text-sm">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{t('receipt.afterTitle')}</div>
              <Line label={t('receipt.instLeft')} value={a.after.installmentPendingPaise ? money(a.after.installmentPendingPaise) : t('receipt.nothing')} />
              {a.after.installmentMonths?.length > 0 && (
                <div className="-mt-0.5 mb-1 text-right text-xs text-muted">{a.after.installmentMonths.slice(0, 4).map((m) => `${t(`m${m.month}`)} ${m.year}`).join(', ')}{a.after.installmentMonths.length > 4 ? '…' : ''}</div>
              )}
              {a.after.loans.map((x) => (
                <Line key={x.loanNo} label={t('receipt.loanLeft', { n: x.loanNo })}
                  value={x.closed ? t('receipt.closedShort') : `${money(x.principalOutstandingPaise)}${x.interestOutstandingPaise ? ` + ${money(x.interestOutstandingPaise)} ${t('receipt.interestShort')}` : ''}`} />
              ))}
              {a.creditAfterPaise > 0 && <Line label={t('receipt.creditNow')} value={money(a.creditAfterPaise)} />}
            </div>
          )}

          {/* signatures */}
          <div className="grid grid-cols-2 gap-6 pt-6 text-center text-xs text-muted">
            <div><div className="border-t border-ink/50 pt-1">{t('receipt.memberSign')}</div></div>
            <div><div className="border-t border-ink/50 pt-1">{t('receipt.receivedBy', { name: p.confirmedBy?.name ?? '—' })}</div></div>
          </div>
          <p className="border-t border-dashed border-line pt-3 text-center text-[0.7rem] text-muted">{t('receipt.footer')}</p>
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

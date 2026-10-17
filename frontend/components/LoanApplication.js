'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Modal, TableWrap } from '@/components/ui';
import { Icon } from '@/components/icons';
import { money } from '@/lib/format';

export const DOC_KINDS = ['aadhaarFront', 'aadhaarBack', 'pan'];
export const APP_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' };
const DOC_TONE = { pending: 'warn', verified: 'ok', rejected: 'bad' };
const DOC_ICON = { pending: 'clock', verified: 'checkCircle', rejected: 'alert' };

const group4 = (s) => String(s ?? '').replace(/(.{4})(?=.)/g, '$1 ');

/** ATM-card style view of the bank account the loan money goes to. */
export function BankCard({ bank, name, mobile, status }) {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto aspect-[1.586] w-full max-w-sm select-none overflow-hidden rounded-2xl bg-gradient-to-br from-maroon via-maroon-dark to-[#2a0910] p-5 text-white shadow-[0_12px_30px_-10px_rgba(94,22,33,.6)]">
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/25" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-white/5" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{bank.name}</div>
            {bank.branch && <div className="truncate text-xs text-white/70">{bank.branch}</div>}
          </div>
          {status === 'approved' ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok px-2.5 py-0.5 text-xs font-bold"><Icon name="check" className="size-3.5" />{t('apply.approvedShort')}</span>
          ) : status ? (
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">{t(`apply.status.${status}`)}</span>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-3">
          {/* chip */}
          <div className="relative h-8 w-11 overflow-hidden rounded-md bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner">
            <div className="absolute inset-x-0 top-1/2 h-px bg-amber-700/40" />
            <div className="absolute inset-y-0 left-1/3 w-px bg-amber-700/40" />
            <div className="absolute inset-y-0 right-1/3 w-px bg-amber-700/40" />
          </div>
          <Icon name="wifi" className="size-5 rotate-90 text-white/70" />
        </div>
        <div className="num mt-auto text-[1.35rem] font-semibold tracking-[0.14em] sm:text-2xl" aria-label={t('apply.account')}>{group4(bank.account)}</div>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-end gap-3 text-xs">
          <div className="min-w-0">
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60">{t('apply.cardHolder')}</div>
            <div className="truncate text-sm font-bold uppercase">{bank.holder || name}</div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60">IFSC</div>
            <div className="num flex items-center gap-1 text-sm font-bold">{bank.ifsc}{bank.ifscVerified && <Icon name="checkCircle" className="size-3.5 text-emerald-300" />}</div>
          </div>
          {mobile && (
            <div className="text-right">
              <div className="text-[0.65rem] uppercase tracking-wider text-white/60">{t('field.mobile')}</div>
              <div className="num text-sm font-bold">{mobile}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The three document photos with their verification status. `onCheck(kind)` adds staff buttons. */
export function DocumentsList({ app, onCheck, busyKind }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {DOC_KINDS.map((k) => {
          const d = app.documents[k];
          if (!d) return null;
          return (
            <div key={k} className="overflow-hidden rounded-2xl border border-line bg-white">
              <button type="button" onClick={() => setOpen(k)} className="block w-full bg-stone-100" aria-label={t(`apply.doc.${k}`)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1${d.url}`} alt={t(`apply.doc.${k}`)} className="h-32 w-full object-cover" loading="lazy" />
              </button>
              <div className="space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t(`apply.doc.${k}`)}</span>
                  <Badge tone={DOC_TONE[d.status]} icon={DOC_ICON[d.status]}>{t(`apply.docStatus.${d.status}`)}</Badge>
                </div>
                {d.note && <p className="text-sm text-bad">{d.note}</p>}
                {onCheck && app.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <Button size="sm" variant={d.status === 'verified' ? 'success' : 'secondary'} icon="check" loading={busyKind === k} onClick={() => onCheck(k, 'verified')}>{t('apply.verify')}</Button>
                    <Button size="sm" variant={d.status === 'rejected' ? 'danger' : 'secondary'} icon="x" disabled={busyKind === k} onClick={() => onCheck(k, 'rejected')}>{t('apply.notOk')}</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? t(`apply.doc.${open}`) : ''} wide>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {open && <img src={`/api/v1${app.documents[open].url}`} alt={t(`apply.doc.${open}`)} className="mx-auto max-h-[70vh] w-auto rounded-xl" />}
      </Modal>
    </>
  );
}

/** Automatic checks done by the server: Aadhaar check digit, PAN format, IFSC found in the national list. */
export function AutoChecks({ app }) {
  const { t } = useTranslation();
  const items = [
    ['apply.check.aadhaar', app.aadhaarChecksumOk],
    ['apply.check.pan', app.panFormatOk],
    ['apply.check.ifsc', app.bank.ifscVerified],
  ];
  return (
    <ul className="space-y-1.5">
      {items.map(([k, ok]) => (
        <li key={k} className={`flex items-center gap-2 text-sm font-semibold ${ok ? 'text-ok' : 'text-warn'}`}>
          <Icon name={ok ? 'checkCircle' : 'alert'} className="size-4.5 shrink-0" />{t(k)}{!ok && ` — ${t('apply.check.notSure')}`}
        </li>
      ))}
    </ul>
  );
}

/** EMI list: first few months, the rest behind "see all". */
export function EmiTable({ plan, initial = 3 }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const rows = all ? plan.rows : plan.rows.slice(0, initial);
  return (
    <div className="space-y-2">
      <TableWrap min={420}>
        <thead>
          <tr><th>#</th><th>{t('common.month')}</th><th className="r">{t('apply.emi')}</th><th className="r">{t('loans.toInterest')}</th><th className="r">{t('loans.toPrincipal')}</th><th className="r">{t('apply.balance')}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td className="num text-muted">{r.n}</td>
              <td className="whitespace-nowrap">{t(`m${r.month}`)} {r.year}</td>
              <td className="r font-semibold">{money(r.paymentPaise)}</td>
              <td className="r">{money(r.interestPaise)}</td>
              <td className="r">{money(r.principalPaise)}</td>
              <td className="r">{money(r.balancePaise)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {plan.rows.length > initial && (
        <button type="button" onClick={() => setAll((x) => !x)} className="w-full rounded-xl py-2 text-center font-semibold text-maroon hover:bg-brand-50">
          {all ? t('apply.showLess') : t('apply.showAll', { n: plan.rows.length })}
        </button>
      )}
    </div>
  );
}

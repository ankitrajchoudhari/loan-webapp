'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorBox, Field, Modal, Notice, TextArea } from './ui';
import { Icon } from './icons';
import { money, fmtDateTime } from '@/lib/format';

/** Warnings from a preview, in plain words. */
export function Warnings({ codes }) {
  const { t } = useTranslation();
  if (!codes?.length) return null;
  return (
    <div className="space-y-2">
      {codes.map((c) => (
        <Notice key={c}>{t(`warn.${c}`)}</Notice>
      ))}
    </div>
  );
}

/** Blocking problems from a preview. */
export function Problems({ codes }) {
  const { t } = useTranslation();
  if (!codes?.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {codes.map((c) => (
        <div key={c} className="flex items-start gap-2 rounded-2xl border border-bad/30 bg-bad-bg p-3 font-semibold text-bad">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
          {t(`err.${c}`, { defaultValue: t('err.generic') })}
        </div>
      ))}
    </div>
  );
}

/** "Before → after" table for loan balances, so an edit never changes balances silently. */
export function BalanceCompare({ before, after }) {
  const { t } = useTranslation();
  if (!before || !after) return null;
  const rows = [
    ['label.principalOutstanding', 'principalOutstandingPaise'],
    ['label.interestOutstanding', 'interestOutstandingPaise'],
    ['label.totalOutstanding', 'totalOutstandingPaise'],
  ];
  return (
    <div className="rounded-2xl border-2 border-brand/30 bg-brand-50/60 p-4">
      <div className="mb-2 font-semibold text-maroon">{t('edit.effectTitle')}</div>
      <table className="sheet">
        <thead>
          <tr>
            <th />
            <th className="r">{t('edit.now')}</th>
            <th className="r">{t('edit.after')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k]) => {
            const changed = before[k] !== after[k];
            return (
              <tr key={k}>
                <td>{t(label)}</td>
                <td className="r">{money(before[k])}</td>
                <td className={`r font-bold ${changed ? 'text-bad' : ''}`}>{money(after[k])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Asks for the reason before a correction or cancellation is saved.
 * `children` shows what will change. onConfirm(reason) returns a promise.
 */
export function ReasonModal({ open, onClose, title, children, confirmLabel, danger, onConfirm, disabled }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    if (reason.trim().length < 3) return setError('reason_required');
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="md" loading={busy} disabled={disabled} onClick={submit} icon="check">
            {confirmLabel ?? t('label.saveChanges')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        <Field label={t('edit.reason')} hint={t('edit.reasonHint')} required htmlFor="reason">
          <TextArea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

/** Change history list (from the audit log). */
export function ChangeHistory({ entries }) {
  const { t } = useTranslation();
  if (!entries?.length) return <p className="text-muted">{t('audit.none')}</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="surface p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold">{t(`audit.${e.action}`, { defaultValue: e.action })}</span>
            <span className="num text-sm text-muted">{fmtDateTime(e.at)}</span>
          </div>
          {e.actorName && <div className="text-sm text-muted">{t('audit.by', { name: e.actorName })}{e.actorRole ? ` (${t(`role.${e.actorRole}`, { defaultValue: e.actorRole })})` : ''}</div>}
          {e.reason && <div className="mt-1"><span className="text-muted">{t('audit.reason')}:</span> {e.reason}</div>}
          <ChangeDetails before={e.before} after={e.after} />
        </li>
      ))}
    </ol>
  );
}

const MONEY_KEYS = /Paise$/;
const SHOW_KEYS = ['amountPaise', 'paidOn', 'method', 'note', 'totalPaise', 'principalPaise', 'interestPaise', 'monthlyInstallmentPaise', 'fullName', 'mobileNumber', 'joinDate', 'memberNo', 'rateBp', 'interestMethod', 'fixedInterestPaise', 'takenOn', 'installmentPaise', 'openingInterestPaise'];

function fmtVal(t, k, v) {
  if (v == null || v === '') return '—';
  if (MONEY_KEYS.test(k)) return money(v);
  if (k === 'rateBp') return `${v / 100}%`;
  if (k === 'method') return t(`pay.${v}`, { defaultValue: v });
  if (k === 'interestMethod') return t(`loan.method.${v}`, { defaultValue: v });
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10).split('-').reverse().join('/');
  return String(v);
}

/** Shows "field: old → new" for corrections and the balance effect when recorded. */
function ChangeDetails({ before, after }) {
  const { t } = useTranslation();
  const lines = [];
  if (after?.changes) {
    for (const [k, v] of Object.entries(after.changes)) lines.push([k, v.from, v.to]);
  } else if (before && after && !after.balances) {
    for (const k of SHOW_KEYS) if (k in after && JSON.stringify(before[k]) !== JSON.stringify(after[k])) lines.push([k, before[k], after[k]]);
  } else if (after && !before) {
    for (const [k, v] of Object.entries(after)) if (v && typeof v === 'object' && 'from' in v) lines.push([k, v.from, v.to]);
  }
  const bb = before?.balances ?? after?.balancesBefore;
  const ba = after?.balances ?? after?.balancesAfter;
  if (!lines.length && !(bb && ba)) return null;
  return (
    <div className="mt-2 space-y-1 text-sm">
      {lines.map(([k, from, to]) => (
        <div key={k}>
          <span className="text-muted">{t(`fieldName.${k}`, { defaultValue: k })}:</span>{' '}
          <span className="line-through opacity-70">{fmtVal(t, k, from)}</span> → <b>{fmtVal(t, k, to)}</b>
        </div>
      ))}
      {bb && ba && (
        <div>
          <span className="text-muted">{t('label.totalOutstanding')}:</span> {money(bb.totalOutstandingPaise)} → <b>{money(ba.totalOutstandingPaise)}</b>
        </div>
      )}
    </div>
  );
}

/** Small helper for "do an API call, show busy + error, then toast". */
export function useAction(toast) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn, okMessage) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (okMessage) toast?.(okMessage);
      return r;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

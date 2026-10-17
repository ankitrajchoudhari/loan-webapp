'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, MoneyInput, Row, Segmented, TextArea, Loading } from './ui';
import DateField from './DateField';
import { ReasonModal, Problems, Warnings } from './admin';
import { api } from '@/lib/api';
import { money, rupeesText, fmtDate } from '@/lib/format';
import { methodLabel } from './statement';

export const METHOD_OPTIONS = (t) => ['cash', 'upi', 'bank', 'other'].map((m) => ({ value: m, label: t(`pay.${m}`) }));

/** Correct or cancel one installment entry. mode: 'edit' | 'void'. */
export default function InstallmentEdit({ entry, mode, onClose, onDone }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ amount: rupeesText(entry.amountPaise), paidOn: entry.paidOn, method: entry.method ?? 'cash', note: entry.note ?? '' });
  const [preview, setPreview] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  // live preview of the corrected entry (nothing is saved)
  useEffect(() => {
    if (mode !== 'edit') return;
    const id = setTimeout(() => {
      api(`/installments/${entry.id}`, { method: 'PUT', query: { preview: 1 }, body: { amountPaise: f.amount, paidOn: f.paidOn, method: f.method, note: f.note, reason: 'preview' } })
        .then(setPreview)
        .catch((err) => setPreview({ errors: [err.details?.[0]?.message ?? err.code], warnings: [] }));
    }, 300);
    return () => clearTimeout(id);
  }, [f, entry.id, mode]);

  const confirm = async (reason) => {
    if (mode === 'void') await api(`/installments/${entry.id}/void`, { method: 'POST', body: { reason } });
    else await api(`/installments/${entry.id}`, { method: 'PUT', body: { amountPaise: f.amount, paidOn: f.paidOn, method: f.method, note: f.note, reason } });
    onDone(mode === 'void' ? t('inst.voided') : t('common.savedOk'));
  };

  const title = `${mode === 'void' ? t('inst.voidTitle') : t('inst.editTitle')} — ${t(`m${entry.month}`)} ${entry.year}`;
  return (
    <ReasonModal open onClose={onClose} title={title} danger={mode === 'void'} confirmLabel={mode === 'void' ? t('inst.voidConfirm') : undefined}
      onConfirm={confirm} disabled={mode === 'edit' && (!preview || preview.errors?.length > 0)}>
      <div className="rounded-2xl bg-stone-50 p-3">
        <div className="mb-1 text-sm font-semibold text-muted">{t('edit.currentEntry')}</div>
        <Row label={t('common.amount')} value={money(entry.amountPaise)} />
        <Row label={t('stmt.paidOn')} value={fmtDate(entry.paidOn)} sub={methodLabel(t, entry.method)} />
      </div>
      {mode === 'edit' && (
        <>
          <Field label={t('inst.amount')} required>
            <MoneyInput value={f.amount} onChange={set('amount')} />
          </Field>
          <Field label={t('stmt.paidOn')} required>
            <DateField value={f.paidOn} onChange={set('paidOn')} />
          </Field>
          <Field label={t('field.method')}>
            <Segmented value={f.method} onChange={set('method')} options={METHOD_OPTIONS(t)} size="sm" />
          </Field>
          <Field label={t('field.note')}>
            <TextArea value={f.note} onChange={(e) => set('note')(e.target.value)} rows={2} />
          </Field>
          {!preview ? <Loading /> : (<><Problems codes={preview.errors} /><Warnings codes={preview.warnings} /></>)}
        </>
      )}
      {mode === 'void' && <p className="font-semibold text-bad">{t('inst.voidHint')}</p>}
    </ReasonModal>
  );
}

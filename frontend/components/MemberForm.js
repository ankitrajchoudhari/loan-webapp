'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorBox, Field, Input, MoneyInput, TextArea } from './ui';
import DateField from './DateField';
import { rupeesText } from '@/lib/format';
import { api } from '@/lib/api';

/** Add / edit member. `initial` is a member from the API (or defaults for a new one). */
export default function MemberForm({ initial, isNew, onSubmit, busy, error }) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    memberNo: String(initial.memberNo ?? ''),
    fullName: initial.fullName ?? '',
    mobileNumber: initial.mobileNumber ?? '',
    joinDate: initial.joinDate,
    dateOfBirth: initial.dateOfBirth ?? '1970-01-01',
    monthlyInstallment: rupeesText(initial.monthlyInstallmentPaise),
    note: initial.note ?? '',
    reason: '',
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  // other accounts already on this number: allowed (family on one phone) — shown so the admin knows
  const [sharing, setSharing] = useState([]);
  useEffect(() => {
    if (!/^[6-9]\d{9}$/.test(f.mobileNumber)) return setSharing([]);
    let stale = false;
    api(`/members/by-mobile/${f.mobileNumber}`).then((r) => !stale && setSharing(r.members.filter((m) => m.id !== initial.id))).catch(() => {});
    return () => { stale = true; };
  }, [f.mobileNumber, initial.id]);
  const fieldErr = (name) => {
    const d = error?.details?.find?.((x) => x.field === name);
    return d ? t(`err.${d.message}`, { defaultValue: t('err.generic') }) : null;
  };
  const moneyChanged = !isNew && (f.monthlyInstallment !== rupeesText(initial.monthlyInstallmentPaise) || f.joinDate !== initial.joinDate);

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      memberNo: f.memberNo,
      fullName: f.fullName,
      mobileNumber: f.mobileNumber,
      joinDate: f.joinDate,
      dateOfBirth: f.dateOfBirth,
      monthlyInstallmentPaise: f.monthlyInstallment,
      note: f.note,
      ...(isNew ? {} : { reason: f.reason }),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('field.memberNo')} required htmlFor="no" hint={isNew ? t('members.noHint') : null} error={fieldErr('memberNo')}>
            <Input id="no" inputMode="numeric" value={f.memberNo} onChange={(e) => set('memberNo')(e.target.value.replace(/\D/g, '').slice(0, 6))} className="num" />
          </Field>
          <Field label={t('field.fullName')} required htmlFor="name" error={fieldErr('fullName')}>
            <Input id="name" value={f.fullName} onChange={(e) => set('fullName')(e.target.value)} maxLength={100} autoComplete="off" />
          </Field>
          <Field label={t('field.mobile')} required htmlFor="mobile" error={fieldErr('mobileNumber')}>
            <Input id="mobile" type="tel" inputMode="numeric" maxLength={10} value={f.mobileNumber} onChange={(e) => set('mobileNumber')(e.target.value.replace(/\D/g, '').slice(0, 10))} className="num" />
            {sharing.length > 0 && (
              <p className="mt-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm text-brand-dark">
                {t('members.sharedNumber', { names: sharing.map((m) => `${m.fullName} (${t('field.memberNo')} ${m.memberNo})`).join(', ') })}
              </p>
            )}
          </Field>
          <Field label={t('field.monthlyInstallment')} required htmlFor="inst" error={fieldErr('monthlyInstallmentPaise')}>
            <MoneyInput id="inst" value={f.monthlyInstallment} onChange={set('monthlyInstallment')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('field.dateOfBirth')} required hint={t('members.dobHint')} error={fieldErr('dateOfBirth')}>
              <DateField value={f.dateOfBirth} onChange={set('dateOfBirth')} minYear={1920} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('field.joinDate')} required error={fieldErr('joinDate')}>
              <DateField value={f.joinDate} onChange={set('joinDate')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('field.note')} htmlFor="note">
              <TextArea id="note" value={f.note} onChange={(e) => set('note')(e.target.value)} maxLength={500} />
            </Field>
          </div>
          {moneyChanged && (
            <div className="sm:col-span-2">
              <Field label={t('edit.reason')} hint={t('members.reasonHint')} required htmlFor="reason" error={fieldErr('reason')}>
                <TextArea id="reason" value={f.reason} onChange={(e) => set('reason')(e.target.value)} maxLength={500} />
              </Field>
            </div>
          )}
        </div>
      </Card>
      {error && <ErrorBox error={error} />}
      <Button type="submit" full loading={busy} icon="check">{isNew ? t('members.save') : t('label.saveChanges')}</Button>
    </form>
  );
}

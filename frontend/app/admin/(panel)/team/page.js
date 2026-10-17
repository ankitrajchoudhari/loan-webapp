'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, Notice, PageTitle, Segmented, TextArea } from '@/components/ui';
import DateField from '@/components/DateField';
import { useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

const ROLE_TONE = { developer: 'test', admin: 'brand', subadmin: 'neutral' };

/** Team: developer adds admins and sub-admins; admin adds sub-admins and gives them work. */
export default function Team() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/staff');
  const [edit, setEdit] = useState(null); // {} for new, or a staff row

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const canAdd = data.canManage.length > 0;

  const toggle = async (s) => {
    try {
      await api(`/staff/${s.id}/status`, { method: 'POST', body: { status: s.status === 'active' ? 'inactive' : 'active' } });
      toast(t('common.savedOk'));
      reload();
    } catch (err) {
      toast(t(`err.${err.code}`, { defaultValue: t('err.generic') }), 'bad');
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.team')} subtitle={t('team.subtitle')}
        action={canAdd && <Button size="md" icon="userPlus" onClick={() => setEdit({})}>{t('team.add')}</Button>} />
      <Notice tone="brand" icon="shield">{t('team.explain')}</Notice>

      <ul className="space-y-2">
        {data.staff.map((s) => {
          const mine = data.canManage.includes(s.role);
          return (
            <li key={s.id} className={`rounded-2xl border border-line bg-white p-4 ${s.status !== 'active' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{s.name}</span>
                <Badge tone={ROLE_TONE[s.role]}>{t(`role.${s.role}`)}</Badge>
                {s.status !== 'active' && <Badge>{t('member.inactive')}</Badge>}
              </div>
              <div className="num text-sm text-muted">
                {s.mobileNumber ?? '—'} · {t('field.dateOfBirth')} {fmtDate(s.dateOfBirth)}{s.email ? ` · ${s.email}` : ''}
              </div>
              {s.role === 'subadmin' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.permissions.length ? s.permissions.map((p) => <Badge key={p} tone="ok">{t(`perm.${p}`)}</Badge>) : <span className="text-sm text-bad">{t('team.noWork')}</span>}
                </div>
              )}
              {s.duty && <p className="mt-2 rounded-xl bg-stone-50 p-2 text-sm"><b>{t('team.duty')}:</b> {s.duty}</p>}
              <div className="mt-1 text-xs text-muted">{t('team.lastLogin')}: {s.lastLogin ? fmtDateTime(s.lastLogin) : '—'}</div>
              {mine && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => setEdit(s)}>{t('team.edit')}</Button>
                  <Button size="sm" variant="ghost" icon={s.status === 'active' ? 'x' : 'check'} onClick={() => toggle(s)}>
                    {s.status === 'active' ? t('team.turnOff') : t('team.turnOn')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {edit && <StaffForm initial={edit} roles={data.canManage} perms={data.perms} onClose={() => setEdit(null)} onDone={() => { setEdit(null); toast(t('common.savedOk')); reload(); }} />}
    </div>
  );
}

function StaffForm({ initial, roles, perms, onClose, onDone }) {
  const { t } = useTranslation();
  const isNew = !initial.id;
  const [f, setF] = useState({
    name: initial.name ?? '',
    mobileNumber: initial.mobileNumber ?? '',
    dateOfBirth: initial.dateOfBirth ?? '1985-01-01',
    email: initial.email ?? '',
    role: initial.role ?? roles[roles.length - 1],
    permissions: initial.permissions ?? [],
    duty: initial.duty ?? '',
  });
  const { busy, error, run } = useAction();
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const togglePerm = (p) => setF((s) => ({ ...s, permissions: s.permissions.includes(p) ? s.permissions.filter((x) => x !== p) : [...s.permissions, p] }));
  const save = async () => {
    const r = await run(() => api(isNew ? '/staff' : `/staff/${initial.id}`, { method: isNew ? 'POST' : 'PUT', body: f }));
    if (r) onDone();
  };

  return (
    <Modal open wide onClose={onClose} title={isNew ? t('team.add') : t('team.edit')}
      footer={<><Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button><Button size="md" icon="check" loading={busy} onClick={save}>{t('label.saveChanges')}</Button></>}>
      <div className="space-y-4">
        {roles.length > 1 && (
          <Field label={t('team.role')}>
            <Segmented value={f.role} onChange={set('role')} options={roles.map((r) => ({ value: r, label: t(`role.${r}`) }))} />
          </Field>
        )}
        <Field label={t('field.fullName')} required><Input value={f.name} onChange={(e) => set('name')(e.target.value)} maxLength={100} /></Field>
        <Field label={t('field.mobile')} required>
          <Input type="tel" inputMode="numeric" maxLength={10} value={f.mobileNumber} onChange={(e) => set('mobileNumber')(e.target.value.replace(/\D/g, '').slice(0, 10))} className="num" />
        </Field>
        <Field label={t('field.dateOfBirth')} required hint={t('team.dobHint')}><DateField value={f.dateOfBirth} onChange={set('dateOfBirth')} minYear={1920} /></Field>
        {f.role === 'admin' && (
          <Field label={t('team.gmail')} hint={t('team.gmailHint')}>
            <Input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} maxLength={200} autoComplete="off" />
          </Field>
        )}
        {f.role === 'subadmin' && (
          <Field label={t('team.work')} hint={t('team.workHint')}>
            <div className="grid gap-2 sm:grid-cols-2">
              {perms.map((p) => (
                <label key={p} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 ${f.permissions.includes(p) ? 'border-maroon bg-brand-50' : 'border-line bg-white'}`}>
                  <input type="checkbox" className="size-5 accent-[#7a1f2b]" checked={f.permissions.includes(p)} onChange={() => togglePerm(p)} />
                  <span className="font-semibold">{t(`perm.${p}`)}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label={t('team.duty')} hint={t('team.dutyHint')}>
          <TextArea value={f.duty} onChange={(e) => set('duty')(e.target.value)} rows={2} maxLength={1000} />
        </Field>
        {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

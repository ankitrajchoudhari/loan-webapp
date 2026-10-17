'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorBox, Field, Loading, Modal, MoneyInput, PageTitle, Row, Segmented, StatusBadge, TableWrap, TextArea, Notice } from '@/components/ui';
import { Icon } from '@/components/icons';
import MemberPicker from '@/components/MemberPicker';
import DateField, { MonthYearSelect } from '@/components/DateField';
import InstallmentEdit, { METHOD_OPTIONS } from '@/components/InstallmentEdit';
import { Problems, Warnings, useAction } from '@/components/admin';
import { methodLabel } from '@/components/statement';
import { useToast } from '@/app/providers';
import { useApi, useQueryParam } from '@/lib/hooks';
import { api } from '@/lib/api';
import { defaultDateFor, fmtDate, money, nowMonthYear, rupeesText } from '@/lib/format';

/** Spec §4.3 — enter a member's installment: fill → preview → save → confirmation. */
export default function Installments() {
  const { t } = useTranslation();
  const toast = useToast();
  const preselect = useQueryParam('member');
  const [my, setMy] = useState(nowMonthYear);
  const [memberId, setMemberId] = useState(null);
  const [member, setMember] = useState(null);
  const [f, setF] = useState({ amount: '', paidOn: defaultDateFor(my.month, my.year), method: 'cash', note: '' });
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [edit, setEdit] = useState(null);
  const sheet = useApi('/installments/sheet', my);
  const { busy, error, setError, run } = useAction();
  const formRef = useRef(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!preselect) return;
    api(`/members/${preselect}`).then((r) => pickMember(r.member.id, r.member)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect]);

  // keep the default date inside the chosen month
  useEffect(() => setF((s) => ({ ...s, paidOn: defaultDateFor(my.month, my.year) })), [my]);

  const pickMember = (id, m) => {
    setMemberId(id);
    setMember(m);
    setError(null);
    if (m) setF((s) => ({ ...s, amount: rupeesText(m.monthlyInstallmentPaise) }));
  };

  const body = () => ({ memberId, month: my.month, year: my.year, amountPaise: f.amount, paidOn: f.paidOn, method: f.method, note: f.note });

  const openPreview = async (e) => {
    e.preventDefault();
    if (!memberId) return setError('member_required');
    const r = await run(() => api('/installments/preview', { method: 'POST', body: body() }));
    if (r) setPreview(r);
  };

  const save = async () => {
    const r = await run(() => api('/installments', { method: 'POST', body: body() }));
    if (r) {
      setPreview(null);
      setSaved(r);
      setMemberId(null);
      setMember(null);
      setF((s) => ({ ...s, amount: '', note: '' }));
      sheet.reload();
    }
  };

  const startFor = (row) => {
    pickMember(row.member.id, row.member);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <PageTitle title={t('nav.installments')} subtitle={t('inst.subtitle')} />

      <Card title={t('inst.formTitle')} icon="calendarCheck">
        <form ref={formRef} onSubmit={openPreview} className="space-y-5" noValidate>
          <Field label={t('inst.pickMember')} required>
            <MemberPicker key={memberId ?? 'none'} value={memberId} onChange={pickMember} />
          </Field>
          <Field label={t('inst.pickMonth')} required>
            <MonthYearSelect month={my.month} year={my.year} onChange={setMy} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('inst.amount')} required hint={member ? t('inst.dueHint', { amount: money(member.monthlyInstallmentPaise) }) : null}>
              <MoneyInput value={f.amount} onChange={set('amount')} />
            </Field>
            <Field label={t('inst.paidOn')} required>
              <DateField value={f.paidOn} onChange={set('paidOn')} />
            </Field>
          </div>
          <Field label={t('inst.method')}>
            <Segmented value={f.method} onChange={set('method')} options={METHOD_OPTIONS(t)} />
          </Field>
          <Field label={t('field.note')}>
            <TextArea value={f.note} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={500} />
          </Field>
          {error && <ErrorBox error={error} />}
          <Button type="submit" full loading={busy && !preview} icon="file">{t('common.preview')}</Button>
        </form>
      </Card>

      <MonthSheet sheet={sheet} my={my} onPick={startFor} onEdit={setEdit} />

      {preview && (
        <Modal
          open
          onClose={() => setPreview(null)}
          title={t('inst.previewTitle')}
          footer={
            <>
              <Button variant="secondary" size="md" onClick={() => setPreview(null)} icon="edit">{t('common.changeSomething')}</Button>
              <Button size="md" loading={busy} disabled={preview.errors.length > 0} onClick={save} icon="check">{t('common.saveNow')}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <Row label={t('field.memberName')} value={preview.member?.fullName} />
              <Row label={t('field.memberNo')} value={preview.member?.memberNo} />
              <Row label={t('common.month')} value={`${t(`m${preview.entry.month}`)} ${preview.entry.year}`} />
              <Row label={t('stmt.monthlyAmount')} value={money(preview.entry.duePaise)} />
              <Row label={t('inst.amount')} value={money(preview.entry.amountPaise)} strong tone="ok" />
              <Row label={t('inst.paidOn')} value={fmtDate(preview.entry.paidOn)} />
              <Row label={t('inst.method')} value={methodLabel(t, preview.entry.method)} />
              {preview.entry.note && <Row label={t('field.note')} value={preview.entry.note} />}
            </div>
            <Problems codes={preview.errors} />
            {preview.duplicate && (
              <Notice>
                {t('inst.duplicateExisting', { amount: money(preview.duplicate.amountPaise), date: fmtDate(preview.duplicate.paidOn) })}
              </Notice>
            )}
            <Warnings codes={preview.warnings} />
          </div>
        </Modal>
      )}

      {saved && (
        <Modal open onClose={() => setSaved(null)} title={t('inst.savedTitle')}
          footer={<Button size="md" onClick={() => setSaved(null)} icon="plus">{t('inst.next')}</Button>}>
          <div className="space-y-3 text-center">
            <Icon name="checkCircle" className="mx-auto size-16 text-ok" />
            <p className="text-xl font-bold text-ok">{t('inst.savedMessage', { name: saved.member.fullName, month: t(`m${saved.installment.month}`), year: saved.installment.year })}</p>
            <div className="text-left">
              <Row label={t('inst.amount')} value={money(saved.installment.amountPaise)} />
              <Row label={t('stmt.status')} value={<StatusBadge status={saved.status.status} />} />
              <Row label={t('label.pending')} value={money(saved.status.pendingPaise)} tone={saved.status.pendingPaise ? 'bad' : 'ok'} />
              <Row label={t('history.installmentArrears')} value={money(saved.arrears.amountPaise)} tone={saved.arrears.amountPaise ? 'bad' : 'ok'} />
            </div>
          </div>
        </Modal>
      )}

      {edit && <InstallmentEdit {...edit} onClose={() => setEdit(null)} onDone={(msg) => { setEdit(null); toast(msg); sheet.reload(); }} />}
    </div>
  );
}

function MonthSheet({ sheet, my, onPick, onEdit }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const { data, error, loading, reload } = sheet;
  const rows = data?.rows.filter((r) => filter === 'all' || (filter === 'pending' ? r.installment.status !== 'paid' : r.installment.status === 'paid')) ?? [];
  return (
    <Card title={t('inst.sheetTitle', { month: t(`m${my.month}`), year: my.year })} icon="users">
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ok-bg p-2"><div className="text-sm text-ok">{t('status.paid')}</div><div className="num text-xl font-bold text-ok">{data.totals.paid}</div></div>
            <div className="rounded-xl bg-warn-bg p-2"><div className="text-sm text-warn">{t('status.partial')}</div><div className="num text-xl font-bold text-warn">{data.totals.partial}</div></div>
            <div className="rounded-xl bg-bad-bg p-2"><div className="text-sm text-bad">{t('status.pending')}</div><div className="num text-xl font-bold text-bad">{data.totals.pending}</div></div>
          </div>
          <Row label={t('inst.collected')} value={money(data.totals.paidPaise)} tone="ok" />
          <Row label={t('label.pending')} value={money(data.totals.pendingPaise)} tone="bad" />
          <Segmented value={filter} onChange={setFilter} size="sm" options={[{ value: 'all', label: t('common.all') }, { value: 'pending', label: t('inst.notPaid') }, { value: 'paid', label: t('status.paid') }]} />
          {rows.length === 0 ? <p className="text-muted">{t('label.noRecord')}</p> : (
            <TableWrap min={600}>
              <thead>
                <tr>
                  <th>{t('field.memberNo')}</th>
                  <th>{t('field.memberName')}</th>
                  <th className="r">{t('stmt.paidShort')}</th>
                  <th>{t('stmt.paidOn')}</th>
                  <th>{t('stmt.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.member.id}>
                    <td className="num">{r.member.memberNo}</td>
                    <td className="font-semibold">{r.member.fullName}</td>
                    <td className="r">{r.installment.paidPaise ? money(r.installment.paidPaise) : '—'}</td>
                    <td className="num">{fmtDate(r.installment.paidOn)}</td>
                    <td><StatusBadge status={r.installment.status} /></td>
                    <td className="text-right">
                      {r.installment.id ? (
                        <Button size="sm" variant="ghost" icon="edit" onClick={() => onEdit({ entry: { ...r.installment, amountPaise: r.installment.paidPaise }, mode: 'edit' })}>{t('common.correct')}</Button>
                      ) : r.member.status === 'active' ? (
                        <Button size="sm" variant="ghost" icon="plus" onClick={() => onPick(r)}>{t('inst.enter')}</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
    </Card>
  );
}

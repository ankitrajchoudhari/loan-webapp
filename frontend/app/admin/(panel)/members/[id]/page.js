'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ButtonLink, Card, ErrorBox, Field, Input, Loading, Notice, PageTitle, Row, Segmented, StatusBadge, TableWrap } from '@/components/ui';
import MonthPager, { clampMonth } from '@/components/MonthPager';
import InstallmentEdit from '@/components/InstallmentEdit';
import { MonthStatement, InstallmentMonthsTable, DepositsTable, methodLabel, interestRule } from '@/components/statement';
import { ChangeHistory, ReasonModal } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDate, money, nowMonthYear } from '@/lib/format';

const TABS = ['month', 'old', 'entries', 'loans', 'changes'];

export default function MemberAccount({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [tab, setTab] = useState('month');
  const [my, setMy] = useState(nowMonthYear);
  const [dialog, setDialog] = useState(null);
  const member = useApi(`/members/${id}`);
  const m = member.data?.member;

  if (member.error) return <ErrorBox error={member.error} onRetry={member.reload} />;
  if (!m) return <Loading />;

  return (
    <div className="space-y-4">
      <PageTitle
        title={m.fullName}
        subtitle={`${t('field.memberNo')} ${m.memberNo} · ${m.mobileNumber}`}
        back="/admin/members"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/members/${id}/edit`} icon="edit" size="md" variant="secondary">{t('members.edit')}</ButtonLink>
            {m.status === 'active' ? (
              <Button size="md" variant="secondary" icon="x" onClick={() => setDialog('deactivate')}>{t('members.deactivate')}</Button>
            ) : (
              <Button size="md" variant="secondary" icon="check" onClick={() => setDialog('activate')}>{t('members.activate')}</Button>
            )}
            <Button size="md" variant="danger" icon="trash" onClick={() => { setConfirmName(''); setDialog('delete'); }}>{t('members.delete')}</Button>
          </div>
        }
      />

      <Card>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <Row label={t('field.memberNo')} value={m.memberNo} />
          <Row label={t('field.joinDate')} value={fmtDate(m.joinDate)} />
          <Row label={t('field.monthlyInstallment')} value={money(m.monthlyInstallmentPaise)} />
          <Row label={t('field.accountStatus')} value={m.status === 'active' ? <Badge tone="ok">{t('member.active')}</Badge> : <Badge>{t('member.inactiveSince', { date: fmtDate(m.inactiveSince) })}</Badge>} />
          <Row label={t('field.dateOfBirth')} value={m.dateOfBirth ? fmtDate(m.dateOfBirth) : <span className="text-bad">{t('members.dobMissing')}</span>} />
        </div>
        {m.note && <p className="mt-3 text-muted">{m.note}</p>}
        {member.data?.sharedWith?.length > 0 && (
          <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm">
            <span className="font-semibold text-brand-dark">{t('members.sameNumberAs')} </span>
            {member.data.sharedWith.map((x, i) => (
              <span key={x.id}>{i > 0 && ', '}<Link href={`/admin/members/${x.id}`} className="font-semibold text-maroon underline">{x.fullName} ({t('field.memberNo')} {x.memberNo})</Link></span>
            ))}
          </div>
        )}
        {m.status === 'active' && (
          <div className="no-print mt-4 grid gap-2 sm:grid-cols-2">
            <ButtonLink href={`/admin/installments?member=${id}`} icon="calendarCheck" size="md" full>{t('dash.addInstallment')}</ButtonLink>
            <ButtonLink href={`/admin/loans/new?member=${id}`} icon="handCoins" size="md" variant="secondary" full>{t('loans.add')}</ButtonLink>
          </div>
        )}
      </Card>

      <div className="no-print -mx-1 overflow-x-auto px-1">
        <div className="min-w-[560px]">
          <Segmented value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x, label: t(`memberTab.${x}`) }))} />
        </div>
      </div>

      {tab === 'month' && <MonthTab id={id} my={my} setMy={setMy} joinDate={m.joinDate} />}
      {tab === 'old' && <OldTab id={id} />}
      {tab === 'entries' && <EntriesTab id={id} toast={toast} />}
      {tab === 'loans' && <LoansTab id={id} />}
      {tab === 'changes' && <ChangesTab id={id} />}

      {(dialog === 'deactivate' || dialog === 'activate') && (
        <ReasonModal
          open
          onClose={() => setDialog(null)}
          title={dialog === 'deactivate' ? t('members.deactivate') : t('members.activate')}
          danger={dialog === 'deactivate'}
          confirmLabel={dialog === 'deactivate' ? t('members.deactivate') : t('members.activate')}
          onConfirm={async (reason) => {
            await api(`/members/${id}/${dialog}`, { method: 'POST', body: { reason } });
            toast(t('common.savedOk'));
            setDialog(null);
            member.reload();
          }}
        >
          {dialog === 'deactivate' && <Notice>{t('members.deactivateHint')}</Notice>}
        </ReasonModal>
      )}

      {dialog === 'delete' && (
        <ReasonModal
          open
          onClose={() => setDialog(null)}
          title={t('members.deleteTitle')}
          danger
          confirmLabel={t('members.delete')}
          disabled={confirmName.trim().toLowerCase() !== m.fullName.trim().toLowerCase()}
          onConfirm={async (reason) => {
            const r = await api(`/members/${id}`, { method: 'DELETE', body: { reason, confirmName } });
            toast(t('members.deletedOk', { date: fmtDate(r.mobileAvailableFrom) }));
            router.replace('/admin/members');
          }}
        >
          <Notice tone="bad" icon="trash">{t('members.deleteWarn')}</Notice>
          <p className="text-muted">{t('members.deleteCooldown')}</p>
          {m.status === 'active' && <p className="text-sm text-muted">{t('members.deleteInstead')}</p>}
          <Field label={t('members.deleteTypeName', { name: m.fullName })} htmlFor="confirm-name" required>
            <Input id="confirm-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </Field>
        </ReasonModal>
      )}
    </div>
  );
}

function MonthTab({ id, my, setMy, joinDate }) {
  const min = joinDate ? { year: Number(joinDate.slice(0, 4)), month: Number(joinDate.slice(5, 7)) } : null;
  const max = nowMonthYear();
  useEffect(() => {
    const fixed = clampMonth(my, min, max);
    if (fixed.month !== my.month || fixed.year !== my.year) setMy(fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinDate]);
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi(`/statements/${id}/month`, my);
  return (
    <div className="space-y-4">
      <MonthPager month={my.month} year={my.year} onChange={setMy} min={min} max={max} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading || !data ? !error && <Loading /> : <MonthStatement st={data} />}
      <Button variant="secondary" full icon="printer" onClick={() => window.print()} className="no-print">{t('common.print')}</Button>
    </div>
  );
}

function OldTab({ id }) {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi(`/statements/${id}/history`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  return (
    <div className="space-y-4">
      <Card title={t('history.summary')} icon="file">
        <Row label={t('history.totalInstallments')} value={money(data.totals.installmentsPaise)} tone="ok" />
        <Row label={t('stmt.principalPaidSoFar')} value={money(data.totals.principalPaidPaise)} />
        <Row label={t('stmt.interestPaidSoFar')} value={money(data.totals.interestPaidPaise)} />
        <Row label={t('history.installmentArrears')} value={money(data.totals.arrears.amountPaise)} tone={data.totals.arrears.amountPaise ? 'bad' : 'ok'} strong />
      </Card>
      <Card title={t('history.monthwise')} icon="calendar"><InstallmentMonthsTable months={data.months} /></Card>
      <Card title={t('label.paymentHistory')} icon="receipt"><DepositsTable deposits={data.deposits} /></Card>
      <Button variant="secondary" full icon="printer" onClick={() => window.print()} className="no-print">{t('common.print')}</Button>
    </div>
  );
}

function EntriesTab({ id, toast }) {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi(`/installments/member/${id}/all`);
  const [edit, setEdit] = useState(null);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  return (
    <Card title={t('memberTab.entries')} icon="calendarCheck">
      {data.installments.length === 0 ? (
        <p className="text-muted">{t('common.empty')}</p>
      ) : (
        <TableWrap min={640}>
          <thead>
            <tr>
              <th>{t('common.month')}</th>
              <th className="r">{t('common.amount')}</th>
              <th>{t('stmt.paidOn')}</th>
              <th>{t('field.method')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.installments.map((e) => (
              <tr key={e.id} className={e.voided ? 'opacity-60' : ''}>
                <td className="font-semibold">
                  {t(`m${e.month}`)} {e.year}
                  {e.source === 'history' && <Badge tone="brand" className="ml-2">{t('history.badge')}</Badge>}
                </td>
                <td className={`r ${e.voided ? 'line-through' : ''}`}>{money(e.amountPaise)}</td>
                <td className="num">{fmtDate(e.paidOn)}</td>
                <td>{methodLabel(t, e.method)}</td>
                <td className="text-right">
                  {e.voided ? (
                    <span className="text-sm text-bad">{t('inst.voidedBecause', { reason: e.voidReason })}</span>
                  ) : (
                    <div className="no-print flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon="edit" onClick={() => setEdit({ entry: e, mode: 'edit' })}>{t('common.correct')}</Button>
                      <Button size="sm" variant="ghost" icon="x" onClick={() => setEdit({ entry: e, mode: 'void' })}>{t('common.void')}</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {edit && <InstallmentEdit {...edit} onClose={() => setEdit(null)} onDone={(msg) => { setEdit(null); toast(msg); reload(); }} />}
    </Card>
  );
}

function LoansTab({ id }) {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/loans', { memberId: id });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  if (!data.loans.length) return <Card><p className="text-lg text-muted">{t('loans.noneForMember')}</p></Card>;
  return (
    <div className="space-y-3">
      {data.loans.map((l) => (
        <Link key={l.id} href={`/admin/loans/${l.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-brand/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">{t('loan.no', { n: l.loanNo })} · {money(l.principalPaise)}</span>
            {l.position.closed ? <Badge tone="ok" icon="check">{t('loan.closed')}</Badge> : <Badge tone="warn">{t('loan.running')}</Badge>}
          </div>
          <div className="text-sm text-muted">{fmtDate(l.takenOn)} · {interestRule(t, l)}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-muted">{t('label.principalOutstanding')}</div><div className="num font-bold">{money(l.position.principalOutstandingPaise)}</div></div>
            <div><div className="text-muted">{t('label.interestOutstanding')}</div><div className="num font-bold">{money(l.position.interestOutstandingPaise)}</div></div>
            <div><div className="text-muted">{t('label.totalOutstanding')}</div><div className="num font-bold text-bad">{money(l.position.totalOutstandingPaise)}</div></div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ChangesTab({ id }) {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi(`/members/${id}/changes`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  return <Card title={t('memberTab.changes')} icon="log"><ChangeHistory entries={data.entries} /></Card>;
}


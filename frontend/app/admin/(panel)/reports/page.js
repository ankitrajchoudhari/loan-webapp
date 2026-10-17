'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorBox, Field, Loading, Notice, PageTitle, Row, StatusBadge, TableWrap } from '@/components/ui';
import { MonthYearSelect } from '@/components/DateField';
import MemberPicker from '@/components/MemberPicker';
import { InstallmentMonthsTable, interestRule } from '@/components/statement';
import { Icon } from '@/components/icons';
import { useApi, useQueryParam } from '@/lib/hooks';
import { fmtDate, money, nowMonthYear } from '@/lib/format';
import { downloadPdf, printOnly } from '@/lib/pdf';

const TYPES = ['deposits', 'pending', 'loans', 'member'];

/** Spec §4.6 — simple reports, filtered by month, year and member; print or save as PDF. */
export default function Reports() {
  const { t } = useTranslation();
  const initial = useQueryParam('type');
  const [type, setType] = useState('deposits');
  const [my, setMy] = useState(nowMonthYear);
  const [memberId, setMemberId] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // one member's account being printed / downloaded: { member, action }
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const title = `${t(`reports.type.${type}`)} — ${t(`m${my.month}`)} ${my.year}`;
  const act = { busyId: sheet?.member.id, onAct: (member, action) => !sheet && setSheet({ member, action }) };
  useEffect(() => {
    if (TYPES.includes(initial)) setType(initial);
  }, [initial]);

  const needMember = type === 'member';
  const { data, error, loading, reload } = useApi(needMember && !memberId ? null : `/reports/${type}`, { ...my, memberId: memberId ?? '' });

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.reports')} subtitle={t('reports.subtitle')} />

      <Card className="no-print">
        <div className="space-y-4">
          <Field label={t('reports.which')}>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((x) => (
                <button key={x} type="button" onClick={() => setType(x)}
                  className={`min-h-12 rounded-xl border-2 px-3 text-left font-semibold ${type === x ? 'border-maroon bg-maroon text-white' : 'border-line bg-white hover:bg-brand-50'}`}>
                  {t(`reports.type.${x}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('reports.month')}>
            <MonthYearSelect month={my.month} year={my.year} onChange={setMy} />
          </Field>
          <Field label={needMember ? t('inst.pickMember') : t('reports.memberOptional')} required={needMember}>
            {needMember || memberId || pickOpen ? (
              <MemberPicker key={memberId ?? 'none'} value={memberId} status="" allowClear onChange={(id) => { setMemberId(id); setPickOpen(false); }} />
            ) : (
              <Button variant="secondary" size="md" icon="search" onClick={() => setPickOpen(true)}>{t('inst.pickMember')}</Button>
            )}
          </Field>
        </div>
      </Card>

      {sheet && <MemberSheet {...sheet} month={my.month} year={my.year} onDone={() => setSheet(null)} />}

      {error && <ErrorBox error={error} onRetry={reload} />}
      {needMember && !memberId ? (
        <Notice>{t('reports.pickMemberFirst')}</Notice>
      ) : loading || !data ? (
        !error && <Loading />
      ) : (
        <>
          <div ref={listRef} className="space-y-4 bg-cream">
            <SheetHeader title={title} />
            {type === 'deposits' && <Deposits data={data} act={act} />}
            {type === 'pending' && <Pending data={data} act={act} />}
            {type === 'loans' && <LoansReport data={data} act={act} />}
            {type === 'member' && <MemberReport data={data} />}
          </div>
          <div className="no-print space-y-2">
            {type !== 'member' && <p className="text-center text-sm text-muted">{t('reports.perMemberHint')}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button full icon="download" loading={busy} onClick={async () => {
                setBusy(true);
                try { await downloadPdf(listRef.current, type === 'member' ? data.member.fullName : title); } finally { setBusy(false); }
              }}>{type === 'member' ? t('reports.downloadPdf') : t('reports.downloadAll')}</Button>
              <Button full variant="secondary" icon="printer" onClick={() => printOnly(listRef.current, type === 'member' ? data.member.fullName : title)}>
                {type === 'member' ? t('common.print') : t('reports.printAll')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Deposits({ data, act }) {
  const { t } = useTranslation();
  return (
    <Card title={`${t('reports.type.deposits')} — ${t(`m${data.month}`)} ${data.year}`} icon="wallet">
      {data.rows.length === 0 ? <p className="text-muted">{t('label.noRecord')}</p> : (
        <TableWrap min={820}>
          <thead>
            <tr>
              <th>{t('field.memberNo')}</th><th>{t('field.memberName')}</th>
              <th className="r">{t('reports.installment')}</th><th>{t('stmt.status')}</th>
              <th className="r">{t('loans.toPrincipal')}</th><th className="r">{t('loans.toInterest')}</th><th className="r">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.member.id}>
                <td className="num">{r.member.memberNo}</td>
                <td><NameCell member={r.member} act={act} /></td>
                <td className="r">{money(r.installment.paidPaise)}</td>
                <td><StatusBadge status={r.installment.status} /></td>
                <td className="r">{money(r.loanPrincipalPaise)}</td>
                <td className="r">{money(r.loanInterestPaise)}</td>
                <td className="r font-semibold">{money(r.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t('common.total')}</td>
              <td className="r">{money(data.totals.installmentPaidPaise)}</td><td />
              <td className="r">{money(data.totals.loanPrincipalPaise)}</td>
              <td className="r">{money(data.totals.loanInterestPaise)}</td>
              <td className="r">{money(data.totals.totalPaise)}</td>
            </tr>
          </tfoot>
        </TableWrap>
      )}
    </Card>
  );
}

function Pending({ data, act }) {
  const { t } = useTranslation();
  return (
    <Card title={`${t('reports.type.pending')} — ${t('reports.upTo', { month: t(`m${data.month}`), year: data.year })}`} icon="clock">
      {data.rows.length === 0 ? <p className="text-lg font-semibold text-ok">{t('reports.nobodyPending')}</p> : (
        <TableWrap min={740}>
          <thead>
            <tr><th>{t('field.memberNo')}</th><th>{t('field.memberName')}</th><th>{t('field.mobile')}</th><th>{t('reports.pendingMonths')}</th><th className="r">{t('label.pending')}</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.member.id}>
                <td className="num">{r.member.memberNo}</td>
                <td><NameCell member={r.member} act={act} /></td>
                <td className="num">{r.member.mobileNumber}</td>
                <td className="text-sm">{r.months.map((m) => `${t(`m${m.month}`)} ${m.year}`).join(', ')}</td>
                <td className="r font-semibold text-bad">{money(r.pendingPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4}>{t('common.total')} ({data.totals.members})</td><td className="r">{money(data.totals.pendingPaise)}</td></tr></tfoot>
        </TableWrap>
      )}
    </Card>
  );
}

function LoansReport({ data, act }) {
  const { t } = useTranslation();
  return (
    <Card title={`${t('reports.type.loans')} — ${t('reports.upTo', { month: t(`m${data.month}`), year: data.year })}`} icon="handCoins">
      {data.rows.length === 0 ? <p className="text-muted">{t('loans.none')}</p> : (
        <TableWrap min={860}>
          <thead>
            <tr>
              <th>{t('field.memberName')}</th><th>{t('reports.loan')}</th>
              <th className="r">{t('label.loanAmount')}</th><th className="r">{t('label.principalOutstanding')}</th>
              <th className="r">{t('label.interestOutstanding')}</th><th className="r">{t('label.totalOutstanding')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.loanId}>
                <td><NameCell member={r.member} act={act} sub={<div className="num text-sm text-muted">{t('field.memberNo')} {r.member.memberNo}</div>} /></td>
                <td className="text-sm">{t('loan.no', { n: r.loanNo })} · {fmtDate(r.takenOn)}<div className="text-muted">{interestRule(t, r)}</div></td>
                <td className="r">{money(r.principalPaise)}</td>
                <td className="r">{money(r.principalOutstandingPaise)}</td>
                <td className="r">{money(r.interestOutstandingPaise)}</td>
                <td className="r font-semibold text-bad">{money(r.totalOutstandingPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t('common.total')} ({data.totals.loans})</td>
              <td className="r">{money(data.totals.principalPaise)}</td>
              <td className="r">{money(data.totals.principalOutstandingPaise)}</td>
              <td className="r">{money(data.totals.interestOutstandingPaise)}</td>
              <td className="r">{money(data.totals.totalOutstandingPaise)}</td>
            </tr>
          </tfoot>
        </TableWrap>
      )}
    </Card>
  );
}

function MemberReport({ data }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Card title={`${data.member.fullName} — ${t('field.memberNo')} ${data.member.memberNo}`} icon="user">
        <Row label={t('field.mobile')} value={data.member.mobileNumber} />
        <Row label={t('field.joinDate')} value={fmtDate(data.member.joinDate)} />
        <Row label={t('field.monthlyInstallment')} value={money(data.member.monthlyInstallmentPaise)} />
        <Row label={t('reports.totalInstallmentPaid')} value={money(data.totals.installmentPaidPaise)} tone="ok" />
        <Row label={t('label.pending')} value={money(data.totals.installmentPendingPaise)} tone={data.totals.installmentPendingPaise ? 'bad' : 'ok'} />
        {data.loans.length > 0 && (
          <>
            <Row label={t('label.principalOutstanding')} value={money(data.totals.principalOutstandingPaise)} />
            <Row label={t('label.interestOutstanding')} value={money(data.totals.interestOutstandingPaise)} />
            <Row label={t('label.totalOutstanding')} value={money(data.totals.totalOutstandingPaise)} strong tone="bad" />
          </>
        )}
      </Card>
      <Card title={t('history.monthwise')} icon="calendar"><InstallmentMonthsTable months={[...data.months].reverse()} /></Card>
      {data.loans.map((l) => (
        <Card key={l.loanNo} title={`${t('loan.no', { n: l.loanNo })} — ${money(l.position.principalPaise)}`} icon="handCoins">
          <p className="mb-3 text-sm text-muted">{fmtDate(l.position.takenOn)} · {interestRule(t, l.position)}</p>
          <TableWrap min={680}>
            <thead>
              <tr><th>{t('common.month')}</th><th className="r">{t('loans.interestCharged')}</th><th className="r">{t('loans.toPrincipal')}</th><th className="r">{t('loans.toInterest')}</th><th className="r">{t('label.principalOutstanding')}</th><th className="r">{t('label.interestOutstanding')}</th></tr>
            </thead>
            <tbody>
              {l.rows.map((r) => (
                <tr key={`${r.year}-${r.month}`}>
                  <td>{t(`m${r.month}`)} {r.year}</td>
                  <td className="r">{money(r.interestCharged)}</td>
                  <td className="r">{money(r.principalPaid)}</td>
                  <td className="r">{money(r.interestPaid)}</td>
                  <td className="r font-semibold">{money(r.closingPrincipal)}</td>
                  <td className="r font-semibold">{money(r.interestDue)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ))}
    </div>
  );
}

function SheetHeader({ title, sub }) {
  const { t } = useTranslation();
  return (
    <div className="border-b-2 border-maroon/70 pb-3 text-center">
      <div className="font-brand text-2xl text-maroon">{t('app.name')}</div>
      <div className="text-lg font-bold">{title}</div>
      {sub && <div className="text-muted">{sub}</div>}
    </div>
  );
}

/** Download and print buttons shown next to each member's name in a report list. */
function RowActions({ member, act }) {
  const { t } = useTranslation();
  const busy = act.busyId === member.id;
  const cls = 'grid size-9 place-items-center rounded-lg border border-line bg-white text-maroon hover:bg-brand-50 disabled:opacity-50';
  return (
    <span className="no-print inline-flex shrink-0 gap-1.5" data-html2canvas-ignore>
      <button type="button" className={cls} disabled={Boolean(act.busyId)} onClick={() => act.onAct(member, 'pdf')}
        title={t('reports.downloadFor', { name: member.fullName })} aria-label={t('reports.downloadFor', { name: member.fullName })}>
        <Icon name="download" className={`size-4 ${busy ? 'animate-pulse' : ''}`} />
      </button>
      <button type="button" className={cls} disabled={Boolean(act.busyId)} onClick={() => act.onAct(member, 'print')}
        title={t('reports.printFor', { name: member.fullName })} aria-label={t('reports.printFor', { name: member.fullName })}>
        <Icon name="printer" className="size-4" />
      </button>
    </span>
  );
}

function NameCell({ member, act, sub }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold">{member.fullName}</div>
        {sub}
      </div>
      {act && <RowActions member={member} act={act} />}
    </div>
  );
}

/** Loads one member's full account off-screen, then prints it or saves it as a PDF named after the member. */
function MemberSheet({ member, action, month, year, onDone }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const { data, error } = useApi('/reports/member', { month, year, memberId: member.id });
  useEffect(() => {
    if (error) return onDone();
    if (!data) return undefined;
    const name = `${member.fullName} - ${t(`m${month}`)} ${year}`;
    const id = setTimeout(async () => {
      try {
        if (action === 'pdf') await downloadPdf(ref.current, name);
        else printOnly(ref.current, name);
      } finally {
        onDone();
      }
    }, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error]);
  if (!data) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 900 }}>
      <div ref={ref} className="space-y-4 bg-cream p-6">
        <SheetHeader title={t('reports.memberSheet')} sub={t('reports.upTo', { month: t(`m${month}`), year })} />
        <MemberReport data={data} />
      </div>
    </div>
  );
}

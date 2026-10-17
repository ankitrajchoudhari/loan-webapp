'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ErrorBox, Loading, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useApi } from '@/lib/hooks';
import { fmtDate, money } from '@/lib/format';

/** One compact line: label left, value right. */
function Line({ label, value, tone, strong }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className={`flex items-center justify-between gap-3 py-1 ${strong ? 'mt-1 border-t-2 border-dashed border-line pt-2' : ''}`}>
      <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span className={`num text-right font-bold ${strong ? 'text-lg' : ''} ${color}`}>{value}</span>
    </div>
  );
}

function Box({ icon, title, aside, children }) {
  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_3px_rgba(60,30,0,.05)]">
      <h2 className="mb-1.5 flex items-center gap-2 font-bold text-maroon">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-dark"><Icon name={icon} className="size-4.5" /></span>
        <span className="min-w-0 truncate">{title}</span>
        {aside && (typeof aside === 'string'
          ? <span className="ml-auto rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">{aside}</span>
          : <span className="ml-auto shrink-0">{aside}</span>)}
      </h2>
      {children}
    </section>
  );
}

function Bar({ pct, tone = 'ok' }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${tone === 'ok' ? 'bg-ok' : 'bg-brand'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function Tile({ href, icon, label, tone = 'brand' }) {
  const tones = { brand: 'bg-brand-50 text-brand-dark', ok: 'bg-ok-bg text-ok', maroon: 'bg-maroon/10 text-maroon' };
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(60,30,0,.05)] transition hover:border-brand/50 active:scale-[.98]">
      <span className={`grid size-11 place-items-center rounded-xl ${tones[tone]}`}><Icon name={icon} className="size-6" /></span>
      <span className="text-sm font-semibold leading-tight">{label}</span>
    </Link>
  );
}

/** Member home: profile card, this month, loan, loan application, quick links — sized for a phone. */
export default function MemberHome() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/statements/me/home');
  const apps = useApi('/loan-apply/mine');
  const app = apps.data?.applications.find((a) => a.status !== 'cancelled');

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { member, installment: inst, hasLoans, loanTotals, earlierArrears } = data;
  const pending = inst.pendingPaise + earlierArrears.amountPaise;
  const paidPct = inst.duePaise ? Math.round((inst.paidPaise * 100) / inst.duePaise) : 100;
  const loanPct = loanTotals?.principalPaise ? Math.floor((loanTotals.principalPaidPaise * 100) / loanTotals.principalPaise) : 0;
  const credit = data.pay?.creditPaise ?? 0;

  return (
    <div className="space-y-3">
      {/* profile card */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-maroon via-maroon-dark to-[#3f0d16] p-4 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand/25" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 font-brand text-2xl ring-2 ring-white/30">{member.fullName.trim()[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/75">{t('member.namasteShort')}</p>
            <p className="truncate font-brand text-xl leading-tight" title={member.fullName}>{member.fullName}</p>
            <p className="num mt-0.5 text-sm text-white/80">{t('field.memberNo')} {member.memberNo} · +91 {member.mobileNumber}</p>
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <div className="text-white/70">{t('field.monthlyInstallment')}</div>
            <div className="num text-base font-bold">{money(member.monthlyInstallmentPaise)}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <div className="text-white/70">{t('member.memberSince')}</div>
            <div className="num text-base font-bold">{fmtDate(member.joinDate)}</div>
          </div>
        </div>
        <div className={`relative mt-2 flex items-center gap-2 rounded-xl px-3 py-2 font-bold ${pending > 0 ? 'bg-white text-bad' : 'bg-ok text-white'}`}>
          <Icon name={pending > 0 ? 'alert' : 'checkCircle'} className="size-5 shrink-0" />
          <span className="flex-1">{pending > 0 ? t('member.dueNow', { amount: money(pending) }) : t('member.allPaid')}</span>
          {credit > 0 && <span className="num rounded-full bg-ok-bg px-2 py-0.5 text-xs text-ok">{t('member.advance', { amount: money(credit) })}</span>}
        </div>
      </section>

      {/* this month */}
      <Box icon="calendar" title={t('member.monthInstallment', { month: t(`m${data.month}`), year: data.year })} aside={<StatusBadge status={inst.status} />}>
        <div className="mb-2 mt-1 flex items-baseline justify-between gap-2">
          <span className="num text-2xl font-bold">{money(inst.paidPaise)}</span>
          <span className="num text-sm text-muted">/ {money(inst.duePaise)}</span>
        </div>
        <Bar pct={paidPct} />
        {pending > 0 && <Line label={t('label.pending')} value={money(pending)} tone="bad" />}
        {data.pay?.payablePaise > 0 && (
          <Link href="/member/pay" className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 py-3 text-lg font-bold text-white shadow hover:brightness-95 active:scale-[.99]">
            <Icon name="wallet" className="size-5" />{t('pay.payNow', { amount: money(data.pay.payablePaise + (data.pay.feePaise ?? 0)) })}
          </Link>
        )}
        {data.pay?.payablePaise > 0 && data.pay.feePaise > 0 && (
          <p className="mt-1 text-center text-xs text-muted">{t('pay.feeNote', { dues: money(data.pay.payablePaise), fee: money(data.pay.feePaise) })}</p>
        )}
      </Box>

      {/* loan */}
      {hasLoans ? (
        <Box icon="handCoins" title={t('stmt.loanTitle')}
          aside={data.loanStatus?.payoff && !data.loanStatus.overduePaise ? t('member.loanEnds', { month: t(`m${data.loanStatus.payoff.month}`), year: data.loanStatus.payoff.year }) : null}>
          <div className="mb-1 mt-1 flex items-baseline justify-between text-sm">
            <span className="text-muted">{t('member.loanRepaid', { pct: loanPct })}</span>
            <span className="num text-muted">{money(loanTotals.principalPaidPaise)} / {money(loanTotals.principalPaise)}</span>
          </div>
          <Bar pct={loanPct} tone="brand" />
          <Line label={t('member.loanLeft')} value={money(loanTotals.principalOutstandingPaise)} tone="warn" />
          <Line label={t('member.interestLeft')} value={money(Math.max(0, loanTotals.interestOutstandingPaise))} tone="warn" />
          <Line label={t('label.totalOutstanding')} value={money(loanTotals.totalOutstandingPaise)} tone="bad" strong />
          {data.loanStatus?.overduePaise > 0 && (
            <p className="mt-1 rounded-lg bg-bad-bg px-2 py-1 text-sm font-semibold text-bad">{t('member.loanOverdue', { amount: money(data.loanStatus.overduePaise), n: data.loanStatus.monthsBehind })}</p>
          )}
        </Box>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-ok-bg px-4 py-3 text-center font-semibold text-ok"><Icon name="checkCircle" className="size-5" />{t('member.noLoan')}</p>
      )}

      {/* loan application */}
      {app && app.status !== 'rejected' ? (
        <Link href="/member/loan" className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 hover:shadow-md ${app.status === 'approved' ? 'border-ok/30 bg-ok-bg text-ok' : 'border-warn/30 bg-warn-bg text-warn'}`}>
          <Icon name={app.status === 'approved' ? 'checkCircle' : 'clock'} className="size-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{t(app.status === 'approved' ? 'apply.homeApproved' : 'apply.homePending', { amount: money(app.amountPaise) })}</span>
            <span className="block text-sm">{t('apply.homeSee')}</span>
          </span>
          <Icon name="chevronRight" className="size-5 shrink-0" />
        </Link>
      ) : (
        <Link href="/member/loan" className="flex items-center gap-3 rounded-2xl border-2 border-brand/40 bg-white px-4 py-3 text-maroon shadow-sm hover:bg-brand-50">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white"><Icon name="handCoins" className="size-6" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold leading-tight">{t('apply.homeButton')}</span>
            <span className="block text-sm text-muted">{app?.status === 'rejected' ? t('apply.homeRejected') : t('apply.homeButtonSub')}</span>
          </span>
          <Icon name="chevronRight" className="size-5 shrink-0" />
        </Link>
      )}

      {/* quick links */}
      <div className="grid grid-cols-3 gap-2">
        <Tile href="/member/month" icon="file" label={t('member.tileStatement')} tone="maroon" />
        <Tile href="/member/history" icon="history" label={t('member.tileRecords')} />
        <Tile href="/member/pay" icon="receipt" label={t('member.tileReceipts')} tone="ok" />
      </div>
    </div>
  );
}

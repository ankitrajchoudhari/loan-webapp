'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ButtonLink, ErrorBox, Loading, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useApi } from '@/lib/hooks';
import { money } from '@/lib/format';

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
    <section className="rounded-2xl border border-line bg-white px-4 py-2.5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-maroon">
        <Icon name={icon} className="size-5 shrink-0 text-brand-dark" />
        <span className="min-w-0 truncate">{title}</span>
        {aside && (typeof aside === 'string'
          ? <span className="ml-auto rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">{aside}</span>
          : <span className="ml-auto shrink-0">{aside}</span>)}
      </h2>
      {children}
    </section>
  );
}

/** Member home (spec §3A): seven essentials and two buttons — fits one phone screen. */
export default function MemberHome() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/statements/me/home');
  const apps = useApi('/loan-apply/mine');
  const app = apps.data?.applications.find((a) => a.status !== 'cancelled');

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { member, installment: inst, hasLoans, loanTotals, earlierArrears } = data;

  return (
    <div className="space-y-3">
      {/* passbook-style header */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-br from-maroon via-maroon-dark to-[#3f0d16] px-4 py-2.5 text-white shadow-md">
        <p className="min-w-0 truncate font-brand text-lg leading-tight sm:text-xl" title={`${t('field.memberName')}: ${member.fullName}`}>{t('member.namaste', { name: member.fullName })}</p>
        <span className="num shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-sm font-bold">{t('field.memberNo')} {member.memberNo}</span>
      </div>

      <Box icon="calendar" title={t('member.monthInstallment', { month: t(`m${data.month}`), year: data.year })}>
        <Line label={t('field.monthlyInstallment')} value={money(inst.duePaise)} />
        <Line label={t('member.paidThisMonth')} value={money(inst.paidPaise)} tone={inst.paidPaise ? 'ok' : undefined} />
        <Line label={t('member.statusThisMonth')} value={<StatusBadge status={inst.status} />} />
        {inst.pendingPaise + earlierArrears.amountPaise > 0 && (
          <Line label={t('label.pending')} value={money(inst.pendingPaise + earlierArrears.amountPaise)} tone="bad" />
        )}
        {data.pay?.payablePaise > 0 && (
          <Link href="/member/pay" className="mb-1.5 mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-ok px-4 py-3 text-lg font-bold text-white shadow hover:brightness-95">
            <Icon name="wallet" className="size-5" />{t('pay.payNow', { amount: money(data.pay.payablePaise) })}
          </Link>
        )}
      </Box>

      {hasLoans ? (
        <Box icon="handCoins" title={t('stmt.loanTitle')}
          aside={data.loanStatus?.payoff && !data.loanStatus.overduePaise ? t('member.loanEnds', { month: t(`m${data.loanStatus.payoff.month}`), year: data.loanStatus.payoff.year }) : null}>
          <Line label={t('member.loanLeft')} value={money(loanTotals.principalOutstandingPaise)} tone="warn" />
          <Line label={t('member.interestLeft')} value={money(Math.max(0, loanTotals.interestOutstandingPaise))} tone="warn" />
          <Line label={t('label.totalOutstanding')} value={money(loanTotals.totalOutstandingPaise)} tone="bad" strong />
          {data.loanStatus?.overduePaise > 0 && (
            <p className="mt-1 rounded-lg bg-bad-bg px-2 py-1 text-sm font-semibold text-bad">{t('member.loanOverdue', { amount: money(data.loanStatus.overduePaise), n: data.loanStatus.monthsBehind })}</p>
          )}
        </Box>
      ) : (
        <p className="rounded-2xl bg-ok-bg px-4 py-3 text-center font-semibold text-ok">{t('member.noLoan')}</p>
      )}

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

      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/member/month" size="md" full className="py-1.5 text-center leading-snug">{t('member.viewMonth')}</ButtonLink>
        <ButtonLink href="/member/history" size="md" full variant="secondary" className="py-1.5 text-center leading-snug">{t('member.viewOld')}</ButtonLink>
      </div>
    </div>
  );
}

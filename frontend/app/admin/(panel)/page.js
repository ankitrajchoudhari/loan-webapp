'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ButtonLink, ErrorBox, Loading, Progress, Stat } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useApi } from '@/lib/hooks';
import { getWho } from '@/lib/api';
import { allowed } from '@/components/shell';
import { money } from '@/lib/format';

/** Admin home: samiti money position at a glance, alerts, the six spec figures, quick actions. */
export default function AdminHome() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/dashboard');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const month = `${t(`m${data.month}`)} ${data.year}`;
  const user = getWho()?.user;
  const paidPct = data.dueThisMonth ? Math.round((data.paidThisMonth / data.dueThisMonth) * 100) : 0;
  const quick = [
    ['/admin/installments', 'calendarCheck', 'dash.addInstallment', 'installments'],
    ['/admin/loans', 'receipt', 'dash.addRepayment', 'loans'],
    ['/admin/members/new', 'userPlus', 'members.add', 'members'],
    ['/admin/loans/calculator', 'calculator', 'calc.title', 'loans'],
    ['/admin/reports', 'chart', 'nav.reports', 'reports'],
  ].filter(([, , , need]) => allowed(user, need));

  return (
    <div className="space-y-5">
      {/* hero: the samiti's money today */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-maroon via-maroon-dark to-[#3f0d16] p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/75">{t('dash.hello', { name: user?.name ?? '' })} · {t('dash.asOf', { month })}</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-wide text-brand-100">{t('dash.cashInHand')}</div>
            <div className="num text-4xl font-extrabold sm:text-5xl">{money(data.cashInHandPaise)}</div>
            <div className="mt-1 text-sm text-white/75">{t('dash.cashFormula')}</div>
          </div>
          <div className="grid min-w-56 grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-white/70">{t('dash.totalCollected')}</div>
              <div className="num text-lg font-bold">{money(data.totalInstallmentsPaise)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-white/70">{t('dash.interestEarned')}</div>
              <div className="num text-lg font-bold text-brand-100">{money(data.interestEarnedPaise)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-white/70">{t('dash.loansGiven')}</div>
              <div className="num text-lg font-bold">{money(data.loansGivenPaise)}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="text-white/70">{t('dash.principalBack')}</div>
              <div className="num text-lg font-bold">{money(data.principalReturnedPaise)}</div>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <Progress tone="light" value={paidPct} label={t('dash.paidCount', { paid: data.paidThisMonth, due: data.dueThisMonth })} />
        </div>
      </section>

      {/* alerts */}
      {data.loanApplicationsPending > 0 && (
        <Link href="/admin/loan-applications" className="flex items-center gap-3 rounded-2xl border-2 border-brand/40 bg-brand-50 p-4 text-maroon shadow-sm hover:shadow-md">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
            <Icon name="handCoins" className="size-6" />
            <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-bad text-xs font-bold text-white">{data.loanApplicationsPending}</span>
          </span>
          <span className="flex-1">
            <span className="block text-lg font-bold">{t('dash.alertLoanApps', { n: data.loanApplicationsPending })}</span>
            <span className="block text-sm text-muted">{t('dash.alertLoanAppsSub')}</span>
          </span>
          <Icon name="chevronRight" className="size-5" />
        </Link>
      )}
      {(data.overdueLoans > 0 || data.arrearsMembers > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.arrearsMembers > 0 && (
            <Link href="/admin/reports?type=pending" className="flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad-bg p-4 text-bad hover:shadow-md">
              <Icon name="clock" className="size-6 shrink-0" />
              <span className="flex-1 font-semibold">{t('dash.alertDues', { n: data.arrearsMembers, amount: money(data.installmentArrearsPaise) })}</span>
              <Icon name="chevronRight" className="size-5" />
            </Link>
          )}
          {data.overdueLoans > 0 && (
            <Link href="/admin/loans" className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-bg p-4 text-warn hover:shadow-md">
              <Icon name="alert" className="size-6 shrink-0" />
              <span className="flex-1 font-semibold">{t('dash.alertOverdue', { n: data.overdueLoans, amount: money(data.overduePaise) })}</span>
              <Icon name="chevronRight" className="size-5" />
            </Link>
          )}
        </div>
      )}

      {/* spec §4.1 figures */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={t('dash.totalMembers')} value={data.totalMembers} icon="users" tone="brand" href="/admin/members"
          sub={data.inactiveMembers ? t('dash.inactive', { n: data.inactiveMembers }) : null} />
        <Stat label={t('dash.installmentThisMonth')} value={money(data.installmentThisMonthPaise)} tone="ok" icon="wallet" href="/admin/installments" />
        <Stat label={t('dash.loanThisMonth')} value={money(data.loanCollectedThisMonthPaise)} tone="ok" icon="receipt" href="/admin/loans" />
        <Stat label={t('dash.installmentArrears')} value={money(data.installmentArrearsPaise)} tone={data.installmentArrearsPaise ? 'bad' : 'ok'} icon="clock" href="/admin/reports?type=pending"
          sub={data.arrearsMembers ? t('dash.arrearsMembers', { n: data.arrearsMembers }) : null} />
        <Stat label={t('dash.principalOutstanding')} value={money(data.principalOutstandingPaise)} tone="warn" icon="handCoins" href="/admin/reports?type=loans"
          sub={t('dash.activeLoans', { n: data.activeLoans })} />
        <Stat label={t('dash.interestOutstanding')} value={money(data.interestOutstandingPaise)} tone="warn" icon="calculator" href="/admin/reports?type=loans" />
      </div>

      {quick.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-maroon">{t('dash.quick')}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {quick.map(([href, icon, label], i) => (
              <ButtonLink key={href} href={href} icon={icon} size="md" variant={i ? 'secondary' : 'primary'} full>{t(label)}</ButtonLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

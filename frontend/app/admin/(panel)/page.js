'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ErrorBox, Loading, Stat } from '@/components/ui';
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
      {/* the samiti's money today */}
      <section className="hero-card overflow-hidden rounded-[1.6rem] text-white">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <div className="text-sm text-white/65">{t('dash.hello', { name: user?.name ?? '' })} · {t('dash.asOf', { month })}</div>
            <div className="eyebrow mt-4 text-gold">{t('dash.cashInHand')}</div>
            <div className="num mt-1 text-[2.6rem] font-extrabold leading-none tracking-tight sm:text-5xl">{money(data.cashInHandPaise)}</div>
            <div className="mt-2 text-xs text-white/55">{t('dash.cashFormula')}</div>
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white/[.06] ring-1 ring-white/10">
            {[
              [t('dash.totalCollected'), data.totalInstallmentsPaise],
              [t('dash.interestEarned'), data.interestEarnedPaise, true],
              [t('dash.loansGiven'), data.loansGivenPaise],
              [t('dash.principalBack'), data.principalReturnedPaise],
            ].map(([label, v, gold], i) => (
              <div key={label} className={`p-3.5 ${i % 2 ? 'border-l border-white/10' : ''} ${i > 1 ? 'border-t border-white/10' : ''}`}>
                <div className="text-xs text-white/60">{label}</div>
                <div className={`num mt-0.5 text-lg font-bold ${gold ? 'text-gold' : ''}`}>{money(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/10 px-5 py-3.5 sm:px-6">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-white/75">{t('dash.paidCount', { paid: data.paidThisMonth, due: data.dueThisMonth })}</span>
            <span className="num font-bold">{paidPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold" style={{ width: `${paidPct}%` }} /></div>
        </div>
      </section>

      {/* things that need attention */}
      {(data.loanApplicationsPending > 0 || data.arrearsMembers > 0 || data.overdueLoans > 0) && (
        <section className="surface divide-y divide-line overflow-hidden">
          {[
            data.loanApplicationsPending > 0 && ['/admin/loan-applications', 'send', 'bg-brand', t('dash.alertLoanApps', { n: data.loanApplicationsPending }), t('dash.alertLoanAppsSub')],
            data.arrearsMembers > 0 && ['/admin/reports?type=pending', 'clock', 'bg-bad', t('dash.alertDues', { n: data.arrearsMembers, amount: money(data.installmentArrearsPaise) }), null],
            data.overdueLoans > 0 && ['/admin/loans', 'alert', 'bg-warn', t('dash.alertOverdue', { n: data.overdueLoans, amount: money(data.overduePaise) }), null],
          ].filter(Boolean).map(([href, icon, dot, title, sub]) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-paper/60">
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-white ${dot}`}><Icon name={icon} className="size-[1.1rem]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{title}</span>
                {sub && <span className="block text-xs text-muted">{sub}</span>}
              </span>
              <Icon name="chevronRight" className="size-4 text-muted" />
            </Link>
          ))}
        </section>
      )}

      {/* spec §4.1 figures */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
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
          <h2 className="eyebrow mb-2.5 px-1 text-muted">{t('dash.quick')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {quick.map(([href, icon, label], i) => (
              <Link key={href} href={href} className="surface group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5">
                <span className={`grid size-10 place-items-center rounded-xl ${i ? 'bg-paper text-maroon' : 'bg-maroon text-gold'}`}><Icon name={icon} className="size-5" /></span>
                <span className="flex items-center justify-between gap-2 text-sm font-semibold leading-tight">{t(label)}<Icon name="chevronRight" className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

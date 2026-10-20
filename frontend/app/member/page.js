'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ButtonLink, ErrorBox, Loading } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useApi } from '@/lib/hooks';
import { fmtDate, money } from '@/lib/format';

/** Thin progress ring: how much of the loan principal is repaid. */
function Ring({ pct, size = 76 }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 76 76" width={size} height={size} className="shrink-0" aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-paper)" strokeWidth="7" />
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform="rotate(-90 38 38)" />
      <text x="38" y="42" textAnchor="middle" className="num" fontSize="15" fontWeight="700" fill="var(--color-ink)">{pct}%</text>
    </svg>
  );
}

/** This month at a glance: one tile per obligation (installment, loan EMI). */
function MonthTile({ icon, label, paid, amount, sub, statusPaid, statusDue }) {
  return (
    <div className="surface flex flex-col gap-2 p-3.5">
      <div className="flex items-center justify-between">
        <span className="grid size-8 place-items-center rounded-xl bg-paper text-maroon"><Icon name={icon} className="size-4.5" /></span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${paid ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
          <Icon name={paid ? 'check' : 'clock'} className="size-3.5" strokeWidth={2.5} />{paid ? statusPaid : statusDue}
        </span>
      </div>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className={`num text-lg font-bold leading-tight ${paid ? 'text-ink' : 'text-bad'}`}>{amount}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/** Member home: balance card, this month, the loan, membership — calm and clear on a phone. */
export default function MemberHome() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/statements/me/home');
  const apps = useApi('/loan-apply/mine');
  const app = apps.data?.applications.find((a) => a.status !== 'cancelled');

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { member, installment: inst, hasLoans, loanTotals, earlierArrears } = data;
  const pending = inst.pendingPaise + earlierArrears.amountPaise;
  const owed = data.pay?.payablePaise ?? pending;
  const fee = data.pay?.feePaise ?? 0;
  const credit = data.pay?.creditPaise ?? 0;
  const running = data.runningLoans ?? loanTotals;
  const hasRunning = (data.runningLoanCount ?? (hasLoans ? 1 : 0)) > 0 && running.totalOutstandingPaise > 0;
  const loanPct = running?.principalPaise ? Math.floor((running.principalPaidPaise * 100) / running.principalPaise) : 0;
  const emiDue = data.loanStatus?.dueNowPaise ?? 0;
  const payoff = data.loanStatus?.payoff;
  const first = member.fullName.trim().split(/\s+/)[0];

  return (
    <div className="space-y-5 pb-4">
      {/* balance card */}
      <section className="hero-card relative overflow-hidden rounded-[1.6rem] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-base font-bold text-[#4a1019]">{first[0]?.toUpperCase()}</span>
            <div className="min-w-0 leading-tight">
              <div className="text-xs text-white/65">{t('member.namasteShort')}</div>
              <div className="truncate font-semibold">{member.fullName}</div>
            </div>
          </div>
          <span className="num shrink-0 text-xs font-semibold text-white/70">{t('field.memberNo')} {member.memberNo}</span>
        </div>

        <div className="mt-6">
          <div className="eyebrow text-gold">{owed > 0 ? t('home.dueNow') : t('home.status')}</div>
          {owed > 0 ? (
            <div className="num mt-1 text-[2.6rem] font-extrabold leading-none tracking-tight">{money(owed)}</div>
          ) : (
            <div className="mt-1 text-[1.75rem] font-extrabold leading-tight">{t('home.allClear')}</div>
          )}
          <div className="mt-2 text-sm text-white/70">
            {hasRunning ? t('home.loanLeftLine', { amount: money(running.totalOutstandingPaise) }) : owed > 0 ? t('home.payToStay') : t('home.thanks')}
          </div>
        </div>

        <div className="mt-5">
          {owed > 0 ? (
            <ButtonLink href="/member/pay" variant="success" size="md" icon="wallet" full>{t('home.payNow', { amount: money(owed + fee) })}</ButtonLink>
          ) : (
            <ButtonLink href={hasRunning ? '/member/pay?loan=ahead' : '/member/pay'} variant="secondary" size="md" icon="wallet" full className="border-transparent">
              {hasRunning ? t('home.payAhead') : t('home.openPay')}
            </ButtonLink>
          )}
        </div>
        {credit > 0 && <div className="mt-3 text-xs text-gold">{t('member.advance', { amount: money(credit) })}</div>}
      </section>

      {/* this month */}
      <section>
        <h2 className="eyebrow mb-2 px-1 text-muted">{t('home.thisMonth', { month: t(`m${data.month}`), year: data.year })}</h2>
        <div className={`grid gap-3 ${hasRunning ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <MonthTile icon="calendar" label={t('home.installment')} paid={pending === 0} statusPaid={t('home.paidShort')} statusDue={t('home.due')}
            amount={pending === 0 ? money(inst.paidPaise || inst.duePaise) : money(pending)}
            sub={pending === 0 ? t('home.thisMonthPaid') : earlierArrears.months > 0 ? t('home.monthsDue', { n: earlierArrears.months + (inst.pendingPaise > 0 ? 1 : 0) }) : t('home.due')} />
          {hasRunning && (
            <MonthTile icon="handCoins" label={t('home.emi')} paid={emiDue === 0} statusPaid={t('home.paidShort')} statusDue={t('home.due')}
              amount={emiDue === 0 ? t('home.emiCovered') : money(emiDue)}
              sub={emiDue === 0 ? t('home.paid') : data.loanStatus?.monthsBehind > 1 ? t('home.emisBehind', { n: data.loanStatus.monthsBehind }) : t('home.due')} />
          )}
        </div>
        {earlierArrears.months > 0 && (
          <p className="mt-2 px-1 text-xs text-bad">
            {t('home.earlier', { list: (earlierArrears.list ?? []).slice(0, 3).map((m) => `${t(`m${m.month}`)} ${m.year}`).join(', ') + ((earlierArrears.list?.length ?? 0) > 3 ? '…' : '') })}
          </p>
        )}
      </section>

      {/* loan */}
      {hasRunning ? (
        <section className="surface overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            <Ring pct={loanPct} />
            <div className="min-w-0 flex-1">
              <div className="eyebrow text-muted">{t('home.loan')}</div>
              <div className="num mt-0.5 text-2xl font-extrabold leading-tight">{money(running.totalOutstandingPaise)}</div>
              <div className="num text-xs text-muted">{t('home.ofTotal', { paid: money(running.principalPaidPaise), total: money(running.principalPaise) })}</div>
              {payoff && <div className="mt-1 text-xs font-semibold text-brand-dark">{t('home.endsIn', { month: t(`m${payoff.month}`), year: payoff.year })}</div>}
            </div>
          </div>
          {(data.loanList ?? []).filter((x) => !x.closed && x.topupFromLoanNo).map((x) => (
            <div key={x.loanNo} className="mx-4 mb-3 rounded-xl bg-brand-50/70 px-3 py-2 text-xs text-brand-dark">
              {t('home.topupLine', { n: x.loanNo, carried: money(x.carriedPrincipalPaise), from: x.topupFromLoanNo, extra: money(x.newMoneyPaise), total: money(x.principalPaise) })}
            </div>
          ))}
          <Link href="/member/loans" className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-paper/70 px-3 py-2 text-sm font-semibold text-maroon">
            {t('home.allLoans', { n: (data.loanList ?? []).length })}<Icon name="chevronRight" className="size-4" />
          </Link>
          {data.loanStatus?.overduePaise > 0 && (
            <div className="mx-4 mb-3 rounded-xl bg-bad-bg px-3 py-2 text-xs font-semibold text-bad">{t('member.loanOverdue', { amount: money(data.loanStatus.overduePaise), n: data.loanStatus.monthsBehind })}</div>
          )}
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center text-sm font-semibold">
            <Link href="/member/pay?loan=emi" className={`flex flex-col items-center gap-1 py-3 ${emiDue > 0 ? 'text-ok' : 'text-maroon'}`}><Icon name="wallet" className="size-5" />{t('home.actEmi')}</Link>
            <Link href="/member/pay?loan=ahead" className="flex flex-col items-center gap-1 py-3 text-maroon"><Icon name="clock" className="size-5" />{t('home.actAhead')}</Link>
            <Link href="/member/pay?loan=settle" className="flex flex-col items-center gap-1 py-3 text-maroon"><Icon name="checkCircle" className="size-5" />{t('home.actSettle')}</Link>
          </div>
        </section>
      ) : (
        <section className="surface flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-ok-bg text-ok"><Icon name="checkCircle" className="size-5" /></span>
          <div className="text-sm font-semibold">{hasLoans ? t('member.loansRepaid') : t('member.noLoan')}</div>
        </section>
      )}

      {/* loan application in progress */}
      {app && app.status !== 'rejected' && (
        <Link href="/member/loan" className="surface flex items-center gap-3 p-4">
          <span className={`grid size-10 place-items-center rounded-xl ${app.status === 'approved' ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}><Icon name={app.status === 'approved' ? 'checkCircle' : 'clock'} className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t(app.status === 'approved' ? 'apply.homeApproved' : 'apply.homePending', { amount: money(app.amountPaise) })}</span>
            <span className="block text-xs text-muted">{t('apply.homeSee')}</span>
          </span>
          <Icon name="chevronRight" className="size-5 text-muted" />
        </Link>
      )}

      {/* membership + shortcuts */}
      <section className="surface divide-y divide-line">
        <div className="grid grid-cols-2 divide-x divide-line">
          <div className="p-4"><div className="text-xs text-muted">{t('field.monthlyInstallment')}</div><div className="num font-bold">{money(member.monthlyInstallmentPaise)}</div></div>
          <div className="p-4"><div className="text-xs text-muted">{t('member.memberSince')}</div><div className="num font-bold">{fmtDate(member.joinDate)}</div></div>
        </div>
        {[
          ['/member/month', 'file', t('member.tileStatement')],
          ['/member/history', 'history', t('member.tileRecords')],
          ['/member/pay', 'receipt', t('member.tileReceipts')],
          ...(!(app && app.status !== 'rejected') ? [['/member/loan', 'handCoins', t('apply.homeButton')]] : []),
        ].map(([href, icon, label]) => (
          <Link key={href + label} href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-paper/60">
            <Icon name={icon} className="size-5 text-maroon" />
            <span className="flex-1 text-sm font-semibold">{label}</span>
            <Icon name="chevronRight" className="size-4 text-muted" />
          </Link>
        ))}
      </section>
    </div>
  );
}

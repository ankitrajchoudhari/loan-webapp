'use client';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ErrorBox, Loading } from '@/components/ui';
import { Icon } from '@/components/icons';
import { interestRule } from '@/components/statement';
import { useApi } from '@/lib/hooks';
import { fmtDate, money } from '@/lib/format';

/**
 * My loans: every loan, newest first, with its full story — a top-up shows the balance carried from
 * the old loan + the new money; a closed loan shows how it closed (fully repaid, or moved into a top-up).
 */
export default function MyLoans() {
  const { t } = useTranslation();
  const { data, error, reload } = useApi('/statements/me/home');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const loans = data.loanList ?? [];
  const running = loans.filter((l) => !l.closed);
  const left = running.reduce((s, l) => s + l.totalOutstandingPaise, 0);

  return (
    <div className="space-y-5 pb-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight">{t('myLoans.title')}</h1>

      <section className="hero-card rounded-[1.6rem] p-5 text-white">
        <div className="eyebrow text-gold">{running.length ? t('myLoans.leftNow') : t('myLoans.noneRunning')}</div>
        <div className="num mt-1 text-[2.3rem] font-extrabold leading-none">{money(left)}</div>
        <div className="mt-2 text-sm text-white/70">{t('myLoans.counts', { running: running.length, closed: loans.length - running.length })}</div>
        {running.length > 0 && (
          <Link href="/member/pay?loan=emi" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white font-semibold text-maroon">
            <Icon name="wallet" className="size-5" />{t('myLoans.payBtn')}
          </Link>
        )}
      </section>

      {loans.length === 0 && <p className="surface p-5 text-center text-muted">{t('member.noLoan')}</p>}

      <ol className="space-y-4">
        {loans.map((l, i) => {
          const pct = l.principalPaise ? Math.floor((Math.min(l.principalPaise, l.principalPaise - l.principalOutstandingPaise) * 100) / l.principalPaise) : 0;
          const next = loans[i + 1];
          const linked = next && next.closedHow === 'topup' && next.movedToLoanNo === l.loanNo;
          return (
            <li key={l.loanNo} className="relative">
              {linked && <span className="absolute -bottom-4 left-9 h-4 w-0.5 bg-brand/50" aria-hidden />}
              <article className={`surface overflow-hidden ${l.closed ? 'opacity-[.92]' : ''}`}>
                <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${l.closed ? 'bg-paper text-muted' : 'bg-maroon text-gold'}`}>#{l.loanNo}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{t('myLoans.loanTitle', { n: l.loanNo })}</div>
                    <div className="text-xs text-muted">{t('myLoans.givenOn', { date: fmtDate(l.takenOn) })}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${l.closed ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}>
                    {l.closed ? t('myLoans.closed') : t('myLoans.running')}
                  </span>
                </header>

                <div className="space-y-3 p-4">
                  {/* how the amount was made */}
                  {l.topupFromLoanNo ? (
                    <div className="rounded-xl border border-brand/30 bg-brand-50/60 p-3 text-sm">
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-dark">{t('myLoans.topupTitle')}</div>
                      <div className="flex justify-between"><span>{t('myLoans.carried', { n: l.topupFromLoanNo })}</span><b className="num">{money(l.carriedPrincipalPaise)}</b></div>
                      <div className="flex justify-between"><span>{t('myLoans.newMoney')}</span><b className="num">+ {money(l.newMoneyPaise)}</b></div>
                      <div className="mt-1 flex justify-between border-t border-brand/30 pt-1 font-bold"><span>{t('myLoans.loanAmount')}</span><span className="num">{money(l.principalPaise)}</span></div>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between text-sm"><span className="text-muted">{t('myLoans.loanAmount')}</span><b className="num text-lg">{money(l.principalPaise)}</b></div>
                  )}

                  <div className="text-xs text-muted">{interestRule(t, l)}{l.installmentPaise ? ` · ${t('pay.emiIs', { amount: money(l.installmentPaise) })}` : ''}</div>

                  {/* paid so far */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-paper/70 p-2.5"><div className="text-xs text-muted">{t('myLoans.principalPaid')}</div><div className="num font-bold">{money(l.principalPaidPaise)}</div></div>
                    <div className="rounded-xl bg-paper/70 p-2.5"><div className="text-xs text-muted">{t('myLoans.interestPaid')}</div><div className="num font-bold">{money(l.interestPaidPaise)}</div></div>
                  </div>

                  {!l.closed ? (
                    <>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted"><span>{t('pay.repaidPct', { pct })}</span>{l.payoff && <span>{t('home.endsIn', { month: t(`m${l.payoff.month}`), year: l.payoff.year })}</span>}</div>
                        <div className="h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="flex items-baseline justify-between rounded-xl border-2 border-maroon/20 px-3 py-2">
                        <span className="text-sm font-semibold">{t('myLoans.leftToPay')}</span>
                        <span className="num text-xl font-extrabold text-maroon">{money(l.totalOutstandingPaise)}</span>
                      </div>
                      {l.interestOutstandingPaise > 0 && <div className="-mt-1 text-right text-xs text-muted">{t('myLoans.leftSplit', { principal: money(l.principalOutstandingPaise), interest: money(l.interestOutstandingPaise) })}</div>}
                    </>
                  ) : (
                    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${l.closedHow === 'topup' ? 'bg-brand-50 text-brand-dark' : 'bg-ok-bg text-ok'}`}>
                      <Icon name={l.closedHow === 'topup' ? 'send' : 'checkCircle'} className="mt-0.5 size-4.5 shrink-0" />
                      <span>{l.closedHow === 'topup'
                        ? t('myLoans.closedTopup', { date: fmtDate(l.closedOn), amount: money(l.movedPaise), n: l.movedToLoanNo })
                        : t('myLoans.closedRepaid', { date: fmtDate(l.closedOn) })}</span>
                    </div>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      <Link href="/member/loan" className="surface flex items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-paper text-maroon"><Icon name="plus" className="size-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">{t('apply.homeButton')}</span><span className="block text-xs text-muted">{t('myLoans.applyHint')}</span></span>
        <Icon name="chevronRight" className="size-4 text-muted" />
      </Link>
    </div>
  );
}

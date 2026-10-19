'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonLink, Empty, ErrorBox, Loading, PageTitle, Segmented, Card, Row, Progress } from '@/components/ui';
import { LoanStatus } from '@/components/LoanBits';
import { Icon } from '@/components/icons';
import { interestRule } from '@/components/statement';
import { useApi } from '@/lib/hooks';
import { fmtDate, money } from '@/lib/format';

/** Spec §4.4 — every loan with its separate principal and interest balances. */
export default function Loans() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('active');
  const { data, error, loading, reload } = useApi('/loans', { status: status === 'all' ? '' : status });
  const loans = data?.loans ?? [];
  const sum = (k) => loans.reduce((s, l) => s + l.position[k], 0);

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.loans')} subtitle={t('loans.subtitle')} action={
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/loans/calculator" icon="calculator" size="md" variant="secondary">{t('calc.title')}</ButtonLink>
          <ButtonLink href="/admin/loans/new" icon="plus" size="md">{t('loans.add')}</ButtonLink>
        </div>
      } />
      <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: t('loan.running') }, { value: 'closed', label: t('loan.closed') }, { value: 'all', label: t('common.all') }]} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : loans.length === 0 ? (
        <Empty icon="handCoins">{t('loans.none')}</Empty>
      ) : (
        <>
          <Card>
            <Row label={t('label.principalOutstanding')} value={money(sum('principalOutstandingPaise'))} tone="warn" />
            <Row label={t('label.interestOutstanding')} value={money(sum('interestOutstandingPaise'))} tone="warn" />
            <Row label={t('label.totalOutstanding')} value={money(sum('totalOutstandingPaise'))} strong tone="bad" />
          </Card>
          <p className="text-muted">{t('loans.tapToRepay')}</p>
          <ul className="space-y-2">
            {loans.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/loans/${l.id}`} className="block surface p-4 transition hover:-translate-y-0.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                        {l.member.fullName}
                        <span className="num text-base font-normal text-muted">({t('field.memberNo')} {l.member.memberNo})</span>
                        <LoanStatus ins={l.insights} />
                      </div>
                      <div className="text-sm text-muted">{t('loan.no', { n: l.loanNo })} · {fmtDate(l.takenOn)} · {money(l.principalPaise)} · {interestRule(t, l)}</div>
                    </div>
                    <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
                  </div>
                  <div className="mt-3">
                    <Progress value={l.insights.repaidPercent} tone={l.insights.status === 'overdue' ? 'warn' : 'ok'} label={t('loanx.repaid')} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><div className="text-muted">{t('loans.principalLeftShort')}</div><div className="num font-bold">{money(l.position.principalOutstandingPaise)}</div></div>
                    <div><div className="text-muted">{t('loans.interestLeftShort')}</div><div className="num font-bold">{money(l.position.interestOutstandingPaise)}</div></div>
                    <div><div className="text-muted">{t('loans.totalLeftShort')}</div><div className="num font-bold text-bad">{money(l.position.totalOutstandingPaise)}</div></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

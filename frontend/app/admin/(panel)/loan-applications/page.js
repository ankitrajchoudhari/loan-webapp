'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Empty, ErrorBox, Loading, PageTitle, Segmented } from '@/components/ui';
import { Icon } from '@/components/icons';
import { APP_TONE, DOC_KINDS } from '@/components/LoanApplication';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, money } from '@/lib/format';

/** Loan applications from members, newest first; pending ones need a decision. */
export default function LoanApplications() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('pending');
  const { data, error, loading, reload } = useApi('/loan-apply', { status: tab === 'all' ? '' : tab });

  return (
    <div className="space-y-4">
      <PageTitle title={t('apply.adminTitle')} subtitle={t('apply.adminSubtitle')} />
      <Segmented value={tab} onChange={setTab} size="sm"
        options={['pending', 'approved', 'rejected', 'all'].map((s) => ({ value: s, label: s === 'pending' && data?.pending ? `${t('apply.status.pending')} (${data.pending})` : s === 'all' ? t('common.all') : t(`apply.status.${s}`) }))} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data && (data.applications.length === 0 ? (
        <Card><Empty icon="handCoins">{t('apply.none')}</Empty></Card>
      ) : (
        <div className="space-y-3">
          {data.applications.map((a) => {
            const checked = DOC_KINDS.filter((k) => a.documents[k]?.status === 'verified').length;
            return (
              <Link key={a.id} href={`/admin/loan-applications/${a.id}`} className="flex items-center gap-3 surface p-4 transition hover:-translate-y-0.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-lg font-bold text-maroon">{a.member.fullName.trim()[0]?.toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-bold">{a.member.fullName}</span>
                    <Badge tone={APP_TONE[a.status]}>{t(`apply.status.${a.status}`)}</Badge>
                  </div>
                  <div className="text-sm text-muted">#{a.applicationNo} · {t('field.memberNo')} {a.member.memberNo} · {fmtDateTime(a.createdAt)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span><b className="num">{money(a.amountPaise)}</b> · {t('apply.nMonths', { n: a.months })}</span>
                    <span>{t('apply.emi')} <b className="num">{money(a.emiPaise)}</b></span>
                    <span className={checked === DOC_KINDS.length ? 'text-ok' : 'text-warn'}>{t('apply.docsChecked', { n: checked, total: DOC_KINDS.length })}</span>
                  </div>
                </div>
                <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

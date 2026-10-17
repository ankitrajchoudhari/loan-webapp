'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, ButtonLink, Card, Empty, ErrorBox, Input, Loading, PageTitle, Segmented, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useApi } from '@/lib/hooks';
import { money } from '@/lib/format';

/** Spec §4.2 सदस्य प्रबंधन — search and open members. */
export default function Members() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const { data, error, loading, reload } = useApi('/members', { q, status: status === 'all' ? '' : status });

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.members')} action={<ButtonLink href="/admin/members/new" icon="userPlus" size="md">{t('members.add')}</ButtonLink>} />

      <Card>
        <div className="space-y-3">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('members.searchPlaceholder')} className="pl-12" aria-label={t('members.search')} />
          </div>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: t('member.active') },
              { value: 'inactive', label: t('member.inactive') },
              { value: 'all', label: t('common.all') },
            ]}
          />
        </div>
      </Card>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data?.members.length === 0 ? (
        <Empty icon="users">{q ? t('members.noMatch') : t('members.none')}</Empty>
      ) : (
        <ul className="space-y-2">
          {data?.members.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 transition hover:border-brand/50">
                <span className="num grid size-12 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-maroon">{m.memberNo}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {m.fullName}
                    {m.status === 'inactive' && <Badge>{t('member.inactive')}</Badge>}
                  </span>
                  <span className="num block text-sm text-muted">
                    {m.mobileNumber}
                    {m.arrearsPaise > 0 && <> · <span className="font-semibold text-bad">{t('members.arrears', { amount: money(m.arrearsPaise) })}</span></>}
                    {m.loanOutstandingPaise > 0 && <> · {t('members.loanLeft', { amount: money(m.loanOutstandingPaise) })}</>}
                  </span>
                </span>
                {m.status === 'active' && <StatusBadge status={m.thisMonth} />}
                <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

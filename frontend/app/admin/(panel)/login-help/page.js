'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Empty, ErrorBox, Loading, PageTitle, Segmented } from '@/components/ui';
import { HelpCard } from '@/components/LoginHelp';
import { useApi } from '@/lib/hooks';

/** Login problems people sent from the login page. Admin: those sent to the admin; developer: all. */
export default function LoginHelp() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('active');
  const { data, error, loading, reload } = useApi('/help-requests', tab === 'active' ? { active: 1 } : { status: 'fixed' });
  useEffect(() => {
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);
  return (
    <div className="space-y-4">
      <PageTitle title={t('help.adminTitle')} subtitle={t('help.adminSubtitle')} />
      <Segmented value={tab} onChange={setTab} size="sm" options={[
        { value: 'active', label: `${t('help.tabActive')}${data?.active ? ` (${data.active})` : ''}` },
        { value: 'fixed', label: t('help.status.fixed') },
      ]} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data && (data.requests.length === 0
        ? <Card><Empty icon="message">{t('help.none')}</Empty></Card>
        : <div className="space-y-3">{data.requests.map((h) => <HelpCard key={h.id} h={h} onChange={reload} />)}</div>)}
    </div>
  );
}

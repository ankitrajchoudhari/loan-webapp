'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Loading, PageTitle } from '@/components/ui';
import { ChangeHistory } from '@/components/admin';
import { useApi } from '@/lib/hooks';

/** Change history: who changed what, when and why — for every staff member (developer, admin, sub-admin). */
export default function Changes() {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const { data, loading } = useApi('/audit-log', { limit: 30, offset }, { live: offset === 0 });
  useEffect(() => {
    if (data) setEntries((e) => (offset === 0 ? data.entries : [...e, ...data.entries]));
  }, [data, offset]);
  return (
    <div className="space-y-4">
      <PageTitle title={t('settings.changeLog')} subtitle={t('settings.changeLogHint')} />
      <Card>
        {loading && !entries.length ? <Loading /> : (
          <ChangeHistory entries={entries.map((e) => ({ ...e, actorName: e.member ? `${e.actorName ?? ''} → ${e.member.fullName} (${e.member.memberNo})` : e.actorName }))} />
        )}
        {data && entries.length < data.total && (
          <Button variant="secondary" full className="mt-3" loading={loading} onClick={() => setOffset(entries.length)}>{t('common.more')}</Button>
        )}
      </Card>
    </div>
  );
}

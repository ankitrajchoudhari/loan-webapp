'use client';
import { useTranslation } from 'react-i18next';
import { PublicShell } from '@/components/shell';
import { Card } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { money } from '@/lib/format';

/** नियम और शर्तें — short, plain terms for members and staff. The platform fee shown is the current one. */
export default function Terms() {
  const { t } = useTranslation();
  const { data } = useApi('/auth/config');
  const fee = data?.memberFeePaise ?? 400;
  const items = Array.from({ length: 8 }, (_, i) => t(`terms.p${i + 1}`, { fee: money(fee) }));
  return (
    <PublicShell>
      <Card title={t('terms.title')} icon="file">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ol>
        <p className="mt-4 text-xs text-muted">{t('terms.updated')}</p>
      </Card>
    </PublicShell>
  );
}

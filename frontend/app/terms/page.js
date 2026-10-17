'use client';
import { useTranslation } from 'react-i18next';
import { PublicShell } from '@/components/shell';
import { Card } from '@/components/ui';
import { money } from '@/lib/format';

const FEE_PAISE = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_PAISE ?? 1245);

/** नियम और शर्तें — short, plain terms for members and staff. */
export default function Terms() {
  const { t } = useTranslation();
  const items = Array.from({ length: 8 }, (_, i) => t(`terms.p${i + 1}`, { fee: money(FEE_PAISE) }));
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

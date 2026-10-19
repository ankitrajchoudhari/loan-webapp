'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageTitle, Notice } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAction } from '@/components/admin';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

/** Spec §4.5 — old records are entered in batches, checked, then saved. */
export default function HistoryBatches() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, error, loading, reload } = useApi('/history/batches');
  const [title, setTitle] = useState('');
  const { busy, error: createError, run } = useAction();

  const create = async (e) => {
    e.preventDefault();
    const r = await run(() => api('/history/batches', { method: 'POST', body: { title } }));
    if (r) router.push(`/admin/history/${r.batch.id}`);
  };

  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.history')} subtitle={t('history.subtitle')} />
      <Notice tone="brand" icon="history">{t('history.howItWorks')}</Notice>

      <Card title={t('history.newBatch')} icon="plus">
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <div className="flex-1">
            <Field label={t('history.batchTitle')} hint={t('history.batchTitleHint')} htmlFor="bt">
              <Input id="bt" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Button type="submit" loading={busy} disabled={title.trim().length < 2} icon="plus">{t('history.create')}</Button>
        </form>
        {createError && <div className="mt-3"><ErrorBox error={createError} /></div>}
      </Card>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data?.batches.length === 0 ? (
        <Empty icon="history">{t('history.noBatches')}</Empty>
      ) : (
        <ul className="space-y-2">
          {data?.batches.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/history/${b.id}`} className="flex items-center gap-3 surface p-4 hover:-translate-y-0.5">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">{b.title}</div>
                  <div className="num text-sm text-muted">{fmtDateTime(b.createdAt)} · {t('history.rowsCount', { n: b.rows })}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {b.needsCheck > 0 && <Badge tone="warn">{t('history.needsCheckN', { n: b.needsCheck })}</Badge>}
                    {b.verified > 0 && <Badge tone="brand">{t('history.verifiedN', { n: b.verified })}</Badge>}
                    {b.posted > 0 && <Badge tone="ok">{t('history.postedN', { n: b.posted })}</Badge>}
                  </div>
                </div>
                <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

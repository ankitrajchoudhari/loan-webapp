'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import MemberForm from '@/components/MemberForm';
import { ErrorBox, Loading, PageTitle } from '@/components/ui';
import { useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function EditMember({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { data, error: loadError } = useApi(`/members/${id}`);
  const { busy, error, run } = useAction(toast);

  if (loadError) return <ErrorBox error={loadError} />;
  if (!data) return <Loading />;

  const save = async (body) => {
    const r = await run(() => api(`/members/${id}`, { method: 'PUT', body }), t('common.savedOk'));
    if (r) router.replace(`/admin/members/${id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={t('members.edit')} subtitle={data.member.fullName} back={`/admin/members/${id}`} />
      <MemberForm initial={data.member} onSubmit={save} busy={busy} error={error} />
    </div>
  );
}

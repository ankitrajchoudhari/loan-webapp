'use client';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import MemberForm from '@/components/MemberForm';
import { ErrorBox, Loading, PageTitle } from '@/components/ui';
import { useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

export default function NewMember() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { data, error: loadError } = useApi('/members/next-number');
  const { busy, error, run } = useAction(toast);

  if (loadError) return <ErrorBox error={loadError} />;
  if (!data) return <Loading />;

  const save = async (body) => {
    const r = await run(() => api('/members', { method: 'POST', body }), t('members.saved'));
    if (r) router.replace(`/admin/members/${r.member.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={t('members.add')} back="/admin/members" />
      <MemberForm isNew initial={{ memberNo: data.memberNo, monthlyInstallmentPaise: data.monthlyInstallmentPaise, joinDate: data.today }} onSubmit={save} busy={busy} error={error} />
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorBox, Field, Loading, Modal, PageTitle, Row } from '@/components/ui';
import MemberPicker from '@/components/MemberPicker';
import LoanTerms, { emptyTerms, termsBody } from '@/components/LoanTerms';
import { Problems, useAction } from '@/components/admin';
import { interestRule } from '@/components/statement';
import { PlanSummary } from '@/components/LoanBits';
import { useToast } from '@/app/providers';
import { useApi, useQueryParam } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDate, money, todayIST } from '@/lib/format';

export default function NewLoan() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const preselect = useQueryParam('member');
  const settings = useApi('/settings');
  const [memberId, setMemberId] = useState(null);
  const [f, setF] = useState(null);
  const [preview, setPreview] = useState(null);
  const { busy, error, setError, run } = useAction(toast);

  useEffect(() => {
    if (settings.data && !f) setF(emptyTerms(settings.data.settings, todayIST()));
  }, [settings.data, f]);
  useEffect(() => {
    if (preselect) setMemberId(preselect);
  }, [preselect]);

  if (settings.error) return <ErrorBox error={settings.error} />;
  if (!f) return <Loading />;

  const body = () => ({ memberId, ...termsBody(f) });
  const openPreview = async (e) => {
    e.preventDefault();
    if (!memberId) return setError('member_required');
    const r = await run(() => api('/loans/preview', { method: 'POST', body: body() }));
    if (r) setPreview(r);
  };
  const save = async () => {
    const r = await run(() => api('/loans', { method: 'POST', body: body() }), t('loans.saved'));
    if (r) router.replace(`/admin/loans/${r.loan.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('loans.add')} back="/admin/loans" />
      <form onSubmit={openPreview} noValidate className="space-y-4">
        <Card>
          <div className="space-y-5">
            <Field label={t('inst.pickMember')} required>
              <MemberPicker key={memberId ?? 'none'} value={memberId} onChange={(id) => { setMemberId(id); setError(null); }} />
            </Field>
            <LoanTerms f={f} setF={setF} />
          </div>
        </Card>
        {error && <ErrorBox error={error} />}
        <Button type="submit" full loading={busy && !preview} icon="file">{t('common.preview')}</Button>
      </form>

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={t('loans.previewTitle')}
          footer={
            <>
              <Button variant="secondary" size="md" icon="edit" onClick={() => setPreview(null)}>{t('common.changeSomething')}</Button>
              <Button size="md" icon="check" loading={busy} disabled={preview.errors.length > 0} onClick={save}>{t('common.saveNow')}</Button>
            </>
          }>
          <div className="space-y-4">
            <div>
              <Row label={t('field.memberName')} value={preview.member.fullName} />
              <Row label={t('loans.takenOn')} value={fmtDate(preview.loan.takenOn)} />
              <Row label={t('label.loanAmount')} value={money(preview.loan.principalPaise)} strong />
              <Row label={t('loans.method')} value={t(`loan.method.${preview.loan.interestMethod}`)} sub={interestRule(t, preview.loan)} />
              <Row label={t('loans.interestFrom')} value={`${t(`m${preview.loan.interestFromMonth}`)} ${preview.loan.interestFromYear}`} />
              <Row label={t('loans.firstInterest')} value={money(preview.firstMonthInterestPaise)} tone="warn" />
              {preview.loan.installmentPaise > 0 && <Row label={t('loans.installment')} value={money(preview.loan.installmentPaise)} />}
              {preview.loan.openingInterestPaise > 0 && <Row label={t('loans.openingInterest')} value={money(preview.loan.openingInterestPaise)} />}
            </div>
            <Problems codes={preview.errors} />
            {preview.plan?.feasible && <PlanSummary plan={preview.plan} installmentPaise={preview.loan.installmentPaise} principalPaise={preview.loan.principalPaise} />}
          </div>
        </Modal>
      )}
    </div>
  );
}

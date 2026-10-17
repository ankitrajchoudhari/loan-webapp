'use client';
import { use, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ButtonLink, Card, ErrorBox, Field, Loading, Modal, Notice, PageTitle, Row, TextArea } from '@/components/ui';
import DateField from '@/components/DateField';
import { ReasonModal, useAction } from '@/components/admin';
import { AutoChecks, BankCard, DocumentsList, EmiTable, APP_TONE, DOC_KINDS } from '@/components/LoanApplication';
import { interestRule } from '@/components/statement';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, money, todayIST } from '@/lib/format';

/** One application: member, loan + EMI list, documents to check one by one, bank card; approve or reject. */
export default function LoanApplicationDetail({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const toast = useToast();
  const { data, error, reload } = useApi(`/loan-apply/${id}`);
  const [app, setApp] = useState(null);
  const [busyKind, setBusyKind] = useState(null);
  const [rejectDoc, setRejectDoc] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [takenOn, setTakenOn] = useState(todayIST());
  const [docError, setDocError] = useState(null);
  const approve = useAction(toast);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const a = app ?? data.application;
  const allVerified = DOC_KINDS.every((k) => a.documents[k]?.status === 'verified');

  const check = async (kind, status, note) => {
    if (status === 'rejected' && !note) return setRejectDoc(kind);
    setBusyKind(kind);
    setDocError(null);
    try {
      const r = await api(`/loan-apply/${a.id}/documents/${kind}`, { method: 'POST', body: { status, note } });
      setApp(r.application);
    } catch (e) {
      setDocError(e);
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle title={`${t('apply.application')} #${a.applicationNo}`} subtitle={`${a.member.fullName} · ${t('field.memberNo')} ${a.member.memberNo} · ${a.member.mobileNumber}`} back="/admin/loan-applications"
        action={<Badge tone={APP_TONE[a.status]} className="text-base">{t(`apply.status.${a.status}`)}</Badge>} />

      {a.status === 'pending' && data.eligibility && !data.eligibility.ok && (
        <Notice tone="bad" icon="alert">
          {t('apply.adminNotEligible', { pct: data.eligibility.neededPct })}{' '}
          {data.eligibility.loans.filter((l) => l.morePaise).map((l) => t('apply.adminLoanRepaid', { n: l.loanNo, pct: l.repaidPct })).join(' · ')}
        </Notice>
      )}
      {a.status === 'rejected' && <Notice tone="bad" icon="alert">{t('apply.rejectedBecause', { reason: a.rejectReason })}</Notice>}
      {a.status === 'approved' && (
        <Notice tone="ok" icon="checkCircle">
          {t('apply.approvedOn', { date: fmtDateTime(a.reviewedAt) })}{' '}
          {a.loanId && <ButtonLink href={`/admin/loans/${a.loanId}`} size="sm" variant="ghost" icon="chevronRight">{t('apply.openLoan')}</ButtonLink>}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('apply.loanAsked')} icon="handCoins">
          <Row label={t('apply.amount')} value={money(a.amountPaise)} strong />
          <Row label={t('apply.months')} value={t('apply.nMonths', { n: a.months })} />
          <Row label={t('apply.emi')} value={money(a.emiPaise)} tone="warn" />
          <Row label={t('apply.totalInterest')} value={money(a.totalInterestPaise)} />
          <Row label={t('apply.interestRule')} value={<span className="text-right text-sm">{interestRule(t, a)}</span>} />
          {a.purpose && <Row label={t('apply.purpose')} value={a.purpose} />}
          <Row label={t('apply.appliedOn')} value={fmtDateTime(a.createdAt)} />
        </Card>
        <Card title={t('apply.bankDetails')} icon="bank">
          <BankCard bank={a.bank} name={a.member.fullName} mobile={a.member.mobileNumber} status={a.status} />
          {a.bank.branch && <p className="mt-3 text-center text-sm text-muted">{a.bank.branch}</p>}
        </Card>
      </div>

      <Card title={t('apply.documents')} icon="idCard">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Row label={t('apply.aadhaar')} value={<span className="num">{a.aadhaar?.replace(/(\d{4})(?=\d)/g, '$1 ')}</span>} />
            <Row label={t('apply.pan')} value={<span className="num">{a.pan}</span>} />
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <div className="mb-1.5 text-sm font-semibold text-muted">{t('apply.autoChecks')}</div>
            <AutoChecks app={a} />
          </div>
        </div>
        {a.status === 'pending' && <p className="mb-3 text-sm text-muted">{t('apply.checkEach')}</p>}
        <DocumentsList app={a} onCheck={check} busyKind={busyKind} />
        {docError && <div className="mt-3"><ErrorBox error={docError} /></div>}
      </Card>

      <Card title={t('apply.emiList')} icon="calendar"><EmiTable plan={data.plan} initial={6} /></Card>

      {a.status === 'pending' && (
        <div className="sticky bottom-[5.5rem] z-10 grid gap-2 rounded-2xl bg-cream/90 p-1 backdrop-blur lg:bottom-2 sm:grid-cols-2">
          <Button variant="success" icon="check" disabled={!allVerified} onClick={() => setDialog('approve')}>{allVerified ? t('apply.approve') : t('apply.verifyFirst')}</Button>
          <Button variant="secondary" icon="x" onClick={() => setDialog('reject')}>{t('apply.reject')}</Button>
        </div>
      )}

      <Modal open={dialog === 'approve'} onClose={() => setDialog(null)} title={t('apply.approveTitle')}
        footer={<>
          <Button variant="secondary" size="md" onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button variant="success" size="md" icon="check" loading={approve.busy} onClick={async () => {
            const r = await approve.run(() => api(`/loan-apply/${a.id}/approve`, { method: 'POST', body: { takenOn } }), t('apply.approvedToast'));
            if (r) { setApp(r.application); setDialog(null); }
          }}>{t('apply.approve')}</Button>
        </>}>
        <div className="space-y-4">
          <p>{t('apply.approveText', { amount: money(a.amountPaise), name: a.member.fullName, emi: money(a.emiPaise), n: a.months })}</p>
          <Field label={t('apply.givenOn')} hint={t('apply.givenOnHint')}>
            <DateField value={takenOn} onChange={setTakenOn} />
          </Field>
          {approve.error && <ErrorBox error={approve.error} />}
        </div>
      </Modal>

      {dialog === 'reject' && (
        <ReasonModal open danger title={t('apply.rejectTitle')} confirmLabel={t('apply.reject')} onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const r = await api(`/loan-apply/${a.id}/reject`, { method: 'POST', body: { reason } });
            setApp(r.application);
            setDialog(null);
            toast(t('apply.rejectedToast'));
          }}>
          <p className="text-muted">{t('apply.rejectHint')}</p>
        </ReasonModal>
      )}

      {rejectDoc && (
        <DocReject kind={rejectDoc} onClose={() => setRejectDoc(null)} onSave={async (note) => { await check(rejectDoc, 'rejected', note); setRejectDoc(null); }} />
      )}
    </div>
  );
}

function DocReject({ kind, onClose, onSave }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`${t('apply.notOk')} — ${t(`apply.doc.${kind}`)}`}
      footer={<>
        <Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" size="md" icon="x" loading={busy} disabled={note.trim().length < 3} onClick={async () => { setBusy(true); await onSave(note.trim()); }}>{t('apply.notOk')}</Button>
      </>}>
      <Field label={t('apply.docProblem')} hint={t('apply.docProblemHint')} required>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
}

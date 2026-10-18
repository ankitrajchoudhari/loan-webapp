'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, MoneyInput, PageTitle, Progress, Row, Segmented, TableWrap, TextArea } from '@/components/ui';
import { LoanStatus, ScheduleTable } from '@/components/LoanBits';
import DateField from '@/components/DateField';
import LoanTerms, { termsFromLoan, termsBody } from '@/components/LoanTerms';
import { METHOD_OPTIONS } from '@/components/InstallmentEdit';
import { BalanceCompare, ChangeHistory, Problems, ReasonModal, Warnings, useAction } from '@/components/admin';
import { interestRule, methodLabel } from '@/components/statement';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { defaultRecordDate, fmtDate, money, rupeesText, toPaise } from '@/lib/format';

export default function LoanAccount({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(`/loans/${id}`);
  const [dialog, setDialog] = useState(null);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const { loan, ledger, repayments, history } = data;
  const liveReps = repayments.filter((r) => !r.voided);
  const p = loan.position;
  const ins = loan.insights;
  const done = (msg) => {
    setDialog(null);
    toast(msg ?? t('common.savedOk'));
    reload();
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title={`${t('loan.no', { n: loan.loanNo })} — ${loan.member.fullName}`}
        subtitle={`${t('field.memberNo')} ${loan.member.memberNo} · ${fmtDate(loan.takenOn)}`}
        back="/admin/loans"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="secondary" icon="edit" onClick={() => setDialog({ kind: 'terms' })}>{t('loans.changeTerms')}</Button>
            <Button size="md" variant="danger" icon="x" onClick={() => setDialog({ kind: 'voidLoan' })}>{t('loans.voidLoan')}</Button>
          </div>
        }
      />

      {/* bank-style account header */}
      <section className="rounded-3xl bg-gradient-to-br from-maroon via-maroon-dark to-[#3f0d16] p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-white/75">{t('loanx.payoffToday')}</div>
            <div className="num text-4xl font-extrabold">{money(ins.payoffTodayPaise)}</div>
            <div className="text-sm text-white/75">{t('loanx.payoffTodayHint')}</div>
          </div>
          <LoanStatus ins={ins} />
        </div>
        <div className="mt-4"><Progress tone="light" value={ins.repaidPercent} label={t('loanx.repaidOf', { amount: money(loan.principalPaise) })} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3"><div className="text-white/70">{t('loanx.dueNow')}</div><div className="num text-lg font-bold">{money(ins.dueNowPaise)}</div></div>
          <div className="rounded-2xl bg-white/10 p-3"><div className="text-white/70">{t('loanx.overdue')}</div><div className={`num text-lg font-bold ${ins.overduePaise ? 'text-brand-100' : ''}`}>{money(ins.overduePaise)}</div></div>
          <div className="rounded-2xl bg-white/10 p-3"><div className="text-white/70">{t('calc.payoff')}</div><div className="text-lg font-bold">{ins.plan.payoff ? `${t(`m${ins.plan.payoff.month}`)} ${ins.plan.payoff.year}` : '—'}</div></div>
          <div className="rounded-2xl bg-white/10 p-3"><div className="text-white/70">{t('loanx.futureInterest')}</div><div className="num text-lg font-bold">{ins.plan.feasible ? money(ins.plan.futureInterestPaise) : '—'}</div></div>
        </div>
        {!p.closed && loan.installmentPaise > 0 && !ins.plan.feasible && <p className="mt-3 rounded-xl bg-white/15 p-2 text-sm font-semibold">{t('err.installment_too_low')}</p>}
        {!p.closed && !loan.installmentPaise && <p className="mt-3 rounded-xl bg-white/15 p-2 text-sm">{t('loanx.noInstallment')}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('loans.terms')} icon="file">
          <Row label={t('label.loanAmount')} value={money(loan.principalPaise)} />
          <Row label={t('loans.method')} value={t(`loan.method.${loan.interestMethod}`)} sub={interestRule(t, loan)} />
          <Row label={t('loans.interestFrom')} value={`${t(`m${loan.interestFromMonth}`)} ${loan.interestFromYear}`} />
          {loan.installmentPaise > 0 && <Row label={t('loans.installment')} value={money(loan.installmentPaise)} />}
          {loan.openingInterestPaise > 0 && <Row label={t('loans.openingInterest')} value={money(loan.openingInterestPaise)} />}
          <Row label={t('loans.nextInterest')} value={money(p.nextMonthInterestPaise)} />
          {loan.note && <p className="mt-2 text-muted">{loan.note}</p>}
        </Card>
        <Card title={t('loans.balances')} icon="calculator">
          <Row label={t('stmt.principalPaidSoFar')} value={money(p.principalPaidPaise)} tone="ok" />
          <Row label={t('stmt.interestPaidSoFar')} value={money(p.interestPaidPaise)} tone="ok" />
          <Row label={t('loans.interestChargedSoFar')} value={money(p.interestChargedPaise + loan.openingInterestPaise)} />
          <Row label={t('label.principalOutstanding')} value={money(p.principalOutstandingPaise)} tone="warn" />
          <Row label={t('label.interestOutstanding')} value={money(p.interestOutstandingPaise)} tone="warn" />
          <Row label={t('label.totalOutstanding')} value={money(p.totalOutstandingPaise)} strong tone="bad" />
        </Card>
      </div>

      {!p.closed && <RepaymentForm loan={loan} onSaved={() => done(t('loans.repaymentSaved'))} />}

      {!p.closed && ins.plan.feasible && ins.plan.rows?.length > 0 && (
        <Card title={t('loanx.futurePlan')} icon="calendar">
          <p className="mb-3 text-sm text-muted">{t('loanx.futurePlanHint', { amount: money(loan.installmentPaise) })}</p>
          <ScheduleTable rows={ins.plan.rows} />
        </Card>
      )}

      <Card title={t('loans.repayments')} icon="receipt">
        {repayments.length === 0 ? <p className="text-muted">{t('common.empty')}</p> : (
          <TableWrap min={680}>
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th className="r">{t('loans.total')}</th>
                <th className="r">{t('loans.toPrincipal')}</th>
                <th className="r">{t('loans.toInterest')}</th>
                <th>{t('field.method')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repayments.map((r) => (
                <tr key={r.id} className={r.voided ? 'opacity-60' : ''}>
                  <td className="num">{fmtDate(r.paidOn)}{r.source === 'history' && <Badge tone="brand" className="ml-2">{t('history.badge')}</Badge>}</td>
                  <td className={`r font-semibold ${r.voided ? 'line-through' : ''}`}>{money(r.totalPaise)}</td>
                  <td className="r">{money(r.principalPaise)}</td>
                  <td className="r">{money(r.interestPaise)}</td>
                  <td>{methodLabel(t, r.method)}</td>
                  <td className="text-right">
                    {r.voided ? <span className="text-sm text-bad">{t('inst.voidedBecause', { reason: r.voidReason })}</span> : (
                      <div className="no-print flex justify-end gap-1">
                        <Button size="sm" variant="ghost" icon="edit" onClick={() => setDialog({ kind: 'editRep', rep: r })}>{t('common.correct')}</Button>
                        <Button size="sm" variant="ghost" icon="x" onClick={() => setDialog({ kind: 'voidRep', rep: r })}>{t('common.void')}</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title={t('loans.ledger')} icon="calendar">
        <p className="mb-3 text-sm text-muted">{t('loans.ledgerHint')}</p>
        <TableWrap min={720}>
          <thead>
            <tr>
              <th>{t('common.month')}</th>
              <th className="r">{t('loans.openingPrincipal')}</th>
              <th className="r">{t('loans.interestCharged')}</th>
              <th className="r">{t('loans.toPrincipal')}</th>
              <th className="r">{t('loans.toInterest')}</th>
              <th className="r">{t('label.principalOutstanding')}</th>
              <th className="r">{t('label.interestOutstanding')}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={`${r.year}-${r.month}`}>
                <td className="font-semibold">{t(`m${r.month}`)} {r.year}</td>
                <td className="r">{money(r.openingPrincipal)}</td>
                <td className="r">{r.interestCharged ? money(r.interestCharged) : '—'}</td>
                <td className="r">{r.principalPaid ? money(r.principalPaid) : '—'}</td>
                <td className="r">{r.interestPaid ? money(r.interestPaid) : '—'}</td>
                <td className="r font-semibold">{money(r.closingPrincipal)}</td>
                <td className="r font-semibold">{money(r.interestDue)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title={t('memberTab.changes')} icon="log"><ChangeHistory entries={history} /></Card>
      <Link href={`/admin/members/${loan.memberId}`} className="no-print block text-center font-semibold text-maroon underline underline-offset-4">{t('loans.openMember')}</Link>

      {dialog?.kind === 'terms' && <TermsDialog loan={loan} onClose={() => setDialog(null)} onDone={() => done()} />}
      {dialog?.kind === 'editRep' && <RepaymentEdit loanId={loan.id} rep={dialog.rep} onClose={() => setDialog(null)} onDone={() => done()} />}
      {dialog?.kind === 'voidRep' && <RepaymentVoid rep={dialog.rep} onClose={() => setDialog(null)} onDone={() => done(t('inst.voided'))} />}
      {dialog?.kind === 'voidLoan' && (
        <ReasonModal open danger title={t('loans.voidLoan')} confirmLabel={t('loans.voidLoan')} onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await api(`/loans/${loan.id}/void`, { method: 'POST', body: { reason, withRepayments: liveReps.length > 0 } });
            toast(t('loans.voidedOk', { n: loan.loanNo }));
            router.replace('/admin/loans');
          }}>
          <p className="font-semibold text-bad">{t('loans.voidLoanHint')}</p>
          {liveReps.length > 0 && (
            <div className="rounded-2xl border border-bad/30 bg-bad-bg p-3 text-bad">
              <p className="font-semibold">{t('loans.voidWithRepayments', { n: liveReps.length, amount: money(liveReps.reduce((s, r) => s + r.totalPaise, 0)) })}</p>
            </div>
          )}
        </ReasonModal>
      )}
    </div>
  );
}

function RepaymentFields({ f, setF, loanId }) {
  const { t } = useTranslation();
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const [splitting, setSplitting] = useState(false);
  // split automatically (interest first) whenever the total or date changes, until the admin edits the split by hand
  const [manual, setManual] = useState(Boolean(f.principal || f.interest));
  useEffect(() => {
    if (manual || !toPaise(f.total)) return;
    const id = setTimeout(() => {
      api(`/loans/${loanId}/split`, { method: 'POST', body: { paidOn: f.paidOn, totalPaise: f.total } })
        .then((s) => setF((x) => ({ ...x, principal: rupeesText(s.principalPaise), interest: rupeesText(s.interestPaise) })))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [f.total, f.paidOn, manual, loanId, setF]);
  const setSplit = (k) => (v) => {
    setManual(true);
    set(k)(v);
  };
  const autoSplit = async () => {
    if (!toPaise(f.total)) return;
    setSplitting(true);
    try {
      const s = await api(`/loans/${loanId}/split`, { method: 'POST', body: { paidOn: f.paidOn, totalPaise: f.total } });
      setF((x) => ({ ...x, principal: rupeesText(s.principalPaise), interest: rupeesText(s.interestPaise) }));
      setManual(false); // back to automatic splitting
    } finally {
      setSplitting(false);
    }
  };
  const sumOk = toPaise(f.total) != null && (toPaise(f.principal) ?? 0) + (toPaise(f.interest) ?? 0) === toPaise(f.total);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('loans.paidOn')} required>
          <DateField value={f.paidOn} onChange={set('paidOn')} />
        </Field>
        <Field label={t('loans.totalPaid')} required>
          <MoneyInput value={f.total} onChange={set('total')} />
        </Field>
      </div>
      <Button variant="secondary" size="md" icon="calculator" onClick={autoSplit} loading={splitting} disabled={!toPaise(f.total)}>{t('loans.autoSplit')}</Button>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('loans.toPrincipalLong')} required hint={manual ? null : t('loanx.autoSplitHint')}>
          <MoneyInput value={f.principal} onChange={setSplit('principal')} />
        </Field>
        <Field label={t('loans.toInterestLong')} required>
          <MoneyInput value={f.interest} onChange={setSplit('interest')} />
        </Field>
      </div>
      {f.total && (f.principal || f.interest) && !sumOk && <p className="font-semibold text-bad">{t('err.split_mismatch')}</p>}
      <Field label={t('field.method')}>
        <Segmented value={f.method} onChange={set('method')} options={METHOD_OPTIONS(t)} size="sm" />
      </Field>
      <Field label={t('field.note')}>
        <TextArea value={f.note} onChange={(e) => set('note')(e.target.value)} rows={2} maxLength={500} />
      </Field>
    </div>
  );
}

const repBody = (f) => ({ paidOn: f.paidOn, totalPaise: f.total, principalPaise: f.principal || '0', interestPaise: f.interest || '0', method: f.method, note: f.note });

function RepaymentForm({ loan, onSaved }) {
  const { t } = useTranslation();
  // pre-fill what is due now (this month + anything overdue), else the agreed installment
  const suggested = loan.insights?.dueNowPaise || loan.installmentPaise;
  const blank = { paidOn: defaultRecordDate(), total: suggested ? rupeesText(suggested) : '', principal: '', interest: '', method: 'cash', note: '' };
  const [f, setF] = useState(blank);
  const [preview, setPreview] = useState(null);
  const { busy, error, run } = useAction();

  const open = async (e) => {
    e.preventDefault();
    const r = await run(() => api(`/loans/${loan.id}/repayments/preview`, { method: 'POST', body: repBody(f) }));
    if (r) setPreview(r);
  };
  const save = async () => {
    const r = await run(() => api(`/loans/${loan.id}/repayments`, { method: 'POST', body: { ...repBody(f), confirmDuplicate: preview?.warnings.includes('possible_duplicate') } }));
    if (r) {
      setPreview(null);
      setF(blank);
      onSaved();
    }
  };

  return (
    <Card title={t('loans.addRepayment')} icon="receipt">
      <form onSubmit={open} noValidate className="space-y-5">
        <RepaymentFields f={f} setF={setF} loanId={loan.id} />
        {error && !preview && <ErrorBox error={error} />}
        <Button type="submit" full loading={busy && !preview} icon="file">{t('common.preview')}</Button>
      </form>
      {preview && (
        <Modal open wide onClose={() => setPreview(null)} title={t('loans.repaymentPreview')}
          footer={
            <>
              <Button variant="secondary" size="md" icon="edit" onClick={() => setPreview(null)}>{t('common.changeSomething')}</Button>
              <Button size="md" icon="check" loading={busy} disabled={preview.errors.length > 0} onClick={save}>{t('common.saveNow')}</Button>
            </>
          }>
          <div className="space-y-4">
            <div>
              <Row label={t('field.memberName')} value={preview.member.fullName} />
              <Row label={t('loans.paidOn')} value={fmtDate(preview.entry.paidOn)} />
              <Row label={t('loans.totalPaid')} value={money(preview.entry.totalPaise)} strong tone="ok" />
              <Row label={t('loans.toPrincipalLong')} value={money(preview.entry.principalPaise)} />
              <Row label={t('loans.toInterestLong')} value={money(preview.entry.interestPaise)} />
            </div>
            <Problems codes={preview.errors} />
            <Warnings codes={preview.warnings} />
            <BalanceCompare before={preview.before} after={preview.after} />
            {error && <ErrorBox error={error} />}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function RepaymentEdit({ loanId, rep, onClose, onDone }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ paidOn: rep.paidOn, total: rupeesText(rep.totalPaise), principal: rupeesText(rep.principalPaise), interest: rupeesText(rep.interestPaise), method: rep.method ?? 'cash', note: rep.note ?? '' });
  const [step, setStep] = useState('edit');
  const [preview, setPreview] = useState(null);
  const { busy, error, run } = useAction();

  const check = async () => {
    const r = await run(() => api(`/repayments/${rep.id}`, { method: 'PUT', query: { preview: 1 }, body: { ...repBody(f), reason: 'preview' } }));
    if (r) {
      setPreview(r);
      setStep('confirm');
    }
  };

  if (step === 'edit') {
    return (
      <Modal open wide onClose={onClose} title={t('loans.editRepayment')}
        footer={<><Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button><Button size="md" icon="file" loading={busy} onClick={check}>{t('common.preview')}</Button></>}>
        <div className="space-y-4">
          <RepaymentFields f={f} setF={setF} loanId={loanId} />
          {error && <ErrorBox error={error} />}
        </div>
      </Modal>
    );
  }
  return (
    <ReasonModal open onClose={onClose} title={t('loans.editRepayment')} disabled={preview.errors.length > 0}
      onConfirm={async (reason) => {
        await api(`/repayments/${rep.id}`, { method: 'PUT', body: { ...repBody(f), reason } });
        onDone();
      }}>
      <Problems codes={preview.errors} />
      <Warnings codes={preview.warnings} />
      <BalanceCompare before={preview.before} after={preview.after} />
      <Button variant="ghost" size="sm" icon="back" onClick={() => setStep('edit')}>{t('common.changeSomething')}</Button>
    </ReasonModal>
  );
}

function RepaymentVoid({ rep, onClose, onDone }) {
  const { t } = useTranslation();
  return (
    <ReasonModal open danger onClose={onClose} title={t('loans.voidRepayment')} confirmLabel={t('inst.voidConfirm')}
      onConfirm={async (reason) => {
        await api(`/repayments/${rep.id}/void`, { method: 'POST', body: { reason } });
        onDone();
      }}>
      <Row label={t('common.date')} value={fmtDate(rep.paidOn)} />
      <Row label={t('loans.totalPaid')} value={money(rep.totalPaise)} />
      <VoidEffect id={rep.id} />
    </ReasonModal>
  );
}

/** Balance effect of cancelling a repayment (preview only). */
function VoidEffect({ id }) {
  const [effect, setEffect] = useState(null);
  useEffect(() => {
    api(`/repayments/${id}/void`, { method: 'POST', query: { preview: 1 }, body: { reason: 'preview' } }).then(setEffect).catch(() => {});
  }, [id]);
  return effect ? <BalanceCompare before={effect.before} after={effect.after} /> : null;
}

function TermsDialog({ loan, onClose, onDone }) {
  const { t } = useTranslation();
  const [f, setF] = useState(termsFromLoan(loan));
  const [step, setStep] = useState('edit');
  const [preview, setPreview] = useState(null);
  const { busy, error, run } = useAction();
  const check = async () => {
    const r = await run(() => api(`/loans/${loan.id}`, { method: 'PUT', query: { preview: 1 }, body: { ...termsBody(f), reason: 'preview' } }));
    if (r) {
      setPreview(r);
      setStep('confirm');
    }
  };
  if (step === 'edit') {
    return (
      <Modal open wide onClose={onClose} title={t('loans.changeTerms')}
        footer={<><Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button><Button size="md" icon="file" loading={busy} onClick={check}>{t('common.preview')}</Button></>}>
        <div className="space-y-4">
          <LoanTerms f={f} setF={setF} />
          {error && <ErrorBox error={error} />}
        </div>
      </Modal>
    );
  }
  return (
    <ReasonModal open onClose={onClose} title={t('loans.changeTerms')} disabled={preview.errors.length > 0}
      onConfirm={async (reason) => {
        await api(`/loans/${loan.id}`, { method: 'PUT', body: { ...termsBody(f), reason } });
        onDone();
      }}>
      <Problems codes={preview.errors} />
      <BalanceCompare before={preview.before} after={preview.after} />
      <Button variant="ghost" size="sm" icon="back" onClick={() => setStep('edit')}>{t('common.changeSomething')}</Button>
    </ReasonModal>
  );
}

'use client';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Row, StatusBadge, TableWrap, Notice } from './ui';
import { fmtDate, money, ratePct } from '@/lib/format';

export const methodLabel = (t, m) => (m ? t(`pay.${m}`) : '—');

/** "2% हर महीने · बाकी मूल राशि पर" — the loan's interest rule in words. */
export function interestRule(t, loan) {
  if (loan.interestMethod === 'fixed') return `${t('loan.rule.fixed', { amount: money(loan.fixedInterestPaise) })}${loan.termMonths ? ` · ${t('loan.forEmis', { n: loan.termMonths })}` : ''}`;
  const rate = `${ratePct(loan.rateBp)} ${t(loan.ratePeriod === 'year' ? 'loan.perYear' : 'loan.perMonth')}`;
  const rule = t(`loan.rule.${loan.interestMethod}`, { rate });
  return loan.termMonths ? `${rule} · ${t('loan.forEmis', { n: loan.termMonths })}` : rule;
}

/** Interest still owed; a negative figure means interest paid in advance. */
function interestValue(t, paise) {
  return paise < 0 ? `${money(-paise)} (${t('loan.advance')})` : money(paise);
}

export function InstallmentSection({ st }) {
  const { t } = useTranslation();
  const inst = st.installment;
  return (
    <Card title={t('stmt.installmentTitle')} icon="wallet" action={<StatusBadge status={inst.status} />}>
      {st.beforeJoining ? (
        <p className="text-muted">{t('stmt.beforeJoining')}</p>
      ) : (
        <>
          <Row label={t('stmt.monthlyAmount')} value={money(inst.duePaise)} />
          <Row label={t('stmt.paidThisMonth')} value={money(inst.paidPaise)} tone={inst.paidPaise ? 'ok' : undefined} />
          <Row label={t('stmt.paidOn')} value={fmtDate(inst.paidOn)} sub={inst.method ? methodLabel(t, inst.method) : null} />
          <Row label={t('stmt.status')} value={<StatusBadge status={inst.status} />} />
          <Row label={t('label.pending')} value={money(inst.pendingPaise)} tone={inst.pendingPaise ? 'bad' : 'ok'} strong />
          {st.earlierArrears?.amountPaise > 0 && (
            <div className="mt-3">
              <Notice>{t('stmt.earlierArrears', { n: st.earlierArrears.months, amount: money(st.earlierArrears.amountPaise) })}</Notice>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function LoanBlock({ loan, showNo }) {
  const { t } = useTranslation();
  return (
    <div>
      {showNo && (
        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
          <span>{t('loan.no', { n: loan.loanNo })} · {fmtDate(loan.takenOn)}</span>
          {loan.closed && <Badge tone="ok" icon="check">{t('loan.closed')}</Badge>}
        </div>
      )}
      <Row label={t('stmt.totalLoanTaken')} value={money(loan.principalPaise)} sub={interestRule(t, loan)} />
      <Row label={t('stmt.monthInterest')} value={money(loan.monthInterestPaise)} />
      <Row
        label={t('stmt.monthLoanPaid')}
        value={money(loan.monthPaidPaise)}
        tone={loan.monthPaidPaise ? 'ok' : undefined}
        sub={loan.monthPaidPaise ? t('loan.split', { p: money(loan.monthPrincipalPaidPaise), i: money(loan.monthInterestPaidPaise) }) : null}
      />
      <Row label={t('stmt.principalPaidSoFar')} value={money(loan.principalPaidPaise)} />
      <Row label={t('stmt.interestPaidSoFar')} value={money(loan.interestPaidPaise)} />
      <Row label={t('label.principalOutstanding')} value={money(loan.principalOutstandingPaise)} tone={loan.principalOutstandingPaise > 0 ? 'warn' : 'ok'} />
      <Row label={t('label.interestOutstanding')} value={interestValue(t, loan.interestOutstandingPaise)} tone={loan.interestOutstandingPaise > 0 ? 'warn' : 'ok'} />
      <Row label={t('label.totalOutstanding')} value={money(loan.totalOutstandingPaise)} strong tone={loan.totalOutstandingPaise > 0 ? 'bad' : 'ok'} />
    </div>
  );
}

export function LoanSection({ st }) {
  const { t } = useTranslation();
  const many = st.loans.length > 1;
  return (
    <Card title={t('stmt.loanTitle')} icon="handCoins">
      {!st.hasLoans ? (
        <p className="rounded-2xl bg-ok-bg p-4 text-lg font-semibold text-ok">{t('member.noLoan')}</p>
      ) : st.loans.length === 0 ? (
        <p className="text-muted">{t('stmt.noLoanYet')}</p>
      ) : (
        <div className="space-y-5">
          {many && (
            <div className="rounded-2xl bg-brand-50 p-4">
              <div className="mb-1 font-semibold text-maroon">{t('stmt.allLoans', { n: st.loans.length })}</div>
              <Row label={t('label.principalOutstanding')} value={money(st.loanTotals.principalOutstandingPaise)} />
              <Row label={t('label.interestOutstanding')} value={interestValue(t, st.loanTotals.interestOutstandingPaise)} />
              <Row label={t('label.totalOutstanding')} value={money(st.loanTotals.totalOutstandingPaise)} strong tone="bad" />
            </div>
          )}
          {st.loans.map((l, i) => (
            <div key={l.loanId} className={i ? 'border-t-2 border-line pt-4' : ''}>
              <LoanBlock loan={l} showNo={many || st.loans.length === 1} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Spec §5: the full monthly statement. */
export function MonthStatement({ st }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="print-only text-base">
        {st.member.fullName} · {t('field.memberNo')} {st.member.memberNo} · {t(`m${st.month}`)} {st.year}
      </div>
      <InstallmentSection st={st} />
      <LoanSection st={st} />
    </div>
  );
}

/** Month-by-month installment table (old account). */
export function InstallmentMonthsTable({ months }) {
  const { t } = useTranslation();
  if (!months.length) return <p className="text-muted">{t('common.empty')}</p>;
  return (
    <TableWrap min={520}>
      <thead>
        <tr>
          <th>{t('common.month')}</th>
          <th className="r">{t('stmt.monthlyAmountShort')}</th>
          <th className="r">{t('stmt.paidShort')}</th>
          <th>{t('stmt.paidOn')}</th>
          <th>{t('stmt.status')}</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={`${m.year}-${m.month}`}>
            <td className="font-semibold">{t(`m${m.month}`)} {m.year}</td>
            <td className="r">{money(m.duePaise)}</td>
            <td className="r">{m.paidPaise ? money(m.paidPaise) : '—'}</td>
            <td className="num">{fmtDate(m.paidOn)}</td>
            <td><StatusBadge status={m.status} /></td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** "अब तक जमा किए गए पैसों का हिसाब" — every deposit, newest first. */
export function DepositsTable({ deposits }) {
  const { t } = useTranslation();
  if (!deposits.length) return <p className="text-muted">{t('common.empty')}</p>;
  return (
    <TableWrap min={520}>
      <thead>
        <tr>
          <th>{t('common.date')}</th>
          <th>{t('history.what')}</th>
          <th className="r">{t('common.amount')}</th>
          <th>{t('field.method')}</th>
        </tr>
      </thead>
      <tbody>
        {deposits.map((d) => (
          <tr key={`${d.kind}-${d.id}`}>
            <td className="num">{fmtDate(d.date)}</td>
            <td>
              {d.kind === 'installment' ? (
                <>{t('history.installmentFor', { month: t(`m${d.month}`), year: d.year })}</>
              ) : (
                <>
                  {t('history.loanRepayment', { n: d.loanNo })}
                  <span className="block text-sm text-muted">{t('loan.split', { p: money(d.principalPaise), i: money(d.interestPaise) })}</span>
                </>
              )}
            </td>
            <td className="r font-semibold">{money(d.amountPaise)}</td>
            <td>{methodLabel(t, d.method)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

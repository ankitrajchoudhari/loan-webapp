'use client';
import { useTranslation } from 'react-i18next';
import { Button, ButtonLink, Card, ErrorBox, Loading, Row } from '@/components/ui';
import { DepositsTable, InstallmentMonthsTable } from '@/components/statement';
import { useApi } from '@/lib/hooks';
import { money } from '@/lib/format';

/** "पुराना हिसाब देखें" — every month since joining and every rupee deposited. */
export default function MemberHistory() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi('/statements/me/history');
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const { totals } = data;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-maroon">{t('member.oldAccount')}</h1>
      <div className="print-only">{data.member.fullName} · {t('field.memberNo')} {data.member.memberNo}</div>

      <Card title={t('history.summary')} icon="file">
        <Row label={t('history.totalInstallments')} value={money(totals.installmentsPaise)} tone="ok" />
        {data.loans.length > 0 && (
          <>
            <Row label={t('stmt.principalPaidSoFar')} value={money(totals.principalPaidPaise)} />
            <Row label={t('stmt.interestPaidSoFar')} value={money(totals.interestPaidPaise)} />
          </>
        )}
        <Row label={t('history.installmentArrears')} value={money(totals.arrears.amountPaise)} tone={totals.arrears.amountPaise ? 'bad' : 'ok'} strong />
      </Card>

      <Card title={t('history.monthwise')} icon="calendar">
        <InstallmentMonthsTable months={data.months} />
      </Card>

      <Card title={t('label.paymentHistory')} icon="receipt">
        <DepositsTable deposits={data.deposits} />
      </Card>

      <div className="no-print grid grid-cols-2 gap-3">
        <ButtonLink href="/member" variant="secondary" icon="back">{t('common.back')}</ButtonLink>
        <Button icon="printer" onClick={() => window.print()}>{t('common.print')}</Button>
      </div>
    </div>
  );
}

'use client';
import { useTranslation } from 'react-i18next';
import { Card, PageTitle } from '@/components/ui';
import { EmiCalculator } from '@/components/LoanBits';

/** Bank-style EMI calculator: amount + rate + method → EMI, months, total interest, full schedule. */
export default function Calculator() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('calc.title')} subtitle={t('calc.subtitle')} back="/admin/loans" />
      <Card><EmiCalculator initial={{ principal: '10000' }} /></Card>
    </div>
  );
}

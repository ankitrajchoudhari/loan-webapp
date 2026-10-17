'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ButtonLink, ErrorBox, Loading } from '@/components/ui';
import MonthPager, { clampMonth } from '@/components/MonthPager';
import { MonthStatement } from '@/components/statement';
import { useApi } from '@/lib/hooks';
import { nowMonthYear } from '@/lib/format';

/** "YYYY-MM-DD" → { month, year } */
const monthOf = (d) => (d ? { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) } : null);

/** Monthly statement — only months from the account opening up to this month can be chosen. */
export default function MemberMonth() {
  const { t } = useTranslation();
  const now = nowMonthYear();
  const [my, setMy] = useState(now);
  const [min, setMin] = useState(null);
  const { data, error, loading, reload } = useApi('/statements/me/month', my);

  // learn the opening month from the first answer and keep the choice inside it
  useEffect(() => {
    const opened = monthOf(data?.member?.joinDate);
    if (!opened) return;
    setMin(opened);
    const fixed = clampMonth(my, opened, now);
    if (fixed.month !== my.month || fixed.year !== my.year) setMy(fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.member?.joinDate]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-maroon">{t('label.monthlyStatement')}</h1>
      <MonthPager month={my.month} year={my.year} onChange={setMy} min={min} max={now} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading || !data ? !error && <Loading /> : <MonthStatement st={data} />}
      <div className="no-print grid grid-cols-2 gap-3">
        <ButtonLink href="/member" variant="secondary" icon="back">{t('common.back')}</ButtonLink>
        <Button icon="printer" onClick={() => window.print()} disabled={!data}>{t('common.print')}</Button>
      </div>
    </div>
  );
}

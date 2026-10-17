'use client';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons';
import { MonthYearSelect } from './DateField';
import { prevMonth, nextMonth } from '@/lib/format';

const k = (p) => p.year * 12 + (p.month - 1);

/** Keeps a month inside [min, max] (both optional). */
export function clampMonth(p, min, max) {
  if (min && k(p) < k(min)) return { ...min };
  if (max && k(p) > k(max)) return { ...max };
  return p;
}

/** ◀ [month][year] ▶ — limited to the months that exist (e.g. from account opening to this month). */
export default function MonthPager({ month, year, onChange, min, max }) {
  const { t } = useTranslation();
  const cur = { month, year };
  const go = (p) => onChange(clampMonth(p, min, max));
  const atMin = min && k(cur) <= k(min);
  const atMax = max && k(cur) >= k(max);
  const btn = 'grid size-14 shrink-0 place-items-center rounded-xl border-2 border-line bg-white text-maroon hover:bg-brand-50 disabled:opacity-30 disabled:hover:bg-white';
  return (
    <div className="no-print flex items-center gap-2">
      <button type="button" className={btn} disabled={atMin} onClick={() => go(prevMonth(cur))} aria-label={t('common.prevMonth')}>
        <Icon name="chevronLeft" />
      </button>
      <div className="flex-1">
        <MonthYearSelect month={month} year={year} onChange={go} minYear={min?.year} maxYear={max?.year} min={min} max={max} />
      </div>
      <button type="button" className={btn} disabled={atMax} onClick={() => go(nextMonth(cur))} aria-label={t('common.nextMonth')}>
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

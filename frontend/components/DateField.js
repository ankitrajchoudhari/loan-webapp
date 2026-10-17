'use client';
import { useTranslation } from 'react-i18next';
import { todayIST } from '@/lib/format';

const cls = 'min-h-14 w-full appearance-none rounded-xl border-2 border-line bg-white px-3 text-lg font-semibold focus:border-brand focus:outline-none';

/**
 * Date picker as three big dropdowns (day / month name / year). The browser's own calendar
 * can't be forced into Hindi, so this keeps month names in the chosen language everywhere.
 * value/onChange use "YYYY-MM-DD".
 */
export default function DateField({ value, onChange, id, minYear = 1990, allowFuture = false }) {
  const { t } = useTranslation();
  const today = todayIST();
  const [y, m, d] = (value || today).split('-').map(Number);
  const maxYear = Number(today.slice(0, 4)) + (allowFuture ? 1 : 0);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const set = (yy, mm, dd) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    onChange(`${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`);
  };
  const years = [];
  for (let yy = maxYear; yy >= minYear; yy--) years.push(yy);

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2" id={id}>
      <select aria-label={t('common.day')} className={`${cls} num`} value={d} onChange={(e) => set(y, m, Number(e.target.value))}>
        {Array.from({ length: days }, (_, i) => (
          <option key={i} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
        ))}
      </select>
      <select aria-label={t('common.month')} className={cls} value={m} onChange={(e) => set(y, Number(e.target.value), d)}>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={i + 1}>{t(`m${i + 1}`)}</option>
        ))}
      </select>
      <select aria-label={t('common.year')} className={`${cls} num`} value={y} onChange={(e) => set(Number(e.target.value), m, d)}>
        {years.map((yy) => (
          <option key={yy} value={yy}>{yy}</option>
        ))}
      </select>
    </div>
  );
}

/** Month + year chooser with Hindi month names. */
export function MonthYearSelect({ month, year, onChange, minYear = 1990, maxYear, min, max }) {
  const { t } = useTranslation();
  const top = maxYear ?? Number(todayIST().slice(0, 4)) + 1;
  const years = [];
  for (let yy = top; yy >= (minYear ?? 1990); yy--) years.push(yy);
  // months outside [min, max] in the chosen year can't be picked
  const outside = (m) => (min && year === min.year && m < min.month) || (max && year === max.year && m > max.month);
  return (
    <div className="grid grid-cols-[1.5fr_1fr] gap-2">
      <select aria-label={t('common.month')} className={cls} value={month} onChange={(e) => onChange({ month: Number(e.target.value), year })}>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={i + 1} disabled={outside(i + 1)}>{t(`m${i + 1}`)}</option>
        ))}
      </select>
      <select aria-label={t('common.year')} className={`${cls} num`} value={year} onChange={(e) => onChange({ month, year: Number(e.target.value) })}>
        {years.map((yy) => (
          <option key={yy} value={yy}>{yy}</option>
        ))}
      </select>
    </div>
  );
}

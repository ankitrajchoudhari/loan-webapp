// Shared helpers: exact money parsing, IST dates, month arithmetic, HTTP errors, validation.
import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// --- Money (integer paise) ----------------------------------------------------------

/**
 * "1,000.50" | "₹1000" | 1000.5 → 100050 paise, parsed from the decimal string so no float
 * rounding can creep in. Returns null for blank, NaN for anything that isn't a valid amount.
 */
export function toPaise(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return NaN;
  const s = String(value).replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (s === '') return null;
  const m = /^(\d{1,11})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}

/** "2" | "1.5" | "1.25" (percent) → hundredths of a percent (200, 150, 125). */
export const toBp = toPaise;

/** zod field: a money amount in rupees (string or number) → paise integer. */
export const moneyField = ({ min = 0, max = 10_000_000_000, optional = false } = {}) =>
  z.any().transform((v, ctx) => {
    const p = toPaise(v);
    if (p === null) {
      if (optional) return null;
      ctx.addIssue({ code: 'custom', message: 'amount_required' });
      return z.NEVER;
    }
    if (Number.isNaN(p) || p < min || p > max) {
      ctx.addIssue({ code: 'custom', message: 'amount_invalid' });
      return z.NEVER;
    }
    return p;
  });

/** Percentage of an amount in paise, rounded half-up to the nearest paisa. Integer math only. */
export function pctOf(paise, bp, divisor = 1) {
  // paise * bp / (10000 * divisor), rounded half-up
  const num = paise * bp;
  const den = 10000 * divisor;
  return Math.floor((2 * num + den) / (2 * den));
}

// --- Dates ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → Date at UTC midnight (DATE columns), or throws invalid_date. */
export function parseDate(value) {
  if (value instanceof Date) return value;
  const m = DATE_RE.exec(String(value ?? ''));
  if (!m) throw new HttpError(400, 'invalid_date');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new HttpError(400, 'invalid_date');
  }
  return d;
}

export const dateField = (msg = 'invalid_date') =>
  z.string().trim().refine((v) => {
    try {
      parseDate(v);
      return true;
    } catch {
      return false;
    }
  }, msg);

export const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Today's date in India as "YYYY-MM-DD". */
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function currentMonthYear() {
  const [y, m] = todayIST().split('-').map(Number);
  return { month: m, year: y };
}

/** Month index for comparisons: ym(2024, 3) < ym(2024, 4). */
export const ym = (year, month) => year * 12 + (month - 1);
export const ymOfDate = (d) => {
  const dt = new Date(d);
  return ym(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
};
export const fromYm = (k) => ({ year: Math.floor(k / 12), month: (k % 12) + 1 });
export const nextMonth = (month, year) => (month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year });

/** True only for a valid date after today (invalid dates are reported by dateField instead). */
export function isFutureDate(value) {
  try {
    return iso(parseDate(value)) > todayIST();
  } catch {
    return false;
  }
}

export function parseMonthYear(query, { required = true } = {}) {
  const month = Number(query.month);
  const year = Number(query.year);
  if (!query.month && !query.year && !required) return currentMonthYear();
  if (!(Number.isInteger(month) && month >= 1 && month <= 12) || !(Number.isInteger(year) && year >= 1990 && year <= 2200)) {
    throw new HttpError(400, 'invalid_month');
  }
  return { month, year };
}

export const monthField = z.coerce.number().int().min(1, 'invalid_month').max(12, 'invalid_month');
export const yearField = z.coerce.number().int().min(1990, 'invalid_month').max(2200, 'invalid_month');

// --- Validation ----------------------------------------------------------------------

export const blankToNull = (schema) => z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

export const reasonField = z.string().trim().min(3, 'reason_required').max(500);

/** Parse a zod schema or throw a 400 listing the bad fields (messages are i18n codes). */
export function validate(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: /^[a-z_]+$/.test(i.message) ? i.message : 'invalid',
    }));
    throw new HttpError(400, 'validation', fields);
  }
  return r.data;
}

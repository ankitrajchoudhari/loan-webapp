// Display helpers. Amounts arrive from the server in whole paise (integers).

/** 100000 → "₹1,000"; 100050 → "₹1,000.50". Indian grouping (₹1,00,000). */
export function money(paise) {
  if (paise == null || Number.isNaN(Number(paise))) return '—';
  const p = Math.round(Number(paise));
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100).toLocaleString('en-IN');
  const rest = abs % 100;
  return `${neg ? '−' : ''}₹${rupees}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** Paise → plain rupee text for an input box: 100050 → "1000.50". */
export const rupeesText = (paise) => (paise == null ? '' : `${Math.floor(paise / 100)}${paise % 100 ? `.${String(paise % 100).padStart(2, '0')}` : ''}`);

/** "1,000.5" → 100050 paise (exact, from the text); null if blank/invalid. */
export function toPaise(text) {
  const s = String(text ?? '').replace(/[₹,\s]/g, '');
  const m = /^(\d{1,11})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}

/** Rate in hundredths of a percent → "2%" / "1.5%". */
export const ratePct = (bp) => `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

/** "2024-04-05" → "05/04/2024" (spec: DD/MM/YYYY everywhere). */
export function fmtDate(value) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return parts.replace(',', '');
}

/** Today in India as YYYY-MM-DD. */
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function nowMonthYear() {
  const [y, m] = todayIST().split('-').map(Number);
  return { month: m, year: y };
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** A sensible default payment date for a month: today if it's this month, else the 5th. */
export function defaultDateFor(month, year) {
  const now = nowMonthYear();
  return now.month === month && now.year === year ? todayIST() : `${year}-${pad2(month)}-05`;
}

export const prevMonth = ({ month, year }) => (month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year });
export const nextMonth = ({ month, year }) => (month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year });

// Reads an uploaded CSV or Excel (.xlsx) file into a header row + data rows of plain values,
// and guesses which column holds which field from Hindi/English header names.
import ExcelJS from 'exceljs';
import { HttpError } from './util.js';

const MAX_ROWS = 3000;

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, newlines inside quotes, BOM. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const delim = (src.split('\n')[0].match(/;/g)?.length ?? 0) > (src.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function cellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('text' in v) return String(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    return '';
  }
  return v;
}

export async function readSheet(file) {
  const name = (file.originalname || '').toLowerCase();
  let rows;
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer);
    } catch {
      throw new HttpError(400, 'file_unreadable');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new HttpError(400, 'file_empty');
    rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(r.getCell(c).value));
      rows.push(vals);
    });
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    rows = parseCsv(file.buffer.toString('utf8'));
  } else {
    throw new HttpError(400, 'file_type');
  }
  if (rows.length < 2) throw new HttpError(400, 'file_empty');
  if (rows.length > MAX_ROWS + 1) throw new HttpError(400, 'file_too_many_rows');
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => Array.from({ length: width }, (_, i) => (r[i] instanceof Date ? r[i].toISOString().slice(0, 10) : String(r[i] ?? '').trim()));
  return { headers: pad(rows[0]), rows: rows.slice(1).map(pad) };
}

const SYNONYMS = {
  memberNo: ['सदस्य संख्या', 'सदस्य नं', 'सदस्य क्रमांक', 'member no', 'member number', 'member id', 'sadasya', 'मोबाइल', 'mobile'],
  month: ['महीना', 'माह', 'month'],
  year: ['साल', 'वर्ष', 'year'],
  amount: ['रकम', 'राशि', 'जमा', 'amount', 'किस्त'],
  paidOn: ['तारीख', 'दिनांक', 'जमा की तारीख', 'भुगतान की तारीख', 'date', 'paid on', 'payment date'],
  method: ['तरीका', 'माध्यम', 'method', 'mode'],
  note: ['टिप्पणी', 'नोट', 'note', 'remark', 'remarks'],
  takenOn: ['कर्ज की तारीख', 'कर्ज लेने की तारीख', 'loan date', 'taken on', 'तारीख', 'date'],
  principal: ['मूल', 'मूल राशि', 'कर्ज', 'principal', 'loan amount'],
  interestMethod: ['ब्याज का तरीका', 'गणना', 'interest method', 'method'],
  rate: ['दर', 'ब्याज दर', 'rate', 'interest rate'],
  ratePeriod: ['अवधि', 'period'],
  fixedInterest: ['तय ब्याज', 'fixed interest'],
  interestFromMonth: ['ब्याज महीना', 'interest from month'],
  interestFromYear: ['ब्याज साल', 'interest from year'],
  installment: ['कर्ज की किस्त', 'emi', 'installment'],
  openingInterest: ['पुराना ब्याज', 'बाकी ब्याज', 'opening interest', 'old interest'],
  loanNo: ['कर्ज संख्या', 'कर्ज नं', 'loan no', 'loan number'],
  total: ['कुल', 'कुल जमा', 'total'],
  interest: ['ब्याज', 'interest'],
};

/** { field: columnIndex } guesses for the given record fields. Exact matches win over partial ones. */
export function guessMapping(headers, fields) {
  const h = headers.map((x) => String(x).trim().toLowerCase());
  const used = new Set();
  const out = {};
  for (const pass of ['exact', 'partial']) {
    for (const f of fields) {
      if (out[f] !== undefined) continue;
      const names = [f.toLowerCase(), ...(SYNONYMS[f] ?? [])];
      const idx = h.findIndex((col, i) => !used.has(i) && col && names.some((n) => (pass === 'exact' ? col === n : col.includes(n))));
      if (idx >= 0) {
        out[f] = idx;
        used.add(idx);
      }
    }
  }
  return out;
}

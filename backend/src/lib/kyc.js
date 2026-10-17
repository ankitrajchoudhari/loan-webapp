// Checks for loan applications: Aadhaar (Verhoeff check digit), PAN format, IFSC (national directory),
// and the document photos (stored in the database, shown only to the member and loan staff).
import { HttpError } from './util.js';

// --- Aadhaar: 12 digits, first is 2–9, last is a Verhoeff check digit ----------------------------
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];

export function aadhaarValid(n) {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  [...n].reverse().forEach((d, i) => { c = D[c][P[i % 8][Number(d)]]; });
  return c === 0;
}

/** PAN: AAAAA9999A, 4th letter is the holder type (P = person, etc.). */
export const panValid = (n) => /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/.test(n);
export const ifscValid = (n) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(n);
export const accountValid = (n) => /^\d{9,18}$/.test(n);

export const maskAadhaar = (n) => (n ? `XXXX XXXX ${n.slice(-4)}` : null);
export const maskAccount = (n) => (n ? `${'X'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : null);

// --- IFSC: looked up in Razorpay's free public IFSC directory (no key needed) ------------------
const ifscCache = new Map();
export async function lookupIfsc(code) {
  if (!ifscValid(code)) return null;
  if (ifscCache.has(code)) return ifscCache.get(code);
  if (process.env.NODE_ENV === 'test') return code === 'SBIN0000001' ? { bank: 'State Bank of India', branch: 'Test branch', city: 'Jaipur', state: 'Rajasthan' } : null;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`, { signal: AbortSignal.timeout(6000) });
    if (res.status === 404) {
      ifscCache.set(code, null);
      return null;
    }
    if (!res.ok) return undefined; // directory unreachable: unknown, not wrong
    const b = await res.json();
    const out = { bank: b.BANK, branch: b.BRANCH, city: b.CITY, state: b.STATE, address: b.ADDRESS };
    ifscCache.set(code, out);
    return out;
  } catch {
    return undefined;
  }
}

// --- Document photos ---------------------------------------------------------------------------
export const DOC_KINDS = ['aadhaarFront', 'aadhaarBack', 'pan'];
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = [
  { type: 'image/jpeg', ext: 'jpg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', ok: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** Decodes a data: URL photo and checks it really is a JPEG/PNG/WebP image of sensible size. */
export function decodePhoto(dataUrl) {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw new HttpError(400, 'photo_invalid');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 1024 || buf.length > MAX_BYTES) throw new HttpError(400, 'photo_invalid');
  const t = TYPES.find((x) => x.ok(buf));
  if (!t) throw new HttpError(400, 'photo_invalid');
  return { buf, type: t.type, ext: t.ext };
}

/** Saves the photo in the database; returns what goes into the application's `documents` entry. */
export async function savePhoto(tx, applicationId, kind, photo) {
  const doc = await tx.loanDocument.create({ data: { applicationId, kind, contentType: photo.type, data: photo.buf } });
  return { file: doc.id, type: photo.type };
}

// Platform fee: what the samiti pays the developer for running the site.
//
// The developer switches "charge platform fee" on (and maybe off again later). Every calendar day in
// India (IST) on which it was on at any moment is charged once, at that period's rate per day
// (default ₹12.45). When a month is over, a bill for it is made: days charged × rate. The admin pays it
// by UPI to the developer's QR, uploads the screenshot, and the developer confirms it.
// Always kept in the live database, whatever mode (live / practice) the person is in.
import crypto from 'node:crypto';
import { liveDb } from './db.js';
import { notify, developerIds } from './notify.js';

export const DEFAULT_RATE_PAISE = 1245;
/** Platform fee added to every member payment (on top of the dues), set by the developer. */
export const DEFAULT_MEMBER_FEE_PAISE = 400;

export async function setMemberFeePaise(feePaise) {
  await liveDb().setting.upsert({ where: { key: 'memberFeePaise' }, update: { value: feePaise }, create: { key: 'memberFeePaise', value: feePaise } });
}

export async function memberFeePaise() {
  const s = await liveDb().setting.findUnique({ where: { key: 'memberFeePaise' } });
  const v = Number(s?.value);
  return Number.isInteger(v) && v >= 0 ? v : DEFAULT_MEMBER_FEE_PAISE;
}

const istFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
export const istDate = (d) => istFmt.format(d);
const nextDay = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Map of 'YYYY-MM-DD' → rate charged that day. */
export function chargedDays(periods, now = new Date()) {
  const days = new Map();
  for (const p of periods) {
    const last = istDate(p.endedAt ?? now);
    for (let d = istDate(p.startedAt); d <= last; d = nextDay(d)) days.set(d, Math.max(days.get(d) ?? 0, p.ratePaise));
  }
  return days;
}

/** Totals per month: { 'YYYY-MM': { year, month, days, amountPaise, breakdown: [{ ratePaise, days, from, to }] } } */
export function monthTotals(days) {
  const out = new Map();
  for (const d of [...days.keys()].sort()) {
    const key = d.slice(0, 7);
    const rate = days.get(d);
    if (!out.has(key)) out.set(key, { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), days: 0, amountPaise: 0, breakdown: [] });
    const m = out.get(key);
    m.days += 1;
    m.amountPaise += rate;
    const last = m.breakdown.at(-1);
    if (last && last.ratePaise === rate && nextDay(last.to) === d) {
      last.days += 1;
      last.to = d;
    } else {
      m.breakdown.push({ ratePaise: rate, days: 1, from: d, to: d });
    }
  }
  return out;
}

async function adminIds() {
  const rows = await liveDb().adminUser.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Makes the bills for every finished month that has charged days and no bill yet. Safe to call often. */
export async function ensureBills(now = new Date()) {
  const db = liveDb();
  const periods = await db.platformFeePeriod.findMany({ orderBy: { startedAt: 'asc' } });
  if (!periods.length) return [];
  const thisMonth = istDate(now).slice(0, 7);
  const made = [];
  for (const [key, m] of monthTotals(chargedDays(periods, now))) {
    if (key >= thisMonth) continue;
    if (await db.platformBill.findUnique({ where: { year_month: { year: m.year, month: m.month } } })) continue;
    try {
      const top = await db.platformBill.aggregate({ _max: { billNo: true } });
      const bill = await db.platformBill.create({
        data: { billNo: (top._max.billNo ?? 0) + 1, year: m.year, month: m.month, days: m.days, amountPaise: m.amountPaise, breakdown: m.breakdown },
      });
      made.push(bill);
      await notify(await adminIds(), {
        title: `🧾 प्लेटफ़ॉर्म बिल #${bill.billNo} — ${rupees(bill.amountPaise)}`,
        body: `${m.month}/${m.year}: ${m.days} दिन × ${rupees(m.breakdown[0].ratePaise)}। QR से भुगतान करके स्क्रीनशॉट लगाएँ।`,
        link: '/admin/platform',
      }).catch(() => {});
    } catch (e) {
      if (e?.code !== 'P2002') throw e; // made a moment ago by another request
    }
  }
  return made;
}

/** Running charge for the current month so far (not billed yet). */
export function currentMonth(periods, now = new Date()) {
  const key = istDate(now).slice(0, 7);
  const m = monthTotals(chargedDays(periods, now)).get(key);
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), days: m?.days ?? 0, amountPaise: m?.amountPaise ?? 0, breakdown: m?.breakdown ?? [], asOf: now.toISOString() };
}

export const screenshotHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export async function notifyDevelopersOfBill(bill) {
  await notify(await developerIds(), {
    title: `💰 प्लेटफ़ॉर्म बिल #${bill.billNo} का भुगतान जाँचें`,
    body: `${rupees(bill.amountPaise)}${bill.utr ? ` · UTR ${bill.utr}` : ''} — स्क्रीनशॉट देखकर पक्का करें।`,
    link: '/admin/platform',
  }, { push: true }).catch(() => {});
}

export async function notifyAdminsOfBill(bill, ok) {
  await notify(await adminIds(), {
    title: ok ? `✅ प्लेटफ़ॉर्म बिल #${bill.billNo} का भुगतान मिल गया` : `❌ प्लेटफ़ॉर्म बिल #${bill.billNo} का भुगतान नहीं मिला`,
    body: ok ? null : bill.rejectReason,
    link: '/admin/platform',
  }).catch(() => {});
}

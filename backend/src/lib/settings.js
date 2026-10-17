import { prisma } from './db.js';

export const DEFAULT_SETTINGS = {
  defaultInstallmentPaise: 100000, // ₹1,000 per month (spec §4.3)
  defaultInterestMethod: 'reducing',
  defaultRateBp: 200, // 2% per month
  defaultRatePeriod: 'month',
  defaultFixedInterestPaise: 0, // monthly interest when the default method is "fixed"
  loanApplyMaxPaise: 0, // largest amount a member may apply for online (0 = no limit)
  loanApplyMaxMonths: 36,
};

export async function getSettings(db = prisma) {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in out) out[r.key] = r.value;
  return out;
}

export async function saveSettings(values, db = prisma) {
  for (const [key, value] of Object.entries(values)) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

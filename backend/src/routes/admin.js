// Admin home figures, settings, change log, backup download and practice-mode reset.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, currentEnv, testEnvAvailable } from '../lib/db.js';
import { HttpError, validate, moneyField, toBp, todayIST } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { dashboardFigures } from '../lib/ledger.js';
import { exportAll } from '../lib/backup.js';
import { maskActors } from '../lib/notify.js';
import { wipeTestData, seedTestData } from '../lib/sample.js';

export const dashboard = Router();
export const settings = Router();
export const auditLog = Router();
export const backup = Router();
export const practice = Router();

dashboard.get('/', async (_req, res) => res.json({
  ...(await dashboardFigures()),
  loanApplicationsPending: await prisma.loanApplication.count({ where: { status: 'pending' } }),
}));

// --- Settings --------------------------------------------------------------------------

settings.get('/', async (_req, res) => res.json({ settings: await getSettings(), env: currentEnv(), testEnv: testEnvAvailable() }));

settings.put('/', async (req, res) => {
  const body = validate(z.object({
    defaultInstallmentPaise: moneyField({ min: 100 }),
    defaultInterestMethod: z.enum(['reducing', 'flat', 'fixed']),
    defaultRateBp: z.any().transform((v, ctx) => {
      const bp = toBp(v);
      if (bp == null || Number.isNaN(bp) || bp > 10000) {
        ctx.addIssue({ code: 'custom', message: 'rate_invalid' });
        return z.NEVER;
      }
      return bp;
    }),
    defaultRatePeriod: z.enum(['month', 'year']),
    defaultFixedInterestPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
    loanApplyMaxPaise: moneyField({ optional: true }).transform((v) => v ?? 0),
    loanApplyMaxMonths: z.coerce.number().int().min(1, 'months_invalid').max(120, 'months_invalid'),
  }).partial(), req.body);
  const before = await getSettings();
  await prisma.$transaction(async (tx) => {
    await saveSettings(body, tx);
    await audit(req, { action: 'settings_changed', entity: 'settings', before, after: body }, tx);
  });
  res.json({ settings: await getSettings() });
});

// --- Change log ---------------------------------------------------------------------------

auditLog.get('/', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Math.max(Number(req.query.offset) || 0, 0);
  const where = req.query.memberId ? { memberId: String(req.query.memberId) } : {};
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
  ]);
  const ids = [...new Set(entries.map((e) => e.memberId).filter(Boolean))];
  const members = await prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, memberNo: true } });
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  res.json({ entries: maskActors(entries, req.user).map((e) => ({ ...e, member: byId[e.memberId] ?? null })), total });
});

// --- Backup download ----------------------------------------------------------------------

backup.get('/', async (req, res) => {
  const data = await exportAll(prisma);
  await audit(req, { action: 'backup_downloaded', entity: 'backup' });
  const name = `samiti-${currentEnv() === 'test' ? 'practice-' : ''}backup-${todayIST()}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(JSON.stringify(data, null, 1));
});

// --- Practice mode ------------------------------------------------------------------------
// Only usable while signed in to practice mode, and it only ever touches the practice database.

function assertPractice() {
  if (currentEnv() !== 'test' || !testEnvAvailable()) throw new HttpError(403, 'practice_only');
}

practice.get('/', async (_req, res) => {
  assertPractice();
  const [members, installments, loans, rows] = await Promise.all([
    prisma.member.count(), prisma.installment.count(), prisma.loan.count(), prisma.historyRow.count(),
  ]);
  res.json({ members, installments, loans, historyRows: rows });
});

practice.post('/reset', async (req, res) => {
  assertPractice();
  const body = validate(z.object({ withSamples: z.boolean().default(true) }), req.body);
  await wipeTestData();
  const result = body.withSamples ? await seedTestData() : {};
  await audit(req, { action: 'practice_reset', after: result });
  res.json({ ok: true, ...result });
});

// Platform fee billing between the developer and the samiti (developer + admin only).
//   developer: switch charging on/off (with rate per day), set the UPI id + QR, confirm or reject payments
//   admin    : see the running charge and bills, pay by QR, upload the payment screenshot
import { Router } from 'express';
import { z } from 'zod';
import { liveDb } from '../lib/db.js';
import { HttpError, validate, moneyField, reasonField, blankToNull } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { decodePhoto } from '../lib/kyc.js';
import { DEFAULT_RATE_PAISE, ensureBills, currentMonth, screenshotHash, notifyDevelopersOfBill, notifyAdminsOfBill } from '../lib/platform.js';

const router = Router();
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const isDeveloper = (req) => req.user?.staffRole === 'developer';
function requireDeveloper(req) {
  if (!isDeveloper(req)) throw new HttpError(403, 'developer_only');
}

async function payee() {
  const s = await liveDb().setting.findUnique({ where: { key: 'platformPayee' } });
  return s?.value ?? null;
}

const billView = (b) => ({
  id: b.id, billNo: b.billNo, month: b.month, year: b.year, days: b.days, amountPaise: b.amountPaise, breakdown: b.breakdown,
  status: b.status, generatedAt: b.generatedAt, utr: b.utr, hasScreenshot: Boolean(b.screenshotHash),
  submittedAt: b.submittedAt, paidAt: b.paidAt, rejectReason: b.rejectReason,
});

async function overview() {
  await ensureBills();
  const db = liveDb();
  const periods = await db.platformFeePeriod.findMany({ orderBy: { startedAt: 'asc' } });
  const open = periods.find((p) => !p.endedAt);
  const bills = await db.platformBill.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 36 });
  const unpaid = bills.filter((b) => b.status === 'due' || b.status === 'rejected');
  return {
    on: Boolean(open),
    since: open?.startedAt ?? null,
    ratePaise: open?.ratePaise ?? periods.at(-1)?.ratePaise ?? DEFAULT_RATE_PAISE,
    current: currentMonth(periods),
    periods: periods.slice(-10).reverse().map((p) => ({ startedAt: p.startedAt, endedAt: p.endedAt, ratePaise: p.ratePaise })),
    bills: bills.map(billView),
    unpaidCount: unpaid.length,
    unpaidPaise: unpaid.reduce((s, b) => s + b.amountPaise, 0),
    payee: await payee(),
  };
}

router.get('/', async (_req, res) => res.json(await overview()));

/** Developer: start or stop charging. Starting begins from this exact moment. */
router.post('/toggle', async (req, res) => {
  requireDeveloper(req);
  const body = validate(z.object({ on: z.boolean(), ratePaise: moneyField({ min: 1, max: 10_000_000, optional: true }) }), req.body);
  const db = liveDb();
  const open = await db.platformFeePeriod.findFirst({ where: { endedAt: null } });
  const now = new Date();
  if (body.on && !open) {
    const ratePaise = body.ratePaise ?? DEFAULT_RATE_PAISE;
    await db.platformFeePeriod.create({ data: { startedAt: now, ratePaise, startedById: req.user.id } });
    await audit(req, { action: 'platform_fee_on', entity: 'settings', after: { ratePaise, from: now.toISOString() } }, db);
  } else if (!body.on && open) {
    await db.platformFeePeriod.update({ where: { id: open.id }, data: { endedAt: now, endedById: req.user.id } });
    await audit(req, { action: 'platform_fee_off', entity: 'settings', after: { until: now.toISOString() } }, db);
  }
  res.json(await overview());
});

/** Developer: the UPI id + QR the samiti pays platform bills to. */
router.put('/payee', async (req, res) => {
  requireDeveloper(req);
  const body = validate(z.object({
    upiId: z.string().trim().regex(UPI_RE, 'upi_invalid'),
    payeeName: z.string().trim().min(2, 'name_required').max(100),
    qrImage: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'qr_invalid').max(1_000_000, 'qr_too_large'),
  }), req.body);
  const db = liveDb();
  await db.setting.upsert({ where: { key: 'platformPayee' }, update: { value: body }, create: { key: 'platformPayee', value: body } });
  await audit(req, { action: 'platform_payee_changed', entity: 'settings', after: { upiId: body.upiId, payeeName: body.payeeName } }, db);
  res.json(await overview());
});

/** Developer: remove the UPI id + QR (admins then see "no payment QR yet" until a new one is added). */
router.delete('/payee', async (req, res) => {
  requireDeveloper(req);
  const db = liveDb();
  const before = await payee();
  await db.setting.deleteMany({ where: { key: 'platformPayee' } });
  if (before) await audit(req, { action: 'platform_payee_removed', entity: 'settings', before: { upiId: before.upiId, payeeName: before.payeeName } }, db);
  res.json(await overview());
});

async function findBill(id) {
  const b = await liveDb().platformBill.findUnique({ where: { id } });
  if (!b) throw new HttpError(404, 'not_found');
  return b;
}

/** Admin: "I have paid" with the payment screenshot (and the UPI transaction id if they have it). */
router.post('/bills/:id/submit', async (req, res) => {
  const body = validate(z.object({ screenshot: z.string().min(100, 'screenshot_required'), utr: blankToNull(z.string().trim().regex(/^\d{12}$/, 'utr_invalid')) }), req.body);
  const b = await findBill(req.params.id);
  if (!['due', 'rejected'].includes(b.status)) throw new HttpError(400, 'bill_state');
  const shot = decodePhoto(body.screenshot);
  const hash = screenshotHash(shot.buf);
  if (await liveDb().platformBill.findFirst({ where: { screenshotHash: hash, id: { not: b.id } } })) throw new HttpError(409, 'screenshot_used');
  const u = await liveDb().platformBill.update({
    where: { id: b.id },
    data: { status: 'submitted', screenshot: shot.buf, screenshotType: shot.type, screenshotHash: hash, utr: body.utr, submittedAt: new Date(), submittedById: req.user.id, rejectReason: null },
  });
  await audit(req, { action: 'platform_bill_submitted', entity: 'platform_bill', entityId: b.id, after: { billNo: b.billNo, amountPaise: b.amountPaise, utr: body.utr } }, liveDb());
  await notifyDevelopersOfBill(u);
  res.json({ bill: billView(u) });
});

router.get('/bills/:id/screenshot', async (req, res) => {
  const b = await liveDb().platformBill.findUnique({ where: { id: req.params.id }, omit: { screenshot: false } });
  if (!b) throw new HttpError(404, 'not_found');
  if (!b.screenshot) throw new HttpError(404, 'not_found');
  res.set({ 'Content-Type': b.screenshotType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(b.screenshot));
});

/** Developer: money arrived → bill paid. */
router.post('/bills/:id/confirm', async (req, res) => {
  requireDeveloper(req);
  const b = await findBill(req.params.id);
  if (!['submitted', 'due', 'rejected'].includes(b.status)) throw new HttpError(400, 'bill_state');
  const u = await liveDb().platformBill.update({ where: { id: b.id }, data: { status: 'paid', paidAt: new Date(), confirmedById: req.user.id, rejectReason: null } });
  await audit(req, { action: 'platform_bill_paid', entity: 'platform_bill', entityId: b.id, after: { billNo: b.billNo, amountPaise: b.amountPaise } }, liveDb());
  await notifyAdminsOfBill(u, true);
  res.json({ bill: billView(u) });
});

/** Developer: payment not found → admin sees why and pays / uploads again. */
router.post('/bills/:id/reject', async (req, res) => {
  requireDeveloper(req);
  const body = validate(z.object({ reason: reasonField }), req.body);
  const b = await findBill(req.params.id);
  if (b.status !== 'submitted') throw new HttpError(400, 'bill_state');
  const u = await liveDb().platformBill.update({ where: { id: b.id }, data: { status: 'rejected', rejectReason: body.reason, confirmedById: req.user.id } });
  await audit(req, { action: 'platform_bill_rejected', entity: 'platform_bill', entityId: b.id, reason: body.reason, after: { billNo: b.billNo } }, liveDb());
  await notifyAdminsOfBill(u, false);
  res.json({ bill: billView(u) });
});

export default router;

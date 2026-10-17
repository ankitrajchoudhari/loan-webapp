// Payments.
//   member : /pay           — see dues, start a UPI or cash payment, give the UPI transaction id (UTR)
//   staff  : /payments      — confirm (money received) or reject, record cash at the counter, receipts
//   admin  : /upi-settings  — the one UPI id + QR shown to members (only an admin may change it)
//
// Plain UPI (id + QR) cannot tell a website whether money arrived, so the member uploads a screenshot
// of the payment and staff confirm it after checking the bank/UPI app. Then a receipt is printed or sent.
import { Router } from 'express';
import { z } from 'zod';
import { prisma, liveDb } from '../lib/db.js';
import { HttpError, validate, moneyField, reasonField, blankToNull } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { SUPPORT_NAME, notifyStaffWith } from '../lib/notify.js';
import { publicMember } from '../lib/ledger.js';
import { loadMemberForPay, duesOf, paymentView, nextPaymentNo, applyPayment, paidDateOf } from '../lib/payments.js';
import { decodePhoto } from '../lib/kyc.js';
import { screenshotHash, memberFeePaise } from '../lib/platform.js';

export const memberPay = Router();
export const payments = Router();
export const upiSettings = Router();
export const receipts = Router();

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

async function upiConfig() {
  const s = await prisma.setting.findUnique({ where: { key: 'upi' } });
  return s?.value ?? null;
}

async function staffNames(viewer) {
  const all = await liveDb().adminUser.findMany({ select: { id: true, name: true, role: true } });
  return new Map(all.map((s) => [s.id, s.role === 'developer' && viewer?.staffRole !== 'developer' ? { name: SUPPORT_NAME.hi, role: 'support' } : { name: s.name, role: s.role }]));
}

function requireMember(req) {
  if (req.user?.role !== 'member') throw new HttpError(403, 'forbidden');
  return req.user.id;
}

// --- Member ---------------------------------------------------------------------------------

memberPay.get('/summary', async (req, res) => {
  const member = await loadMemberForPay(prisma, requireMember(req));
  const upi = await upiConfig();
  const open = await prisma.payment.findMany({ where: { memberId: member.id, status: { in: ['initiated', 'submitted'] } }, orderBy: { createdAt: 'desc' } });
  res.json({
    member: publicMember(member),
    dues: duesOf(member),
    feePaise: await memberFeePaise(),
    upi: upi ? { upiId: upi.upiId, payeeName: upi.payeeName, qrImage: upi.qrImage } : null,
    open: open.map((p) => paymentView(p)),
  });
});

memberPay.get('/history', async (req, res) => {
  const rows = await prisma.payment.findMany({ where: { memberId: requireMember(req) }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ payments: rows.map((p) => paymentView(p)) });
});

memberPay.post('/', async (req, res) => {
  const memberId = requireMember(req);
  const body = validate(z.object({ method: z.enum(['upi', 'cash']), amountPaise: moneyField({ min: 100, max: 100_000_000 }) }), req.body);
  const member = await loadMemberForPay(prisma, memberId);
  const upi = await upiConfig();
  if (body.method === 'upi' && !upi?.upiId) throw new HttpError(400, 'upi_not_set');
  // one open request at a time keeps things simple for members and staff
  const open = await prisma.payment.findFirst({ where: { memberId, status: { in: ['initiated', 'submitted'] } } });
  if (open) throw new HttpError(409, 'payment_open', { paymentId: open.id });
  const fee = await memberFeePaise();
  const p = await prisma.payment.create({
    data: {
      paymentNo: await nextPaymentNo(prisma),
      memberId,
      method: body.method,
      // amountPaise goes to the member's dues; the fee is recorded separately and never touches the books
      amountPaise: body.amountPaise,
      feePaise: fee,
      totalPaise: body.amountPaise + fee,
      // cash waits for the admin; UPI waits for the member's screenshot
      status: body.method === 'cash' ? 'submitted' : 'initiated',
      submittedAt: body.method === 'cash' ? new Date() : null,
      upiId: body.method === 'upi' ? upi.upiId : null,
      dueSnapshot: duesOf(member),
      createdById: null,
    },
  });
  await audit(req, { action: 'payment_started', entity: 'payment', entityId: p.id, memberId, after: { paymentNo: p.paymentNo, method: p.method, totalPaise: p.totalPaise } });
  if (p.method === 'cash') {
    await notifyStaffWith('payments', { title: `💵 ${member.fullName} नकद देंगे — भुगतान #${p.paymentNo}`, body: `कुल ₹${(p.totalPaise / 100).toFixed(2)} लेकर "नकद मिला" दबाएँ और रसीद छापें।`, link: '/admin/payments' }).catch(() => {});
  }
  res.status(201).json({ payment: paymentView(p), upi: body.method === 'upi' ? { upiId: upi.upiId, payeeName: upi.payeeName } : null });
});

async function ownPayment(req) {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!p || p.memberId !== requireMember(req)) throw new HttpError(404, 'not_found');
  return p;
}

memberPay.get('/:id', async (req, res) => {
  res.json({ payment: paymentView(await ownPayment(req)) });
});

/** Member says "I have paid": screenshot of the payment (needed) and the 12-digit UPI transaction id (UTR, if they have it). */
memberPay.post('/:id/submit', async (req, res) => {
  const body = validate(z.object({
    screenshot: z.string().min(100, 'screenshot_required'),
    utr: blankToNull(z.string().trim().regex(/^\d{12}$/, 'utr_invalid')),
  }), req.body);
  const p = await ownPayment(req);
  if (p.method !== 'upi' || !['initiated', 'rejected'].includes(p.status)) throw new HttpError(400, 'payment_state');
  const shot = decodePhoto(body.screenshot);
  const hash = screenshotHash(shot.buf);
  if (body.utr && await prisma.payment.findFirst({ where: { utr: body.utr, status: { in: ['submitted', 'confirmed'] }, id: { not: p.id } } })) throw new HttpError(409, 'utr_used');
  if (await prisma.payment.findFirst({ where: { screenshotHash: hash, status: { in: ['submitted', 'confirmed'] }, id: { not: p.id } } })) throw new HttpError(409, 'screenshot_used');
  const u = await prisma.payment.update({
    where: { id: p.id },
    data: { utr: body.utr, screenshot: shot.buf, screenshotType: shot.type, screenshotHash: hash, status: 'submitted', submittedAt: new Date(), rejectReason: null },
  });
  await audit(req, { action: 'payment_submitted', entity: 'payment', entityId: p.id, memberId: p.memberId, after: { paymentNo: p.paymentNo, utr: body.utr, screenshot: true } });
  await notifyStaffWith('payments', { title: `📲 UPI भुगतान #${p.paymentNo} जाँचें`, body: `₹${(p.totalPaise / 100).toFixed(2)}${body.utr ? ` · UTR ${body.utr}` : ''} — स्क्रीनशॉट और बैंक/UPI ऐप देखकर पक्का करें।`, link: '/admin/payments' }).catch(() => {});
  res.json({ payment: paymentView(u) });
});

memberPay.post('/:id/cancel', async (req, res) => {
  const p = await ownPayment(req);
  if (!['initiated', 'submitted'].includes(p.status)) throw new HttpError(400, 'payment_state');
  const u = await prisma.payment.update({ where: { id: p.id }, data: { status: 'cancelled' } });
  res.json({ payment: paymentView(u) });
});

// --- Staff ----------------------------------------------------------------------------------

payments.get('/', async (req, res) => {
  const status = ['initiated', 'submitted', 'confirmed', 'rejected', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  const rows = await prisma.payment.findMany({
    where: { ...(status ? { status } : {}), ...(req.query.memberId ? { memberId: String(req.query.memberId) } : {}) },
    include: { member: true },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
  const names = await staffNames(req.user);
  const counts = await prisma.payment.groupBy({ by: ['status'], _count: true });
  const unprinted = await prisma.payment.count({ where: { status: 'confirmed', receiptPrintedAt: null } });
  res.json({
    payments: rows.map((p) => paymentView(p, { names })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    unprinted,
  });
});

/** Dues for one member (counter screen). */
payments.get('/due/:memberId', async (req, res) => {
  const member = await loadMemberForPay(prisma, req.params.memberId);
  res.json({ member: publicMember(member), dues: duesOf(member), feePaise: await memberFeePaise() });
});

/** Applies a payment to dues. `req.user` is the confirming staff member. */
export async function confirmPayment(req, p) {
  const result = await prisma.$transaction(async (tx) => {
    // lock the row: two confirmations at once (e.g. a double-click) apply only once
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${p.id}::uuid FOR UPDATE`;
    const fresh = await tx.payment.findUnique({ where: { id: p.id } });
    if (fresh.status !== 'submitted' && fresh.status !== 'initiated') throw new HttpError(400, 'payment_state');
    const allocation = await applyPayment(tx, req, fresh, paidDateOf(fresh));
    const u = await tx.payment.update({
      where: { id: p.id },
      data: { status: 'confirmed', confirmedById: req.user?.role === 'admin' ? req.user.id : null, confirmedAt: new Date(), allocation },
      include: { member: true },
    });
    await audit(req, { action: 'payment_confirmed', entity: 'payment', entityId: p.id, memberId: p.memberId, after: { paymentNo: p.paymentNo, method: p.method, amountPaise: p.amountPaise, feePaise: p.feePaise, utr: p.utr, allocation } }, tx);
    return u;
  }, { timeout: 30000 });
  return result;
}

/** Money received (UPI seen in the bank / cash in hand) → apply it to dues. */
payments.post('/:id/confirm', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!p) throw new HttpError(404, 'not_found');
  if (p.method === 'upi' && p.status !== 'submitted') throw new HttpError(400, 'payment_state');
  const u = await confirmPayment(req, p);
  res.json({ payment: paymentView(u, { names: await staffNames(req.user) }) });
});

/** Not received → member sees "payment failed, try again or pay cash". */
payments.post('/:id/reject', async (req, res) => {
  const body = validate(z.object({ reason: reasonField }), req.body);
  const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!p || !['initiated', 'submitted'].includes(p.status)) throw new HttpError(400, 'payment_state');
  const u = await prisma.payment.update({ where: { id: p.id }, data: { status: 'rejected', rejectReason: body.reason, confirmedById: req.user.id, confirmedAt: new Date() } });
  await audit(req, { action: 'payment_rejected', entity: 'payment', entityId: p.id, memberId: p.memberId, reason: body.reason, after: { paymentNo: p.paymentNo } });
  res.json({ payment: paymentView(u) });
});

/** Cash taken at the counter: record and confirm in one step; a receipt must then be printed. */
payments.post('/cash', async (req, res) => {
  const body = validate(z.object({ memberId: z.string().uuid('member_required'), amountPaise: moneyField({ min: 100, max: 100_000_000 }), note: blankToNull(z.string().max(300)) }), req.body);
  const member = await loadMemberForPay(prisma, body.memberId);
  const fee = await memberFeePaise();
  const p = await prisma.payment.create({
    data: {
      paymentNo: await nextPaymentNo(prisma), memberId: member.id, method: 'cash', amountPaise: body.amountPaise, feePaise: fee,
      totalPaise: body.amountPaise + fee, status: 'submitted', submittedAt: new Date(), dueSnapshot: duesOf(member), createdById: req.user.id,
    },
  });
  const u = await confirmPayment(req, p);
  res.status(201).json({ payment: paymentView(u, { names: await staffNames(req.user) }) });
});

payments.post('/:id/printed', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'confirmed') throw new HttpError(400, 'payment_state');
  if (!p.receiptPrintedAt) await prisma.payment.update({ where: { id: p.id }, data: { receiptPrintedAt: new Date() } });
  res.json({ ok: true });
});

// --- Receipts (member: own; staff: any) ---------------------------------------------------------

receipts.get('/:id', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { member: true } });
  if (!p) throw new HttpError(404, 'not_found');
  if (req.user.role === 'member' && p.memberId !== req.user.id) throw new HttpError(404, 'not_found');
  if (p.status !== 'confirmed') throw new HttpError(400, 'payment_state');
  res.json({ payment: paymentView(p, { names: await staffNames(req.user) }) });
});

/** The member's payment screenshot: the member themselves, or staff. */
receipts.get('/:id/screenshot', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id }, omit: { screenshot: false } });
  if (!p || !p.screenshot || (req.user.role === 'member' && p.memberId !== req.user.id)) throw new HttpError(404, 'not_found');
  res.set({ 'Content-Type': p.screenshotType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.from(p.screenshot));
});

// --- UPI settings (one UPI id + QR; only an admin may change it) ------------------------------------

upiSettings.get('/', async (req, res) => {
  const upi = await upiConfig();
  res.json({ upi, canEdit: req.user.staffRole === 'admin' });
});

upiSettings.put('/', async (req, res) => {
  if (req.user.staffRole !== 'admin') throw new HttpError(403, 'upi_admin_only');
  const body = validate(z.object({
    upiId: z.string().trim().regex(UPI_RE, 'upi_invalid'),
    payeeName: z.string().trim().min(2, 'name_required').max(100),
    qrImage: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'qr_invalid').max(1_000_000, 'qr_too_large'),
  }), req.body);
  const before = await upiConfig();
  const value = { ...body, setBy: { id: req.user.id, name: req.user.name, role: req.user.staffRole }, setAt: new Date().toISOString() };
  await prisma.$transaction(async (tx) => {
    await saveSettings({ upi: value }, tx);
    await audit(req, { action: 'upi_changed', entity: 'settings', before: before ? { upiId: before.upiId, payeeName: before.payeeName } : null, after: { upiId: body.upiId, payeeName: body.payeeName } }, tx);
  });
  res.json({ upi: value });
});

export { getSettings };

// Support: admins / sub-admins raise tickets; the developer answers and marks them done.
// The developer's name is never shown to admins — replies appear as "सहायता टीम".
import { Router } from 'express';
import { z } from 'zod';
import { liveDb } from '../lib/db.js';
import { HttpError, validate, blankToNull } from '../lib/util.js';
import { notify, notifyDevelopers, SUPPORT_NAME } from '../lib/notify.js';

export const support = Router(); // all staff
export const notifications = Router(); // all staff

const isDev = (req) => req.user.staffRole === 'developer';

async function ticketView(t, req, names) {
  const creator = names.get(t.createdById);
  return {
    ...t,
    createdBy: creator ? { name: creator.name, role: creator.role } : null,
    messages: (Array.isArray(t.messages) ? t.messages : []).map((m) => ({
      ...m,
      name: m.by === 'support' ? (isDev(req) ? names.get(m.staffId)?.name ?? SUPPORT_NAME.hi : SUPPORT_NAME.hi) : names.get(m.staffId)?.name ?? '—',
      staffId: m.by === 'support' && !isDev(req) ? undefined : m.staffId,
    })),
  };
}

async function staffNames() {
  const all = await liveDb().adminUser.findMany({ select: { id: true, name: true, role: true } });
  return new Map(all.map((s) => [s.id, s]));
}

async function getTicket(req) {
  const t = await liveDb().supportTicket.findUnique({ where: { id: req.params.id } });
  if (!t) throw new HttpError(404, 'not_found');
  // sub-admins see their own tickets; admins see all admin/sub-admin tickets; developer sees all
  if (req.user.staffRole === 'subadmin' && t.createdById !== req.user.id) throw new HttpError(403, 'forbidden');
  return t;
}

support.get('/tickets', async (req, res) => {
  const where = {
    ...(req.user.staffRole === 'subadmin' ? { createdById: req.user.id } : {}),
    ...(['open', 'resolved'].includes(req.query.status) ? { status: req.query.status } : {}),
  };
  const rows = await liveDb().supportTicket.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
  const names = await staffNames();
  res.json({ tickets: await Promise.all(rows.map((t) => ticketView(t, req, names))) });
});

support.post('/tickets', async (req, res) => {
  if (isDev(req)) throw new HttpError(400, 'bad_request');
  const body = validate(z.object({
    subject: z.string().trim().min(3, 'subject_required').max(200),
    details: z.string().trim().min(3, 'details_required').max(4000),
    page: blankToNull(z.string().trim().max(200)),
    errorCode: blankToNull(z.string().trim().max(60)),
  }), req.body);
  const db = liveDb();
  const top = await db.supportTicket.aggregate({ _max: { ticketNo: true } });
  const t = await db.supportTicket.create({
    data: { ...body, ticketNo: (top._max.ticketNo ?? 0) + 1, createdById: req.user.id, messages: [{ by: 'staff', staffId: req.user.id, text: body.details, at: new Date() }] },
  });
  await notifyDevelopers({
    title: `🎫 नई शिकायत #${t.ticketNo}: ${t.subject}`,
    body: `${req.user.name} (${req.user.staffRole}): ${body.details.slice(0, 300)}`,
    link: '/admin/support',
  });
  res.status(201).json({ ticket: t });
});

support.post('/tickets/:id/messages', async (req, res) => {
  const body = validate(z.object({ text: z.string().trim().min(1, 'details_required').max(4000) }), req.body);
  const t = await getTicket(req);
  const by = isDev(req) ? 'support' : 'staff';
  const messages = [...(Array.isArray(t.messages) ? t.messages : []), { by, staffId: req.user.id, text: body.text, at: new Date() }];
  const u = await liveDb().supportTicket.update({ where: { id: t.id }, data: { messages, ...(by === 'staff' && t.status === 'resolved' ? { status: 'open', resolvedAt: null } : {}) } });
  if (by === 'support') {
    await notify([t.createdById], { title: `💬 शिकायत #${t.ticketNo} पर सहायता टीम का जवाब`, body: body.text.slice(0, 300), link: '/admin/support' });
  } else {
    await notifyDevelopers({ title: `💬 शिकायत #${t.ticketNo} पर नया संदेश`, body: `${req.user.name}: ${body.text.slice(0, 300)}`, link: '/admin/support' });
  }
  res.json({ ticket: u });
});

support.post('/tickets/:id/resolve', async (req, res) => {
  if (!isDev(req)) throw new HttpError(403, 'forbidden');
  const body = validate(z.object({ note: z.string().trim().max(4000).optional() }), req.body);
  const t = await getTicket(req);
  const messages = [...(Array.isArray(t.messages) ? t.messages : []), ...(body.note ? [{ by: 'support', staffId: req.user.id, text: body.note, at: new Date() }] : [])];
  const u = await liveDb().supportTicket.update({ where: { id: t.id }, data: { status: 'resolved', resolvedAt: new Date(), messages } });
  await notify([t.createdById], { title: `✅ शिकायत #${t.ticketNo} ठीक कर दी गई`, body: body.note?.slice(0, 300) ?? t.subject, link: '/admin/support' });
  res.json({ ticket: u });
});

// --- Notifications (bell) ---------------------------------------------------------------

notifications.get('/', async (req, res) => {
  const db = liveDb();
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { recipientId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.notification.count({ where: { recipientId: req.user.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});

notifications.post('/read', async (req, res) => {
  await liveDb().notification.updateMany({ where: { recipientId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

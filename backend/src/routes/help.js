// Login help: a person who can't log in asks the admin or the developer for help — no login needed.
//   public : POST /help (send), GET /help/:id?token= (follow: open → seen → fixed)
//   staff  : /help-requests — admin sees requests sent to the admin, the developer sees all; mark seen / fixed
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { liveDb, client, testEnvAvailable } from '../lib/db.js';
import { HttpError, validate, blankToNull } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { notify, developerIds } from '../lib/notify.js';

export const helpPublic = Router();
export const helpStaff = Router();

const PROBLEMS = ['not_registered', 'wrong_dob', 'locked', 'forgot_code', 'other'];
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const publicView = (h) => ({
  id: h.id, requestNo: h.requestNo, sendTo: h.sendTo, problem: h.problem, status: h.status,
  createdAt: h.createdAt, seenAt: h.seenAt, fixedAt: h.fixedAt, reply: h.reply,
});

async function adminIds() {
  const rows = await liveDb().adminUser.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
  return rows.map((r) => r.id);
}

// a handful of requests per address per half hour is plenty for a real problem
const sendLimit = rateLimit({
  windowMs: 30 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.mobile ?? '')}`, // behind the website's proxy many people share one address
  message: { error: { code: 'too_many_requests' } },
});

helpPublic.post('/', sendLimit, async (req, res) => {
  const body = validate(z.object({
    mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'mobile_invalid'),
    name: blankToNull(z.string().trim().max(100)),
    problem: z.enum(PROBLEMS, { message: 'problem_required' }),
    message: blankToNull(z.string().trim().max(1000)),
    sendTo: z.enum(['admin', 'developer'], { message: 'send_to_required' }),
    env: z.enum(['live', 'test']).optional(),
  }), req.body);
  const env = body.env === 'test' && testEnvAvailable() ? 'test' : 'live';
  const db = liveDb();
  // at most one open request per number: a second "send" just updates it
  const open = await db.helpRequest.findFirst({ where: { mobile: body.mobile, status: { in: ['open', 'seen'] } } });
  const member = await client(env).member.findUnique({ where: { mobileNumber: body.mobile }, select: { id: true, fullName: true, memberNo: true } });
  const token = crypto.randomBytes(24).toString('hex');
  const data = { name: body.name ?? member?.fullName ?? null, memberId: member?.id ?? null, env, problem: body.problem, message: body.message, sendTo: body.sendTo, tokenHash: hash(token), status: 'open', seenAt: null, seenById: null };
  let h;
  if (open) {
    h = await db.helpRequest.update({ where: { id: open.id }, data });
  } else {
    const top = await db.helpRequest.aggregate({ _max: { requestNo: true } });
    h = await db.helpRequest.create({ data: { ...data, mobile: body.mobile, requestNo: (top._max.requestNo ?? 0) + 1 } });
  }
  const who = data.name ? `${data.name} (${body.mobile})` : body.mobile;
  const msg = { title: `🆘 लॉगिन में दिक्कत #${h.requestNo} — ${who}`, body: body.message ?? null, link: '/admin/login-help' };
  const to = body.sendTo === 'developer' ? await developerIds() : await adminIds();
  await notify(to, msg, { push: body.sendTo === 'developer' }).catch(() => {});
  res.status(201).json({ request: publicView(h), token });
});

helpPublic.get('/:id', async (req, res) => {
  const h = await liveDb().helpRequest.findUnique({ where: { id: String(req.params.id) } }).catch(() => null);
  if (!h || h.tokenHash !== hash(req.query.token ?? '')) throw new HttpError(404, 'not_found');
  res.json({ request: publicView(h) });
});

// --- Staff (developer / admin) ---------------------------------------------------------------------

const scope = (req) => (req.user.staffRole === 'developer' ? {} : { sendTo: 'admin' });

helpStaff.get('/', async (req, res) => {
  const status = ['open', 'seen', 'fixed'].includes(req.query.status) ? req.query.status : undefined;
  const where = { ...scope(req), ...(status ? { status } : req.query.active ? { status: { in: ['open', 'seen'] } } : {}) };
  const db = liveDb();
  const rows = await db.helpRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  const active = await db.helpRequest.count({ where: { ...scope(req), status: { in: ['open', 'seen'] } } });
  res.json({ requests: rows.map((h) => ({ ...publicView(h), mobile: h.mobile, name: h.name, memberId: h.memberId, env: h.env, message: h.message })), active });
});

async function mine(req) {
  const h = await liveDb().helpRequest.findUnique({ where: { id: req.params.id } });
  if (!h || (req.user.staffRole !== 'developer' && h.sendTo !== 'admin')) throw new HttpError(404, 'not_found');
  return h;
}

/** "Working on it" — the person sees that someone has picked it up. */
helpStaff.post('/:id/seen', async (req, res) => {
  const h = await mine(req);
  const u = h.status === 'open' ? await liveDb().helpRequest.update({ where: { id: h.id }, data: { status: 'seen', seenAt: new Date(), seenById: req.user.id } }) : h;
  res.json({ request: publicView(u) });
});

/** Fixed — with an optional note for the person ("date of birth corrected, try again"). */
helpStaff.post('/:id/fixed', async (req, res) => {
  const body = validate(z.object({ reply: blankToNull(z.string().trim().max(500)) }), req.body);
  const h = await mine(req);
  const u = await liveDb().helpRequest.update({
    where: { id: h.id },
    data: { status: 'fixed', fixedAt: new Date(), fixedById: req.user.id, reply: body.reply, seenAt: h.seenAt ?? new Date(), seenById: h.seenById ?? req.user.id },
  });
  await audit(req, { action: 'login_help_fixed', entity: 'help_request', entityId: h.id, memberId: h.memberId, reason: body.reply, after: { requestNo: h.requestNo, mobile: h.mobile } }, liveDb());
  res.json({ request: publicView(u) });
});

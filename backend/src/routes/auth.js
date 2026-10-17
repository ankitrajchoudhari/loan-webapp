// One login screen for everyone. Step 1: mobile number → we tell the screen what to ask.
// Step 2: member / sub-admin: date of birth. Admin / developer: date of birth OR Gmail, then secret code.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma, liveDb, testEnvAvailable, currentEnv } from '../lib/db.js';
import { HttpError, validate, dateField, iso, parseDate } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { verifyFirebaseToken, firebaseProjectId } from '../lib/firebase.js';
import { staffPublic } from '../lib/staff.js';
import { memberFeePaise } from '../lib/platform.js';
import { issueSession, clearSession, requireLogin } from '../middleware/auth.js';

const router = Router();

const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'mobile_invalid');
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
function secretCodeOk(given) {
  const expected = process.env.ADMIN_SECRET_CODE;
  if (!expected) throw new HttpError(503, 'secret_code_not_set');
  return crypto.timingSafeEqual(sha(given ?? ''), sha(expected));
}

// wrong tries for numbers that match nobody (kept in memory)
const strangers = new Map();
function strangerAttempt(key) {
  const s = strangers.get(key) ?? { n: 0 };
  if (s.until > Date.now()) throw new HttpError(429, 'locked');
  s.n += 1;
  if (s.n >= MAX_ATTEMPTS) Object.assign(s, { n: 0, until: Date.now() + LOCK_MS });
  strangers.set(key, s);
}
async function lockCheck(row) {
  if (row?.lockedUntil && row.lockedUntil > new Date()) throw new HttpError(429, 'locked');
}
async function recordFail(model, row) {
  const fails = row.failedLogins + 1;
  await model.update({
    where: { id: row.id },
    data: fails >= MAX_ATTEMPTS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails },
  });
}
const sameDay = (stored, given) => {
  try {
    return Boolean(stored) && iso(stored) === iso(parseDate(given));
  } catch {
    return false;
  }
};

const findStaff = (m) => liveDb().adminUser.findFirst({ where: { mobileNumber: m, status: 'active' } });

router.get('/config', async (_req, res) => {
  res.json({ testEnv: testEnvAvailable(), firebase: Boolean(firebaseProjectId()), memberFeePaise: await memberFeePaise() });
});

/**
 * Step 1. Says whose number it is and shows the name the admin entered, so the person can see it is
 * their account before logging in (the samiti chose this over hiding who is a member).
 * Unknown numbers get found: false. The /auth rate limit keeps anyone from trying many numbers quickly.
 */
router.post('/identify', async (req, res) => {
  const body = validate(z.object({ mobile }), req.body);
  const staff = await findStaff(body.mobile);
  if (!staff) {
    const m = await prisma.member.findUnique({ where: { mobileNumber: body.mobile }, select: { fullName: true, memberNo: true, status: true } });
    const found = Boolean(m && m.status === 'active');
    return res.json({ kind: 'member', methods: ['dob'], needsCode: false, found, name: found ? m.fullName : null, memberNo: found ? m.memberNo : null });
  }
  if (staff.role === 'subadmin') return res.json({ kind: 'subadmin', methods: ['dob'], needsCode: false, found: true, name: staff.name });
  const methods = ['dob', ...(staff.email && firebaseProjectId() ? ['google'] : [])];
  res.json({ kind: staff.role, methods, needsCode: true, found: true, name: staff.name });
});

/** Step 2. */
router.post('/login', async (req, res) => {
  const body = validate(z.object({
    mobile,
    method: z.enum(['dob', 'google']).default('dob'),
    dateOfBirth: dateField('dob_invalid').optional(),
    idToken: z.string().optional(),
    code: z.string().trim().max(20).optional(),
  }), req.body);
  const env = currentEnv();
  const staff = await findStaff(body.mobile);

  if (staff) {
    const db = liveDb();
    await lockCheck(staff);
    let ok;
    if (body.method === 'google') {
      if (staff.role === 'subadmin') throw new HttpError(400, 'bad_request');
      const who = await verifyFirebaseToken(body.idToken);
      ok = Boolean(staff.email) && who.email === staff.email.toLowerCase();
      if (ok && !staff.firebaseUid) await db.adminUser.update({ where: { id: staff.id }, data: { firebaseUid: who.uid } });
      if (!ok) {
        await recordFail(db.adminUser, staff);
        throw new HttpError(401, 'gmail_mismatch');
      }
    } else {
      ok = sameDay(staff.dateOfBirth, body.dateOfBirth);
    }
    if (ok && staff.role !== 'subadmin') ok = secretCodeOk(body.code);
    if (!ok) {
      await recordFail(db.adminUser, staff);
      throw new HttpError(401, staff.role === 'subadmin' ? 'member_login_wrong' : 'admin_login_wrong');
    }
    await db.adminUser.update({ where: { id: staff.id }, data: { failedLogins: 0, lockedUntil: null, lastLogin: new Date() } });
    req.user = { id: staff.id, role: 'admin', staffRole: staff.role, name: staff.name };
    await audit(req, { action: 'admin_login', entity: 'admin', entityId: staff.id, after: { via: body.method, env } });
    const token = issueSession(res, { role: 'admin', id: staff.id, name: staff.name, env });
    return res.json({ role: 'admin', env, token, user: { ...staffPublic(staff), staffRole: staff.role } });
  }

  // member: mobile + date of birth, as entered by the admin
  const member = await prisma.member.findUnique({ where: { mobileNumber: body.mobile } });
  if (!member || member.status !== 'active' || !member.dateOfBirth) {
    strangerAttempt(`m:${env}:${body.mobile}`);
    throw new HttpError(401, 'member_login_wrong');
  }
  await lockCheck(member);
  if (!sameDay(member.dateOfBirth, body.dateOfBirth)) {
    await recordFail(prisma.member, member);
    throw new HttpError(401, 'member_login_wrong');
  }
  await prisma.member.update({ where: { id: member.id }, data: { failedLogins: 0, lockedUntil: null } });
  const token = issueSession(res, { role: 'member', id: member.id, name: member.fullName, env });
  res.json({ role: 'member', env, token, user: { id: member.id, fullName: member.fullName, memberNo: member.memberNo } });
});

router.post('/logout', async (req, res) => {
  if (req.user) {
    await liveDb().revokedToken.upsert({
      where: { jti: req.user.jti },
      update: {},
      create: { jti: req.user.jti, expiresAt: new Date(req.user.exp * 1000) },
    });
    await liveDb().revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireLogin, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json({ role: 'admin', env: req.user.env, user: { id: req.user.id, name: req.user.name, staffRole: req.user.staffRole, permissions: req.user.perms } });
  }
  const m = await prisma.member.findUnique({ where: { id: req.user.id } });
  res.json({ role: 'member', env: req.user.env, user: { id: m.id, fullName: m.fullName, memberNo: m.memberNo } });
});

export default router;

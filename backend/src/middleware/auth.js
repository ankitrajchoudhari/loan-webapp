// Sessions are signed JWTs in an httpOnly cookie (never readable by page scripts).
// The token carries the role and the environment (live / test); every request then runs
// against that environment's database, so a practice session can never touch live records.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { liveDb, runInEnv, prisma, testEnvAvailable } from '../lib/db.js';
import { HttpError } from '../lib/util.js';
import { can, isManager } from '../lib/staff.js';

export const COOKIE = 'samiti_session';
const TTL_SECONDS = { member: 12 * 3600, admin: 8 * 3600 };

const SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (16+ chars)');
  return s;
};

export function issueSession(res, { role, id, name, env }) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ role, env, name, jti }, SECRET(), { subject: id, expiresIn: TTL_SECONDS[role] });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS[role] * 1000,
    path: '/',
  });
  return token;
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Environment for unauthenticated calls (login screens): ?env=test or body.env. */
export function requestedEnv(req) {
  const env = req.body?.env ?? req.query?.env;
  if (env === 'test') {
    if (!testEnvAvailable()) throw new HttpError(400, 'test_env_off');
    return 'test';
  }
  return 'live';
}

/** Verifies the session cookie (if any) and runs the rest of the request in its environment. */
export async function session(req, _res, next) {
  // cookie first; a Bearer header is accepted too (for embedded browsers that drop cookies)
  const header = req.headers.authorization || '';
  const token = readCookie(req, COOKIE) || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return runInEnv(requestedEnv(req), next);
  let payload;
  try {
    payload = jwt.verify(token, SECRET());
  } catch {
    return runInEnv(requestedEnv(req), next);
  }
  if (await liveDb().revokedToken.findUnique({ where: { jti: payload.jti } })) return runInEnv(requestedEnv(req), next);
  const env = payload.env === 'test' && testEnvAvailable() ? 'test' : 'live';
  req.user = { id: payload.sub, role: payload.role, name: payload.name, env, jti: payload.jti, exp: payload.exp };
  return runInEnv(env, next);
}

export async function requireLogin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'unauthorized');
  if (req.user.role === 'member') {
    const m = await prisma.member.findUnique({ where: { id: req.user.id }, select: { status: true } });
    if (!m || m.status !== 'active') throw new HttpError(401, 'account_inactive');
  } else if (req.user.role === 'admin') {
    const a = await liveDb().adminUser.findUnique({ where: { id: req.user.id }, select: { id: true, role: true, permissions: true, status: true, name: true } });
    if (!a || a.status !== 'active') throw new HttpError(401, 'account_inactive');
    req.user.staffRole = a.role;
    req.user.perms = Array.isArray(a.permissions) ? a.permissions : [];
    req.user.name = a.name;
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'forbidden');
  next();
}

/** Work-area check: developer/admin always; sub-admin only for the areas given to them. */
export const requirePerm = (perm, { readOpen = false } = {}) => (req, _res, next) => {
  if (readOpen && req.method === 'GET') return next();
  if (!can(req.user, perm)) throw new HttpError(403, 'forbidden');
  next();
};

/** Developer or admin only (settings, backup, team, change log). */
export function requireManager(req, _res, next) {
  if (!isManager(req.user)) throw new HttpError(403, 'forbidden');
  next();
}

/** A member may only see their own records; admins may see anyone's. Enforced on the server. */
export function assertSelfOrAdmin(req, memberId) {
  if (req.user?.role === 'admin') return;
  if (req.user?.role === 'member' && req.user.id === memberId) return;
  throw new HttpError(403, 'forbidden');
}

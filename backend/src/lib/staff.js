// Staff roles:
//   developer — everything, including adding admins; sees every action by everyone
//   admin     — all samiti work, settings, adds sub-admins and gives them work areas
//   subadmin  — only the work areas the admin/developer ticked for them
import { liveDb } from './db.js';
import { parseDate, iso } from './util.js';

export const ROLES = ['developer', 'admin', 'subadmin'];
export const PERMS = ['members', 'installments', 'loans', 'payments', 'history', 'reports'];

/** Can this logged-in staff user do work in this area? */
export function can(user, perm) {
  if (user?.role !== 'admin') return false; // session role for all staff is "admin"
  if (user.staffRole === 'developer' || user.staffRole === 'admin') return true;
  return Array.isArray(user.perms) && user.perms.includes(perm);
}

export const isManager = (user) => user?.staffRole === 'developer' || user?.staffRole === 'admin';

/** Which roles may this user add or change? */
export function manageableRoles(user) {
  if (user?.staffRole === 'developer') return ['admin', 'subadmin'];
  if (user?.staffRole === 'admin') return ['subadmin'];
  return [];
}

export function staffPublic(s) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    mobileNumber: s.mobileNumber,
    email: s.email,
    dateOfBirth: iso(s.dateOfBirth),
    permissions: Array.isArray(s.permissions) ? s.permissions : [],
    duty: s.duty ?? null,
    status: s.status,
    lastLogin: s.lastLogin,
    createdAt: s.createdAt,
  };
}

/** Makes sure the developer account from .env exists (live database). */
export async function ensureDeveloper() {
  const mobile = process.env.DEVELOPER_MOBILE;
  const dob = process.env.DEVELOPER_DOB;
  if (!/^[6-9]\d{9}$/.test(mobile || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return null;
  const db = liveDb();
  const email = process.env.DEVELOPER_EMAIL?.trim().toLowerCase() || null;
  const data = { name: process.env.DEVELOPER_NAME || 'Developer', role: 'developer', dateOfBirth: parseDate(dob), status: 'active', ...(email ? { email } : {}) };
  return db.adminUser.upsert({ where: { mobileNumber: mobile }, update: data, create: { ...data, mobileNumber: mobile } });
}

// Team (staff) management. Developer adds/changes admins and sub-admins; admin adds/changes sub-admins
// and gives them work areas. Staff always live in the live database (also used by practice mode).
import { Router } from 'express';
import { z } from 'zod';
import { liveDb } from '../lib/db.js';
import { HttpError, validate, dateField, parseDate, blankToNull, isFutureDate } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { PERMS, manageableRoles, staffPublic } from '../lib/staff.js';

const router = Router(); // mounted behind requireManager

const fields = {
  name: z.string().trim().min(2, 'name_required').max(100),
  mobileNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'mobile_invalid'),
  dateOfBirth: dateField('dob_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  email: blankToNull(z.string().trim().toLowerCase().email('email_invalid').max(200)),
  role: z.enum(['admin', 'subadmin']),
  permissions: z.array(z.enum(PERMS)).default([]),
  duty: blankToNull(z.string().trim().max(1000)),
};

function assertCanManage(req, role) {
  if (!manageableRoles(req.user).includes(role)) throw new HttpError(403, 'staff_not_allowed');
}

async function assertUnique(db, { mobileNumber, email }, exceptId) {
  if (mobileNumber) {
    const c = await db.adminUser.findUnique({ where: { mobileNumber } });
    if (c && c.id !== exceptId) throw new HttpError(409, 'mobile_exists');
  }
  if (email) {
    const c = await db.adminUser.findUnique({ where: { email } });
    if (c && c.id !== exceptId) throw new HttpError(409, 'email_exists');
  }
}

const toData = (b) => ({
  ...b,
  ...(b.dateOfBirth ? { dateOfBirth: parseDate(b.dateOfBirth) } : {}),
  ...(b.role === 'admin' ? { permissions: [] } : {}),
});

router.get('/', async (req, res) => {
  const all = await liveDb().adminUser.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  // the developer sees everyone; an admin sees admins and sub-admins (not the developer)
  const visible = req.user.staffRole === 'developer' ? all : all.filter((s) => s.role !== 'developer');
  res.json({ staff: visible.map(staffPublic), canManage: manageableRoles(req.user), perms: PERMS });
});

router.post('/', async (req, res) => {
  const body = validate(z.object(fields), req.body);
  assertCanManage(req, body.role);
  const db = liveDb();
  await assertUnique(db, body);
  const s = await db.adminUser.create({ data: { ...toData(body), createdById: req.user.id } });
  await audit(req, { action: 'staff_added', entity: 'admin', entityId: s.id, after: staffPublic(s) });
  res.status(201).json({ staff: staffPublic(s) });
});

router.put('/:id', async (req, res) => {
  const body = validate(z.object(fields).partial(), req.body);
  const db = liveDb();
  const before = await db.adminUser.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'not_found');
  assertCanManage(req, before.role);
  if (body.role) assertCanManage(req, body.role);
  await assertUnique(db, body, before.id);
  const s = await db.adminUser.update({ where: { id: before.id }, data: toData(body) });
  await audit(req, { action: 'staff_changed', entity: 'admin', entityId: s.id, before: staffPublic(before), after: staffPublic(s) });
  res.json({ staff: staffPublic(s) });
});

/** Clears a login lock (5 wrong tries) at once instead of waiting 15 minutes. */
router.post('/:id/unlock', async (req, res) => {
  const db = liveDb();
  const s = await db.adminUser.findUnique({ where: { id: req.params.id } });
  if (!s) throw new HttpError(404, 'not_found');
  await db.adminUser.update({ where: { id: s.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit(req, { action: 'login_unlocked', entity: 'admin', entityId: s.id, after: { name: s.name } });
  res.json({ ok: true });
});

router.post('/:id/status', async (req, res) => {
  const body = validate(z.object({ status: z.enum(['active', 'inactive']) }), req.body);
  const db = liveDb();
  const before = await db.adminUser.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'not_found');
  assertCanManage(req, before.role);
  if (before.id === req.user.id) throw new HttpError(400, 'staff_self');
  const s = await db.adminUser.update({ where: { id: before.id }, data: { status: body.status } });
  await audit(req, { action: body.status === 'active' ? 'staff_activated' : 'staff_deactivated', entity: 'admin', entityId: s.id, after: { name: s.name, role: s.role } });
  res.json({ staff: staffPublic(s) });
});

export default router;

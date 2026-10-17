import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, validate, parseDate, dateField, moneyField, blankToNull, reasonField, isFutureDate, todayIST, currentMonthYear } from '../lib/util.js';
import { audit, changes } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { publicMember, loadMembers, loadMember, installmentView, installmentArrears, loanPositions } from '../lib/ledger.js';
import { requireAdmin, assertSelfOrAdmin } from '../middleware/auth.js';
import { maskActors } from '../lib/notify.js';
import { exportAll } from '../lib/backup.js';

const router = Router();

const memberNo = z.coerce.number().int('member_no_invalid').min(1, 'member_no_invalid').max(999999, 'member_no_invalid');
const fields = {
  memberNo,
  fullName: z.string().trim().min(2, 'name_required').max(100, 'name_required'),
  mobileNumber: z.string().trim().regex(/^[6-9]\d{9}$/, 'mobile_invalid'),
  joinDate: dateField('join_date_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  monthlyInstallmentPaise: moneyField({ min: 100 }),
  dateOfBirth: dateField('dob_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  note: blankToNull(z.string().trim().max(500)),
};

const createSchema = z.object({ ...fields, memberNo: memberNo.optional().or(z.literal('').transform(() => undefined)), monthlyInstallmentPaise: moneyField({ min: 100, optional: true }) });
const updateSchema = z.object({ ...fields, reason: blankToNull(z.string().trim().max(500)) }).partial();

async function nextMemberNo() {
  const top = await prisma.member.aggregate({ _max: { memberNo: true } });
  return (top._max.memberNo ?? 0) + 1;
}

async function assertUnique({ memberNo: no, mobileNumber }, exceptId) {
  if (no != null) {
    const clash = await prisma.member.findUnique({ where: { memberNo: no } });
    if (clash && clash.id !== exceptId) throw new HttpError(409, 'member_no_exists');
  }
  if (mobileNumber) {
    const clash = await prisma.member.findUnique({ where: { mobileNumber } });
    if (clash && clash.id !== exceptId) throw new HttpError(409, 'mobile_exists');
    const deleted = await prisma.deletedMobile.findUnique({ where: { mobileHash: mobileHash(mobileNumber) } });
    if (deleted && deleted.availableAt > new Date()) {
      throw new HttpError(409, 'mobile_recently_deleted', { date: deleted.availableAt.toISOString().slice(0, 10) });
    }
  }
}

const DELETE_COOLDOWN_DAYS = 7;
const mobileHash = (mobile) => crypto.createHash('sha256').update(`samiti-member:${mobile}`).digest('hex');

router.get('/', requireAdmin, async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : undefined;
  const { month, year } = currentMonthYear();
  const members = await loadMembers(status ? { status } : {});
  const list = members
    .filter((m) => !q || m.fullName.toLowerCase().includes(q) || m.mobileNumber.includes(q) || String(m.memberNo) === q)
    .map((m) => {
      const loans = loanPositions(m, month, year);
      return {
        ...publicMember(m),
        thisMonth: installmentView(m, month, year).status,
        arrearsPaise: installmentArrears(m).amountPaise,
        loanOutstandingPaise: loans.reduce((s, l) => s + l.totalOutstandingPaise, 0),
        activeLoans: loans.filter((l) => !l.closed).length,
      };
    });
  res.json({ members: list });
});

router.get('/next-number', requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  res.json({ memberNo: await nextMemberNo(), monthlyInstallmentPaise: settings.defaultInstallmentPaise, today: todayIST() });
});

router.post('/', requireAdmin, async (req, res) => {
  const body = validate(createSchema, req.body);
  const settings = await getSettings();
  const data = {
    ...body,
    memberNo: body.memberNo ?? (await nextMemberNo()),
    monthlyInstallmentPaise: body.monthlyInstallmentPaise ?? settings.defaultInstallmentPaise,
    joinDate: parseDate(body.joinDate),
    dateOfBirth: parseDate(body.dateOfBirth),
  };
  await assertUnique(data);
  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.member.create({ data });
    await audit(req, { action: 'member_created', entity: 'member', entityId: m.id, memberId: m.id, after: publicMember(m) }, tx);
    return m;
  });
  res.status(201).json({ member: publicMember(member) });
});

router.get('/:id', async (req, res) => {
  assertSelfOrAdmin(req, req.params.id);
  const m = await loadMember(req.params.id);
  res.json({ member: publicMember(m) });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const body = validate(updateSchema, req.body);
  const before = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'member_not_found');
  const { reason, ...rest } = body;
  const data = { ...rest, ...(rest.joinDate ? { joinDate: parseDate(rest.joinDate) } : {}), ...(rest.dateOfBirth ? { dateOfBirth: parseDate(rest.dateOfBirth) } : {}) };
  // changing the installment amount or joining date changes dues — ask why
  const money = (data.monthlyInstallmentPaise != null && data.monthlyInstallmentPaise !== before.monthlyInstallmentPaise)
    || (data.joinDate && data.joinDate.getTime() !== before.joinDate.getTime());
  if (money && !reason) throw new HttpError(400, 'validation', [{ field: 'reason', message: 'reason_required' }]);
  await assertUnique(data, before.id);

  const member = await prisma.$transaction(async (tx) => {
    const m = await tx.member.update({ where: { id: before.id }, data });
    const diff = changes(before, data);
    if (Object.keys(diff).length) {
      await audit(req, { action: 'member_updated', entity: 'member', entityId: m.id, memberId: m.id, reason, before: publicMember(before), after: diff }, tx);
    }
    return m;
  });
  res.json({ member: publicMember(member) });
});

/** Spec: inactive members keep every financial record; they just stop owing new installments. */
router.post('/:id/deactivate', requireAdmin, async (req, res) => {
  const body = validate(z.object({ reason: reasonField, date: dateField().optional() }), req.body);
  const before = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'member_not_found');
  if (before.status === 'inactive') throw new HttpError(400, 'already_inactive');
  const inactiveSince = parseDate(body.date ?? todayIST());
  const m = await prisma.$transaction(async (tx) => {
    const u = await tx.member.update({ where: { id: before.id }, data: { status: 'inactive', inactiveSince } });
    await audit(req, { action: 'member_deactivated', entity: 'member', entityId: u.id, memberId: u.id, reason: body.reason, after: { inactiveSince: body.date ?? todayIST() } }, tx);
    return u;
  });
  res.json({ member: publicMember(m) });
});

router.post('/:id/activate', requireAdmin, async (req, res) => {
  const body = validate(z.object({ reason: reasonField }), req.body);
  const m = await prisma.$transaction(async (tx) => {
    const u = await tx.member.update({ where: { id: req.params.id }, data: { status: 'active', inactiveSince: null } });
    await audit(req, { action: 'member_activated', entity: 'member', entityId: u.id, memberId: u.id, reason: body.reason }, tx);
    return u;
  });
  res.json({ member: publicMember(m) });
});

/**
 * Deletes a member for good: name, mobile, date of birth, installments, loans, repayments, payments and
 * the member's change-log entries are erased. Only a hash of the mobile number is kept, so the same
 * number can be given to a new member after 7 days. A full backup is written first, just in case.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  const body = validate(z.object({ reason: reasonField, confirmName: z.string().trim() }), req.body);
  const before = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, 'member_not_found');
  if (body.confirmName.toLowerCase() !== before.fullName.trim().toLowerCase()) {
    throw new HttpError(400, 'validation', [{ field: 'confirmName', message: 'confirm_name_mismatch' }]);
  }

  // safety copy on servers with a lasting disk (not on Vercel, where the database host keeps backups)
  if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
    try {
      const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `samiti-backup-before-delete-${before.memberNo}-${Date.now()}.json`), JSON.stringify(await exportAll(prisma)));
    } catch (e) {
      console.error('[delete] backup before delete failed', e.message);
    }
  }

  const availableAt = new Date(Date.now() + DELETE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const counts = await prisma.$transaction(async (tx) => {
    const loanIds = (await tx.loan.findMany({ where: { memberId: before.id }, select: { id: true } })).map((l) => l.id);
    const c = {
      repayments: (await tx.loanRepayment.deleteMany({ where: { loanId: { in: loanIds } } })).count,
      loans: (await tx.loan.deleteMany({ where: { memberId: before.id } })).count,
      installments: (await tx.installment.deleteMany({ where: { memberId: before.id } })).count,
      payments: (await tx.payment.deleteMany({ where: { memberId: before.id } })).count,
      // document photos go with their applications (cascade)
      loanApplications: (await tx.loanApplication.deleteMany({ where: { memberId: before.id } })).count,
    };
    await tx.auditLog.deleteMany({ where: { memberId: before.id } });
    await tx.otpToken.deleteMany({ where: { mobileNumber: before.mobileNumber } });
    await tx.member.delete({ where: { id: before.id } });
    const hash = mobileHash(before.mobileNumber);
    await tx.deletedMobile.upsert({ where: { mobileHash: hash }, create: { mobileHash: hash, availableAt }, update: { deletedAt: new Date(), availableAt } });
    // no name or number in the log — only that member no. X was deleted, why, and how many records went
    await audit(req, { action: 'member_deleted', entity: 'member', reason: body.reason, after: { memberNo: before.memberNo, ...c } }, tx);
    return c;
  });
  res.json({ deleted: true, counts, mobileAvailableFrom: availableAt.toISOString().slice(0, 10) });
});

/** Change history for one member's account (all entities). */
router.get('/:id/changes', requireAdmin, async (req, res) => {
  const entries = await prisma.auditLog.findMany({ where: { memberId: req.params.id }, orderBy: { at: 'desc' }, take: 200 });
  res.json({ entries: maskActors(entries, req.user) });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, validate, parseMonthYear, parseDate, reasonField } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { maskActors } from '../lib/notify.js';
import { installmentEntry, installmentFields, checkInstallment, createInstallment, installmentRow } from '../lib/installments.js';
import { publicMember, installmentView, installmentApplies, loadMember, installmentArrears } from '../lib/ledger.js';

const router = Router(); // mounted behind requireAdmin

/** Everyone due for a month, with what they've paid — the monthly sheet. */
router.get('/sheet', async (req, res) => {
  const { month, year } = parseMonthYear(req.query);
  const members = await prisma.member.findMany({
    include: { installments: { where: { voidedAt: null } } },
    orderBy: { memberNo: 'asc' },
  });
  const rows = members
    .filter((m) => installmentApplies(m, month, year) || m.installments.some((i) => i.month === month && i.year === year))
    .map((m) => ({ member: publicMember(m), installment: installmentView(m, month, year) }));
  const sum = (k) => rows.reduce((s, r) => s + r.installment[k], 0);
  res.json({
    month,
    year,
    rows,
    totals: {
      members: rows.length,
      paid: rows.filter((r) => r.installment.status === 'paid').length,
      partial: rows.filter((r) => r.installment.status === 'partial').length,
      pending: rows.filter((r) => r.installment.status === 'pending').length,
      duePaise: sum('duePaise'),
      paidPaise: sum('paidPaise'),
      pendingPaise: sum('pendingPaise'),
    },
  });
});

/** Shows what will be saved, the member's due, and any warning — before anything is written. */
router.post('/preview', async (req, res) => {
  const entry = validate(installmentEntry, req.body);
  const member = await prisma.member.findUnique({ where: { id: entry.memberId } });
  const check = await checkInstallment(prisma, member, entry);
  res.json({
    member: member ? publicMember(member) : null,
    entry: { ...entry, duePaise: member?.monthlyInstallmentPaise ?? 0 },
    ...check,
  });
});

router.post('/', async (req, res) => {
  const entry = validate(installmentEntry, req.body);
  const member = await prisma.member.findUnique({ where: { id: entry.memberId } });
  if (!member) throw new HttpError(404, 'member_not_found');
  const saved = await prisma.$transaction(async (tx) => {
    const row = await createInstallment(tx, member, entry);
    await audit(req, { action: 'installment_added', entity: 'installment', entityId: row.id, memberId: member.id, after: installmentRow(row) }, tx);
    return row;
  });
  const full = await loadMember(member.id);
  res.status(201).json({
    installment: installmentRow(saved),
    member: publicMember(member),
    status: installmentView(full, saved.month, saved.year),
    arrears: installmentArrears(full),
  });
});

router.get('/:id', async (req, res) => {
  const row = await prisma.installment.findUnique({ where: { id: req.params.id }, include: { member: true } });
  if (!row) throw new HttpError(404, 'not_found');
  const history = await prisma.auditLog.findMany({ where: { entity: 'installment', entityId: row.id }, orderBy: { at: 'desc' } });
  res.json({ installment: installmentRow(row), member: publicMember(row.member), history: maskActors(history, req.user) });
});

/**
 * Correct an entry. A reason is required; the old values stay in the change history.
 * With ?preview=1 nothing is saved — the screen shows old vs new first.
 */
router.put('/:id', async (req, res) => {
  const body = validate(z.object({ ...installmentFields, reason: reasonField }), req.body);
  const before = await prisma.installment.findUnique({ where: { id: req.params.id }, include: { member: true } });
  if (!before || before.voidedAt) throw new HttpError(404, 'not_found');
  const entry = { month: before.month, year: before.year, ...body };
  const check = await checkInstallment(prisma, before.member, entry, { exceptId: before.id });
  const after = { ...installmentRow(before), amountPaise: body.amountPaise, paidOn: body.paidOn, method: body.method, note: body.note };

  if (req.query.preview === '1') return res.json({ before: installmentRow(before), after, ...check });
  if (check.errors.length) throw new HttpError(409, check.errors[0], check);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.installment.update({
      where: { id: before.id },
      data: { amountPaise: body.amountPaise, paidOn: parseDate(body.paidOn), method: body.method, note: body.note },
    });
    await audit(req, {
      action: 'installment_corrected', entity: 'installment', entityId: u.id, memberId: u.memberId,
      reason: body.reason, before: installmentRow(before), after: installmentRow(u),
    }, tx);
    return u;
  });
  res.json({ installment: installmentRow(updated) });
});

/** Cancel a wrong entry. The row is kept (marked cancelled) with the reason. */
router.post('/:id/void', async (req, res) => {
  const body = validate(z.object({ reason: reasonField }), req.body);
  const before = await prisma.installment.findUnique({ where: { id: req.params.id } });
  if (!before || before.voidedAt) throw new HttpError(404, 'not_found');
  const u = await prisma.$transaction(async (tx) => {
    const row = await tx.installment.update({ where: { id: before.id }, data: { voidedAt: new Date(), voidReason: body.reason } });
    await audit(req, { action: 'installment_voided', entity: 'installment', entityId: row.id, memberId: row.memberId, reason: body.reason, before: installmentRow(before) }, tx);
    return row;
  });
  res.json({ installment: installmentRow(u) });
});

/** All installment rows for one member, including cancelled ones (admin view). */
router.get('/member/:memberId/all', async (req, res) => {
  const rows = await prisma.installment.findMany({ where: { memberId: req.params.memberId }, orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }] });
  res.json({ installments: rows.map(installmentRow) });
});

export default router;

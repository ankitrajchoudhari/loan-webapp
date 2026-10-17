// Write-side installment logic, shared by the monthly entry screen and historical posting.
// An installment is never treated as a loan repayment — the two live in separate tables.
import { z } from 'zod';
import { HttpError, moneyField, dateField, monthField, yearField, blankToNull, parseDate, isFutureDate, ym, ymOfDate, currentMonthYear, iso } from './util.js';
import { installmentApplies } from './ledger.js';

export const METHODS = ['cash', 'upi', 'bank', 'other'];

export const installmentFields = {
  amountPaise: moneyField({ min: 1 }),
  paidOn: dateField('paid_on_invalid').refine((v) => !isFutureDate(v), 'date_in_future'),
  method: blankToNull(z.enum(METHODS)),
  note: blankToNull(z.string().trim().max(500)),
};

export const installmentEntry = z.object({
  memberId: z.string().uuid('member_required'),
  month: monthField,
  year: yearField,
  ...installmentFields,
});

/**
 * Checks an entry against the member and existing records.
 * Returns { errors, warnings, duplicate } — errors block saving, warnings are shown in the preview.
 */
export async function checkInstallment(db, member, entry, { exceptId } = {}) {
  const errors = [];
  const warnings = [];
  if (!member) return { errors: ['member_not_found'], warnings, duplicate: null };

  const k = ym(entry.year, entry.month);
  const now = currentMonthYear();
  if (k < ymOfDate(member.joinDate)) errors.push('month_before_joining');
  else if (!installmentApplies(member, entry.month, entry.year)) errors.push('month_after_inactive');
  if (k > ym(now.year, now.month) + 12) errors.push('month_too_far');
  if (k > ym(now.year, now.month)) warnings.push('advance_month');

  const duplicate = await db.installment.findFirst({
    where: { memberId: member.id, month: entry.month, year: entry.year, voidedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (duplicate) errors.push('installment_exists');

  const due = member.monthlyInstallmentPaise;
  if (entry.amountPaise < due) warnings.push('amount_less_than_due');
  if (entry.amountPaise > due) warnings.push('amount_more_than_due');
  if (entry.paidOn && ymOfDate(parseDate(entry.paidOn)) < k - 1) warnings.push('paid_long_before_month');

  return { errors, warnings, duplicate: duplicate ? installmentRow(duplicate) : null };
}

export function installmentRow(i) {
  return {
    id: i.id,
    memberId: i.memberId,
    month: i.month,
    year: i.year,
    duePaise: i.duePaise,
    amountPaise: i.amountPaise,
    paidOn: iso(i.paidOn),
    method: i.method,
    note: i.note,
    source: i.source,
    voided: Boolean(i.voidedAt),
    voidReason: i.voidReason,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

/** Create one installment inside a transaction. Throws if the check finds errors. */
export async function createInstallment(tx, member, entry, { source = 'entry', batchId = null } = {}) {
  const check = await checkInstallment(tx, member, entry);
  if (check.errors.length) throw new HttpError(409, check.errors[0], { errors: check.errors, duplicate: check.duplicate });
  return tx.installment.create({
    data: {
      memberId: member.id,
      month: entry.month,
      year: entry.year,
      duePaise: member.monthlyInstallmentPaise,
      amountPaise: entry.amountPaise,
      paidOn: parseDate(entry.paidOn),
      method: entry.method ?? null,
      note: entry.note ?? null,
      source,
      batchId,
    },
  });
}

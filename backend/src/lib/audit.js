import { prisma } from './db.js';

const plain = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

/**
 * Record who changed what, with before/after and the reason given.
 * Pass `tx` to write inside the same transaction as the change itself, so a change
 * can never be saved without its history.
 */
export function audit(req, { action, entity = null, entityId = null, memberId = null, reason = null, before = null, after = null }, tx = prisma) {
  return tx.auditLog.create({
    data: {
      actorRole: req.user?.staffRole ?? req.user?.role ?? 'system',
      actorId: req.user?.id ?? null,
      actorName: req.user?.name ?? null,
      action,
      entity,
      entityId,
      memberId,
      reason,
      before: plain(before) ?? undefined,
      after: plain(after) ?? undefined,
    },
  });
}

/** Only the fields that actually changed, as { field: { from, to } }. */
export function changes(before, after) {
  const out = {};
  const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : v);
  for (const key of Object.keys(after)) {
    const a = norm(before?.[key]);
    const b = norm(after[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { from: a, to: b };
  }
  return out;
}

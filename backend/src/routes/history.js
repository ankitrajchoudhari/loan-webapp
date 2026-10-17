import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, validate } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { KINDS, FIELDS, REQUIRED, normaliseRow, checkRow, loadContext, postBatch } from '../lib/history.js';
import { readSheet, guessMapping } from '../lib/sheet.js';

const router = Router(); // mounted behind requireAdmin
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const kind = z.enum(KINDS);
const rowData = z.record(z.string(), z.any());

async function getBatch(id) {
  const batch = await prisma.historyBatch.findUnique({ where: { id } });
  if (!batch) throw new HttpError(404, 'not_found');
  return batch;
}

/** Rows with their live check result (errors / warnings), recomputed on every view. */
async function batchView(batchId) {
  const batch = await getBatch(batchId);
  const ctx = await loadContext(batchId);
  const rows = ctx.rows.map((r) => ({
    id: r.id,
    lineNo: r.lineNo,
    kind: r.kind,
    data: r.data,
    status: r.status,
    postedId: r.postedId,
    check: r.status === 'posted' ? { errors: [], warnings: [] } : checkRow(ctx, r.kind, r.data, r),
  }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    batch,
    rows,
    totals: {
      rows: rows.length,
      needsCheck: count('needs_check'),
      verified: count('verified'),
      posted: count('posted'),
      withErrors: rows.filter((r) => r.check.errors.length).length,
    },
  };
}

router.get('/fields', (_req, res) => res.json({ fields: FIELDS, required: REQUIRED }));

router.get('/batches', async (_req, res) => {
  const batches = await prisma.historyBatch.findMany({ orderBy: { createdAt: 'desc' }, include: { rows: { select: { status: true } } } });
  res.json({
    batches: batches.map(({ rows, ...b }) => ({
      ...b,
      rows: rows.length,
      needsCheck: rows.filter((r) => r.status === 'needs_check').length,
      verified: rows.filter((r) => r.status === 'verified').length,
      posted: rows.filter((r) => r.status === 'posted').length,
    })),
  });
});

router.post('/batches', async (req, res) => {
  const body = validate(z.object({ title: z.string().trim().min(2, 'title_required').max(120), note: z.string().trim().max(500).optional() }), req.body);
  const batch = await prisma.historyBatch.create({ data: body });
  await audit(req, { action: 'history_batch_created', entity: 'batch', entityId: batch.id, after: body });
  res.status(201).json({ batch });
});

router.get('/batches/:id', async (req, res) => res.json(await batchView(req.params.id)));

router.delete('/batches/:id', async (req, res) => {
  const batch = await getBatch(req.params.id);
  if (await prisma.historyRow.count({ where: { batchId: batch.id, status: 'posted' } })) throw new HttpError(400, 'batch_has_posted');
  await prisma.historyBatch.delete({ where: { id: batch.id } });
  await audit(req, { action: 'history_batch_deleted', entity: 'batch', entityId: batch.id, before: { title: batch.title } });
  res.json({ ok: true });
});

/** Check a row without saving it (the "पूरा विवरण देखें" step of manual entry). */
router.post('/batches/:id/check', async (req, res) => {
  const body = validate(z.object({ kind, data: rowData, rowId: z.string().optional() }), req.body);
  const ctx = await loadContext(req.params.id);
  const data = normaliseRow(body.kind, body.data);
  res.json({ data, check: checkRow(ctx, body.kind, data, { id: body.rowId }) });
});

router.post('/batches/:id/rows', async (req, res) => {
  const body = validate(z.object({ kind, data: rowData, verified: z.boolean().optional() }), req.body);
  await getBatch(req.params.id);
  const ctx = await loadContext(req.params.id);
  const data = normaliseRow(body.kind, body.data);
  const check = checkRow(ctx, body.kind, data);
  if (body.verified && check.errors.length) throw new HttpError(400, 'row_has_errors', check);
  const lineNo = (ctx.rows.at(-1)?.lineNo ?? 0) + 1;
  const row = await prisma.historyRow.create({
    data: { batchId: req.params.id, lineNo, kind: body.kind, data, status: body.verified ? 'verified' : 'needs_check' },
  });
  res.status(201).json({ row, check });
});

/** Fix a row. Any edit sends it back to "needs checking". */
router.put('/rows/:rowId', async (req, res) => {
  const body = validate(z.object({ data: rowData }), req.body);
  const row = await prisma.historyRow.findUnique({ where: { id: req.params.rowId } });
  if (!row) throw new HttpError(404, 'not_found');
  if (row.status === 'posted') throw new HttpError(400, 'row_posted');
  const data = normaliseRow(row.kind, body.data);
  const updated = await prisma.historyRow.update({ where: { id: row.id }, data: { data, status: 'needs_check' } });
  res.json({ row: updated });
});

router.delete('/rows/:rowId', async (req, res) => {
  const row = await prisma.historyRow.findUnique({ where: { id: req.params.rowId } });
  if (!row) throw new HttpError(404, 'not_found');
  if (row.status === 'posted') throw new HttpError(400, 'row_posted');
  await prisma.historyRow.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

/** Mark rows as checked against the old register (or back to "needs checking"). */
router.post('/batches/:id/verify', async (req, res) => {
  const body = validate(z.object({ rowIds: z.array(z.string().uuid()).min(1), verified: z.boolean() }), req.body);
  const view = await batchView(req.params.id);
  const targets = view.rows.filter((r) => body.rowIds.includes(r.id) && r.status !== 'posted');
  const blocked = body.verified ? targets.filter((r) => r.check.errors.length) : [];
  const ok = targets.filter((r) => !blocked.includes(r));
  await prisma.historyRow.updateMany({ where: { id: { in: ok.map((r) => r.id) } }, data: { status: body.verified ? 'verified' : 'needs_check' } });
  res.json({ updated: ok.length, blocked: blocked.map((r) => r.lineNo) });
});

/** Save all verified rows into the real records — one transaction, all or nothing. */
router.post('/batches/:id/post', async (req, res) => {
  await getBatch(req.params.id);
  const posted = await prisma.$transaction(
    (tx) => postBatch(tx, req.params.id, (entry) => audit(req, entry, tx)),
    { timeout: 120000, maxWait: 10000 },
  );
  await audit(req, { action: 'history_batch_posted', entity: 'batch', entityId: req.params.id, after: posted });
  res.json({ posted });
});

// --- Spreadsheet import -------------------------------------------------------------------

/** Step 1: read the file and guess the column mapping. Nothing is saved. */
router.post('/parse', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'file_missing');
  const { kind: k } = validate(z.object({ kind }), req.body);
  const sheet = await readSheet(req.file);
  res.json({ ...sheet, mapping: guessMapping(sheet.headers, FIELDS[k]), fields: FIELDS[k], required: REQUIRED[k] });
});

/**
 * Step 2: apply the mapping, check every row (missing fields, bad dates/amounts, unknown members,
 * duplicates against saved records and within the file). dryRun=true only previews.
 */
router.post('/batches/:id/import', async (req, res) => {
  const body = validate(z.object({
    kind,
    mapping: z.record(z.string(), z.number().int().min(0)),
    rows: z.array(z.array(z.string())).min(1).max(3000),
    dryRun: z.boolean(),
    includeInvalid: z.boolean().default(false),
  }), req.body);
  await getBatch(req.params.id);
  for (const f of REQUIRED[body.kind]) {
    if (body.mapping[f] === undefined) throw new HttpError(400, 'mapping_incomplete', { field: f });
  }
  const ctx = await loadContext(req.params.id);
  const startLine = (ctx.rows.at(-1)?.lineNo ?? 0) + 1;
  const preview = [];
  for (const [i, raw] of body.rows.entries()) {
    const obj = {};
    for (const [field, col] of Object.entries(body.mapping)) if (FIELDS[body.kind].includes(field)) obj[field] = raw[col] ?? '';
    const data = normaliseRow(body.kind, obj);
    const check = checkRow(ctx, body.kind, data, { id: `import-${i}` });
    preview.push({ fileRow: i + 2, data, check });
    // later rows in the same file see this one, so duplicates inside the file are caught
    ctx.rows.push({ id: `import-${i}`, kind: body.kind, data, status: 'needs_check' });
  }
  const valid = preview.filter((p) => !p.check.errors.length);
  const toSave = body.includeInvalid ? preview : valid;
  if (!body.dryRun) {
    await prisma.historyRow.createMany({
      data: toSave.map((p, j) => ({ batchId: req.params.id, lineNo: startLine + j, kind: body.kind, data: p.data, status: 'needs_check' })),
    });
    await audit(req, { action: 'history_imported', entity: 'batch', entityId: req.params.id, after: { kind: body.kind, rows: toSave.length, skipped: preview.length - toSave.length } });
  }
  res.json({ dryRun: body.dryRun, total: preview.length, valid: valid.length, invalid: preview.length - valid.length, saved: body.dryRun ? 0 : toSave.length, preview });
});

export default router;

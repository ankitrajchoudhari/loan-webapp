// Full-data backup as JSON (every table, every row, cancelled entries and change log included).
// Restore with `npm run restore -- <file> ` into an empty database (see BACKUP.md).

export const BACKUP_FORMAT = 'samiti-backup-v1';

// Order matters for restore: parents before children.
export const TABLE_ORDER = ['member', 'payment', 'historyBatch', 'historyRow', 'installment', 'loan', 'loanRepayment', 'loanApplication', 'setting', 'auditLog'];

export async function exportAll(db) {
  const out = { format: BACKUP_FORMAT, createdAt: new Date().toISOString(), tables: {} };
  for (const t of TABLE_ORDER) out.tables[t] = await db[t].findMany();
  return out;
}

export async function importAll(db, data) {
  if (data?.format !== BACKUP_FORMAT) throw new Error('Not a samiti backup file');
  const counts = {};
  await db.$transaction(async (tx) => {
    for (const t of TABLE_ORDER) {
      const rows = data.tables[t] ?? [];
      for (let i = 0; i < rows.length; i += 500) await tx[t].createMany({ data: rows.slice(i, i + 500) });
      counts[t] = rows.length;
    }
  }, { timeout: 600000 });
  return counts;
}

// Restores a JSON backup into an EMPTY database.
// Usage: npm run restore -- backups/samiti-backup-....json [--target=practice]
// Refuses to run if the target already has members, so it can never overwrite real records.
import fs from 'node:fs/promises';
import { client, disconnectAll } from '../src/lib/db.js';
import { importAll } from '../src/lib/backup.js';

const file = process.argv.find((a) => a.endsWith('.json'));
const target = process.argv.includes('--target=practice') ? 'test' : 'live';
if (!file) {
  console.error('Usage: npm run restore -- <backup.json> [--target=practice]');
  process.exit(1);
}
const db = client(target);
if (await db.member.count()) {
  console.error(`The ${target} database is not empty. Restore only into a fresh, migrated database.`);
  process.exit(1);
}
const data = JSON.parse(await fs.readFile(file, 'utf8'));
console.log('Restored rows:', await importAll(db, data));
await disconnectAll();

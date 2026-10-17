// Writes a full JSON backup of the live database to backend/backups/ (or BACKUP_DIR).
// Schedule daily with Windows Task Scheduler or cron:  npm run backup
import fs from 'node:fs/promises';
import path from 'node:path';
import { liveDb, disconnectAll } from '../src/lib/db.js';
import { exportAll } from '../src/lib/backup.js';
import { todayIST } from '../src/lib/util.js';

const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
await fs.mkdir(dir, { recursive: true });
const data = await exportAll(liveDb());
const file = path.join(dir, `samiti-backup-${todayIST()}-${Date.now()}.json`);
await fs.writeFile(file, JSON.stringify(data));
const counts = Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length]));
console.log(`Backup written: ${file}`, counts);

// keep the newest 60 backups
const files = (await fs.readdir(dir)).filter((f) => /^samiti-backup-.*\.json$/.test(f)).sort();
for (const old of files.slice(0, Math.max(0, files.length - 60))) await fs.unlink(path.join(dir, old));
await disconnectAll();

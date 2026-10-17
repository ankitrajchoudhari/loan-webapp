// Applies database migrations to the live database and (if configured) the practice database.
import { execSync } from 'node:child_process';

// DIRECT_* = the database's direct (non-pooled) address, used for migrations when the app itself
// connects through a pooler (e.g. Neon on Vercel). Falls back to the normal address.
const targets = [
  ['live', process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL],
  ['practice', process.env.DIRECT_TEST_DATABASE_URL || process.env.TEST_DATABASE_URL],
].filter(([, url]) => url);
for (const [name, url] of targets) {
  console.log(`\n▶ Migrating ${name} database`);
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}

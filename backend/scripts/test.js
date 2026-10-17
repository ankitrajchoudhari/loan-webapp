// `npm test`: unit tests + full API tests against two throwaway databases (CI_DATABASE_URL and
// CI_TEST_DATABASE_URL). Live and practice data are never touched.
import { execSync, spawnSync } from 'node:child_process';

const live = process.env.CI_DATABASE_URL;
const practice = process.env.CI_TEST_DATABASE_URL;
if (!live || !practice) {
  console.error('Set CI_DATABASE_URL and CI_TEST_DATABASE_URL in backend/.env');
  process.exit(1);
}
for (const url of [live, practice]) {
  if (url === process.env.DATABASE_URL || url === process.env.TEST_DATABASE_URL) {
    console.error('Refusing: CI database must not be the live or practice database.');
    process.exit(1);
  }
}

const env = { ...process.env, DATABASE_URL: live, TEST_DATABASE_URL: practice, NODE_ENV: 'test', ADMIN_SECRET_CODE: '0100', FIREBASE_PROJECT_ID: 'jaipur-comitte', ADMIN_ALLOWED: '' };
if (!process.argv.includes('--skip-migrate')) {
  for (const url of [live, practice]) execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...env, DATABASE_URL: url } });
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/unit/*.test.js', 'test/integration/*.test.js'], { stdio: 'inherit', env });
process.exit(r.status ?? 1);

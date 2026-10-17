// Adds an admin directly (or resets a locked one) — for setup or recovery when Firebase registration
// is not possible. Usage:
//   npm run seed:admin -- --name="रमेश जी" --mobile=9876543210 --dob=1975-05-20
// They then log in with mobile + date of birth + the secret code (ADMIN_SECRET_CODE).
import { liveDb, disconnectAll } from '../src/lib/db.js';
import { parseDate } from '../src/lib/util.js';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const name = arg('name') || 'व्यवस्थापक';
const mobile = arg('mobile');
const dob = arg('dob');
if (!/^[6-9]\d{9}$/.test(mobile || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) {
  console.error('Usage: npm run seed:admin -- --name="Name" --mobile=9876543210 --dob=YYYY-MM-DD');
  process.exit(1);
}
const db = liveDb();
const dateOfBirth = parseDate(dob);
await db.adminUser.upsert({
  where: { mobileNumber: mobile },
  update: { name, dateOfBirth, failedLogins: 0, lockedUntil: null },
  create: { name, mobileNumber: mobile, dateOfBirth },
});
console.log(`Admin ready: ${name} (${mobile}). Log in with mobile + date of birth + secret code.`);
await disconnectAll();

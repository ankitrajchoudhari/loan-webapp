import { createApp } from './app.js';
import { disconnectAll, testEnvAvailable } from './lib/db.js';
import { firebaseProjectId } from './lib/firebase.js';
import { ensureDeveloper } from './lib/staff.js';

const port = Number(process.env.PORT) || 4000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters — set it in backend/.env');
  process.exit(1);
}
if (!process.env.ADMIN_SECRET_CODE) console.warn('ADMIN_SECRET_CODE is not set — admins cannot log in until it is.');
if (!firebaseProjectId()) console.warn('FIREBASE_PROJECT_ID is not set — admin registration and Google login are off.');

const dev = await ensureDeveloper().catch((e) => console.error('Developer account:', e.message));
if (dev) console.log(`Developer account ready: ${dev.mobileNumber}`);

const server = createApp().listen(port, () => {
  console.log(`Samiti API on http://localhost:${port}/api/v1`);
  console.log(`Firebase project: ${firebaseProjectId() || '—'} · practice mode: ${testEnvAvailable() ? 'on' : 'off'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => disconnectAll().then(() => process.exit(0))));
}

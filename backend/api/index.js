// Vercel entry: every request to the backend project runs the same Express app as `npm start`.
// (vercel.json sends all paths here.) The developer account is checked once per server instance.
import { createApp } from '../src/app.js';
import { ensureDeveloper } from '../src/lib/staff.js';

const app = createApp();
let ready = null;

export default async function handler(req, res) {
  ready ??= ensureDeveloper().catch((e) => console.error('Developer account:', e.message));
  await ready;
  return app(req, res);
}

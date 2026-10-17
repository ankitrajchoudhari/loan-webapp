// Staff notifications (bell icon) + optional instant phone alert for the developer (ntfy.sh).
// Always stored in the live database, whatever mode the sender is in.
import { liveDb } from './db.js';

export const SUPPORT_NAME = { hi: 'सहायता टीम', en: 'Support team' };

export async function developerIds() {
  const devs = await liveDb().adminUser.findMany({ where: { role: 'developer', status: 'active' }, select: { id: true } });
  return devs.map((d) => d.id);
}

/** Pings the developer's phone through ntfy if SUPPORT_NOTIFY_URL is set. Never throws. */
function pushToPhone(title, body) {
  const url = process.env.SUPPORT_NOTIFY_URL;
  if (!url) return;
  fetch(url, { method: 'POST', headers: { Title: encodeURIComponent(title).slice(0, 200), Priority: 'high', Tags: 'warning' }, body: body || title })
    .catch((e) => console.error('[notify] push failed', e.message));
}

export async function notify(recipientIds, { title, body = null, link = null }, { push = false } = {}) {
  const ids = [...new Set(recipientIds.filter(Boolean))];
  if (ids.length) {
    await liveDb().notification.createMany({ data: ids.map((recipientId) => ({ recipientId, title, body, link })) });
  }
  if (push) pushToPhone(title, body);
}

/** Admins + sub-admins who were given this work area. */
export async function notifyStaffWith(perm, message) {
  const staff = await liveDb().adminUser.findMany({ where: { status: 'active', role: { in: ['admin', 'subadmin'] } }, select: { id: true, role: true, permissions: true } });
  const ids = staff.filter((s) => s.role === 'admin' || (Array.isArray(s.permissions) && s.permissions.includes(perm))).map((s) => s.id);
  await notify(ids, message);
}

export async function notifyDevelopers(message) {
  await notify(await developerIds(), message, { push: true });
}

// One automatic error alert per person + place every 10 minutes, so a broken page can't flood you.
const recent = new Map();
export async function reportStaffError(req, err) {
  if (req.user?.role !== 'admin' || req.user.staffRole === 'developer') return;
  const key = `${req.user.id}:${req.method}:${req.baseUrl}${req.path}`;
  if (recent.get(key) > Date.now()) return;
  recent.set(key, Date.now() + 10 * 60 * 1000);
  await notifyDevelopers({
    title: `⚠️ ${req.user.name ?? 'Admin'} (${req.user.staffRole}) को गड़बड़ी आई`,
    body: `${req.method} ${req.originalUrl.split('?')[0]} — ${err?.message?.slice(0, 300) ?? 'server error'} · mode: ${req.user.env}`,
    link: '/admin/support',
  }).catch((e) => console.error('[notify] error report failed', e.message));
}

/** Hides the developer's name and role from anyone who is not the developer. */
export function maskActors(entries, viewer) {
  if (viewer?.staffRole === 'developer') return entries;
  return entries.map((e) => (e.actorRole === 'developer' ? { ...e, actorRole: 'support', actorName: SUPPORT_NAME.hi } : e));
}

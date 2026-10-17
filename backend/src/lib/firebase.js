// Verifies Firebase Authentication ID tokens (phone OTP or Google sign-in done in the browser).
// Uses Google's public signing keys, so no service-account secret is needed on the server.
import jwt from 'jsonwebtoken';
import { HttpError } from './util.js';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cache = { certs: null, until: 0 };

async function certs() {
  if (cache.certs && Date.now() < cache.until) return cache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new HttpError(502, 'firebase_unreachable');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  cache = { certs: await res.json(), until: Date.now() + maxAge * 1000 };
  return cache.certs;
}

export const firebaseProjectId = () => process.env.FIREBASE_PROJECT_ID || '';

/**
 * Returns { uid, provider, mobile, email } for a valid token, or throws 401 firebase_token_invalid.
 * mobile is the 10-digit Indian number for phone sign-in; email is set (and verified) for Google.
 */
export async function verifyFirebaseToken(idToken) {
  const projectId = firebaseProjectId();
  if (!projectId) throw new HttpError(503, 'firebase_not_configured');
  const header = jwt.decode(String(idToken || ''), { complete: true })?.header;
  const keys = await certs();
  const cert = header?.kid && keys[header.kid];
  if (!cert || header.alg !== 'RS256') throw new HttpError(401, 'firebase_token_invalid');
  let p;
  try {
    p = jwt.verify(idToken, cert, { algorithms: ['RS256'], audience: projectId, issuer: `https://securetoken.google.com/${projectId}` });
  } catch {
    throw new HttpError(401, 'firebase_token_invalid');
  }
  if (!p.sub || (p.auth_time && p.auth_time * 1000 > Date.now() + 60_000)) throw new HttpError(401, 'firebase_token_invalid');
  // the sign-in must be fresh (done just now on the registration / login screen)
  if (p.auth_time && Date.now() - p.auth_time * 1000 > 10 * 60 * 1000) throw new HttpError(401, 'firebase_token_old');
  const provider = p.firebase?.sign_in_provider;
  const mobile = provider === 'phone' && /^\+91[6-9]\d{9}$/.test(p.phone_number || '') ? p.phone_number.slice(3) : null;
  const email = provider === 'google.com' && p.email && p.email_verified ? String(p.email).toLowerCase() : null;
  if (!mobile && !email) throw new HttpError(401, 'firebase_token_invalid');
  return { uid: p.sub, provider, mobile, email };
}

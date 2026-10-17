'use client';
// Firebase is used only to prove who the admin is (SMS OTP or Google) at registration and
// Google login. The website's own session is then created by our server, which re-checks
// the Firebase token. This web config is public by design (it identifies the project only).

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCO8xSbmfgAFcsGWhfTxRLaZ0nDcGQwqoo',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'jaipur-comitte.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'jaipur-comitte',
  storageBucket: 'jaipur-comitte.firebasestorage.app',
  messagingSenderId: '178402647771',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:178402647771:web:e10cd40fd2c0732fa236fe',
};

let authPromise;
async function getAuthLazy() {
  // loaded only on the admin screens that need it
  authPromise ??= (async () => {
    const [{ initializeApp, getApps }, authMod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = getApps()[0] ?? initializeApp(config);
    const auth = authMod.getAuth(app);
    auth.languageCode = 'hi';
    return { auth, m: authMod };
  })();
  return authPromise;
}

let verifier;
/** Sends an SMS OTP to +91<mobile>. `buttonId` is the element used for the invisible reCAPTCHA. */
export async function sendPhoneOtp(mobile, buttonId) {
  const { auth, m } = await getAuthLazy();
  verifier?.clear?.();
  verifier = new m.RecaptchaVerifier(auth, buttonId, { size: 'invisible' });
  return m.signInWithPhoneNumber(auth, `+91${mobile}`, verifier);
}

/** Confirms the OTP and returns a fresh Firebase ID token for our server to check. */
export async function confirmPhoneOtp(confirmation, code) {
  const cred = await confirmation.confirm(code);
  return finish(cred.user);
}

/** Google (Gmail) sign-in popup; returns a fresh Firebase ID token. */
export async function googleIdToken() {
  const { auth, m } = await getAuthLazy();
  const provider = new m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await m.signInWithPopup(auth, provider);
  return finish(cred.user);
}

async function finish(user) {
  const token = await user.getIdToken(true);
  const { auth, m } = await getAuthLazy();
  await m.signOut(auth); // our own server session is what keeps the admin logged in
  return token;
}

/** Firebase error → our message key. */
export function firebaseErrorCode(err) {
  const c = String(err?.code || '');
  if (c.includes('invalid-verification-code')) return 'otp_wrong';
  if (c.includes('code-expired')) return 'otp_expired';
  if (c.includes('too-many-requests') || c.includes('quota')) return 'too_many_requests';
  if (c.includes('invalid-phone-number')) return 'mobile_invalid';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'google_cancelled';
  if (c.includes('operation-not-allowed') || c.includes('billing') || c.includes('unauthorized-domain') || c.includes('configuration')) return 'firebase_setup';
  if (c.includes('network')) return 'network';
  return err?.code && !c.startsWith('auth/') ? err.code : 'firebase_failed';
}

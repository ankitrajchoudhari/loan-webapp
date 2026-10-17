'use client';
// The session itself is an httpOnly cookie set by the server (scripts can't read it).
// We only keep a small copy of "who is signed in" for showing names and the practice banner.

const INFO_KEY = 'samiti.who';

export class ApiError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

// Copy of the session for this tab only — used when a browser (e.g. an editor's built-in preview)
// refuses the session cookie. Cleared when the tab closes or on logout.
const TOKEN_KEY = 'samiti.t';
const getToken = () => safe(() => sessionStorage.getItem(TOKEN_KEY));

export const getWho = () => safe(() => JSON.parse(localStorage.getItem(INFO_KEY)));
export const setWho = ({ token, ...w }) => safe(() => {
  localStorage.setItem(INFO_KEY, JSON.stringify(w));
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
});
export const clearWho = () => safe(() => {
  localStorage.removeItem(INFO_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
});

function buildUrl(path, query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return `/api/v1${path}${qs ? `?${qs}` : ''}`;
}

/** fetch wrapper: same-origin cookie session, JSON in/out, errors become ApiError(code). */
export async function api(path, { method = 'GET', body, query, raw = false, form } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'same-origin',
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearWho();
    window.location.href = '/?expired=1';
    throw new ApiError(401, 'session_expired');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error?.code || 'server_error', data.error?.details);
  }
  // something was saved: every screen that shows data refreshes at once (see useApi)
  if (method !== 'GET' && !path.startsWith('/auth/') && typeof window !== 'undefined') {
    setTimeout(() => window.dispatchEvent(new Event('samiti:changed')), 0);
  }
  return raw ? res : res.json();
}

/** Download an authenticated file by streaming it into a blob link. */
export async function download(path, query) {
  const res = await api(path, { query, raw: true });
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'download';
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

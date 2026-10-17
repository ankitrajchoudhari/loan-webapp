'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getWho, setWho, clearWho } from './api';

/** How often an open screen quietly fetches fresh data (only while the page is visible). */
export const LIVE_MS = 15_000;

/**
 * Load JSON from the API; re-runs when path/query change. Pass path=null to skip.
 * Live: refreshes quietly every LIVE_MS while visible, when the tab/app is opened again, and right
 * after anything is saved anywhere on the page. A refresh only redraws when the data really changed,
 * so forms filled from it are not reset. `{ live: false }` turns this off.
 */
export function useApi(path, query, { live = true } = {}) {
  const key = JSON.stringify([path, query]);
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const seq = useRef(0);
  const last = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!path) return;
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { query });
      if (id !== seq.current) return;
      const text = JSON.stringify(data);
      if (silent && text === last.current) return; // nothing new
      last.current = text;
      setState({ data, error: null, loading: false });
    } catch (error) {
      // a quiet refresh that fails (e.g. phone offline for a moment) keeps what is on screen
      if (id === seq.current && !silent) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    last.current = null;
    load();
  }, [load]);

  useEffect(() => {
    if (!path || !live) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    const id = setInterval(refresh, LIVE_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('samiti:changed', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('samiti:changed', refresh);
    };
  }, [load, path, live]);

  const reload = useCallback(() => load(), [load]);
  return { ...state, reload };
}

/**
 * Confirms with the server that someone with this role is signed in; otherwise sends them to
 * the right login screen. Returns { role, env, user } once confirmed.
 */
export function useSession(role) {
  const router = useRouter();
  const [who, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const cached = getWho();
    if (cached?.role === role) setState(cached); // show the page at once; the server check below decides
    api('/auth/me')
      .then((me) => {
        if (!alive) return;
        if (me.role !== role) throw new Error('wrong role');
        setWho(me); // keeps the tab's session copy
        setState(me);
      })
      .catch(() => {
        if (!alive) return;
        clearWho();
        router.replace('/');
      });
    return () => {
      alive = false;
    };
  }, [role, router]);
  return who;
}

/** Read a query-string param on the client. */
export function useQueryParam(name) {
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}

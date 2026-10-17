'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getWho, setWho, clearWho } from './api';

/** Load JSON from the API; re-runs when path/query change. Pass path=null to skip. */
export function useApi(path, query) {
  const key = JSON.stringify([path, query]);
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { query });
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
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

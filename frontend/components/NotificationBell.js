'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

/** Bell with unread count; checks every minute. Opening it marks everything read. */
export default function NotificationBell() {
  const { t } = useTranslation();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread) {
      await api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
      setData((d) => ({ ...d, unread: 0 }));
    }
  };

  return (
    <div className="no-print relative">
      <button type="button" onClick={toggle} className="relative grid size-11 place-items-center rounded-full text-maroon hover:bg-brand-50" aria-label={t('notify.title')}>
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-xs font-bold text-white">{data.unread > 9 ? '9+' : data.unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[70dvh] w-[min(22rem,90vw)] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl">
            <div className="px-2 py-1 font-bold text-maroon">{t('notify.title')}</div>
            {data.items.length === 0 ? (
              <p className="px-2 py-4 text-muted">{t('notify.none')}</p>
            ) : (
              data.items.map((n) => (
                <Link key={n.id} href={n.link || '#'} onClick={() => setOpen(false)} className={`block rounded-xl px-2 py-2 hover:bg-brand-50 ${n.readAt ? '' : 'bg-brand-50/60'}`}>
                  <div className="font-semibold leading-snug">{n.title}</div>
                  {n.body && <div className="line-clamp-2 text-sm text-muted">{n.body}</div>}
                  <div className="num text-xs text-muted">{fmtDateTime(n.createdAt)}</div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

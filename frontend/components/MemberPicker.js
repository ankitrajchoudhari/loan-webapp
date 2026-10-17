'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Loading, Badge } from './ui';
import { Icon } from './icons';
import { useApi } from '@/lib/hooks';

/** Searchable member chooser (by name, member number or mobile). Collapses to the chosen member. */
export default function MemberPicker({ value, onChange, status = 'active', allowClear = false, matchNo }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!value && !matchNo);
  const { data, loading } = useApi('/members', status ? { status } : undefined);
  const members = data?.members ?? [];
  const selected = members.find((m) => m.id === value) ?? (matchNo ? members.find((m) => String(m.memberNo) === String(matchNo)) : undefined);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) => m.fullName.toLowerCase().includes(s) || m.mobileNumber.includes(s) || String(m.memberNo) === s);
  }, [members, q]);

  if (loading && !data) return <Loading />;

  if (selected && !open) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-maroon/30 bg-brand-50/60 p-3">
        <span className="num grid size-11 shrink-0 place-items-center rounded-full bg-maroon text-base font-bold text-white">{selected.memberNo}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{selected.fullName}</div>
          <div className="num text-sm text-muted">{t('field.memberNo')} {selected.memberNo} · {selected.mobileNumber}</div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-lg px-3 font-semibold text-maroon hover:bg-white">
          {t('common.change')}
        </button>
        {allowClear && (
          <button type="button" onClick={() => onChange(null, null)} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-white" aria-label={t('common.clear')}>
            <Icon name="x" className="size-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('members.searchPlaceholder')} className="pl-12" />
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border-2 border-line bg-white" role="listbox">
        {list.length === 0 && <li className="p-4 text-muted">{t('members.noMatch')}</li>}
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={m.id === value}
              onClick={() => { onChange(m.id, m); setOpen(false); setQ(''); }}
              className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50 ${m.id === value ? 'bg-brand-50' : ''}`}
            >
              <span className="num grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-maroon">{m.memberNo}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{m.fullName}</span>
                <span className="num block text-sm text-muted">{m.mobileNumber}</span>
              </span>
              {m.status === 'inactive' && <Badge>{t('member.inactive')}</Badge>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

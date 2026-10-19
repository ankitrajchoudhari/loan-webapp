'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Emblem, LangToggle, LiveClock } from '@/components/shell';
import { Button, ErrorBox, Field, Input, TextArea } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

const PROBLEMS = ['wrong_dob', 'not_registered', 'locked', 'forgot_code', 'other'];
const KEY = 'samiti.help';
const FIX_SECONDS = 180;

const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };

/**
 * "I can't log in": choose who to ask (admin or developer) and what the problem is, send,
 * then watch it here: fixing (about 3 minutes) → someone is working on it → fixed.
 */
export default function Help() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(undefined);
  useEffect(() => setSaved(readSaved()), []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 shadow-[0_1px_0_rgba(233,184,102,.6)]">
        <Link href="/" className="flex items-center gap-2" aria-label={t('common.back')}><Emblem className="size-9" /></Link>
        <div className="flex items-center gap-3"><LiveClock /><LangToggle /></div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-maroon"><Icon name="message" className="size-7" />{t('help.title')}</h1>
        <p className="mb-4 text-muted">{t('help.subtitle')}</p>
        {saved === undefined ? null : saved ? (
          <Follow saved={saved} onNew={() => { save(null); setSaved(null); }} />
        ) : (
          <Ask onSent={(v) => { save(v); setSaved(v); }} />
        )}
        <Link href="/" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold text-maroon hover:bg-brand-50">
          <Icon name="back" className="size-5" />{t('help.backToLogin')}
        </Link>
      </main>
    </div>
  );
}

function Ask({ onSent }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ sendTo: 'admin', problem: '', mobile: '', name: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (/^\d{10}$/.test(q.get('mobile') ?? '')) setF((s) => ({ ...s, mobile: q.get('mobile') }));
  }, []);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const practice = new URLSearchParams(window.location.search).get('practice') === '1';
      const r = await api('/help', { method: 'POST', body: { ...f, env: practice ? 'test' : 'live' } });
      onSent({ id: r.request.id, token: r.token, sentAt: Date.now() });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  const ok = /^[6-9]\d{9}$/.test(f.mobile) && f.problem;

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-white p-4 shadow-sm">
      <Field label={t('help.sendTo')}>
        <div className="grid grid-cols-2 gap-2">
          {[['admin', 'shield', 'help.toAdmin', 'help.toAdminSub'], ['developer', 'settings', 'help.toDeveloper', 'help.toDeveloperSub']].map(([v, icon, label, sub]) => (
            <button key={v} type="button" onClick={() => set('sendTo')(v)} aria-pressed={f.sendTo === v}
              className={`rounded-2xl border-2 p-3 text-left transition ${f.sendTo === v ? 'border-maroon bg-maroon text-white shadow' : 'border-line bg-white hover:bg-brand-50'}`}>
              <Icon name={icon} className="mb-1 size-6" />
              <span className="block font-bold">{t(label)}</span>
              <span className={`block text-xs ${f.sendTo === v ? 'text-white/80' : 'text-muted'}`}>{t(sub)}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('help.whatProblem')} required>
        <div className="flex flex-wrap gap-2">
          {PROBLEMS.map((p) => (
            <button key={p} type="button" onClick={() => set('problem')(p)} aria-pressed={f.problem === p}
              className={`min-h-11 rounded-xl border-2 px-3 text-sm font-semibold ${f.problem === p ? 'border-maroon bg-maroon text-white' : 'border-line bg-white hover:bg-brand-50'}`}>
              {t(`help.problem.${p}`)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('field.mobile')} required htmlFor="help-mobile">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">+91</span>
          <Input id="help-mobile" type="tel" inputMode="numeric" maxLength={10} placeholder="98XXXXXXXX" value={f.mobile}
            onChange={(e) => set('mobile')(e.target.value.replace(/\D/g, '').slice(0, 10))} className="num pl-16 text-lg tracking-wider" />
        </div>
      </Field>
      <Field label={t('help.yourName')} htmlFor="help-name">
        <Input id="help-name" value={f.name} onChange={(e) => set('name')(e.target.value)} maxLength={100} />
      </Field>
      <Field label={t('help.message')} hint={t('help.messageHint')} htmlFor="help-msg">
        <TextArea id="help-msg" value={f.message} onChange={(e) => set('message')(e.target.value)} maxLength={1000} />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button variant="success" full icon="send" loading={busy} disabled={!ok} onClick={send}>{t('help.send')}</Button>
    </div>
  );
}

/** After sending: countdown "fixing in about 3 minutes" → "working on it" → "fixed". */
function Follow({ saved, onNew }) {
  const { t } = useTranslation();
  const [r, setR] = useState(null);
  const [gone, setGone] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    const load = () => api(`/help/${saved.id}`, { query: { token: saved.token } })
      .then((x) => !stop && setR(x.request))
      .catch((e) => !stop && e.code === 'not_found' && setGone(true));
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(poll); clearInterval(tick); };
  }, [saved.id, saved.token]);

  if (gone) {
    return (
      <div className="space-y-3 rounded-3xl border border-line bg-white p-4">
        <p className="text-muted">{t('help.notFound')}</p>
        <Button full icon="send" onClick={onNew}>{t('help.newProblem')}</Button>
      </div>
    );
  }
  if (!r) return <div className="h-40 animate-pulse rounded-3xl bg-white" />;

  const left = Math.max(0, FIX_SECONDS - Math.floor((now - new Date(r.createdAt).getTime()) / 1000));
  const mm = String(Math.floor(left / 60));
  const ss = String(left % 60).padStart(2, '0');
  const who = t(r.sendTo === 'developer' ? 'help.toDeveloper' : 'help.toAdmin');

  if (r.status === 'fixed') {
    return (
      <div className="space-y-4 rounded-3xl border-2 border-ok/40 bg-ok-bg p-5 text-ok">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-ok text-white"><Icon name="check" className="size-8" strokeWidth={3} /></span>
          <div>
            <div className="text-2xl font-bold">{t('help.fixed')}</div>
            <div className="text-sm">{t('help.fixedAt', { date: fmtDateTime(r.fixedAt) })}</div>
          </div>
        </div>
        {r.reply && <p className="rounded-2xl bg-white p-3 text-ink">{r.reply}</p>}
        <Link href="/" onClick={onNew} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-ok font-bold text-white"><Icon name="chevronRight" className="size-5" />{t('help.tryLogin')}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-line bg-white p-5 text-center shadow-sm">
      <div className="relative mx-auto grid size-36 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-line)" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-brand)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44} strokeDashoffset={(2 * Math.PI * 44) * (1 - left / FIX_SECONDS)} className="transition-[stroke-dashoffset] duration-1000" />
        </svg>
        <div>
          <div className="num text-3xl font-bold text-maroon">{left > 0 ? `${mm}:${ss}` : <Icon name="clock" className="mx-auto size-9" />}</div>
          <div className="text-xs text-muted">{t('help.minutes')}</div>
        </div>
      </div>
      <div>
        <div className="text-xl font-bold text-maroon">{r.status === 'seen' ? t('help.workingOn', { who }) : left > 0 ? t('help.fixingIn') : t('help.stillWorking')}</div>
        <p className="mt-1 text-sm text-muted">{t('help.sentTo', { who, n: r.requestNo, date: fmtDateTime(r.createdAt) })}</p>
      </div>
      <ol className="space-y-2 text-left text-sm">
        {[['help.stepSent', true], ['help.stepSeen', r.status !== 'open'], ['help.stepFixed', false]].map(([k, done]) => (
          <li key={k} className={`flex items-center gap-2 ${done ? 'font-semibold text-ok' : 'text-muted'}`}>
            <Icon name={done ? 'checkCircle' : 'clock'} className="size-5 shrink-0" />{t(k, { who })}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">{t('help.keepOpen')}</p>
      <button type="button" onClick={onNew} className="text-sm font-semibold text-maroon underline underline-offset-4">{t('help.newProblem')}</button>
    </div>
  );
}

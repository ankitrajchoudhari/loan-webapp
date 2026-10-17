'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LangToggle, Emblem, PracticeBanner } from '@/components/shell';
import { Badge, Button, ErrorBox, Input, Notice, Segmented } from '@/components/ui';
import { Icon } from '@/components/icons';
import DateField from '@/components/DateField';
import { api, getWho, setWho } from '@/lib/api';
import { useApi, useQueryParam } from '@/lib/hooks';
import { googleIdToken, firebaseErrorCode } from '@/lib/firebase';

const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold">{children}</label>;

/**
 * One login for everyone, sized to fit one screen (phone or laptop) without scrolling.
 * Step 1: mobile number only. Step 2 depends on whose number it is:
 * member / sub-admin → date of birth; admin / developer → date of birth or Gmail, then secret code.
 */
export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const expired = useQueryParam('expired');
  const practiceParam = useQueryParam('practice') === '1';
  const { data: config } = useApi('/auth/config');
  const [step, setStep] = useState('mobile');
  const [who, setWhoKind] = useState(null);
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('1970-01-01');
  const [method, setMethod] = useState('dob');
  const [code, setCode] = useState('');
  const [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [agree, setAgree] = useState(false);
  const [preview, setPreview] = useState(null); // { mobile, ...identify answer } — shown as soon as 10 digits are typed
  useEffect(() => {
    try { setAgree(localStorage.getItem('samiti.terms') === '1'); } catch {}
  }, []);

  useEffect(() => setPractice(practiceParam), [practiceParam]);
  useEffect(() => {
    const w = getWho();
    if (w?.role) router.replace(w.role === 'admin' ? '/admin' : '/member');
  }, [router]);

  const valid = /^[6-9]\d{9}$/.test(mobile);
  const staff = who && who.kind !== 'member';
  const env = practice ? 'test' : 'live';
  const known = preview?.mobile === mobile ? preview : null;

  useEffect(() => {
    if (!valid) return undefined;
    let stale = false;
    const id = setTimeout(() => {
      api('/auth/identify', { method: 'POST', body: { mobile, env } })
        .then((r) => !stale && setPreview({ ...r, mobile }))
        .catch(() => {});
    }, 200);
    return () => { stale = true; clearTimeout(id); };
  }, [mobile, valid, env]);

  const go = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(String(err?.code || '').startsWith('auth/') ? firebaseErrorCode(err) : err);
      setBusy(false);
    }
  };

  const identify = (e) => {
    e.preventDefault();
    if (!valid) return setError('mobile_invalid');
    go(async () => {
      const r = known ?? await api('/auth/identify', { method: 'POST', body: { mobile, env } });
      setWhoKind(r);
      setMethod('dob');
      setDob(r.kind === 'member' ? '1970-01-01' : '1980-01-01');
      setStep('auth');
      setBusy(false);
    });
  };

  const login = (e) => {
    e.preventDefault();
    go(async () => {
      const body = { mobile, method, code: who.needsCode ? code : undefined, env };
      if (method === 'google') body.idToken = await googleIdToken();
      else body.dateOfBirth = dob;
      const r = await api('/auth/login', { method: 'POST', body });
      setWho({ role: r.role, env: r.env, user: r.user, token: r.token });
      router.replace(r.role === 'admin' ? '/admin' : '/member');
    });
  };

  const back = () => {
    setStep('mobile');
    setError(null);
    setCode('');
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b-4 border-brand bg-white px-4 py-2">
        <div className="flex items-center gap-2"><Emblem className="size-9" /></div>
        <LangToggle />
      </header>
      {practice && <PracticeBanner />}

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-3">
        <div className="mb-3 text-center">
          <h1 className="font-brand text-3xl leading-tight text-maroon sm:text-4xl">{t('app.name')}</h1>
          {step === 'mobile' && <p className="mt-1 text-base text-muted">{t('login.instruction')}</p>}
        </div>
        {expired && step === 'mobile' && <div className="mb-3"><Notice>{t('err.session_expired')}</Notice></div>}

        <div className="rounded-3xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(60,30,0,.05)]">
          {step === 'mobile' ? (
            <form onSubmit={identify} className="space-y-3" noValidate>
              <div>
                <Label htmlFor="mobile">{t('field.mobile')}</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">+91</span>
                  <Input id="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} autoFocus placeholder="98XXXXXXXX"
                    value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                    className="num pl-16 text-xl tracking-wider" />
                </div>
              </div>
              {valid && known && (known.found ? (
                <div className="flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok-bg px-3 py-2.5 text-ok" aria-live="polite">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok text-lg font-bold text-white">{known.name?.trim()[0]?.toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold leading-tight">{known.name}</span>
                    <span className="block text-sm">{known.memberNo ? `${t('field.memberNo')} ${known.memberNo}` : t(`role.${known.kind}`)}</span>
                  </span>
                  <Icon name="checkCircle" className="ml-auto size-6 shrink-0" />
                </div>
              ) : (
                <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn" aria-live="polite">{t('login.notRegistered')}</p>
              ))}
              {error && <ErrorBox error={error} />}
              <Button type="submit" full loading={busy} disabled={!valid} icon="chevronRight">{t('login.next')}</Button>
            </form>
          ) : (
            <form onSubmit={login} className="space-y-3" noValidate>
              <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2">
                <span className="min-w-0">
                  {who.name && <span className="block truncate font-bold text-maroon">{who.name}</span>}
                  <span className={`num block ${who.name ? 'text-sm text-muted' : 'font-bold text-maroon'}`}>+91 {mobile}</span>
                </span>
                {staff && <Badge tone="brand">{t(`role.${who.kind}`)}</Badge>}
                <button type="button" onClick={back} className="ml-auto min-h-9 text-sm font-semibold text-maroon underline underline-offset-4">
                  {t('common.change')}
                </button>
              </div>

              {who.methods.length > 1 && (
                <Segmented value={method} onChange={(m) => { setMethod(m); setError(null); }} size="sm"
                  options={[{ value: 'dob', label: t('login.withDob') }, { value: 'google', label: t('login.withGmail') }]} />
              )}

              {method === 'dob' ? (
                <div>
                  <Label>{t('field.dateOfBirth')}</Label>
                  <DateField value={dob} onChange={(v) => { setDob(v); setError(null); }} minYear={1920} />
                </div>
              ) : (
                <p className="text-sm text-muted">{t('login.gmailHint')}</p>
              )}

              {who.needsCode && (
                <div>
                  <Label htmlFor="secret">{t('admin.secretCode')}</Label>
                  <Input id="secret" type="password" inputMode="numeric" autoComplete="off" maxLength={20} value={code}
                    onChange={(e) => { setCode(e.target.value.trim()); setError(null); }} className="num text-center text-2xl tracking-[0.4em]" />
                </div>
              )}

              {staff && config?.testEnv && (
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-test">
                  <input type="checkbox" className="size-5 accent-[#5b21b6]" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
                  {t('practice.loginToggle')}
                </label>
              )}

              {error && <ErrorBox error={error} />}
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-muted">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#7a1f2b]" checked={agree}
                  onChange={(e) => { setAgree(e.target.checked); try { localStorage.setItem('samiti.terms', e.target.checked ? '1' : '0'); } catch {} }} />
                <span>
                  {t('terms.agreePrefix')}{' '}
                  <a href="/terms" target="_blank" className="font-semibold text-maroon underline underline-offset-2">{t('terms.link')}</a>{' '}
                  {t('terms.agreeSuffix')}
                </span>
              </label>
              <Button type="submit" full loading={busy} disabled={(who.needsCode && !code) || !agree} icon="lock">
                {method === 'google' ? t('login.gmailButton') : t('label.login')}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

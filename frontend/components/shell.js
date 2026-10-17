'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons';
import { api, clearWho } from '@/lib/api';
import { setLanguage } from '@/lib/i18n';
import { useSession } from '@/lib/hooks';
import { Loading } from './ui';
import NotificationBell from './NotificationBell';

/** हिंदी | English switch — shown on every screen. */
export function LangToggle() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="no-print inline-flex rounded-full bg-brand-50 p-1 text-sm font-bold ring-1 ring-line" role="group" aria-label="भाषा / Language">
      {[
        ['hi', 'हिंदी', 'हिं'],
        ['en', 'English', 'EN'],
      ].map(([code, label, short]) => (
        <button
          key={code}
          type="button"
          lang={code}
          onClick={() => setLanguage(code)}
          aria-pressed={lang === code}
          className={`min-h-9 rounded-full px-2.5 transition sm:px-3 ${lang === code ? 'bg-maroon text-white shadow' : 'text-muted hover:text-maroon'}`}
        >
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Emblem({ className = 'size-11' }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full border-2 border-brand bg-brand-50 font-brand text-maroon ${className}`}>
      <span className="text-lg leading-none">श्री</span>
    </span>
  );
}

/** Live date + time (India time), top corner on every screen. Drawn only in the browser, so no server/browser mismatch. */
export function LiveClock() {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="w-20 shrink-0" aria-hidden />;
  const locale = i18n.language === 'en' ? 'en-IN' : 'hi-IN';
  const opts = { timeZone: 'Asia/Kolkata' };
  const time = now.toLocaleTimeString(locale, { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const date = now.toLocaleDateString(locale, { ...opts, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <time dateTime={now.toISOString()} className="shrink-0 text-right leading-tight" title={`${date} ${time}`}>
      <span className="num block whitespace-nowrap text-sm font-bold text-maroon sm:text-base">{time}</span>
      <span className="block whitespace-nowrap text-[0.7rem] text-muted sm:text-xs">{date}</span>
    </time>
  );
}

function BrandBar({ children, left }) {
  const { t } = useTranslation();
  return (
    <header className="no-print sticky top-0 z-30 border-b-4 border-brand bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        {left}
        <span className="hidden min-[400px]:block"><Emblem /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-brand text-lg leading-tight text-maroon sm:text-xl">{t('app.name')}</div>
          <div className="hidden truncate text-sm text-muted sm:block">{t('app.tagline')}</div>
        </div>
        <LiveClock />
        {children}
      </div>
    </header>
  );
}

export function PracticeBanner() {
  const { t } = useTranslation();
  return (
    <div className="no-print bg-test text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-sm font-semibold">
        <Icon name="flask" className="size-4 shrink-0" />
        <span className="sm:hidden">{t('practice.bannerShort')}</span>
        <span className="hidden sm:inline">{t('practice.banner')}</span>
      </div>
    </div>
  );
}

function PrintHeader() {
  const { t } = useTranslation();
  return (
    <div className="print-only mb-4 border-b-2 border-black pb-2 text-center">
      <div className="font-brand text-2xl">{t('app.name')}</div>
      <div className="text-sm">{t('app.tagline')}</div>
    </div>
  );
}

async function logout(router, role) {
  try {
    await api('/auth/logout', { method: 'POST', body: {} });
  } catch {}
  clearWho();
  router.replace('/');
}

export function PublicShell({ children, practice }) {
  return (
    <div className="min-h-dvh">
      <BrandBar>
        <LangToggle />
      </BrandBar>
      {practice && <PracticeBanner />}
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}

/** Bottom tab bar for phones: big tap targets, the current page highlighted. */
function BottomTabs({ items, className = '' }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  return (
    <nav className={`no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(60,30,0,.08)] backdrop-blur ${className}`} aria-label={t('nav.menu')}>
      <div className="mx-auto flex max-w-lg">
        {items.map(({ href, icon, label, onClick, exact }) => {
          const active = href && (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
          const cls = `flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-semibold leading-tight transition ${active ? 'text-maroon' : 'text-muted hover:text-maroon'}`;
          const inner = (
            <>
              <span className={`grid h-8 w-12 place-items-center rounded-full transition ${active ? 'bg-maroon text-white' : ''}`}><Icon name={icon} className="size-5" /></span>
              <span className="max-w-full truncate">{t(label)}</span>
            </>
          );
          return href
            ? <Link key={label} href={href} className={cls} aria-current={active ? 'page' : undefined}>{inner}</Link>
            : <button key={label} type="button" onClick={onClick} className={cls}>{inner}</button>;
        })}
      </div>
    </nav>
  );
}

const MEMBER_TABS = [
  { href: '/member', icon: 'home', label: 'nav.home', exact: true },
  { href: '/member/pay', icon: 'wallet', label: 'nav.pay' },
  { href: '/member/loan', icon: 'handCoins', label: 'nav.loan' },
  { href: '/member/month', icon: 'file', label: 'nav.statement' },
  { href: '/member/history', icon: 'history', label: 'nav.records' },
];

export function MemberShell({ children }) {
  const who = useSession('member');
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <BrandBar>
        <LangToggle />
        <button type="button" onClick={() => logout(router, 'member')} className="no-print grid size-11 place-items-center rounded-full text-maroon hover:bg-brand-50" aria-label={t('nav.logout')} title={t('nav.logout')}>
          <Icon name="logout" />
        </button>
      </BrandBar>
      {who?.env === 'test' && <PracticeBanner />}
      <main className="mx-auto max-w-lg px-4 pb-28 pt-3">
        <PrintHeader />
        {who ? children : <Loading />}
      </main>
      <BottomTabs items={MEMBER_TABS} />
    </div>
  );
}

// Spec §3B main menu, in this order.
// [href, icon, label, who may see it: null = everyone, 'manager' = developer/admin, else a work area]
const ADMIN_NAV = [
  ['/admin', 'home', 'nav.home', null],
  ['/admin/members', 'users', 'nav.members', 'members'],
  ['/admin/installments', 'calendarCheck', 'nav.installments', 'installments'],
  ['/admin/loans', 'handCoins', 'nav.loans', 'loans'],
  ['/admin/loan-applications', 'send', 'nav.loanApplications', 'loans'],
  ['/admin/payments', 'wallet', 'nav.payments', 'payments'],
  ['/admin/history', 'history', 'nav.history', 'history'],
  ['/admin/reports', 'chart', 'nav.reports', 'reports'],
  ['/admin/team', 'shield', 'nav.team', 'manager'],
  ['/admin/changes', 'log', 'settings.changeLog', null],
  ['/admin/platform', 'receipt', 'nav.platform', 'manager'],
  ['/admin/login-help', 'phone', 'nav.loginHelp', 'manager'],
  ['/admin/support', 'message', 'nav.support', null],
  ['/admin/settings', 'settings', 'nav.settings', 'manager'],
];

// the pages staff use most, for the phone tab bar (first four they may use, then "Menu")
const ADMIN_TABS = [
  ['/admin', 'home', 'nav.home', null],
  ['/admin/members', 'users', 'nav.members', 'members'],
  ['/admin/installments', 'calendarCheck', 'nav.installments', 'installments'],
  ['/admin/payments', 'wallet', 'nav.payments', 'payments'],
  ['/admin/loans', 'handCoins', 'nav.loans', 'loans'],
  ['/admin/reports', 'chart', 'nav.reports', 'reports'],
];

/** Can this staff user use a page/area? Mirrors the server's rules (the server decides). */
export function allowed(user, need) {
  if (!need) return true;
  const role = user?.staffRole;
  if (role === 'developer' || role === 'admin') return true;
  if (need === 'manager') return false;
  return (user?.permissions ?? []).includes(need);
}

function NavLinks({ onNavigate, user }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  return (
    <nav className="space-y-1">
      {ADMIN_NAV.filter(([, , , need]) => allowed(user, need)).map(([href, icon, label]) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold transition ${
              active ? 'bg-maroon text-white shadow-sm' : 'text-ink hover:bg-brand-50'
            }`}
          >
            <Icon name={icon} className="size-5 shrink-0" />
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }) {
  const who = useSession('admin');
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh">
      <BrandBar
        left={
          <button type="button" onClick={() => setOpen(true)} className="no-print -ml-1 grid size-11 place-items-center rounded-full text-maroon hover:bg-brand-50 lg:hidden" aria-label={t('nav.menu')}>
            <Icon name="menu" />
          </button>
        }
      >
        {who && <NotificationBell />}
        <div className="hidden sm:block"><LangToggle /></div>
        <button type="button" onClick={() => logout(router, 'admin')} className="no-print hidden min-h-11 items-center gap-2 rounded-full px-3 font-semibold text-maroon hover:bg-brand-50 sm:flex" title={t('nav.logout')}>
          <Icon name="logout" className="size-5" />
          <span className="hidden md:inline">{t('nav.logout')}</span>
        </button>
      </BrandBar>
      {who?.env === 'test' && <PracticeBanner />}

      <div className="mx-auto flex max-w-6xl gap-6 px-4">
        <aside className="no-print sticky top-[80px] hidden h-[calc(100dvh-96px)] w-60 shrink-0 overflow-y-auto py-6 lg:block">
          <div className="mb-3 px-3">
            <div className="font-semibold">{who?.user?.name}</div>
            <div className="text-sm text-muted">{who?.user?.staffRole ? t(`role.${who.user.staffRole}`) : ''}</div>
          </div>
          <NavLinks user={who?.user} />
        </aside>
        <main className="min-w-0 flex-1 pb-28 pt-4 sm:pt-6 lg:pb-16">
          <PrintHeader />
          {who ? children : <Loading />}
        </main>
      </div>

      <BottomTabs className="lg:hidden" items={[
        ...ADMIN_TABS.filter(([, , , need]) => allowed(who?.user, need)).slice(0, 4).map(([href, icon, label]) => ({ href, icon, label, exact: href === '/admin' })),
        { icon: 'menu', label: 'nav.menu', onClick: () => setOpen(true) },
      ]} />

      {open && (
        <div className="no-print fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-[84%] max-w-xs flex-col bg-cream shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b-4 border-brand bg-white px-4 py-3">
              <Emblem className="size-10" />
              <div className="flex-1"><div className="font-bold text-maroon">{who?.user?.name}</div><div className="text-sm text-muted">{who?.user?.staffRole ? t(`role.${who.user.staffRole}`) : ''}</div></div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full text-maroon hover:bg-brand-50" aria-label={t('common.close')}>
                <Icon name="x" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks user={who?.user} onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-3 border-t border-line p-3">
              <LangToggle />
              <button type="button" onClick={() => logout(router, 'admin')} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 font-semibold text-bad hover:bg-bad-bg">
                <Icon name="logout" className="size-5" />
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

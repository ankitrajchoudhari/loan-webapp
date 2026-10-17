'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons';
import { errorText } from '@/lib/i18n';
import { money } from '@/lib/format';
import { getWho } from '@/lib/api';

const VARIANTS = {
  primary: 'bg-maroon text-white shadow-sm hover:bg-maroon-dark',
  secondary: 'border-2 border-maroon/25 bg-white text-maroon hover:bg-brand-50',
  ghost: 'text-maroon hover:bg-brand-50',
  danger: 'bg-bad text-white hover:brightness-95',
  success: 'bg-ok text-white hover:brightness-95',
};
const SIZES = {
  lg: 'min-h-14 px-5 text-lg rounded-2xl',
  md: 'min-h-12 px-4 text-base rounded-xl',
  sm: 'min-h-10 px-3 text-sm rounded-lg',
};

export const btnClass = (variant = 'primary', size = 'lg', full = false) =>
  `inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''}`;

export function Button({ variant, size, full, loading, icon, className = '', children, disabled, type = 'button', ...props }) {
  return (
    <button type={type} className={`${btnClass(variant, size, full)} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner small /> : icon ? <Icon name={icon} className="size-5 shrink-0" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant, size, full, icon, className = '', children }) {
  return (
    <Link href={href} className={`${btnClass(variant, size, full)} ${className}`}>
      {icon && <Icon name={icon} className="size-5 shrink-0" />}
      {children}
    </Link>
  );
}

export function Card({ title, icon, action, tone, className = '', children }) {
  const ring = tone === 'test' ? 'border-test/40 bg-test-bg/40' : 'border-line bg-white';
  return (
    <section className={`print-card rounded-2xl border p-5 shadow-[0_1px_3px_rgba(60,30,0,.06)] ${ring} ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2.5 text-xl font-bold text-maroon">
              {icon && (
                <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-dark">
                  <Icon name={icon} className="size-5" />
                </span>
              )}
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Label/value line used throughout statements. */
export function Row({ label, value, strong, tone, sub }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${strong ? 'mt-1 border-t-2 border-dashed border-line pt-3.5' : 'border-b border-line/60 last:border-0'}`}>
      <span className={`text-muted ${strong ? 'font-semibold text-ink' : ''}`}>
        {label}
        {sub && <span className="block text-sm">{sub}</span>}
      </span>
      <span className={`num text-right font-semibold ${strong ? 'text-xl' : ''} ${color}`}>{value}</span>
    </div>
  );
}

export const Money = ({ value }) => <span className="num">{money(value)}</span>;

export function Badge({ tone = 'neutral', icon, children, className = '' }) {
  const tones = {
    ok: 'bg-ok-bg text-ok',
    warn: 'bg-warn-bg text-warn',
    bad: 'bg-bad-bg text-bad',
    test: 'bg-test-bg text-test',
    brand: 'bg-brand-50 text-brand-dark',
    neutral: 'bg-stone-100 text-muted',
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ${tones[tone]} ${className}`}>
      {icon && <Icon name={icon} className="size-3.5" strokeWidth={3} />}
      {children}
    </span>
  );
}

export function TestBadge() {
  const { t } = useTranslation();
  return <Badge tone="test">{t('practice.badge')}</Badge>;
}

const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', brand: 'text-brand-dark', test: 'text-test' };
const TONE_BUBBLE = { ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', brand: 'bg-brand-50 text-brand-dark', test: 'bg-test-bg text-test' };

/** Figure tile with a coloured icon bubble. */
export function Stat({ label, value, sub, tone, icon, href }) {
  const body = (
    <div className="flex items-start gap-3">
      {icon && (
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${TONE_BUBBLE[tone] ?? 'bg-brand-50 text-maroon'}`}>
          <Icon name={icon} className="size-5" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight text-muted">{label}</div>
        <div className={`num mt-1 text-2xl font-bold ${TONE_TEXT[tone] ?? 'text-maroon'}`}>{value}</div>
        {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
      </div>
    </div>
  );
  const cls = 'print-card block rounded-2xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(60,30,0,.06)]';
  return href ? <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Thin progress bar (0–100). */
export function Progress({ value, tone = 'ok', label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const bar = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', brand: 'bg-brand', light: 'bg-white' }[tone] ?? 'bg-ok';
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="num font-semibold">{pct}%</span></div>}
      <div className={`h-2.5 w-full overflow-hidden rounded-full ${tone === 'light' ? 'bg-white/25' : 'bg-stone-200'}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Small key figure: label on top, value below. */
export function Kpi({ label, value, tone, sub }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`num text-lg font-bold ${TONE_TEXT[tone] ?? 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-base font-semibold text-ink">
          {label} {required && <span className="text-bad">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-sm text-muted">{hint}</p>}
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
    </div>
  );
}

const inputCls =
  'w-full min-h-14 rounded-xl border-2 border-line bg-white px-4 text-lg text-ink placeholder:text-stone-400 focus:border-brand focus:outline-none disabled:bg-stone-50';

export const Input = ({ className = '', ...props }) => <input className={`${inputCls} ${className}`} {...props} />;

export const TextArea = ({ className = '', ...props }) => <textarea className={`${inputCls} py-3 ${className}`} rows={3} {...props} />;

export function Select({ className = '', children, ...props }) {
  return (
    <div className="relative">
      <select className={`${inputCls} appearance-none pr-10 ${className}`} {...props}>
        {children}
      </select>
      <Icon name="chevronRight" className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 rotate-90 text-muted" />
    </div>
  );
}

/** Rupee amount box. value/onChange work with the typed text (e.g. "1,000.50"), kept exact. */
export function MoneyInput({ value, onChange, ...props }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">₹</span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="num pl-9"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        {...props}
      />
    </div>
  );
}

/** Installment status chip: paid / partial / pending / not due / future. */
export function StatusBadge({ status }) {
  const { t } = useTranslation();
  const tone = { paid: 'ok', partial: 'warn', pending: 'bad', not_due: 'neutral', future: 'neutral' }[status] ?? 'neutral';
  const icon = { paid: 'check', partial: 'clock', pending: 'alert' }[status];
  return <Badge tone={tone} icon={icon}>{t(`status.${status}`)}</Badge>;
}

/** Horizontally scrollable table wrapper for phones. */
export function TableWrap({ children, min = 560 }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="sheet" style={{ minWidth: min }}>{children}</table>
    </div>
  );
}

/** Segmented two/three-way choice with big tap targets. */
export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex w-full rounded-xl border-2 border-line bg-white p-1" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        const tone = on ? (o.tone === 'bad' ? 'bg-bad text-white' : o.tone === 'ok' ? 'bg-ok text-white' : 'bg-maroon text-white') : 'text-muted hover:bg-brand-50';
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-semibold transition ${size === 'md' ? 'min-h-11 text-base' : 'min-h-9 text-sm'} ${tone}`}
          >
            {o.icon && <Icon name={o.icon} className="size-4" strokeWidth={3} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-stone-300 transition peer-checked:bg-maroon" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Spinner({ small }) {
  return <span className={`inline-block animate-spin rounded-full border-current border-r-transparent ${small ? 'size-5 border-2' : 'size-9 border-4 text-brand'}`} aria-hidden="true" />;
}

export function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted" role="status">
      <Spinner />
      <span>{t('common.loading')}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad-bg p-4 text-bad" role="alert">
      <Icon name="alert" className="mt-0.5 size-6 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">{typeof error === 'string' ? error : errorText(t, error)}</p>
        {getWho()?.role === 'admin' && getWho()?.user?.staffRole !== 'developer' && typeof error !== 'string' && ['server_error', 'network', 'not_found', 'forbidden'].includes(error.code) && (
          <Link href={`/admin/support?error=${encodeURIComponent(error.code)}&page=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`} className="mt-1 mr-4 inline-block font-semibold underline underline-offset-4">
            {t('support.contact')}
          </Link>
        )}
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-1 font-semibold underline underline-offset-4">
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function Notice({ tone = 'warn', icon = 'alert', children }) {
  const tones = { warn: 'bg-warn-bg text-warn border-warn/20', ok: 'bg-ok-bg text-ok border-ok/20', test: 'bg-test-bg text-test border-test/20', brand: 'bg-brand-50 text-brand-dark border-brand/15', bad: 'bg-bad-bg text-bad border-bad/20' };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${tones[tone]}`}>
      <Icon name={icon} className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 font-medium">{children}</div>
    </div>
  );
}

export function Empty({ icon = 'file', children }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center text-muted">
      <Icon name={icon} className="size-10 opacity-60" />
      <p className="text-lg">{children}</p>
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Modal({ open, onClose, title, children, footer, wide }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-xl font-bold text-maroon">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted hover:bg-stone-100" aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">{footer}</footer>}
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, back, action }) {
  const { t } = useTranslation();
  return (
    <div className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        {back && (
          <Link href={back} className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-maroon hover:bg-brand-50" aria-label={t('common.back')}>
            <Icon name="back" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold leading-tight text-maroon sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, src, size = 'md' }) {
  const s = size === 'lg' ? 'size-20 text-2xl' : size === 'sm' ? 'size-10 text-sm' : 'size-12 text-base';
  if (src) return <img src={src} alt="" className={`${s} shrink-0 rounded-full object-cover ring-2 ring-brand-100`} />;
  const letters = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  return <span className={`${s} grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-dark`}>{letters}</span>;
}

'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Notice, PageTitle, Segmented, TextArea } from '@/components/ui';
import { useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api, getWho } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

/**
 * सहायता (Support). Admins / sub-admins raise a problem; the developer answers and marks it done.
 * Both sides get a bell notification at each step.
 */
export default function Support() {
  const { t } = useTranslation();
  const isDev = getWho()?.user?.staffRole === 'developer';
  const [status, setStatus] = useState('open');
  const { data, error, loading, reload } = useApi('/support/tickets', { status: status === 'all' ? '' : status });

  return (
    <div className="space-y-4">
      <PageTitle title={isDev ? t('support.devTitle') : t('nav.support')} subtitle={isDev ? t('support.devSubtitle') : t('support.subtitle')} />
      {!isDev && <NewTicket onDone={() => { setStatus('open'); reload(); }} />}
      <Segmented value={status} onChange={setStatus} size="sm"
        options={[{ value: 'open', label: t('support.open') }, { value: 'resolved', label: t('support.resolved') }, { value: 'all', label: t('common.all') }]} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : data?.tickets.length === 0 ? (
        <p className="text-muted">{t('support.none')}</p>
      ) : (
        <div className="space-y-3">
          {data?.tickets.map((tk) => <Ticket key={tk.id} tk={tk} isDev={isDev} onChange={reload} />)}
        </div>
      )}
    </div>
  );
}

function NewTicket({ onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [f, setF] = useState({ subject: '', details: '', page: '', errorCode: '' });
  const { busy, error, run } = useAction(toast);

  // arriving from an error message: "?error=code&page=/admin/..."
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('error');
    if (code) setF((s) => ({ ...s, errorCode: code, page: q.get('page') ?? '', subject: s.subject || t('support.autoSubject') }));
  }, [t]);

  const send = async (e) => {
    e.preventDefault();
    if (await run(() => api('/support/tickets', { method: 'POST', body: f }), t('support.sent'))) {
      setF({ subject: '', details: '', page: '', errorCode: '' });
      onDone();
    }
  };

  return (
    <Card title={t('support.raise')} icon="message">
      <form onSubmit={send} className="space-y-4" noValidate>
        {f.errorCode && <Notice>{t('support.fromError', { code: f.errorCode, page: f.page || '—' })}</Notice>}
        <Field label={t('support.subject')} required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} /></Field>
        <Field label={t('support.details')} hint={t('support.detailsHint')} required>
          <TextArea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} rows={4} maxLength={4000} />
        </Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" icon="message" loading={busy} disabled={f.subject.trim().length < 3 || f.details.trim().length < 3}>{t('support.send')}</Button>
      </form>
    </Card>
  );
}

function Ticket({ tk, isDev, onChange }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const { busy, error, run } = useAction(toast);
  const send = async () => {
    if (await run(() => api(`/support/tickets/${tk.id}/messages`, { method: 'POST', body: { text: reply } }), t('support.replySent'))) {
      setReply('');
      onChange();
    }
  };
  const resolve = async () => {
    if (await run(() => api(`/support/tickets/${tk.id}/resolve`, { method: 'POST', body: reply.trim() ? { note: reply } : {} }), t('support.markedDone'))) {
      setReply('');
      onChange();
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-maroon">#{tk.ticketNo} · {tk.subject}</span>
        {tk.status === 'resolved' ? <Badge tone="ok" icon="check">{t('support.resolved')}</Badge> : <Badge tone="warn">{t('support.open')}</Badge>}
      </div>
      <div className="num text-sm text-muted">
        {tk.createdBy ? `${tk.createdBy.name} (${t(`role.${tk.createdBy.role}`)})` : ''} · {fmtDateTime(tk.createdAt)}
        {tk.errorCode ? ` · ${tk.errorCode}` : ''}{tk.page ? ` · ${tk.page}` : ''}
      </div>
      <ol className="mt-3 space-y-2">
        {tk.messages.map((m, i) => (
          <li key={i} className={`rounded-xl p-3 ${m.by === 'support' ? 'ml-6 bg-brand-50' : 'mr-6 bg-stone-50'}`}>
            <div className="text-sm font-semibold">{m.name} <span className="num font-normal text-muted">· {fmtDateTime(m.at)}</span></div>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </li>
        ))}
      </ol>
      <div className="mt-3 space-y-2">
        <TextArea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={4000} placeholder={isDev ? t('support.replyDev') : t('support.replyStaff')} />
        {error && <ErrorBox error={error} />}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon="message" loading={busy} disabled={!reply.trim()} onClick={send}>{t('support.reply')}</Button>
          {isDev && tk.status === 'open' && <Button size="sm" variant="success" icon="check" loading={busy} onClick={resolve}>{t('support.markDone')}</Button>}
        </div>
      </div>
    </Card>
  );
}

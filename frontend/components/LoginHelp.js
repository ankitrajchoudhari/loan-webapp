'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorBox, Field, Modal, TextArea } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api, getWho } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export const HELP_TONE = { open: 'bad', seen: 'warn', fixed: 'ok' };

/** One login problem with its actions: working on it / fixed (with a note for the person). */
export function HelpCard({ h, onChange, compact }) {
  const { t } = useTranslation();
  const [reply, setReply] = useState('');
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const act = async (kind, body) => {
    setBusy(kind);
    setError(null);
    try {
      const r = await api(`/help-requests/${h.id}/${kind}`, { method: 'POST', body: body ?? {} });
      onChange?.(r.request);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={`space-y-3 ${compact ? '' : 'surface p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-maroon">#{h.requestNo}</span>
        <span className="text-lg font-bold">{h.name || t('help.unknownName')}</span>
        <a href={`tel:+91${h.mobile}`} className="num font-semibold text-maroon underline underline-offset-2">+91 {h.mobile}</a>
        {h.env === 'test' && <Badge tone="test">{t('practice.short')}</Badge>}
        <Badge tone={HELP_TONE[h.status]} className="ml-auto">{t(`help.status.${h.status}`)}</Badge>
      </div>
      <div className="rounded-xl bg-bad-bg/60 px-3 py-2">
        <div className="font-semibold text-bad">{t(`help.problem.${h.problem}`)}</div>
        {h.message && <p className="mt-0.5 whitespace-pre-wrap text-ink">{h.message}</p>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>{fmtDateTime(h.createdAt)}</span>
        <span>{t('help.sentToShort', { who: t(h.sendTo === 'developer' ? 'help.toDeveloper' : 'help.toAdmin') })}</span>
        {h.memberId ? <Link href={`/admin/members/${h.memberId}`} className="font-semibold text-maroon underline">{t('help.openMember')}</Link> : <span className="font-semibold text-warn">{t('help.notAMember')}</span>}
      </div>
      {h.status === 'fixed' ? (
        <p className="text-sm font-semibold text-ok">{t('help.fixedAt', { date: fmtDateTime(h.fixedAt) })}{h.reply ? ` — ${h.reply}` : ''}</p>
      ) : fixing ? (
        <div className="space-y-2">
          <Field label={t('help.replyLabel')} hint={t('help.replyHint')}>
            <TextArea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="md" onClick={() => setFixing(false)}>{t('common.cancel')}</Button>
            <Button variant="success" size="md" icon="check" loading={busy === 'fixed'} onClick={() => act('fixed', { reply })}>{t('help.markFixed')}</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="md" icon="clock" disabled={h.status === 'seen'} loading={busy === 'seen'} onClick={() => act('seen')}>{h.status === 'seen' ? t('help.status.seen') : t('help.markSeen')}</Button>
          <Button variant="success" size="md" icon="check" onClick={() => setFixing(true)}>{t('help.markFixed')}</Button>
        </div>
      )}
      {error && <ErrorBox error={error} />}
    </div>
  );
}

/**
 * Admin / developer: a pop-up as soon as someone asks for login help (checked every 15 seconds).
 * Admins get requests sent to the admin; the developer gets all. "Later" hides that one for this session.
 */
export function LoginHelpPopup() {
  const { t } = useTranslation();
  const role = getWho()?.user?.staffRole;
  const [list, setList] = useState([]);
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('samiti.helpLater')) ?? []; } catch { return []; }
  });

  useEffect(() => {
    if (role !== 'admin' && role !== 'developer') return undefined;
    let stop = false;
    const load = () => api('/help-requests', { query: { active: 1 } }).then((r) => !stop && setList(r.requests)).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [role]);

  const h = list.find((x) => x.status === 'open' && !hidden.includes(x.id));
  if (!h) return null;
  const later = () => {
    const next = [...hidden, h.id];
    setHidden(next);
    try { sessionStorage.setItem('samiti.helpLater', JSON.stringify(next)); } catch {}
  };
  return (
    <Modal open onClose={later} title={<span className="flex items-center gap-2"><span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-bad" /></span>{t('help.popupTitle')}</span>} wide
      footer={<Button variant="secondary" size="md" onClick={later}>{t('platform.later')}</Button>}>
      <HelpCard h={h} compact onChange={(u) => setList((l) => l.map((x) => (x.id === u.id ? { ...x, ...u } : x)))} />
    </Modal>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, MoneyInput, Notice, PageTitle, Segmented, Toggle } from '@/components/ui';
import { ChangeHistory, useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api, clearWho, download, getWho } from '@/lib/api';
import { rupeesText } from '@/lib/format';
import { LangToggle, allowed } from '@/components/shell';

/** Spec §3B "खाते की सेटिंग" — defaults, PIN, practice mode, backup, change log. */
export default function Settings() {
  const { t } = useTranslation();
  const { data, error, reload } = useApi('/settings');
  if (!allowed(getWho()?.user, 'manager')) return <Notice>{t('err.forbidden')}</Notice>;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageTitle title={t('nav.settings')} />
      <Card title={t('settings.language')} icon="message"><LangToggle /></Card>
      <UpiCard />
      <Defaults settings={data.settings} onSaved={reload} />
      <Practice env={data.env} available={data.testEnv} />
      <Backup />
      <ChangeLog />
    </div>
  );
}

function Defaults({ settings, onSaved }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [f, setF] = useState({
    defaultInstallmentPaise: rupeesText(settings.defaultInstallmentPaise),
    defaultInterestMethod: settings.defaultInterestMethod,
    defaultRateBp: String(settings.defaultRateBp / 100),
    defaultRatePeriod: settings.defaultRatePeriod,
    defaultFixedInterestPaise: settings.defaultFixedInterestPaise ? rupeesText(settings.defaultFixedInterestPaise) : '',
    loanApplyMaxPaise: settings.loanApplyMaxPaise ? rupeesText(settings.loanApplyMaxPaise) : '',
    loanApplyMaxMonths: String(settings.loanApplyMaxMonths ?? 36),
  });
  const { busy, error, run } = useAction(toast);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (await run(() => api('/settings', { method: 'PUT', body: f }), t('common.savedOk'))) onSaved();
  };
  return (
    <Card title={t('settings.defaults')} icon="settings">
      <div className="space-y-5">
        <Field label={t('settings.defaultInstallment')} hint={t('settings.defaultInstallmentHint')}>
          <MoneyInput value={f.defaultInstallmentPaise} onChange={set('defaultInstallmentPaise')} />
        </Field>
        <Field label={t('settings.defaultMethod')}>
          <Segmented value={f.defaultInterestMethod} onChange={set('defaultInterestMethod')} size="sm"
            options={['reducing', 'flat', 'fixed'].map((m) => ({ value: m, label: t(`loan.methodShort.${m}`) }))} />
        </Field>
        {f.defaultInterestMethod === 'fixed' ? (
          <Field label={t('settings.defaultFixedInterest')}>
            <MoneyInput value={f.defaultFixedInterestPaise} onChange={set('defaultFixedInterestPaise')} />
          </Field>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('loans.rate')}>
              <Input inputMode="decimal" value={f.defaultRateBp} onChange={(e) => set('defaultRateBp')(e.target.value.replace(/[^\d.]/g, ''))} className="num" />
            </Field>
            <Field label={t('loans.ratePeriod')}>
              <Segmented value={f.defaultRatePeriod} onChange={set('defaultRatePeriod')} options={[{ value: 'month', label: t('loan.perMonth') }, { value: 'year', label: t('loan.perYear') }]} />
            </Field>
          </div>
        )}
        <div className="grid gap-5 rounded-2xl bg-brand-50 p-4 sm:grid-cols-2">
          <p className="font-semibold text-maroon sm:col-span-2">{t('settings.loanApplyTitle')}</p>
          <Field label={t('settings.loanApplyMax')} hint={t('settings.loanApplyMaxHint')}>
            <MoneyInput value={f.loanApplyMaxPaise} onChange={set('loanApplyMaxPaise')} />
          </Field>
          <Field label={t('settings.loanApplyMaxMonths')}>
            <Input inputMode="numeric" value={f.loanApplyMaxMonths} onChange={(e) => set('loanApplyMaxMonths')(e.target.value.replace(/\D/g, '').slice(0, 3))} className="num" />
          </Field>
        </div>
        <p className="text-sm text-muted">{t('settings.defaultsNote')}</p>
        {error && <ErrorBox error={error} />}
        <Button icon="check" loading={busy} onClick={save}>{t('label.saveChanges')}</Button>
      </div>
    </Card>
  );
}

function Practice({ env, available }) {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [withSamples, setWithSamples] = useState(true);
  const { busy, error, run } = useAction(toast);
  const stats = useApi(env === 'test' ? '/practice' : null);

  const switchMode = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {}
    clearWho();
    router.replace('/');
  };
  const reset = async () => {
    const r = await run(() => api('/practice/reset', { method: 'POST', body: { withSamples } }), t('practice.resetDone'));
    setConfirm(false);
    if (r) stats.reload();
  };

  if (!available) return <Card title={t('practice.title')} icon="flask"><p className="text-muted">{t('practice.off')}</p></Card>;
  return (
    <Card title={t('practice.title')} icon="flask" action={env === 'test' ? <Badge tone="test">{t('practice.badge')}</Badge> : <Badge tone="ok">{t('practice.liveBadge')}</Badge>}>
      <div className="space-y-4">
        <p>{t('practice.explain')}</p>
        {env === 'test' ? (
          <>
            {stats.data && <p className="num text-muted">{t('practice.stats', stats.data)}</p>}
            <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>{t('practice.reset')}</Button>
            <Button variant="secondary" icon="logout" onClick={switchMode} className="sm:ml-3">{t('practice.backToLive')}</Button>
            <Notice tone="test" icon="flask">{t('practice.memberLogin')}</Notice>
          </>
        ) : (
          <Button variant="secondary" icon="flask" onClick={switchMode}>{t('practice.open')}</Button>
        )}
        {error && <ErrorBox error={error} />}
      </div>
      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title={t('practice.reset')}
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button variant="danger" size="md" loading={busy} onClick={reset}>{t('practice.resetConfirm')}</Button></>}>
          <div className="space-y-4">
            <p>{t('practice.resetWarn')}</p>
            <Toggle checked={withSamples} onChange={setWithSamples} label={t('practice.withSamples')} description={t('practice.withSamplesHint')} />
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Backup() {
  const { t } = useTranslation();
  const toast = useToast();
  const { busy, error, run } = useAction(toast);
  return (
    <Card title={t('settings.backup')} icon="download">
      <p className="mb-4">{t('settings.backupExplain')}</p>
      {error && <div className="mb-3"><ErrorBox error={error} /></div>}
      <Button icon="download" loading={busy} onClick={() => run(() => download('/backup'), t('settings.backupDone'))}>{t('settings.backupDownload')}</Button>
    </Card>
  );
}

function ChangeLog() {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const { data, loading } = useApi('/audit-log', { limit: 30, offset });
  useEffect(() => {
    if (data) setEntries((e) => (offset === 0 ? data.entries : [...e, ...data.entries]));
  }, [data, offset]);
  return (
    <Card title={t('settings.changeLog')} icon="log">
      <p className="mb-3 text-sm text-muted">{t('settings.changeLogHint')}</p>
      {loading && !entries.length ? <Loading /> : (
        <ChangeHistory entries={entries.map((e) => ({ ...e, actorName: e.member ? `${e.actorName ?? ''} → ${e.member.fullName} (${e.member.memberNo})` : e.actorName }))} />
      )}
      {data && entries.length < data.total && (
        <Button variant="secondary" full className="mt-3" loading={loading} onClick={() => setOffset(entries.length)}>{t('common.more')}</Button>
      )}
    </Card>
  );
}

/** Shrinks an uploaded QR photo so it is light to store and quick to load on phones. */
function readQr(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** One UPI id + QR shown to members on the pay page. Only an admin can change it; others see who set it. */
function UpiCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, reload } = useApi('/upi-settings');
  const [f, setF] = useState(null);
  const { busy, error, setError, run } = useAction(toast);
  useEffect(() => {
    if (data) setF({ upiId: data.upi?.upiId ?? '', payeeName: data.upi?.payeeName ?? '', qrImage: data.upi?.qrImage ?? '' });
  }, [data]);
  if (!data || !f) return <Card title={t('upi.title')} icon="wallet"><Loading /></Card>;
  const upi = data.upi;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setF((s) => ({ ...s, qrImage: '' }));
      const qrImage = await readQr(file);
      setF((s) => ({ ...s, qrImage }));
    } catch {
      setError('qr_invalid');
    }
  };
  const save = async () => {
    if (await run(() => api('/upi-settings', { method: 'PUT', body: f }), t('upi.saved'))) reload();
  };

  return (
    <Card title={t('upi.title')} icon="wallet">
      <div className="space-y-4">
        {upi?.setBy && (
          <Notice tone="brand" icon="shield">
            {t('upi.setBy', { name: upi.setBy.name, role: t(`role.${upi.setBy.role}`, { defaultValue: upi.setBy.role }), date: fmtDateTimeSafe(upi.setAt) })}
          </Notice>
        )}
        {!data.canEdit ? (
          upi ? (
            <div className="flex flex-wrap items-center gap-4">
              {upi.qrImage && <img src={upi.qrImage} alt="QR" className="size-32 rounded-xl border border-line bg-white object-contain p-1" />}
              <div><div className="num text-lg font-bold">{upi.upiId}</div><div className="text-muted">{upi.payeeName}</div></div>
            </div>
          ) : (
            <p className="text-muted">{t('upi.notSet')}</p>
          )
        ) : (
          <>
            <p className="text-sm text-muted">{t('upi.help')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('upi.id')} hint={t('upi.idHint')}><Input value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value.trim() })} placeholder="samiti@okaxis" autoComplete="off" /></Field>
              <Field label={t('upi.payee')}><Input value={f.payeeName} onChange={(e) => setF({ ...f, payeeName: e.target.value })} maxLength={100} /></Field>
            </div>
            <Field label={t('upi.qr')} hint={t('upi.qrHint')}>
              <div className="flex flex-wrap items-center gap-4">
                {f.qrImage && <img src={f.qrImage} alt="QR" className="size-32 rounded-xl border border-line bg-white object-contain p-1" />}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick}
                  className="text-base file:mr-3 file:rounded-lg file:border-0 file:bg-maroon file:px-4 file:py-2 file:font-semibold file:text-white" />
              </div>
            </Field>
            {error && <ErrorBox error={error} />}
            <Button icon="check" loading={busy} disabled={!f.upiId || !f.payeeName || !f.qrImage} onClick={save}>{t('label.saveChanges')}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

const fmtDateTimeSafe = (v) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

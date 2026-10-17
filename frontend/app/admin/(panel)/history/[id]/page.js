'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ErrorBox, Loading, Modal, Notice, PageTitle, Segmented, Field, Select, TableWrap, Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';
import HistoryRowForm, { KINDS, blankRow, describeRow } from '@/components/HistoryRowForm';
import { Problems, Warnings, useAction } from '@/components/admin';
import { useToast } from '@/app/providers';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';

const STATUS_TONE = { needs_check: 'warn', verified: 'brand', posted: 'ok' };

export default function Batch({ params }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(`/history/batches/${id}`);
  const [tab, setTab] = useState('rows');
  const [editRow, setEditRow] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirmPost, setConfirmPost] = useState(false);
  const { busy, error: actionError, run } = useAction(toast);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const { batch, rows, totals } = data;
  const open = rows.filter((r) => r.status !== 'posted');
  const toggle = (rid) => setSelected((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : [...s, rid]));

  const verify = async (rowIds, verified) => {
    const r = await run(() => api(`/history/batches/${id}/verify`, { method: 'POST', body: { rowIds, verified } }));
    if (r) {
      toast(r.blocked.length ? t('history.verifiedSome', { n: r.updated, lines: r.blocked.join(', ') }) : t('history.verifiedDone', { n: r.updated }), r.blocked.length ? 'bad' : 'ok');
      setSelected([]);
      reload();
    }
  };
  const post = async () => {
    const r = await run(() => api(`/history/batches/${id}/post`, { method: 'POST', body: {} }));
    setConfirmPost(false);
    if (r) {
      toast(t('history.postedDone', { n: r.posted.installment + r.posted.loan + r.posted.repayment }));
      reload();
    }
  };
  const removeRow = async (rid) => {
    if (await run(() => api(`/history/rows/${rid}`, { method: 'DELETE' }), t('history.rowRemoved'))) reload();
  };
  const removeBatch = async () => {
    if (await run(() => api(`/history/batches/${id}`, { method: 'DELETE' }), t('history.batchRemoved'))) router.replace('/admin/history');
  };

  return (
    <div className="space-y-4">
      <PageTitle title={batch.title} subtitle={batch.note} back="/admin/history"
        action={totals.posted === 0 && <Button size="md" variant="secondary" icon="trash" onClick={removeBatch}>{t('history.deleteBatch')}</Button>} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['needsCheck', 'warn'], ['verified', 'brand'], ['posted', 'ok'], ['withErrors', 'bad']].map(([k, tone]) => (
          <div key={k} className={`rounded-2xl p-3 text-center ${tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'brand' ? 'bg-brand-50 text-brand-dark' : tone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
            <div className="text-sm font-semibold">{t(`history.count.${k}`)}</div>
            <div className="num text-2xl font-bold">{totals[k]}</div>
          </div>
        ))}
      </div>

      {totals.verified > 0 && (
        <Card tone="test" className="!border-ok/40 !bg-ok-bg/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 font-semibold">{t('history.readyToPost', { n: totals.verified })}</p>
            <Button icon="check" variant="success" onClick={() => setConfirmPost(true)}>{t('history.post')}</Button>
          </div>
        </Card>
      )}
      {actionError && <ErrorBox error={actionError} />}
      {actionError?.code === 'post_failed' && (
        <Notice>{actionError.details?.failures?.map((f) => `${t('history.line', { n: f.lineNo })}: ${t(`err.${f.code}`, { defaultValue: t('err.generic') })}`).join(' · ')}</Notice>
      )}

      <Segmented value={tab} onChange={setTab} options={[{ value: 'rows', label: t('history.tab.rows') }, { value: 'add', label: t('history.tab.add') }, { value: 'import', label: t('history.tab.import') }]} />

      {tab === 'rows' && (
        <Card title={t('history.tab.rows')} icon="log">
          {rows.length === 0 ? <p className="text-muted">{t('history.noRows')}</p> : (
            <>
              {open.length > 0 && (
                <div className="no-print mb-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(selected.length === open.length ? [] : open.map((r) => r.id))}>
                    {selected.length === open.length ? t('history.selectNone') : t('history.selectAll')}
                  </Button>
                  <Button size="sm" icon="check" disabled={!selected.length} loading={busy} onClick={() => verify(selected, true)}>{t('history.markVerified', { n: selected.length })}</Button>
                  <Button size="sm" variant="secondary" disabled={!selected.length} onClick={() => verify(selected, false)}>{t('history.markUnverified')}</Button>
                </div>
              )}
              <TableWrap min={760}>
                <thead>
                  <tr>
                    <th />
                    <th>#</th>
                    <th>{t('history.type')}</th>
                    <th>{t('field.memberName')}</th>
                    <th>{t('history.details')}</th>
                    <th>{t('stmt.status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.check.errors.length ? 'bg-bad-bg/40' : ''}>
                      <td>{r.status !== 'posted' && <input type="checkbox" className="size-5 accent-[#7a1f2b]" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={t('history.line', { n: r.lineNo })} />}</td>
                      <td className="num">{r.lineNo}</td>
                      <td>{t(`history.kind.${r.kind}`)}</td>
                      <td>
                        <div className="font-semibold">{r.check.memberName ?? '—'}</div>
                        <div className="num text-sm text-muted">{t('field.memberNo')} {r.data.memberNo ?? '—'}</div>
                      </td>
                      <td>
                        <div>{describeRow(t, r.kind, r.data)}</div>
                        {r.check.errors.map((c) => <div key={c} className="text-sm font-semibold text-bad">✗ {t(`err.${c}`, { defaultValue: t('err.generic') })}</div>)}
                        {r.check.warnings.map((c) => <div key={c} className="text-sm text-warn">! {t(`warn.${c}`)}</div>)}
                      </td>
                      <td><Badge tone={STATUS_TONE[r.status]}>{t(`history.status.${r.status}`)}</Badge></td>
                      <td className="text-right">
                        {r.status !== 'posted' && (
                          <div className="no-print flex justify-end gap-1">
                            {r.status === 'needs_check' && !r.check.errors.length && <Button size="sm" variant="ghost" icon="check" onClick={() => verify([r.id], true)}>{t('history.ok')}</Button>}
                            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditRow(r)}>{t('common.correct')}</Button>
                            <Button size="sm" variant="ghost" icon="trash" onClick={() => removeRow(r.id)} aria-label={t('common.remove')} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </>
          )}
        </Card>
      )}

      {tab === 'add' && <AddRow batchId={id} onAdded={() => { reload(); toast(t('history.rowAdded')); }} />}
      {tab === 'import' && <ImportSheet batchId={id} onDone={() => { reload(); setTab('rows'); }} />}

      {editRow && <EditRowDialog batchId={id} row={editRow} onClose={() => setEditRow(null)} onDone={() => { setEditRow(null); reload(); toast(t('common.savedOk')); }} />}

      {confirmPost && (
        <Modal open onClose={() => setConfirmPost(false)} title={t('history.post')}
          footer={<><Button variant="secondary" size="md" onClick={() => setConfirmPost(false)}>{t('common.cancel')}</Button><Button variant="success" size="md" icon="check" loading={busy} onClick={post}>{t('history.postConfirm')}</Button></>}>
          <div className="space-y-3">
            <p className="text-lg">{t('history.postQuestion', { n: totals.verified })}</p>
            <Notice>{t('history.postNote')}</Notice>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Manual entry: fill → "पूरा विवरण देखें" (check) → add to batch. */
function AddRow({ batchId, onAdded }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState('installment');
  const [d, setD] = useState(blankRow('installment'));
  const [checked, setChecked] = useState(null);
  const { busy, error, run } = useAction();

  const changeKind = (k) => {
    setKind(k);
    setD(blankRow(k));
    setChecked(null);
  };
  const check = async () => {
    const r = await run(() => api(`/history/batches/${batchId}/check`, { method: 'POST', body: { kind, data: d } }));
    if (r) setChecked(r);
  };
  const add = async (verified) => {
    const r = await run(() => api(`/history/batches/${batchId}/rows`, { method: 'POST', body: { kind, data: d, verified } }));
    if (r) {
      setChecked(null);
      setD((s) => ({ ...blankRow(kind), memberNo: s.memberNo, ...(kind === 'installment' ? { month: s.month, year: s.year, amount: s.amount, method: s.method } : {}) }));
      onAdded();
    }
  };

  return (
    <Card title={t('history.tab.add')} icon="plus">
      <div className="space-y-5">
        <Field label={t('history.recordType')}>
          <Segmented value={kind} onChange={changeKind} options={KINDS.map((k) => ({ value: k, label: t(`history.kind.${k}`) }))} />
        </Field>
        <HistoryRowForm key={kind} kind={kind} d={d} setD={(fn) => { setD(fn); setChecked(null); }} />
        {error && <ErrorBox error={error} />}
        <Button full icon="file" loading={busy && !checked} onClick={check} disabled={!d.memberNo}>{t('history.checkFull')}</Button>
      </div>
      {checked && (
        <Modal open onClose={() => setChecked(null)} title={t('history.checkFull')}
          footer={
            <>
              <Button variant="secondary" size="md" icon="edit" onClick={() => setChecked(null)}>{t('common.changeSomething')}</Button>
              <Button variant="secondary" size="md" loading={busy} onClick={() => add(false)}>{t('history.addNeedsCheck')}</Button>
              <Button size="md" icon="check" loading={busy} disabled={checked.check.errors.length > 0} onClick={() => add(true)}>{t('history.addVerified')}</Button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-2xl bg-stone-50 p-3">
              <div className="font-semibold">{checked.check.memberName ?? '—'} ({t('field.memberNo')} {checked.data.memberNo})</div>
              <div>{t(`history.kind.${kind}`)} · {describeRow(t, kind, checked.data)}</div>
            </div>
            <Problems codes={checked.check.errors} />
            <Warnings codes={checked.check.warnings} />
            {!checked.check.errors.length && <Notice tone="ok" icon="check">{t('history.looksFine')}</Notice>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function EditRowDialog({ batchId, row, onClose, onDone }) {
  const { t } = useTranslation();
  const [d, setD] = useState(() => ({ ...blankRow(row.kind), ...row.data }));
  const [checked, setChecked] = useState(null);
  const { busy, error, run } = useAction();
  const check = async () => {
    const r = await run(() => api(`/history/batches/${batchId}/check`, { method: 'POST', body: { kind: row.kind, data: d, rowId: row.id } }));
    if (r) setChecked(r);
  };
  const save = async () => {
    if (await run(() => api(`/history/rows/${row.id}`, { method: 'PUT', body: { data: d } }))) onDone();
  };
  return (
    <Modal open wide onClose={onClose} title={`${t('common.correct')} — ${t('history.line', { n: row.lineNo })}`}
      footer={<><Button variant="secondary" size="md" onClick={onClose}>{t('common.cancel')}</Button><Button variant="secondary" size="md" icon="file" loading={busy} onClick={check}>{t('history.checkFull')}</Button><Button size="md" icon="check" loading={busy} onClick={save}>{t('label.saveChanges')}</Button></>}>
      <div className="space-y-4">
        <HistoryRowForm kind={row.kind} d={d} setD={(fn) => { setD(fn); setChecked(null); }} />
        {checked && (<><Problems codes={checked.check.errors} /><Warnings codes={checked.check.warnings} />{!checked.check.errors.length && <Notice tone="ok" icon="check">{t('history.looksFine')}</Notice>}</>)}
        <p className="text-sm text-muted">{t('history.editResets')}</p>
        {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

/** Spreadsheet import: choose file → map columns → check every row → add to batch. */
function ImportSheet({ batchId, onDone }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kind, setKind] = useState('installment');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const { busy, error, run } = useAction();

  const upload = async () => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    const r = await run(() => api('/history/parse', { method: 'POST', form }));
    if (r) {
      setParsed(r);
      setMapping(r.mapping);
      setResult(null);
    }
  };
  const send = async (dryRun) => {
    const r = await run(() => api(`/history/batches/${batchId}/import`, { method: 'POST', body: { kind, mapping, rows: parsed.rows, dryRun, includeInvalid } }));
    if (!r) return;
    if (dryRun) setResult(r);
    else {
      toast(t('history.imported', { n: r.saved }));
      onDone();
    }
  };
  const missing = parsed?.required.filter((f) => mapping[f] === undefined) ?? [];

  return (
    <Card title={t('history.tab.import')} icon="upload">
      <div className="space-y-5">
        <Notice tone="brand" icon="file">{t('history.importHelp')}</Notice>
        <Field label={t('history.recordType')}>
          <Segmented value={kind} onChange={(k) => { setKind(k); setParsed(null); setResult(null); }} options={KINDS.map((k) => ({ value: k, label: t(`history.kind.${k}`) }))} />
        </Field>
        <Field label={t('history.chooseFile')} hint={t('history.fileHint')}>
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setParsed(null); setResult(null); }}
            className="block w-full rounded-xl border-2 border-dashed border-line bg-white p-4 text-base file:mr-4 file:rounded-lg file:border-0 file:bg-maroon file:px-4 file:py-2 file:font-semibold file:text-white" />
        </Field>
        <Button variant="secondary" icon="upload" disabled={!file} loading={busy && !parsed} onClick={upload}>{t('history.readFile')}</Button>
        {error && <ErrorBox error={error} />}

        {parsed && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-maroon">{t('history.mapColumns', { n: parsed.rows.length })}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {parsed.fields.map((f) => (
                <Field key={f} label={`${t(`importField.${f}`)}${parsed.required.includes(f) ? ' *' : ''}`}>
                  <Select value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                    <option value="">{t('history.notInFile')}</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || t('history.column', { n: i + 1 })}{parsed.rows[0]?.[i] ? ` — ${parsed.rows[0][i]}` : ''}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            {missing.length > 0 && <Notice>{t('history.mapMissing', { fields: missing.map((f) => t(`importField.${f}`)).join(', ') })}</Notice>}
            <Button full icon="file" disabled={missing.length > 0} loading={busy && !result} onClick={() => send(true)}>{t('history.checkRows')}</Button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-stone-100 p-2"><div className="text-sm">{t('history.totalRows')}</div><div className="num text-xl font-bold">{result.total}</div></div>
              <div className="rounded-xl bg-ok-bg p-2 text-ok"><div className="text-sm">{t('history.validRows')}</div><div className="num text-xl font-bold">{result.valid}</div></div>
              <div className="rounded-xl bg-bad-bg p-2 text-bad"><div className="text-sm">{t('history.invalidRows')}</div><div className="num text-xl font-bold">{result.invalid}</div></div>
            </div>
            <TableWrap min={640}>
              <thead><tr><th>{t('history.fileRow')}</th><th>{t('field.memberName')}</th><th>{t('history.details')}</th><th>{t('history.result')}</th></tr></thead>
              <tbody>
                {result.preview.map((p) => (
                  <tr key={p.fileRow} className={p.check.errors.length ? 'bg-bad-bg/40' : ''}>
                    <td className="num">{p.fileRow}</td>
                    <td>{p.check.memberName ?? `${t('field.memberNo')} ${p.data.memberNo ?? '—'}`}</td>
                    <td>{describeRow(t, kind, p.data)}</td>
                    <td>
                      {p.check.errors.length === 0 && <span className="font-semibold text-ok"><Icon name="check" className="mr-1 inline size-4" />{t('history.rowOk')}</span>}
                      {p.check.errors.map((c) => <div key={c} className="text-sm font-semibold text-bad">✗ {t(`err.${c}`, { defaultValue: t('err.generic') })}</div>)}
                      {p.check.warnings.map((c) => <div key={c} className="text-sm text-warn">! {t(`warn.${c}`)}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {result.invalid > 0 && <Toggle checked={includeInvalid} onChange={setIncludeInvalid} label={t('history.includeInvalid')} description={t('history.includeInvalidHint')} />}
            <Button full icon="plus" loading={busy} disabled={!result.valid && !includeInvalid} onClick={() => send(false)}>
              {t('history.addToBatch', { n: includeInvalid ? result.total : result.valid })}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

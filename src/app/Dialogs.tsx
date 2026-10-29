import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileUp, Quote, X, AlertTriangle, Link2Off, Check } from 'lucide-react';
import { Modal } from '../components/Modal';
import { Button, IconButton, SelectField, Tabs, TabPanel, TextArea, TextField, ProgressBar, Badge } from '../components/ui';
import { useI18n } from '../i18n';
import { useApp } from './AppContext';
import { navigate, routes } from './router';
import { importFile, createTextSource, getSource } from '../services/sources';
import { checkCardQuality, createCard, listCards, updateCard, type CardWarning } from '../services/memory';
import { addConceptSourceRef, createConcept, findConceptByLabel, listConcepts, updateConcept } from '../services/learn';
import type { Concept, LearningItem, LearningItemType, Source, SourceRef } from '../domain/types';
import { isAppError } from '../domain/errors';
import { useQuery } from './useQuery';
import { AktarPanel } from '../modules/aktar/AktarPanel';
import { aktarSupported } from '../services/aktar';
import { PackExportModal, PackImportModal } from '../modules/pack/PackDialogs';
import { looksLikePack } from '../services/pack';
import { downloadBlob } from '../services/export/download';

/* ------------------------------------------------------------------ */

export interface CardEditorInit {
  item?: LearningItem;
  prompt?: string;
  answer?: string;
  explanation?: string;
  itemType?: LearningItemType;
  sourceRef?: SourceRef;
  quote?: string;
  conceptIds?: string[];
}

export interface ConceptEditorInit {
  concept?: Concept;
  label?: string;
  description?: string;
  sourceRef?: SourceRef;
  quote?: string;
}

interface DialogsApi {
  openImport: (tab?: 'file' | 'paste' | 'note') => void;
  openCardEditor: (init: CardEditorInit) => void;
  openConceptEditor: (init: ConceptEditorInit) => void;
  openPackExport: (sourceIds?: string[]) => void;
}

const DialogsCtx = createContext<DialogsApi | null>(null);

export function useDialogs(): DialogsApi {
  const v = useContext(DialogsCtx);
  if (!v) throw new Error('DialogsProvider eksik');
  return v;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [importTab, setImportTab] = useState<null | 'file' | 'paste' | 'note'>(null);
  const [cardInit, setCardInit] = useState<CardEditorInit | null>(null);
  const [conceptInit, setConceptInit] = useState<ConceptEditorInit | null>(null);
  const [packExport, setPackExport] = useState<string[] | null>(null);
  const api = useMemo<DialogsApi>(
    () => ({
      openImport: (tab = 'file') => setImportTab(tab),
      openCardEditor: (init) => setCardInit(init),
      openConceptEditor: (init) => setConceptInit(init),
      openPackExport: (ids) => setPackExport(ids ?? []),
    }),
    [],
  );
  return (
    <DialogsCtx.Provider value={api}>
      {children}
      <ImportDialog tab={importTab} onClose={() => setImportTab(null)} onTab={setImportTab} />
      <CardEditor init={cardInit} onClose={() => setCardInit(null)} />
      <ConceptEditor init={conceptInit} onClose={() => setConceptInit(null)} />
      <PackExportModal open={packExport != null} initialSourceIds={packExport ?? undefined} onClose={() => setPackExport(null)} />
    </DialogsCtx.Provider>
  );
}

/* ------------------------------ İçe aktarma ------------------------------ */

interface ImportJob {
  key: string;
  name: string;
  progress: number;
  phase: 'queued' | 'reading' | 'extracting' | 'saving' | 'done' | 'error' | 'cancelled' | 'duplicate';
  sourceId?: string;
  message?: string;
  status?: Source['processingStatus'];
  controller: AbortController;
}

function ImportDialog({ tab, onClose, onTab }: { tab: null | 'file' | 'paste' | 'note'; onClose: () => void; onTab: (t: 'file' | 'paste' | 'note') => void }) {
  const { t, formatNumber } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pwRequest, setPwRequest] = useState<{ name: string; reason: 'need' | 'incorrect'; resolve: (v: string | null) => void } | null>(null);
  const [pw, setPw] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [packFile, setPackFile] = useState<File | null>(null);
  const closePack = useCallback(() => setPackFile(null), []);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (tab == null) {
      setJobs((js) => js.filter((j) => !['done', 'error', 'cancelled', 'duplicate'].includes(j.phase)));
      setTitle('');
      setText('');
      setTextError(undefined);
    }
  }, [tab]);

  const patch = (key: string, p: Partial<ImportJob>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const runJob = useCallback(
    async (file: File, job: ImportJob) => {
      try {
        const res = await importFile(file, {
          signal: job.controller.signal,
          onProgress: (f, phase) => patch(job.key, { progress: Math.round(f * 100), phase }),
          requestPassword: (reason) =>
            new Promise((resolve) => {
              setPw('');
              setPwRequest({ name: file.name, reason, resolve });
            }),
          confirmDuplicate: (existing) =>
            confirm({ title: t('import.duplicateTitle'), message: t('import.duplicateMessage', { title: existing.title }), confirmLabel: t('import.addAnyway') }),
        });
        if (res.status === 'skipped-duplicate') {
          patch(job.key, { phase: 'duplicate', sourceId: res.existing.id, progress: 100 });
          return;
        }
        patch(job.key, { phase: 'done', progress: 100, sourceId: res.source.id, status: res.source.processingStatus, message: res.source.errorCode ? t(`errors.${res.source.errorCode}.title`) : undefined });
      } catch (e) {
        const err = isAppError(e) ? e : null;
        if (err?.code === 'SRC-006') {
          patch(job.key, { phase: 'cancelled' });
          return;
        }
        const code = reportError(e, 'import').code;
        patch(job.key, { phase: 'error', message: `${t(`errors.${code}.title`)} ${t(`errors.${code}.action`)}` });
      }
    },
    [confirm, reportError, t],
  );

  const addFiles = (files: FileList | File[]) => {
    const list: File[] = [];
    for (const file of Array.from(files)) {
      if (looksLikePack(file.name)) setPackFile(file);
      else if (/\.(nexlearn-enc|zip)$/i.test(file.name) && /nexlearn-backup/i.test(file.name)) {
        // Telefondan gelen yedek: diske kaydedilir, geri yükleme Ayarlar → Veri'den yapılır.
        downloadBlob(file, file.name);
        toast(t('aktar.backupReceived'), { tone: 'info' });
      } else list.push(file);
    }
    for (const file of list) {
      const job: ImportJob = { key: `${file.name}-${file.size}-${Math.random()}`, name: file.name, progress: 0, phase: 'queued', controller: new AbortController() };
      setJobs((js) => [...js, job]);
      // Dosyalar sırayla işlenir: bellek kullanımı sınırlı kalır.
      queue.current = queue.current.then(() => (job.controller.signal.aborted ? patch(job.key, { phase: 'cancelled' }) : runJob(file, job)));
    }
  };

  const createText = async (kind: 'paste' | 'note') => {
    if (!text.trim()) {
      setTextError(t('import.textRequired'));
      return;
    }
    try {
      const src = await createTextSource(kind, title || (kind === 'note' ? t('import.untitledNote') : t('import.untitledPaste')), text);
      toast(t('import.textCreated'), { tone: 'success' });
      onClose();
      navigate(routes.read(src.id));
    } catch (e) {
      reportError(e, 'create-text');
    }
  };

  const activeJobs = jobs.filter((j) => ['queued', 'reading', 'extracting', 'saving'].includes(j.phase)).length;

  return (
    <>
      <Modal open={tab != null} onClose={onClose} title={t('import.title')} description={t('import.description')} size="lg">
        <Tabs
          idPrefix="imp"
          label={t('import.title')}
          value={tab ?? 'file'}
          onChange={(v) => onTab(v as 'file' | 'paste' | 'note')}
          items={[
            { id: 'file', label: t('import.tabFile') },
            { id: 'paste', label: t('import.tabPaste') },
            { id: 'note', label: t('import.tabNote') },
          ]}
        />
        {(tab ?? 'file') === 'file' && (
          <TabPanel idPrefix="imp" id="file" className="import-panel">
            <div
              className={`dropzone ${dragOver ? 'dropzone-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
            >
              <FileUp size={32} aria-hidden="true" />
              <p className="dropzone-title">{t('import.dropTitle')}</p>
              <p className="dropzone-hint">{t('import.dropHint')}</p>
              <Button variant="primary" onClick={() => inputRef.current?.click()} data-autofocus>
                {t('import.chooseFiles')}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.epub,.nexpack,.txt,.md,.markdown,.text,application/epub+zip,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
                data-testid="file-input"
              />
            </div>
            <p className="import-note">{t('import.privacy')}</p>
            {aktarSupported() && <AktarPanel onAccept={addFiles} />}
            {jobs.length > 0 && (
              <ul className="job-list" aria-label={t('import.jobs')}>
                {jobs.map((j) => (
                  <li key={j.key} className={`job job-${j.phase}`}>
                    <div className="job-head">
                      <span className="job-name">{j.name}</span>
                      <span className="job-phase">
                        {j.phase === 'done' && j.status === 'ready' && <Badge tone="success">{t('import.phase.done')}</Badge>}
                        {j.phase === 'done' && j.status !== 'ready' && <Badge tone="warning">{t(`status.${j.status}`)}</Badge>}
                        {j.phase === 'error' && <Badge tone="danger">{t('import.phase.error')}</Badge>}
                        {j.phase === 'cancelled' && <Badge>{t('import.phase.cancelled')}</Badge>}
                        {j.phase === 'duplicate' && <Badge>{t('import.phase.duplicate')}</Badge>}
                        {['queued', 'reading', 'extracting', 'saving'].includes(j.phase) && <span>{t(`import.phase.${j.phase}`)}</span>}
                      </span>
                    </div>
                    {['reading', 'extracting', 'saving'].includes(j.phase) && <ProgressBar value={j.progress} label={t('import.progressOf', { name: j.name })} showValue />}
                    {j.message && <p className="job-message">{j.message}</p>}
                    <div className="job-actions">
                      {['queued', 'reading', 'extracting', 'saving'].includes(j.phase) && (
                        <Button size="sm" variant="ghost" onClick={() => j.controller.abort()}>
                          {t('common.cancel')}
                        </Button>
                      )}
                      {(j.phase === 'done' || j.phase === 'duplicate') && j.sourceId && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => {
                            onClose();
                            navigate(routes.read(j.sourceId!));
                          }}
                        >
                          {t('import.openReader')}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {activeJobs > 0 && <p className="sr-only" aria-live="polite">{t('import.activeJobs', { count: formatNumber(activeJobs) })}</p>}
          </TabPanel>
        )}
        {(tab === 'paste' || tab === 'note') && (
          <TabPanel idPrefix="imp" id={tab} className="import-panel">
            <TextField label={t('import.textTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} optional={t('common.optional')} />
            <TextArea
              label={tab === 'note' ? t('import.noteBody') : t('import.pasteBody')}
              hint={tab === 'note' ? t('import.noteHint') : t('import.pasteHint')}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTextError(undefined);
              }}
              error={textError}
              rows={12}
            />
            <div className="row-end">
              <Button variant="primary" onClick={() => void createText(tab)}>
                {tab === 'note' ? t('import.createNote') : t('import.createPaste')}
              </Button>
            </div>
          </TabPanel>
        )}
      </Modal>
      <PackImportModal file={packFile} onClose={closePack} />
      <Modal
        open={Boolean(pwRequest)}
        onClose={() => {
          pwRequest?.resolve(null);
          setPwRequest(null);
        }}
        title={t('import.passwordTitle')}
        description={pwRequest?.reason === 'incorrect' ? t('import.passwordIncorrect') : t('import.passwordNeed', { name: pwRequest?.name ?? '' })}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                pwRequest?.resolve(null);
                setPwRequest(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                pwRequest?.resolve(pw);
                setPw('');
                setPwRequest(null);
              }}
            >
              {t('import.passwordSubmit')}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pwRequest?.resolve(pw);
            setPw('');
            setPwRequest(null);
          }}
        >
          <TextField label={t('import.password')} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" hint={t('import.passwordPrivacy')} />
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------ Kart düzenleyici ------------------------------ */

function SourceRefBox({ sourceRef, quote, onRemove }: { sourceRef: SourceRef; quote?: string; onRemove?: () => void }) {
  const { t } = useI18n();
  const { data: source, loading } = useQuery(() => getSource(sourceRef.sourceId), [sourceRef.sourceId], ['sources']);
  const broken = !loading && (!source || source.deletedAt);
  return (
    <div className={`source-ref ${broken ? 'source-ref-broken' : ''}`}>
      {broken ? <Link2Off size={16} aria-hidden="true" /> : <Quote size={16} aria-hidden="true" />}
      <div className="source-ref-body">
        <p className="source-ref-title">
          {broken ? t('sourceRef.broken') : source?.title}
          {sourceRef.pageNumber ? ` · ${t('common.pageN', { n: sourceRef.pageNumber })}` : ''}
        </p>
        {quote && <p className="source-ref-quote">“{quote.length > 280 ? `${quote.slice(0, 280)}…` : quote}”</p>}
      </div>
      {onRemove && <IconButton icon={X} size="sm" label={t('sourceRef.remove')} onClick={onRemove} />}
    </div>
  );
}

export { SourceRefBox };

function ConceptPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const { data: concepts = [] } = useQuery(listConcepts, [], ['concepts']);
  const [q, setQ] = useState('');
  const selected = concepts.filter((c) => value.includes(c.id));
  const options = concepts.filter((c) => !value.includes(c.id) && c.label.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))).slice(0, 8);
  if (!concepts.length) return <p className="field-hint">{t('cardEditor.noConcepts')}</p>;
  return (
    <fieldset className="concept-picker">
      <legend className="field-label">{t('cardEditor.concepts')}</legend>
      {selected.length > 0 && (
        <ul className="chips">
          {selected.map((c) => (
            <li key={c.id} className="chip chip-selected">
              {c.label}
              <button type="button" className="chip-x" aria-label={t('cardEditor.removeConcept', { label: c.label })} onClick={() => onChange(value.filter((x) => x !== c.id))}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input className="input input-sm" placeholder={t('cardEditor.findConcept')} aria-label={t('cardEditor.findConcept')} value={q} onChange={(e) => setQ(e.target.value)} />
      {options.length > 0 && (
        <ul className="chips">
          {options.map((c) => (
            <li key={c.id}>
              <button type="button" className="chip" onClick={() => onChange([...value, c.id])}>
                + {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function CardEditor({ init, onClose }: { init: CardEditorInit | null; onClose: () => void }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [itemType, setItemType] = useState<LearningItemType>('qa');
  const [sourceRef, setSourceRef] = useState<SourceRef | undefined>();
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ prompt?: string; answer?: string }>({});
  const [existing, setExisting] = useState<LearningItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!init) return;
    const it = init.item;
    setPrompt(it?.prompt ?? init.prompt ?? '');
    setAnswer(it?.answer ?? init.answer ?? '');
    setExplanation(it?.explanation ?? init.explanation ?? '');
    setItemType(it?.itemType ?? init.itemType ?? 'qa');
    setSourceRef(it?.sourceRefs[0] ?? init.sourceRef);
    setConceptIds(it?.conceptIds ?? init.conceptIds ?? []);
    setErrors({});
    void listCards().then((cs) => setExisting(cs.filter((c) => c.id !== it?.id)));
  }, [init]);

  const warnings: CardWarning[] = useMemo(
    () => (prompt || answer ? checkCardQuality({ prompt, answer, sourceRefs: sourceRef ? [sourceRef] : [] }, existing) : []),
    [prompt, answer, sourceRef, existing],
  );

  const save = async () => {
    const errs: typeof errors = {};
    if (!prompt.trim()) errs.prompt = t('cardEditor.promptRequired');
    if (!answer.trim()) errs.answer = t('cardEditor.answerRequired');
    setErrors(errs);
    if (errs.prompt || errs.answer) return;
    setSaving(true);
    try {
      const input = { prompt, answer, explanation, itemType, sourceRefs: sourceRef ? [sourceRef] : [], conceptIds };
      if (init?.item) {
        await updateCard(init.item.id, input, init.item.revision);
        toast(t('cardEditor.updated'), { tone: 'success' });
      } else {
        const first = existing.length === 0;
        await createCard(input);
        toast(first ? t('cardEditor.firstCreated') : t('cardEditor.created'), {
          tone: 'success',
          action: { label: t('cardEditor.reviewNow'), run: () => navigate(routes.review()) },
        });
      }
      onClose();
    } catch (e) {
      reportError(e, 'card-save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(init)}
      onClose={onClose}
      title={init?.item ? t('cardEditor.editTitle') : t('cardEditor.newTitle')}
      description={t('cardEditor.description')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={Check} onClick={() => void save()} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {sourceRef && <SourceRefBox sourceRef={sourceRef} quote={init?.quote} onRemove={() => setSourceRef(undefined)} />}
        <SelectField
          label={t('cardEditor.type')}
          value={itemType}
          onChange={(e) => setItemType(e.target.value as LearningItemType)}
          options={[
            { value: 'qa', label: t('cardEditor.typeQa') },
            { value: 'question', label: t('cardEditor.typeQuestion') },
          ]}
          hint={itemType === 'qa' ? t('cardEditor.typeQaHint') : t('cardEditor.typeQuestionHint')}
        />
        <TextArea label={t('cardEditor.prompt')} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} error={errors.prompt} data-autofocus />
        <TextArea label={t('cardEditor.answer')} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} error={errors.answer} hint={t('cardEditor.answerHint')} />
        <TextArea label={t('cardEditor.explanation')} value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} optional={t('common.optional')} />
        <ConceptPicker value={conceptIds} onChange={setConceptIds} />
        {warnings.length > 0 && (
          <ul className="warnings" aria-live="polite">
            {warnings.map((w) => (
              <li key={w}>
                <AlertTriangle size={16} aria-hidden="true" /> {t(`cardEditor.warning.${w}`)}
              </li>
            ))}
          </ul>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ------------------------------ Kavram düzenleyici ------------------------------ */

function ConceptEditor({ init, onClose }: { init: ConceptEditorInit | null; onClose: () => void }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string>();
  const [match, setMatch] = useState<Concept | undefined>();

  useEffect(() => {
    if (!init) return;
    setLabel(init.concept?.label ?? init.label?.slice(0, 120) ?? '');
    setDescription(init.concept?.description ?? init.description ?? '');
    setExplanation(init.concept?.explanation ?? '');
    setError(undefined);
  }, [init]);

  useEffect(() => {
    if (!init || init.concept || !label.trim()) {
      setMatch(undefined);
      return;
    }
    let live = true;
    void findConceptByLabel(label).then((c) => live && setMatch(c));
    return () => {
      live = false;
    };
  }, [label, init]);

  const save = async () => {
    if (!label.trim()) {
      setError(t('conceptEditor.labelRequired'));
      return;
    }
    try {
      if (init?.concept) {
        await updateConcept(init.concept.id, { label, description, explanation });
        toast(t('conceptEditor.updated'), { tone: 'success' });
      } else {
        const c = await createConcept({ label, description, explanation, sourceRefs: init?.sourceRef ? [init.sourceRef] : [] });
        toast(t('conceptEditor.created', { label: c.label }), { tone: 'success', action: { label: t('conceptEditor.openMap'), run: () => navigate(routes.map(c.id)) } });
      }
      onClose();
    } catch (e) {
      reportError(e, 'concept-save');
    }
  };

  const attachToExisting = async () => {
    if (!match || !init?.sourceRef) return;
    try {
      await addConceptSourceRef(match.id, init.sourceRef);
      toast(t('conceptEditor.attached', { label: match.label }), { tone: 'success' });
      onClose();
    } catch (e) {
      reportError(e, 'concept-attach');
    }
  };

  return (
    <Modal
      open={Boolean(init)}
      onClose={onClose}
      title={init?.concept ? t('conceptEditor.editTitle') : t('conceptEditor.newTitle')}
      description={t('conceptEditor.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {init?.sourceRef && <SourceRefBox sourceRef={init.sourceRef} quote={init.quote} />}
        <TextField label={t('conceptEditor.label')} value={label} onChange={(e) => setLabel(e.target.value)} error={error} maxLength={120} data-autofocus />
        {match && (
          <div className="inline-notice">
            <p>{t('conceptEditor.exists', { label: match.label })}</p>
            {init?.sourceRef && (
              <Button size="sm" variant="soft" onClick={() => void attachToExisting()}>
                {t('conceptEditor.attachExisting')}
              </Button>
            )}
          </div>
        )}
        <TextArea label={t('conceptEditor.descriptionField')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} optional={t('common.optional')} />
        <TextArea label={t('conceptEditor.explanation')} hint={t('conceptEditor.explanationHint')} value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} optional={t('common.optional')} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Package, PackageCheck } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Badge, Button, SelectField, Switch, TextArea, TextField } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useQuery } from '../../app/useQuery';
import { listSources } from '../../services/sources';
import { applyPack, exportPack, listPublishedPacks, packStatus, parsePack, type PackKind, type PackStatus, type ParsedPack } from '../../services/pack';
import { downloadBytes } from '../../services/export/download';

/* ------------------------------ İçe aktarma ------------------------------ */

export function PackImportModal({ file, onClose }: { file: File | null; onClose: () => void }) {
  const { t, formatNumber } = useI18n();
  const { toast, reportError } = useApp();
  const [parsed, setParsed] = useState<ParsedPack | null>(null);
  const [status, setStatus] = useState<PackStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setParsed(null);
    setStatus(null);
    if (!file) return;
    let live = true;
    void (async () => {
      try {
        const p = await parsePack(new Uint8Array(await file.arrayBuffer()));
        const st = await packStatus(p.manifest);
        if (live) {
          setParsed(p);
          setStatus(st);
        }
      } catch (e) {
        reportError(e, 'pack-read');
        if (live) onClose();
      }
    })();
    return () => {
      live = false;
    };
  }, [file, onClose, reportError]);

  const run = async (asCopy: boolean) => {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await applyPack(parsed, { asCopy });
      toast(t('pack.applied', { created: r.created, updated: r.updated, removed: r.removed }), { tone: 'success' });
      onClose();
    } catch (e) {
      reportError(e, 'pack-apply');
    } finally {
      setBusy(false);
    }
  };

  const m = parsed?.manifest;
  const primary =
    status?.action === 'update' ? t('pack.update', { from: status.installed?.version ?? 0, to: m?.version ?? 0 }) : status?.action === 'install' ? t('pack.install') : t('pack.reapply');
  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title={t('pack.importTitle')}
      size="md"
      footer={
        parsed && (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {status?.action !== 'install' && (
              <Button onClick={() => void run(true)} disabled={busy}>
                {t('pack.asCopy')}
              </Button>
            )}
            <Button variant="primary" icon={PackageCheck} onClick={() => void run(false)} loading={busy}>
              {primary}
            </Button>
          </>
        )
      }
    >
      {!m ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <div className="stack-sm pack-preview">
          <p className="pack-title">
            <Package size={20} aria-hidden="true" /> <strong>{m.title}</strong> <Badge tone="accent">{t('pack.versionN', { n: m.version })}</Badge>{' '}
            <Badge>{t(`pack.kind.${m.kind}`)}</Badge>
          </p>
          {m.author && <p className="muted">{t('pack.by', { author: m.author })}</p>}
          {m.description && <p>{m.description}</p>}
          <ul className="pack-counts">
            {(['sources', 'concepts', 'relations', 'items', 'annotations'] as const).map((k) => (
              <li key={k}>
                <strong>{formatNumber(m.counts[k] ?? 0)}</strong> {t(`pack.count.${k}`)}
              </li>
            ))}
          </ul>
          {status?.action === 'update' && <p className="inline-notice">{t('pack.updateNote')}</p>}
          {status?.action === 'same' && <p className="inline-notice">{t('pack.sameNote')}</p>}
          {status?.action === 'older' && <p className="inline-notice">{t('pack.olderNote', { installed: status.installed?.version ?? 0 })}</p>}
          <p className="field-hint">{t('pack.privacy')}</p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Dışa aktarma ------------------------------ */

export function PackExportModal({ open, onClose, initialSourceIds }: { open: boolean; onClose: () => void; initialSourceIds?: string[] }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const { data } = useQuery(
    async () => {
      const [sources, published] = await Promise.all([listSources(), listPublishedPacks()]);
      return { sources: sources.filter((s) => !s.isSample), published };
    },
    [open],
    ['sources', 'meta'],
  );
  const [target, setTarget] = useState('new');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [kind, setKind] = useState<PackKind>('study');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeCards, setIncludeCards] = useState(true);
  const [includeConcepts, setIncludeConcepts] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTarget('new');
    setTitle('');
    setDescription('');
    setSelected(new Set(initialSourceIds ?? []));
    setTitleError(undefined);
  }, [open, initialSourceIds]);

  const published = useMemo(() => data?.published ?? [], [data]);
  const pickTarget = (v: string) => {
    setTarget(v);
    const p = published.find((x) => x.packId === v);
    if (p) {
      setTitle(p.title);
      setDescription(p.description);
      setAuthor(p.author);
      setKind(p.kind);
      setSelected(new Set(p.sourceIds));
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async () => {
    if (!title.trim()) {
      setTitleError(t('pack.titleRequired'));
      return;
    }
    if (!selected.size) {
      toast(t('pack.pickSources'), { tone: 'info' });
      return;
    }
    setBusy(true);
    try {
      const r = await exportPack({
        title,
        description,
        author,
        kind,
        sourceIds: [...selected],
        includeCards,
        includeConcepts,
        includeNotes,
        includeOriginals,
        packId: target === 'new' ? undefined : target,
      });
      downloadBytes(r.bytes, r.fileName, 'application/octet-stream');
      toast(t('pack.exported', { name: r.fileName }), { tone: 'success' });
      onClose();
    } catch (e) {
      reportError(e, 'pack-export');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pack.exportTitle')}
      description={t('pack.exportIntro')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={Package} onClick={() => void submit()} loading={busy}>
            {target === 'new' ? t('pack.create') : t('pack.publishUpdate')}
          </Button>
        </>
      }
    >
      <div className="stack">
        {published.length > 0 && (
          <SelectField
            label={t('pack.target')}
            value={target}
            onChange={(e) => pickTarget(e.target.value)}
            options={[{ value: 'new', label: t('pack.targetNew') }, ...published.map((p) => ({ value: p.packId, label: t('pack.targetUpdate', { title: p.title, next: p.version + 1 }) }))]}
          />
        )}
        <div className="grid-2">
          <TextField
            label={t('pack.title')}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(undefined);
            }}
            maxLength={200}
            error={titleError}
          />
          <TextField label={t('pack.author')} value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={120} optional={t('common.optional')} />
        </div>
        <TextArea label={t('pack.description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} optional={t('common.optional')} />
        <fieldset className="choice-group">
          <legend className="field-label">{t('pack.kindLabel')}</legend>
          {(['study', 'knowledge'] as const).map((k) => (
            <label key={k} className={`choice ${kind === k ? 'selected' : ''}`}>
              <input type="radio" name="pack-kind" checked={kind === k} onChange={() => setKind(k)} disabled={target !== 'new'} />
              <span>
                <strong>{t(`pack.kind.${k}`)}</strong>
                <span className="field-hint">{t(`pack.kindHint.${k}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="choice-group">
          <legend className="field-label">{t('pack.sources')}</legend>
          {data?.sources.length === 0 && <p className="muted">{t('pack.noSources')}</p>}
          <ul className="check-list">
            {data?.sources.map((s) => (
              <li key={s.id}>
                <label className="check-row">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span>{s.title}</span>
                  <span className="muted">{t(`sourceType.${s.sourceType}`)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="stack-sm">
          <Switch label={t('pack.includeCards')} checked={includeCards} onChange={setIncludeCards} />
          <Switch label={t('pack.includeConcepts')} checked={includeConcepts} onChange={setIncludeConcepts} />
          <Switch label={t('pack.includeNotes')} checked={includeNotes} onChange={setIncludeNotes} hint={t('pack.includeNotesHint')} />
          <Switch label={t('pack.includeOriginals')} checked={includeOriginals} onChange={setIncludeOriginals} hint={t('pack.includeOriginalsHint')} />
        </div>
        <p className="field-hint">{t('pack.privacy')}</p>
      </div>
    </Modal>
  );
}

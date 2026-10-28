import { useMemo, useState } from 'react';
import { NotebookPen, Plus, Pencil, Trash2, Layers, ExternalLink, Search, StickyNote } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { routes } from '../../app/router';
import { Badge, Button, EmptyState, IconButton, SelectField, Tabs, TabPanel, TextArea, TextField } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { deleteAnnotation, listAllAnnotations, updateAnnotation } from '../../services/annotations';
import { getAllSegments, listSources, trashSource, restoreSource, updateNoteBody } from '../../services/sources';
import { normalizeForSearch } from '../../domain/text';
import type { Annotation, Source } from '../../domain/types';

export default function NotesPage() {
  const { t, formatDate } = useI18n();
  const { toast, reportError } = useApp();
  const { openImport, openCardEditor } = useDialogs();
  const [tab, setTab] = useState('marks');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('all');
  const [tag, setTag] = useState('all');
  const [editing, setEditing] = useState<Annotation | null>(null);
  const [editText, setEditText] = useState('');
  const [noteEdit, setNoteEdit] = useState<Source | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const { data } = useQuery(
    async () => {
      const [anns, sources, segments] = await Promise.all([listAllAnnotations(), listSources(), getAllSegments()]);
      return { anns, sources: new Map(sources.map((s) => [s.id, s])), segs: new Map(segments.map((s) => [s.id, s])), noteSources: sources.filter((s) => s.sourceType === 'note') };
    },
    [],
    ['annotations', 'sources', 'segments'],
  );

  const tags = useMemo(() => [...new Set((data?.anns ?? []).flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b, 'tr')), [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const nq = normalizeForSearch(q);
    const seen = new Set<string>();
    return data.anns
      .filter((a) => data.sources.has(a.sourceId))
      .filter((a) => (type === 'all' ? a.annotationType !== 'bookmark' : a.annotationType === type))
      .filter((a) => src === 'all' || a.sourceId === src)
      .filter((a) => tag === 'all' || a.tags.includes(tag))
      .filter((a) => !nq || normalizeForSearch(`${a.selectedText ?? ''} ${a.noteText ?? ''}`).includes(nq))
      .filter((a) => {
        if (!a.groupId) return true;
        if (seen.has(a.groupId)) return false;
        seen.add(a.groupId);
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data, q, type, src, tag]);

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateAnnotation(editing.id, { noteText: editText });
      setEditing(null);
      toast(t('common.saved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'note-edit');
    }
  };

  const saveNoteSource = async () => {
    if (!noteEdit) return;
    try {
      await updateNoteBody(noteEdit.id, noteTitle, noteBody);
      setNoteEdit(null);
      toast(t('common.saved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'note-source');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('notes.title')}</h1>
          <p className="page-sub">{t('notes.subtitle')}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => openImport('note')}>
          {t('library.newNote')}
        </Button>
      </header>
      <Tabs
        idPrefix="nt"
        label={t('notes.title')}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'marks', label: t('notes.tabMarks'), count: data?.anns.filter((a) => a.annotationType !== 'bookmark').length },
          { id: 'notebook', label: t('notes.tabNotebook'), count: data?.noteSources.length },
        ]}
      />
      {tab === 'marks' ? (
        <TabPanel idPrefix="nt" id="marks">
          {data && data.anns.length === 0 ? (
            <EmptyState icon={NotebookPen} title={t('notes.emptyTitle')} text={t('notes.emptyText')} />
          ) : (
            <>
              <div className="filters" role="search">
                <div className="filter-search">
                  <Search size={18} aria-hidden="true" />
                  <input className="input" type="search" placeholder={t('notes.search')} aria-label={t('notes.search')} value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <SelectField
                  label={t('notes.type')}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  options={[{ value: 'all', label: t('common.all') }, ...(['highlight', 'note', 'explanation', 'quote', 'bookmark'] as const).map((x) => ({ value: x, label: t(`annotationType.${x}`) }))]}
                />
                <SelectField
                  label={t('notes.source')}
                  value={src}
                  onChange={(e) => setSrc(e.target.value)}
                  options={[{ value: 'all', label: t('common.all') }, ...[...(data?.sources.values() ?? [])].map((s) => ({ value: s.id, label: s.title }))]}
                />
                {tags.length > 0 && <SelectField label={t('library.tag')} value={tag} onChange={(e) => setTag(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...tags.map((x) => ({ value: x, label: `#${x}` }))]} />}
              </div>
              <p className="muted" aria-live="polite">
                {t('notes.count', { count: shown.length })}
              </p>
              <ul className="note-grid">
                {shown.map((a) => {
                  const s = data!.sources.get(a.sourceId)!;
                  const seg = data!.segs.get(a.segmentId);
                  return (
                    <li key={a.id} className={`note-card ann-${a.annotationType}`}>
                      <p className="mini-meta">
                        {a.annotationType === 'highlight' && <span className={`dot hl-${a.color ?? 'important'}`} aria-hidden="true" />}
                        {a.annotationType === 'highlight' ? t(`colors.${a.color ?? 'important'}`) : t(`annotationType.${a.annotationType}`)} · {formatDate(a.createdAt)}
                      </p>
                      {(a.selectedText || (seg && a.annotationType !== 'explanation')) && (
                        <p className="mini-quote">“{(a.selectedText ?? seg?.text ?? '').slice(0, 260)}”</p>
                      )}
                      {a.noteText && <p className="mini-text">{a.noteText}</p>}
                      {a.tags.length > 0 && (
                        <p className="source-card-tags">
                          {a.tags.map((x) => (
                            <span key={x} className="tag">
                              #{x}
                            </span>
                          ))}
                        </p>
                      )}
                      <a href={`#${routes.read(a.sourceId, a.segmentId)}`} className="link-inline">
                        <ExternalLink size={14} aria-hidden="true" /> {s.title}
                        {seg?.pageNumber ? ` · ${t('common.pageN', { n: seg.pageNumber })}` : ''}
                      </a>
                      {!seg && <Badge tone="warning">{t('sourceRef.brokenShort')}</Badge>}
                      <div className="row-wrap">
                        <IconButton
                          icon={Pencil}
                          size="sm"
                          label={t('reader.editNote')}
                          onClick={() => {
                            setEditText(a.noteText ?? '');
                            setEditing(a);
                          }}
                        />
                        <IconButton
                          icon={Layers}
                          size="sm"
                          label={t('reader.createCard')}
                          onClick={() => openCardEditor({ sourceRef: { sourceId: a.sourceId, segmentId: a.segmentId, pageNumber: seg?.pageNumber }, quote: a.selectedText ?? seg?.text, answer: (a.selectedText ?? '').slice(0, 300) })}
                        />
                        <IconButton icon={Trash2} size="sm" label={t('common.delete')} onClick={() => void deleteAnnotation(a).then(() => toast(t('reader.annotationDeleted'))).catch((e) => reportError(e, 'ann-delete'))} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </TabPanel>
      ) : (
        <TabPanel idPrefix="nt" id="notebook">
          {data && data.noteSources.length === 0 ? (
            <EmptyState icon={StickyNote} title={t('notes.notebookEmpty')} text={t('notes.notebookEmptyText')} action={<Button icon={Plus} onClick={() => openImport('note')}>{t('library.newNote')}</Button>} />
          ) : (
            <ul className="list">
              {data?.noteSources.map((s) => (
                <li key={s.id} className="list-row">
                  <div>
                    <a href={`#${routes.read(s.id)}`} className="list-title">
                      {s.title}
                    </a>
                    <p className="list-meta">
                      {t('notes.updated', { date: formatDate(s.updatedAt) })} · {t('library.words', { n: s.wordCount })}
                    </p>
                  </div>
                  <div className="row-wrap">
                    <IconButton
                      icon={Pencil}
                      size="sm"
                      label={t('common.edit')}
                      onClick={() => {
                        setNoteTitle(s.title);
                        setNoteBody(String(s.metadata.body ?? ''));
                        setNoteEdit(s);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={t('common.delete')}
                      onClick={() =>
                        void trashSource(s.id)
                          .then(() => toast(t('library.trashed', { title: s.title }), { action: { label: t('common.undo'), run: () => void restoreSource(s.id) } }))
                          .catch((e) => reportError(e, 'note-trash'))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('reader.editNote')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveEdit()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <TextArea label={t('reader.noteLabel')} hint={t('reader.noteHint')} value={editText} onChange={(e) => setEditText(e.target.value)} rows={5} data-autofocus />
      </Modal>

      <Modal
        open={Boolean(noteEdit)}
        onClose={() => setNoteEdit(null)}
        title={t('notes.editNotebook')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteEdit(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveNoteSource()} disabled={!noteBody.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextField label={t('import.textTitle')} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} maxLength={200} />
          <TextArea label={t('import.noteBody')} hint={t('notes.editHint')} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={14} />
        </div>
      </Modal>
    </div>
  );
}

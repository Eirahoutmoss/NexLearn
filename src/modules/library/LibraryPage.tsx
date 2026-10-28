import { useMemo, useState } from 'react';
import { Upload, StickyNote, Trash2, RotateCcw, Pencil, Tag, RefreshCw, Library as LibraryIcon, Search, Undo2, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { routes } from '../../app/router';
import { Badge, Button, EmptyState, IconButton, ProgressBar, SelectField, Tabs, TabPanel, TextField } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { SourceCover } from '../../components/SourceCover';
import { listDeletedSources, listSources, purgeSource, renameSource, restoreSource, retryImport, setSourceTags, trashSource } from '../../services/sources';
import { getAllReadingStates, progressPercent } from '../../services/reading';
import { estimateReadingMinutes, normalizeForSearch } from '../../domain/text';
import type { Source } from '../../domain/types';

type SortKey = 'recent' | 'title' | 'progress';

export default function LibraryPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const { openImport } = useDialogs();
  const [tab, setTab] = useState<'all' | 'trash'>('all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [editing, setEditing] = useState<{ source: Source; mode: 'rename' | 'tags' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data } = useQuery(
    async () => {
      const [sources, trash, states] = await Promise.all([listSources(), listDeletedSources(), getAllReadingStates()]);
      return { sources, trash, states: new Map(states.map((s) => [s.sourceId, s])) };
    },
    [],
    ['sources', 'readingStates'],
  );

  const allTags = useMemo(() => [...new Set((data?.sources ?? []).flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, 'tr')), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const nq = normalizeForSearch(q);
    const list = data.sources.filter(
      (s) =>
        (type === 'all' || s.sourceType === type) &&
        (tag === 'all' || s.tags.includes(tag)) &&
        (!nq || normalizeForSearch(`${s.title} ${s.originalFilename ?? ''} ${s.tags.join(' ')}`).includes(nq)),
    );
    const pct = (s: Source) => progressPercent(data.states.get(s.id), s.segmentCount);
    return list.sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'tr')
        : sort === 'progress'
          ? pct(b) - pct(a)
          : (data.states.get(b.id)?.updatedAt ?? b.createdAt).localeCompare(data.states.get(a.id)?.updatedAt ?? a.createdAt),
    );
  }, [data, q, type, tag, sort]);

  const run = async (fn: () => Promise<unknown>, ok: string, ctx: string, undo?: () => Promise<unknown>) => {
    try {
      await fn();
      toast(ok, { tone: 'success', action: undo ? { label: t('common.undo'), run: () => void undo().catch((e) => reportError(e, `${ctx}-undo`)) } : undefined });
    } catch (e) {
      reportError(e, ctx);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editing.mode === 'rename') await run(() => renameSource(editing.source.id, editValue), t('library.renamed'), 'rename');
    else await run(() => setSourceTags(editing.source.id, editValue.split(/[,\s]+/)), t('library.tagsSaved'), 'tags');
    setEditing(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('library.title')}</h1>
          <p className="page-sub">{t('library.subtitle')}</p>
        </div>
        <div className="row-wrap">
          <Button icon={StickyNote} onClick={() => openImport('note')}>
            {t('library.newNote')}
          </Button>
          <Button variant="primary" icon={Upload} onClick={() => openImport('file')}>
            {t('library.add')}
          </Button>
        </div>
      </header>

      <Tabs
        idPrefix="lib"
        label={t('library.title')}
        value={tab}
        onChange={(v) => setTab(v as 'all' | 'trash')}
        items={[
          { id: 'all', label: t('library.tabAll'), count: data?.sources.length },
          { id: 'trash', label: t('library.tabTrash'), count: data?.trash.length },
        ]}
      />

      {tab === 'all' ? (
        <TabPanel idPrefix="lib" id="all">
          {data && data.sources.length > 0 && (
            <div className="filters" role="search">
              <div className="filter-search">
                <Search size={18} aria-hidden="true" />
                <input className="input" type="search" placeholder={t('library.filterPlaceholder')} aria-label={t('library.filterPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <SelectField
                label={t('library.type')}
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[{ value: 'all', label: t('common.all') }, ...(['pdf', 'markdown', 'txt', 'note', 'paste', 'image'] as const).map((x) => ({ value: x, label: t(`sourceType.${x}`) }))]}
              />
              {allTags.length > 0 && (
                <SelectField label={t('library.tag')} value={tag} onChange={(e) => setTag(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...allTags.map((x) => ({ value: x, label: `#${x}` }))]} />
              )}
              <SelectField
                label={t('library.sort')}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                options={[
                  { value: 'recent', label: t('library.sortRecent') },
                  { value: 'title', label: t('library.sortTitle') },
                  { value: 'progress', label: t('library.sortProgress') },
                ]}
              />
            </div>
          )}
          {data && data.sources.length === 0 ? (
            <EmptyState
              icon={LibraryIcon}
              title={t('library.emptyTitle')}
              text={t('library.emptyText')}
              action={
                <Button variant="primary" icon={Upload} onClick={() => openImport('file')}>
                  {t('library.add')}
                </Button>
              }
            />
          ) : data && filtered.length === 0 ? (
            <p className="muted">{t('library.noMatch')}</p>
          ) : (
            <ul className="source-grid" aria-label={t('library.listLabel')}>
              {filtered.map((s) => {
                const pct = progressPercent(data!.states.get(s.id), s.segmentCount);
                const problem = s.processingStatus !== 'ready';
                return (
                  <li key={s.id} className="source-card">
                    <a href={`#${routes.read(s.id)}`} className="source-card-link">
                      <SourceCover source={s} />
                      <span className="source-card-title">{s.title}</span>
                    </a>
                    <p className="source-card-meta">
                      {t(`sourceType.${s.sourceType}`)}
                      {s.pageCount ? ` · ${t('common.pagesN', { n: formatNumber(s.pageCount) })}` : ''}
                      {s.sourceType !== 'image' && s.wordCount > 0 ? ` · ${t('library.words', { n: formatNumber(s.wordCount) })} · ${t('library.minutes', { n: estimateReadingMinutes(s.wordCount) })}` : ''}
                    </p>
                    {s.tags.length > 0 && (
                      <p className="source-card-tags">
                        {s.tags.map((x) => (
                          <span key={x} className="tag">
                            #{x}
                          </span>
                        ))}
                      </p>
                    )}
                    {problem ? (
                      <div className="source-problem">
                        <Badge tone={s.processingStatus === 'failed' ? 'danger' : 'warning'}>{t(`status.${s.processingStatus}`)}</Badge>
                        {s.errorCode && (
                          <p className="field-hint">
                            <AlertTriangle size={14} aria-hidden="true" /> {t(`errors.${s.errorCode}.title`)}
                          </p>
                        )}
                        {(s.processingStatus === 'partial' || s.processingStatus === 'failed') && s.storageRef && (
                          <Button size="sm" icon={RefreshCw} onClick={() => void run(() => retryImport(s.id), t('library.retried'), 'retry')}>
                            {t('library.retry')}
                          </Button>
                        )}
                      </div>
                    ) : (
                      s.sourceType !== 'image' && <ProgressBar value={pct} label={t('library.progressOf', { title: s.title })} showValue />
                    )}
                    <div className="source-card-actions">
                      <IconButton
                        icon={Pencil}
                        size="sm"
                        label={t('library.rename', { title: s.title })}
                        onClick={() => {
                          setEditValue(s.title);
                          setEditing({ source: s, mode: 'rename' });
                        }}
                      />
                      <IconButton
                        icon={Tag}
                        size="sm"
                        label={t('library.editTags', { title: s.title })}
                        onClick={() => {
                          setEditValue(s.tags.join(', '));
                          setEditing({ source: s, mode: 'tags' });
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={t('library.trash', { title: s.title })}
                        onClick={() => void run(() => trashSource(s.id), t('library.trashed', { title: s.title }), 'trash', () => restoreSource(s.id))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabPanel>
      ) : (
        <TabPanel idPrefix="lib" id="trash">
          <p className="muted">{t('library.trashInfo')}</p>
          {data && data.trash.length === 0 ? (
            <EmptyState icon={Trash2} title={t('library.trashEmpty')} />
          ) : (
            <ul className="list">
              {data?.trash.map((s) => (
                <li key={s.id} className="list-row">
                  <div>
                    <p className="list-title">{s.title}</p>
                    <p className="list-meta">{t('library.deletedOn', { date: formatDate(s.deletedAt!) })}</p>
                  </div>
                  <div className="row-wrap">
                    <Button size="sm" icon={Undo2} onClick={() => void run(() => restoreSource(s.id), t('library.restored'), 'restore')}>
                      {t('common.restore')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={RotateCcw}
                      onClick={async () => {
                        const ok = await confirm({ title: t('library.purgeTitle'), message: t('library.purgeMessage', { title: s.title }), confirmLabel: t('library.purge'), danger: true });
                        if (ok) await run(() => purgeSource(s.id), t('library.purged'), 'purge');
                      }}
                    >
                      {t('library.purge')}
                    </Button>
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
        title={editing?.mode === 'rename' ? t('library.renameTitle') : t('library.tagsTitle')}
        size="sm"
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <TextField
            label={editing?.mode === 'rename' ? t('library.titleField') : t('library.tagsField')}
            hint={editing?.mode === 'tags' ? t('library.tagsHint') : undefined}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            maxLength={editing?.mode === 'rename' ? 200 : 600}
          />
        </form>
      </Modal>
    </div>
  );
}

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Eye,
  Focus,
  Search,
  Type,
  FileText,
  Files,
  ChevronUp,
  ChevronDown,
  StickyNote,
  Layers,
  Share2,
  Quote,
  PanelRight,
  MessageSquareText,
  X,
  Trash2,
  Pencil,
  Copy,
  Ruler,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { useShell } from '../../app/Shell';
import { navigate, routes } from '../../app/router';
import { useShortcuts } from '../../app/shortcuts';
import { Badge, Button, EmptyState, IconButton, ProgressBar, SelectField, Spinner, Switch, Tabs, TabPanel, TextArea } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { getSegments, getSource, getSourceFile, restoreSource } from '../../services/sources';
import {
  HIGHLIGHT_COLORS,
  createRangeAnnotations,
  createSegmentAnnotation,
  deleteAnnotation,
  listAnnotationsForSource,
  toggleBookmark,
  updateAnnotation,
  type SelectionPart,
} from '../../services/annotations';
import { getReadingState, recordSession, saveReadingPosition } from '../../services/reading';
import { listConcepts } from '../../services/learn';
import { countWords, normalizeForSearch } from '../../domain/text';
import type { Annotation, HighlightColor, Source, SourceSegment } from '../../domain/types';
import { partsText, selectionToParts, splitPieces, wordsPerMinute } from './readerUtils';
import { PageView } from './PageView';
import { OcrAction } from './OcrAction';
import { KeywordSuggestions } from './KeywordSuggestions';
import { FeynmanResultView, keyTermsAround } from '../learn/FeynmanPanel';
import { feynmanCheck, type FeynmanResult } from '../../domain/learning';

const RANGE_TYPES = new Set(['highlight', 'quote', 'note']);

interface ToolbarState {
  parts: SelectionPart[];
  x: number;
  y: number;
  fromKeyboard?: boolean;
}

/* ------------------------------ Okuma oturumu ------------------------------ */

function useReadingSession(sourceId: string | undefined, getProgress: () => { words: number }) {
  const active = useRef(0);
  const lastActivity = useRef(Date.now());
  const startedAt = useRef(new Date());
  const [activeMs, setActiveMs] = useState(0);
  const progressRef = useRef(getProgress);
  progressRef.current = getProgress;

  useEffect(() => {
    if (!sourceId) return;
    active.current = 0;
    startedAt.current = new Date();
    const mark = () => {
      lastActivity.current = Date.now();
    };
    const events = ['scroll', 'pointermove', 'keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const TICK = 5000;
    const flush = () => {
      const ms = active.current;
      if (ms >= 5000) {
        void recordSession('reading', startedAt.current, new Date(), ms, [sourceId], { words: progressRef.current().words });
      }
      active.current = 0;
      startedAt.current = new Date();
    };
    const iv = window.setInterval(() => {
      // Etkin süre: sekme görünür ve son 90 sn içinde etkileşim varsa sayılır.
      if (document.visibilityState === 'visible' && Date.now() - lastActivity.current < 90_000) {
        active.current += TICK;
        setActiveMs((v) => v + TICK);
      }
      if (active.current >= 120_000) flush();
    }, TICK);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [sourceId]);
  return activeMs;
}

/* ------------------------------ Segment ------------------------------ */

interface SegmentProps {
  seg: SourceSegment;
  ranged: Annotation[];
  hasNote: boolean;
  bookmarked: boolean;
  focused: boolean;
  searchHit: boolean;
  onMarkClick: (a: Annotation, el: HTMLElement) => void;
  onFocusSeg: (index: number) => void;
  onOpenActions: (index: number, el: HTMLElement) => void;
  noteLabel: string;
  bookmarkLabel: string;
}

const SegmentView = memo(function SegmentView({ seg, ranged, hasNote, bookmarked, focused, searchHit, onMarkClick, onFocusSeg, onOpenActions, noteLabel, bookmarkLabel }: SegmentProps) {
  const pieces = splitPieces(seg.text, ranged);
  const content = (
    <span data-seg-text={seg.index} className="seg-text">
      {pieces.map((p) =>
        p.annotation ? (
          <mark
            key={p.start}
            className={`hl hl-${p.annotation.annotationType === 'highlight' ? (p.annotation.color ?? 'important') : p.annotation.annotationType}`}
            data-ann={p.annotation.id}
            onClick={(e) => onMarkClick(p.annotation!, e.currentTarget)}
          >
            {p.text}
          </mark>
        ) : (
          <Fragment key={p.start}>{p.text}</Fragment>
        ),
      )}
    </span>
  );
  const common = {
    id: `seg-${seg.id}`,
    'data-index': seg.index,
    tabIndex: focused ? 0 : -1,
    className: `seg seg-${seg.segmentType} ${searchHit ? 'seg-search-hit' : ''} ${bookmarked ? 'seg-bookmarked' : ''}`,
    onFocus: () => onFocusSeg(seg.index),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        onOpenActions(seg.index, e.currentTarget);
      }
    },
  };
  const gutter = (hasNote || bookmarked) && (
    <span className="seg-gutter" aria-hidden="true">
      {bookmarked && <BookmarkCheck size={14} aria-label={bookmarkLabel} />}
      {hasNote && <MessageSquareText size={14} aria-label={noteLabel} />}
    </span>
  );
  if (seg.segmentType === 'heading') {
    const level = Math.min(6, Math.max(2, (seg.level ?? 1) + 1));
    const H = `h${level}` as 'h2';
    return (
      <H {...common}>
        {gutter}
        {content}
      </H>
    );
  }
  if (seg.segmentType === 'quote') {
    return (
      <blockquote {...common}>
        {gutter}
        {content}
      </blockquote>
    );
  }
  if (seg.segmentType === 'code') {
    return (
      <pre {...common}>
        {gutter}
        {content}
      </pre>
    );
  }
  return (
    <div {...common} role="paragraph">
      {gutter}
      {content}
    </div>
  );
});

/* ------------------------------ Sayfa ------------------------------ */

async function loadReader(sourceId: string) {
  const source = await getSource(sourceId);
  if (!source) return { source: undefined } as const;
  const [segments, annotations, concepts, state] = await Promise.all([
    getSegments(sourceId),
    listAnnotationsForSource(sourceId),
    listConcepts(),
    getReadingState(sourceId),
  ]);
  return {
    source,
    segments,
    annotations,
    concepts: concepts.filter((c) => c.sourceRefs.some((r) => r.sourceId === sourceId)),
    state,
  } as const;
}

export default function ReaderPage({ sourceId, segmentId }: { sourceId?: string; segmentId?: string }) {
  const { t } = useI18n();
  const { data, loading } = useQuery(() => (sourceId ? loadReader(sourceId) : Promise.resolve({ source: undefined } as const)), [sourceId], ['sources', 'segments', 'annotations', 'concepts']);

  if (!sourceId) {
    navigate(routes.library(), { replace: true });
    return null;
  }
  if (loading && !data) return <Spinner label={t('common.loading')} />;
  if (!data?.source) {
    return (
      <div className="page">
        <EmptyState icon={FileText} title={t('reader.notFound')} text={t('reader.notFoundText')} action={<Button onClick={() => navigate(routes.library())}>{t('nav.library')}</Button>} />
      </div>
    );
  }
  if (data.source.deletedAt) {
    return (
      <div className="page">
        <EmptyState
          icon={Trash2}
          title={t('reader.inTrash')}
          text={t('reader.inTrashText')}
          action={<Button onClick={() => void restoreSource(data.source.id)}>{t('common.restore')}</Button>}
        />
      </div>
    );
  }
  return (
    <Reader
      key={data.source.id}
      source={data.source}
      segments={data.segments ?? []}
      annotations={data.annotations ?? []}
      concepts={data.concepts ?? []}
      initialIndex={data.state?.segmentIndex ?? 0}
      jumpTo={segmentId}
    />
  );
}

interface ReaderProps {
  source: Source;
  segments: SourceSegment[];
  annotations: Annotation[];
  concepts: Awaited<ReturnType<typeof listConcepts>>;
  initialIndex: number;
  jumpTo?: string;
}

function Reader({ source, segments, annotations, concepts, initialIndex, jumpTo }: ReaderProps) {
  const { t, formatNumber } = useI18n();
  const { settings, updateSettings, toast, reportError, confirm } = useApp();
  const { openCardEditor, openConceptEditor } = useDialogs();
  const { focusMode, setFocusMode } = useShell();
  const articleRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(Math.min(initialIndex, Math.max(0, segments.length - 1)));
  const [focusedIndex, setFocusedIndex] = useState(current);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [annPopover, setAnnPopover] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ parts?: SelectionPart[]; segment?: SourceSegment; existing?: Annotation } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [view, setView] = useState<'text' | 'page'>(source.processingStatus === 'empty' && source.sourceType === 'pdf' ? 'page' : 'text');
  const [typoOpen, setTypoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [docQuery, setDocQuery] = useState('');
  const [hitPos, setHitPos] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('notes');
  const [rulerY, setRulerY] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string>();
  const startIndex = useRef(current);
  const maxIndex = useRef(current);

  /* ---- türetilmiş veri ---- */
  const bySeg = useMemo(() => {
    const ranged = new Map<string, Annotation[]>();
    const notes = new Set<string>();
    const bookmarks = new Set<string>();
    for (const a of annotations) {
      if (a.annotationType === 'bookmark') bookmarks.add(a.segmentId);
      if ((a.annotationType === 'note' || a.annotationType === 'explanation') && a.startInSegment == null) notes.add(a.segmentId);
      if (RANGE_TYPES.has(a.annotationType) && a.startInSegment != null) {
        const list = ranged.get(a.segmentId) ?? [];
        list.push(a);
        ranged.set(a.segmentId, list);
      }
      if (a.annotationType === 'note' && a.startInSegment != null && a.noteText) notes.add(a.segmentId);
    }
    return { ranged, notes, bookmarks };
  }, [annotations]);

  const segIndexById = useMemo(() => new Map(segments.map((s) => [s.id, s.index])), [segments]);

  const hits = useMemo(() => {
    const q = normalizeForSearch(docQuery);
    if (q.length < 2) return [];
    return segments.filter((s) => normalizeForSearch(s.text).includes(q)).map((s) => s.index);
  }, [docQuery, segments]);
  const hitSet = useMemo(() => new Set(hits), [hits]);

  const wordsBefore = useMemo(() => {
    const acc: number[] = [];
    let n = 0;
    for (const s of segments) {
      acc.push(n);
      n += countWords(s.text);
    }
    acc.push(n);
    return acc;
  }, [segments]);

  const activeMs = useReadingSession(source.id, () => ({ words: Math.max(0, wordsBefore[maxIndex.current + 1] - wordsBefore[startIndex.current]) }));

  /* ---- görsel kaynak ---- */
  useEffect(() => {
    if (source.sourceType !== 'image') return;
    let url: string | undefined;
    void getSourceFile(source).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      }
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // Kaynak nesnesi her veri yenilemesinde değişir; yalnızca dosya değişince yeniden yükle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.storageRef]);

  /* ---- konuma git ---- */
  const scrollToIndex = useCallback((index: number, opts: { focus?: boolean; flash?: boolean } = {}) => {
    const seg = segments[index];
    if (!seg) return;
    const el = document.getElementById(`seg-${seg.id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    if (opts.focus) el.focus({ preventScroll: true });
    if (opts.flash) {
      el.classList.remove('seg-flash');
      void el.offsetWidth;
      el.classList.add('seg-flash');
    }
    setFocusedIndex(index);
  }, [segments]);

  useLayoutEffect(() => {
    if (view !== 'text') return;
    const target = jumpTo ? segIndexById.get(jumpTo) : undefined;
    if (target != null) scrollToIndex(target, { flash: true, focus: true });
    else if (initialIndex > 0) scrollToIndex(Math.min(initialIndex, segments.length - 1));
    // Yalnızca ilk açılışta ve hedef değiştiğinde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  /* ---- görünür konumu izle ve kaydet ---- */
  useEffect(() => {
    if (view !== 'text' || !articleRef.current) return;
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.index);
          if (e.isIntersecting) visible.add(idx);
          else visible.delete(idx);
        }
        if (visible.size) {
          const top = Math.min(...visible);
          setCurrent(top);
          maxIndex.current = Math.max(maxIndex.current, Math.max(...visible));
        }
      },
      { rootMargin: '-20% 0px -40% 0px' },
    );
    articleRef.current.querySelectorAll<HTMLElement>('.seg').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [segments, view]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void saveReadingPosition(source.id, current).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(id);
  }, [current, source.id]);

  /* ---- seçim araç çubuğu ---- */
  const updateToolbarFromSelection = useCallback(() => {
    const container = articleRef.current;
    if (!container) return;
    const parts = selectionToParts(container, segments);
    if (!parts) {
      setToolbar((tb) => (tb?.fromKeyboard ? tb : null));
      return;
    }
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    setAnnPopover(null);
    setToolbar({ parts, x: rect.left + rect.width / 2, y: rect.top });
  }, [segments]);

  useEffect(() => {
    const onUp = () => window.setTimeout(updateToolbarFromSelection, 0);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey || e.key.startsWith('Arrow')) onUp();
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.addEventListener('keyup', onKeyUp);
    const onScroll = () => {
      setToolbar((tb) => {
        if (!tb || tb.fromKeyboard) return tb;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        const r = sel.getRangeAt(0).getBoundingClientRect();
        return { ...tb, x: r.left + r.width / 2, y: r.top };
      });
      setAnnPopover(null);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('scroll', onScroll);
    };
  }, [updateToolbarFromSelection]);

  const paragraphParts = (index: number): SelectionPart[] => {
    const seg = segments[index];
    return seg ? [{ segment: seg, start: 0, end: seg.text.length }] : [];
  };

  /** Seçim varsa seçimi, yoksa odaklı/görünür paragrafı hedef alır. */
  const targetParts = (): SelectionPart[] => {
    if (toolbar) return toolbar.parts;
    const container = articleRef.current;
    const sel = container ? selectionToParts(container, segments) : null;
    return sel ?? paragraphParts(focusedIndex ?? current);
  };

  const closeToolbar = () => {
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const refOf = (parts: SelectionPart[]) => ({ sourceId: source.id, segmentId: parts[0].segment.id, pageNumber: parts[0].segment.pageNumber });

  const doHighlight = async (color: HighlightColor, parts = targetParts()) => {
    if (!parts.length) return;
    try {
      await createRangeAnnotations('highlight', parts, { color });
      closeToolbar();
      toast(t('reader.highlighted', { color: t(`colors.${color}`) }), { tone: 'success' });
    } catch (e) {
      reportError(e, 'highlight');
    }
  };

  const doQuote = async (parts = targetParts()) => {
    if (!parts.length) return;
    try {
      await createRangeAnnotations('quote', parts);
      closeToolbar();
      toast(t('reader.quoteSaved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'quote');
    }
  };

  const doNote = (parts = targetParts()) => {
    if (!parts.length) return;
    const whole = parts.length === 1 && parts[0].start === 0 && parts[0].end === parts[0].segment.text.length;
    setNoteText('');
    setNoteDialog(whole ? { segment: parts[0].segment } : { parts });
    setToolbar(null);
  };

  const doCard = (parts = targetParts()) => {
    if (!parts.length) return;
    const text = partsText(parts);
    openCardEditor({ sourceRef: refOf(parts), quote: text, answer: text.length <= 300 ? text : '' });
    closeToolbar();
  };

  const doConcept = (parts = targetParts()) => {
    if (!parts.length) return;
    const text = partsText(parts);
    openConceptEditor({ sourceRef: refOf(parts), quote: text, label: text.length <= 60 ? text : '', description: text.length > 60 ? text.slice(0, 500) : '' });
    closeToolbar();
  };

  const saveNote = async () => {
    if (!noteDialog) return;
    try {
      if (noteDialog.existing) await updateAnnotation(noteDialog.existing.id, { noteText });
      else if (noteDialog.segment) await createSegmentAnnotation('note', noteDialog.segment, { noteText });
      else if (noteDialog.parts) await createRangeAnnotations('note', noteDialog.parts, { noteText });
      setNoteDialog(null);
      window.getSelection()?.removeAllRanges();
      toast(t('reader.noteSaved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'note');
    }
  };

  const removeAnnotation = async (a: Annotation) => {
    try {
      await deleteAnnotation(a);
      setAnnPopover(null);
      toast(t('reader.annotationDeleted'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'annotation-delete');
    }
  };

  const onMarkClick = useCallback((a: Annotation, el: HTMLElement) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const r = el.getBoundingClientRect();
    setToolbar(null);
    setAnnPopover({ annotation: a, x: r.left + r.width / 2, y: r.top });
  }, []);

  const onOpenActions = useCallback(
    (index: number, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const seg = segments[index];
      if (!seg) return;
      setToolbar({ parts: [{ segment: seg, start: 0, end: seg.text.length }], x: r.left + Math.min(r.width, 600) / 2, y: r.top, fromKeyboard: true });
    },
    [segments],
  );

  const moveFocus = (delta: number) => {
    const next = Math.max(0, Math.min(segments.length - 1, (focusedIndex ?? current) + delta));
    scrollToIndex(next, { focus: true });
  };

  const bookmarkCurrent = async () => {
    const seg = segments[focusedIndex ?? current];
    if (!seg) return;
    try {
      const on = await toggleBookmark(seg);
      toast(on ? t('reader.bookmarked') : t('reader.unbookmarked'));
    } catch (e) {
      reportError(e, 'bookmark');
    }
  };

  const sc = settings.shortcuts;
  useShortcuts({
    [sc.nextParagraph]: () => view === 'text' && moveFocus(1),
    [sc.prevParagraph]: () => view === 'text' && moveFocus(-1),
    [sc.highlight]: () => view === 'text' && void doHighlight('important'),
    [sc.addNote]: () => view === 'text' && doNote(),
    [sc.createCard]: () => view === 'text' && doCard(),
    [sc.focusMode]: () => setFocusMode(!focusMode),
    Escape: () => {
      if (toolbar || annPopover) {
        closeToolbar();
        setAnnPopover(null);
      } else if (focusMode) setFocusMode(false);
    },
  });

  useEffect(() => () => setFocusMode(false), [setFocusMode]);

  /* ---- belge içi arama ---- */
  const gotoHit = (pos: number) => {
    if (!hits.length) return;
    const p = (pos + hits.length) % hits.length;
    setHitPos(p);
    scrollToIndex(hits[p], { flash: true });
  };

  /* ---- konum bilgisi ---- */
  const curSeg = segments[current];
  const pageInfo = source.pageCount && curSeg?.pageNumber ? { cur: curSeg.pageNumber, total: source.pageCount } : null;
  const progress = segments.length ? Math.round(((current + 1) / segments.length) * 100) : 0;
  const sectionLabel = curSeg?.headingPath.length ? curSeg.headingPath[curSeg.headingPath.length - 1] : pageInfo ? t('common.pageN', { n: pageInfo.cur }) : undefined;
  const wpm = wordsPerMinute(Math.max(0, wordsBefore[maxIndex.current + 1] - wordsBefore[startIndex.current]), activeMs);

  const annotationsSorted = useMemo(
    () => [...annotations].sort((a, b) => (segIndexById.get(a.segmentId) ?? 0) - (segIndexById.get(b.segmentId) ?? 0) || (a.startInSegment ?? 0) - (b.startInSegment ?? 0)),
    [annotations, segIndexById],
  );

  const toolbarPos = (x: number, y: number) => ({
    left: Math.max(170, Math.min(window.innerWidth - 170, x)),
    top: y < 90 ? y + 36 : y - 10,
    transform: y < 90 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  });

  return (
    <div className={`reader ${focusMode ? 'reader-focus' : ''} ${panelOpen ? 'reader-panel-open' : ''}`}>
      <header className="reader-head">
        <IconButton icon={ArrowLeft} label={t('reader.back')} onClick={() => navigate(routes.library())} />
        <div className="reader-title-wrap">
          <h1 className="reader-title">{source.title}</h1>
          <p className="reader-loc">
            {sectionLabel ?? t(`sourceType.${source.sourceType}`)}
            {source.isSample && (
              <>
                {' '}
                <Badge tone="accent">{t('common.sample')}</Badge>
              </>
            )}
          </p>
        </div>
        <div className="reader-tools" role="toolbar" aria-label={t('reader.tools')}>
          {source.sourceType === 'pdf' && (
            <div className="segmented" role="group" aria-label={t('reader.viewMode')}>
              <button type="button" className={view === 'text' ? 'active' : ''} aria-pressed={view === 'text'} onClick={() => setView('text')} disabled={segments.length === 0}>
                <FileText size={16} aria-hidden="true" /> <span>{t('reader.textView')}</span>
              </button>
              <button type="button" className={view === 'page' ? 'active' : ''} aria-pressed={view === 'page'} onClick={() => setView('page')}>
                <Files size={16} aria-hidden="true" /> <span>{t('reader.pageView')}</span>
              </button>
            </div>
          )}
          <IconButton icon={Search} label={t('reader.searchDoc')} pressed={searchOpen} onClick={() => setSearchOpen((v) => !v)} disabled={view !== 'text'} />
          <IconButton icon={Type} label={t('reader.typography')} pressed={typoOpen} aria-expanded={typoOpen} aria-controls="typo-panel" onClick={() => setTypoOpen((v) => !v)} />
          <IconButton icon={Ruler} label={t('reader.ruler')} pressed={settings.readingRuler} onClick={() => void updateSettings({ readingRuler: !settings.readingRuler })} />
          <IconButton icon={bySeg.bookmarks.has(segments[focusedIndex ?? current]?.id ?? '') ? BookmarkCheck : Bookmark} label={t('reader.bookmark')} onClick={() => void bookmarkCurrent()} disabled={!segments.length} />
          <IconButton icon={Focus} label={focusMode ? t('reader.exitFocus') : t('reader.focusMode')} pressed={focusMode} onClick={() => setFocusMode(!focusMode)} />
          <IconButton icon={PanelRight} label={t('reader.panel')} pressed={panelOpen} className="panel-toggle" onClick={() => setPanelOpen((v) => !v)} />
        </div>
      </header>

      {searchOpen && view === 'text' && (
        <div className="doc-search" role="search">
          <Search size={16} aria-hidden="true" />
          <input
            className="input input-sm"
            autoFocus
            placeholder={t('reader.searchPlaceholder')}
            aria-label={t('reader.searchPlaceholder')}
            value={docQuery}
            onChange={(e) => {
              setDocQuery(e.target.value);
              setHitPos(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                gotoHit(e.shiftKey ? hitPos - 1 : hits.length && hitPos === 0 && !document.querySelector('.seg-flash') ? 0 : hitPos + 1);
              } else if (e.key === 'Escape') {
                setSearchOpen(false);
                setDocQuery('');
              }
            }}
          />
          <span className="doc-search-count" aria-live="polite">
            {docQuery.trim().length >= 2 ? (hits.length ? t('reader.hitOf', { n: hitPos + 1, total: hits.length }) : t('search.noResults')) : ''}
          </span>
          <IconButton icon={ChevronUp} size="sm" label={t('reader.prevHit')} onClick={() => gotoHit(hitPos - 1)} disabled={!hits.length} />
          <IconButton icon={ChevronDown} size="sm" label={t('reader.nextHit')} onClick={() => gotoHit(hitPos + 1)} disabled={!hits.length} />
          <IconButton icon={X} size="sm" label={t('common.close')} onClick={() => (setSearchOpen(false), setDocQuery(''))} />
        </div>
      )}

      {typoOpen && (
        <div id="typo-panel" className="typo-panel" role="region" aria-label={t('reader.typography')}>
          <SelectField
            label={t('settings.readingFont')}
            value={settings.readingFont}
            onChange={(e) => void updateSettings({ readingFont: e.target.value as typeof settings.readingFont })}
            options={(['literata', 'inter', 'atkinson', 'opendyslexic'] as const).map((f) => ({ value: f, label: t(`fonts.${f}`) }))}
          />
          <RangeField label={t('settings.fontSize')} value={settings.fontSizePx} min={14} max={32} step={1} unit="px" onChange={(v) => void updateSettings({ fontSizePx: v })} />
          <RangeField label={t('settings.lineHeight')} value={settings.lineHeight} min={1.3} max={2.2} step={0.05} onChange={(v) => void updateSettings({ lineHeight: v })} />
          <RangeField label={t('settings.measure')} value={settings.measureCh} min={40} max={100} step={2} unit="ch" onChange={(v) => void updateSettings({ measureCh: v })} />
          <RangeField label={t('settings.letterSpacing')} value={settings.letterSpacingEm} min={0} max={0.12} step={0.01} unit="em" onChange={(v) => void updateSettings({ letterSpacingEm: v })} />
          <Switch label={t('reader.ruler')} checked={settings.readingRuler} onChange={(v) => void updateSettings({ readingRuler: v })} hint={t('reader.rulerHint')} />
        </div>
      )}

      <div className="reader-body">
        <div
          className="reader-main"
          onPointerMove={(e) => settings.readingRuler && setRulerY(e.clientY)}
          onPointerLeave={() => setRulerY(null)}
        >
          {source.processingStatus !== 'ready' && (
            <div className="inline-notice" role="status">
              <p>
                <strong>{t(`status.${source.processingStatus}`)}</strong>
                {source.errorCode ? ` — ${t(`errors.${source.errorCode}.title`)} ${t(`errors.${source.errorCode}.action`)}` : ''}
              </p>
            </div>
          )}
          {((source.sourceType === 'pdf' && source.processingStatus === 'empty') || (source.sourceType === 'image' && !source.metadata.ocr)) && <OcrAction source={source} />}
          {source.metadata.ocr === true && (
            <p className="inline-notice ocr-notice" role="note">
              <span>{t('ocr.banner', { confidence: Number(source.metadata.ocrConfidence ?? 0) })}</span>
            </p>
          )}
          {view === 'page' && source.sourceType === 'pdf' ? (
            <PageView
              source={source}
              initialPage={curSeg?.pageNumber ?? 1}
              onOpenText={(page) => {
                const idx = segments.findIndex((s) => (s.pageNumber ?? 0) >= page);
                setView('text');
                if (idx >= 0) window.setTimeout(() => scrollToIndex(idx, { flash: true }), 50);
              }}
            />
          ) : (
            <article ref={articleRef} className="reading" aria-label={source.title} lang={settings.language === 'tr' ? undefined : 'tr'}>
              {imageUrl && (
                <figure className="reading-image">
                  <img src={imageUrl} alt={source.title} />
                  <figcaption className="field-hint">{t('reader.imageNote')}</figcaption>
                </figure>
              )}
              {segments.length === 0 && source.processingStatus === 'ready' && <p className="muted">{t('reader.noText')}</p>}
              {segments.map((seg, i) => {
                const newPage = seg.pageNumber != null && (i === 0 || segments[i - 1].pageNumber !== seg.pageNumber);
                return (
                  <Fragment key={seg.id}>
                    {newPage && (
                      <p className="page-marker" aria-label={t('common.pageN', { n: seg.pageNumber! })}>
                        <span>{t('common.pageN', { n: seg.pageNumber! })}</span>
                      </p>
                    )}
                    <SegmentView
                      seg={seg}
                      ranged={bySeg.ranged.get(seg.id) ?? EMPTY}
                      hasNote={bySeg.notes.has(seg.id)}
                      bookmarked={bySeg.bookmarks.has(seg.id)}
                      focused={i === focusedIndex}
                      searchHit={hitSet.has(i)}
                      onMarkClick={onMarkClick}
                      onFocusSeg={setFocusedIndex}
                      onOpenActions={onOpenActions}
                      noteLabel={t('reader.hasNote')}
                      bookmarkLabel={t('reader.bookmark')}
                    />
                  </Fragment>
                );
              })}
            </article>
          )}
          {settings.readingRuler && rulerY != null && view === 'text' && <div className="ruler" style={{ top: rulerY }} aria-hidden="true" />}
        </div>

        <aside className={`reader-panel ${panelOpen ? 'open' : ''}`} aria-label={t('reader.panel')}>
          <div className="reader-panel-head">
            <Tabs
              idPrefix="rp"
              label={t('reader.panel')}
              value={panelTab}
              onChange={setPanelTab}
              items={[
                { id: 'notes', label: t('reader.tabNotes'), count: annotations.filter((a) => a.annotationType !== 'quote').length },
                { id: 'concepts', label: t('reader.tabConcepts'), count: concepts.length },
                { id: 'quotes', label: t('reader.tabQuotes'), count: annotations.filter((a) => a.annotationType === 'quote').length },
              ]}
            />
            <IconButton icon={X} size="sm" className="panel-close" label={t('common.close')} onClick={() => setPanelOpen(false)} />
          </div>
          <TabPanel idPrefix="rp" id={panelTab} className="reader-panel-list">
            {panelTab === 'notes' && (
              <AnnotationList
                items={annotationsSorted.filter((a) => a.annotationType !== 'quote')}
                segments={segments}
                segIndexById={segIndexById}
                onGo={(i) => scrollToIndex(i, { flash: true, focus: true })}
                onEdit={(a) => {
                  setNoteText(a.noteText ?? '');
                  setNoteDialog({ existing: a });
                }}
                onDelete={(a) => void removeAnnotation(a)}
                empty={t('reader.noNotes')}
              />
            )}
            {panelTab === 'concepts' && (
              <div className="stack-sm">
                <KeywordSuggestions source={source} segments={segments} onGo={(i) => scrollToIndex(i, { flash: true })} />
                {concepts.length === 0 && <p className="muted">{t('reader.noConcepts')}</p>}
                <ul className="mini-list">
                  {concepts.map((c) => {
                    const ref = c.sourceRefs.find((r) => r.sourceId === source.id);
                    return (
                      <li key={c.id} className="mini-item">
                        <a href={`#${routes.map(c.id)}`} className="mini-title">
                          {c.label}
                        </a>
                        {c.description && <p className="mini-text">{c.description}</p>}
                        {ref?.segmentId && segIndexById.has(ref.segmentId) && (
                          <Button size="sm" variant="ghost" onClick={() => scrollToIndex(segIndexById.get(ref.segmentId!)!, { flash: true })}>
                            {t('reader.showInText')}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {panelTab === 'quotes' && (
              <ul className="mini-list">
                {annotationsSorted.filter((a) => a.annotationType === 'quote').length === 0 && <p className="muted">{t('reader.noQuotes')}</p>}
                {annotationsSorted
                  .filter((a) => a.annotationType === 'quote')
                  .map((a) => {
                    const seg = segments[segIndexById.get(a.segmentId) ?? -1];
                    const cite = `“${a.selectedText}” — ${source.title}${seg?.pageNumber ? `, ${t('common.pageShort', { n: seg.pageNumber })}` : ''}`;
                    return (
                      <li key={a.id} className="mini-item">
                        <p className="mini-quote">“{a.selectedText}”</p>
                        <div className="row-wrap">
                          <Button size="sm" variant="ghost" onClick={() => scrollToIndex(segIndexById.get(a.segmentId) ?? 0, { flash: true })}>
                            {seg?.pageNumber ? t('common.pageN', { n: seg.pageNumber }) : t('reader.showInText')}
                          </Button>
                          <IconButton
                            icon={Copy}
                            size="sm"
                            label={t('reader.copyCitation')}
                            onClick={() =>
                              void navigator.clipboard
                                ?.writeText(cite)
                                .then(() => toast(t('reader.copied')))
                                .catch(() => toast(t('reader.copyFailed'), { tone: 'error' }))
                            }
                          />
                          <IconButton icon={Trash2} size="sm" label={t('common.delete')} onClick={() => void removeAnnotation(a)} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </TabPanel>
          <div className="panel-actions" role="group" aria-label={t('reader.actionsFor')}>
            <p className="field-hint">{t('reader.actionsHint')}</p>
            <button type="button" className="panel-action" onClick={() => doCard()} disabled={!segments.length}>
              <Layers size={18} aria-hidden="true" /> {t('reader.createCard')}
            </button>
            <button type="button" className="panel-action" onClick={() => doConcept()} disabled={!segments.length}>
              <Share2 size={18} aria-hidden="true" /> {t('reader.addConcept')}
            </button>
            <button type="button" className="panel-action" onClick={() => void doQuote()} disabled={!segments.length}>
              <Quote size={18} aria-hidden="true" /> {t('reader.saveQuote')}
            </button>
          </div>
          <ExplainBox segment={curSeg} sectionLabel={sectionLabel} existing={annotations.filter((a) => a.annotationType === 'explanation')} />
        </aside>
      </div>

      <footer className="reader-foot">
        <span className="reader-foot-pos">
          {pageInfo ? t('reader.pageOf', { n: formatNumber(pageInfo.cur), total: formatNumber(pageInfo.total) }) : segments.length ? t('reader.paraOf', { n: formatNumber(current + 1), total: formatNumber(segments.length) }) : ''}
        </span>
        <ProgressBar value={progress} label={t('reader.progress')} />
        <span className="reader-foot-time" title={t('reader.speedNote')}>
          <Eye size={14} aria-hidden="true" /> {t('reader.sessionTime', { n: Math.floor(activeMs / 60000) })}
          {wpm && <span className="reader-wpm"> · {t('reader.wpm', { n: wpm })}</span>}
        </span>
      </footer>

      {toolbar && (
        <div className="sel-toolbar" role="toolbar" aria-label={t('reader.selectionTools')} style={toolbarPos(toolbar.x, toolbar.y)}>
          <div className="sel-colors" role="group" aria-label={t('reader.highlightAs')}>
            {HIGHLIGHT_COLORS.map((c, i) => (
              <button key={c} type="button" className={`swatch hl-${c}`} aria-label={t('reader.highlightColor', { color: t(`colors.${c}`) })} title={t(`colors.${c}`)} onClick={() => void doHighlight(c, toolbar.parts)} autoFocus={toolbar.fromKeyboard && i === 0} />
            ))}
          </div>
          <span className="sel-sep" aria-hidden="true" />
          <IconButton icon={StickyNote} size="sm" label={t('reader.addNote')} onClick={() => doNote(toolbar.parts)} />
          <IconButton icon={Layers} size="sm" label={t('reader.createCard')} onClick={() => doCard(toolbar.parts)} />
          <IconButton icon={Share2} size="sm" label={t('reader.addConcept')} onClick={() => doConcept(toolbar.parts)} />
          <IconButton icon={Quote} size="sm" label={t('reader.saveQuote')} onClick={() => void doQuote(toolbar.parts)} />
          <IconButton icon={X} size="sm" label={t('common.close')} onClick={closeToolbar} />
        </div>
      )}

      {annPopover && (
        <div className="sel-toolbar ann-popover" role="dialog" aria-label={t('reader.annotation')} style={toolbarPos(annPopover.x, annPopover.y)}>
          {annPopover.annotation.annotationType === 'highlight' && (
            <div className="sel-colors" role="group" aria-label={t('reader.changeColor')}>
              {HIGHLIGHT_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch hl-${c} ${annPopover.annotation.color === c ? 'swatch-on' : ''}`}
                  aria-pressed={annPopover.annotation.color === c}
                  aria-label={t('reader.highlightColor', { color: t(`colors.${c}`) })}
                  title={t(`colors.${c}`)}
                  autoFocus={i === 0}
                  onClick={() => void updateAnnotation(annPopover.annotation.id, { color: c }).then(() => setAnnPopover(null)).catch((e) => reportError(e, 'color'))}
                />
              ))}
            </div>
          )}
          {annPopover.annotation.noteText && <p className="ann-note">{annPopover.annotation.noteText}</p>}
          <IconButton
            icon={Pencil}
            size="sm"
            label={t('reader.editNote')}
            onClick={() => {
              setNoteText(annPopover.annotation.noteText ?? '');
              setNoteDialog({ existing: annPopover.annotation });
              setAnnPopover(null);
            }}
          />
          <IconButton
            icon={Layers}
            size="sm"
            label={t('reader.createCard')}
            onClick={() => {
              const a = annPopover.annotation;
              const seg = segments[segIndexById.get(a.segmentId) ?? -1];
              openCardEditor({ sourceRef: { sourceId: source.id, segmentId: a.segmentId, pageNumber: seg?.pageNumber }, quote: a.selectedText, answer: (a.selectedText ?? '').slice(0, 300) });
              setAnnPopover(null);
            }}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            label={t('common.delete')}
            onClick={async () => {
              const a = annPopover.annotation;
              if (a.noteText && !(await confirm({ title: t('reader.deleteAnnTitle'), message: t('reader.deleteAnnMessage'), danger: true, confirmLabel: t('common.delete') }))) return;
              await removeAnnotation(a);
            }}
          />
          <IconButton icon={X} size="sm" label={t('common.close')} onClick={() => setAnnPopover(null)} />
        </div>
      )}

      <Modal
        open={Boolean(noteDialog)}
        onClose={() => setNoteDialog(null)}
        title={noteDialog?.existing ? t('reader.editNote') : t('reader.addNote')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveNote()} disabled={!noteText.trim() && !noteDialog?.existing}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          {(noteDialog?.parts || noteDialog?.segment || noteDialog?.existing?.selectedText) && (
            <p className="source-ref-quote">
              “{noteDialog?.parts ? partsText(noteDialog.parts).slice(0, 300) : (noteDialog?.segment?.text ?? noteDialog?.existing?.selectedText ?? '').slice(0, 300)}”
            </p>
          )}
          <TextArea label={t('reader.noteLabel')} hint={t('reader.noteHint')} value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={5} data-autofocus />
        </div>
      </Modal>
    </div>
  );
}

const EMPTY: Annotation[] = [];

function RangeField({ label, value, min, max, step, unit = '', onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const id = `rng-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="field range-field">
      <label htmlFor={id} className="field-label">
        {label} <span className="range-value">{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function AnnotationList({
  items,
  segments,
  segIndexById,
  onGo,
  onEdit,
  onDelete,
  empty,
}: {
  items: Annotation[];
  segments: SourceSegment[];
  segIndexById: Map<string, number>;
  onGo: (i: number) => void;
  onEdit: (a: Annotation) => void;
  onDelete: (a: Annotation) => void;
  empty: string;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const shown = items.filter((a) => filter === 'all' || a.annotationType === filter);
  // Çok segmentli vurguların yalnızca ilk parçası listelenir.
  const seenGroups = new Set<string>();
  return (
    <div className="stack-sm">
      <SelectField
        label={t('reader.filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        options={[
          { value: 'all', label: t('common.all') },
          { value: 'highlight', label: t('annotationType.highlight') },
          { value: 'note', label: t('annotationType.note') },
          { value: 'explanation', label: t('annotationType.explanation') },
          { value: 'bookmark', label: t('annotationType.bookmark') },
        ]}
      />
      {shown.length === 0 && <p className="muted">{empty}</p>}
      <ul className="mini-list">
        {shown.map((a) => {
          if (a.groupId) {
            if (seenGroups.has(a.groupId)) return null;
            seenGroups.add(a.groupId);
          }
          const idx = segIndexById.get(a.segmentId);
          const seg = idx != null ? segments[idx] : undefined;
          return (
            <li key={a.id} className={`mini-item ann-${a.annotationType}`}>
              <p className="mini-meta">
                {a.annotationType === 'highlight' ? <span className={`dot hl-${a.color ?? 'important'}`} aria-hidden="true" /> : null}
                {a.annotationType === 'highlight' ? t(`colors.${a.color ?? 'important'}`) : t(`annotationType.${a.annotationType}`)}
                {seg?.pageNumber ? ` · ${t('common.pageN', { n: seg.pageNumber })}` : ''}
              </p>
              {a.selectedText && <p className="mini-quote">“{a.selectedText.length > 180 ? `${a.selectedText.slice(0, 180)}…` : a.selectedText}”</p>}
              {!a.selectedText && seg && a.annotationType !== 'explanation' && <p className="mini-quote">“{seg.text.slice(0, 120)}{seg.text.length > 120 ? '…' : ''}”</p>}
              {a.noteText && <p className="mini-text">{a.noteText}</p>}
              <div className="row-wrap">
                {idx != null ? (
                  <Button size="sm" variant="ghost" onClick={() => onGo(idx)}>
                    {t('reader.showInText')}
                  </Button>
                ) : (
                  <Badge tone="warning">{t('sourceRef.brokenShort')}</Badge>
                )}
                {(a.annotationType === 'note' || a.annotationType === 'explanation' || a.annotationType === 'highlight') && (
                  <IconButton icon={Pencil} size="sm" label={t('reader.editNote')} onClick={() => onEdit(a)} />
                )}
                <IconButton icon={Trash2} size="sm" label={t('common.delete')} onClick={() => onDelete(a)} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExplainBox({ segment, sectionLabel, existing }: { segment?: SourceSegment; sectionLabel?: string; existing: Annotation[] }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<FeynmanResult | null>(null);
  if (!segment) return null;
  const runCheck = async () => {
    const terms = await keyTermsAround([{ sourceId: segment.sourceId, segmentId: segment.id }], [], 5, 8);
    setCheck(feynmanCheck(text, terms));
  };
  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createSegmentAnnotation('explanation', segment, { noteText: text });
      setText('');
      toast(t('reader.explanationSaved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'explanation');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="explain-box" aria-labelledby="explain-title">
      <h2 id="explain-title" className="explain-title">
        {t('reader.explainTitle')}
      </h2>
      <p className="field-hint">{sectionLabel ? t('reader.explainPromptSection', { section: sectionLabel }) : t('reader.explainPrompt')}</p>
      <textarea className="input textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-labelledby="explain-title" placeholder={t('reader.explainPlaceholder')} />
      <div className="row-between">
        <span className="field-hint">{existing.length ? t('reader.explanationCount', { count: existing.length }) : ''}</span>
        <div className="row-wrap">
          <Button size="sm" onClick={() => void runCheck()} disabled={!text.trim()}>
            {t('feynman.check')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={!text.trim()} loading={saving}>
            {t('reader.saveExplanation')}
          </Button>
        </div>
      </div>
      {check && <FeynmanResultView result={check} />}
    </section>
  );
}

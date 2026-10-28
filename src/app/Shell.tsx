import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Home,
  Library,
  BookOpen,
  RotateCcw,
  Share2,
  NotebookPen,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  HelpCircle,
  Search,
  Upload,
  MoreHorizontal,
  FileText,
  Layers,
  Network,
  StickyNote,
  Plus,
  Command,
} from 'lucide-react';
import type { Route } from './router';
import { navigate, routes } from './router';
import { useI18n } from '../i18n';
import { LogoMark, Wordmark } from '../components/Brand';
import { Modal } from '../components/Modal';
import { useDialogs } from './Dialogs';
import { useShortcuts } from './shortcuts';
import { useApp } from './AppContext';
import { SearchIndex, type SearchHit } from '../services/search';
import { listSources, getAllSegments } from '../services/sources';
import { listCards } from '../services/memory';
import { listConcepts } from '../services/learn';
import { listAllAnnotations } from '../services/annotations';
import { getAllReadingStates } from '../services/reading';
import { Onboarding } from './Onboarding';
import { UpdateBanner } from './UpdateBanner';

interface ShellApi {
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  openSearch: (q?: string) => void;
}

const ShellCtx = createContext<ShellApi>({ focusMode: false, setFocusMode: () => undefined, openSearch: () => undefined });
export const useShell = () => useContext(ShellCtx);

const NAV = [
  { key: 'home', icon: Home, href: routes.home(), match: (r: Route) => r.segments.length === 0 },
  { key: 'library', icon: Library, href: routes.library(), match: (r: Route) => r.segments[0] === 'library' },
  { key: 'read', icon: BookOpen, href: '', match: (r: Route) => r.segments[0] === 'read' },
  { key: 'review', icon: RotateCcw, href: routes.review(), match: (r: Route) => r.segments[0] === 'review' },
  { key: 'map', icon: Share2, href: routes.map(), match: (r: Route) => r.segments[0] === 'map' },
  { key: 'notes', icon: NotebookPen, href: routes.notes(), match: (r: Route) => r.segments[0] === 'notes' },
  { key: 'tasks', icon: Target, href: routes.tasks(), match: (r: Route) => r.segments[0] === 'tasks' },
  { key: 'progress', icon: BarChart3, href: routes.progress(), match: (r: Route) => r.segments[0] === 'progress' },
] as const;

const NAV_BOTTOM = [
  { key: 'settings', icon: SettingsIcon, href: routes.settings(), match: (r: Route) => r.segments[0] === 'settings' },
  { key: 'help', icon: HelpCircle, href: routes.help(), match: (r: Route) => r.segments[0] === 'help' },
] as const;

/** "Okuma" bağlantısı: en son okunan kaynağa gider; yoksa kütüphaneye. */
async function goToLastRead() {
  const states = await getAllReadingStates();
  const sources = new Map((await listSources()).map((s) => [s.id, s]));
  const last = states.filter((s) => sources.has(s.sourceId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  navigate(last ? routes.read(last.sourceId) : routes.library());
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useI18n();
  const { openImport } = useDialogs();
  const { settings } = useApp();
  const [focusMode, setFocusMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Sayfa değişince odak ana içeriğe taşınır (ekran okuyucular için) ve odak modu kapanır.
  const routeKey = route.segments.join('/');
  useEffect(() => {
    setMoreOpen(false);
    if (route.segments[0] !== 'read') setFocusMode(false);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [routeKey, route.segments]);

  const sc = settings.shortcuts;
  useShortcuts({
    [sc.search]: () => {
      setSearchSeed('');
      setSearchOpen(true);
    },
    [sc.goHome]: () => navigate(routes.home()),
    [sc.goLibrary]: () => navigate(routes.library()),
    [sc.goReview]: () => navigate(routes.review()),
    [sc.goMap]: () => navigate(routes.map()),
  });

  const api = useMemo<ShellApi>(
    () => ({
      focusMode,
      setFocusMode,
      openSearch: (q = '') => {
        setSearchSeed(q);
        setSearchOpen(true);
      },
    }),
    [focusMode],
  );

  const navLink = (item: (typeof NAV)[number] | (typeof NAV_BOTTOM)[number], compact = false) => {
    const active = item.match(route);
    const Icon = item.icon;
    const label = compact && item.key === 'map' ? t('nav.mapShort') : t(`nav.${item.key}`);
    if (item.key === 'read') {
      return (
        <button type="button" className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => void goToLastRead()}>
          <Icon size={20} aria-hidden="true" />
          <span className={compact ? 'nav-label-compact' : 'nav-label'}>{label}</span>
        </button>
      );
    }
    return (
      <a href={`#${item.href}`} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon size={20} aria-hidden="true" />
        <span className={compact ? 'nav-label-compact' : 'nav-label'}>{label}</span>
      </a>
    );
  };

  const mobileTabs = [NAV[0], NAV[1], NAV[3], NAV[4]];

  return (
    <ShellCtx.Provider value={api}>
      <a className="skip-link" href="#main" onClick={(e) => {
        e.preventDefault();
        mainRef.current?.focus();
      }}>
        {t('nav.skip')}
      </a>
      <div className={`shell ${focusMode ? 'shell-focus' : ''}`}>
        <aside className="sidebar" aria-label={t('nav.primary')}>
          <a href="#/" className="brand" aria-label={t('nav.homeBrand')}>
            <LogoMark size={34} />
            <Wordmark />
          </a>
          <nav className="nav" aria-label={t('nav.primary')}>
            {NAV.map((n) => (
              <div key={n.key}>{navLink(n)}</div>
            ))}
          </nav>
          <nav className="nav nav-bottom" aria-label={t('nav.secondary')}>
            {NAV_BOTTOM.map((n) => (
              <div key={n.key}>{navLink(n)}</div>
            ))}
          </nav>
        </aside>
        <div className="main-col">
          <header className="topbar">
            <a href="#/" className="brand brand-mobile" aria-label={t('nav.homeBrand')}>
              <LogoMark size={28} />
              <Wordmark />
            </a>
            <button type="button" className="search-trigger" onClick={() => api.openSearch()} aria-keyshortcuts="Control+K">
              <Search size={18} aria-hidden="true" />
              <span className="search-trigger-text">{t('search.placeholder')}</span>
              <kbd className="kbd search-kbd">{sc.search}</kbd>
            </button>
            <div className="topbar-actions">
              <button type="button" className="btn btn-soft btn-md topbar-add" onClick={() => openImport('file')}>
                <Upload size={18} aria-hidden="true" />
                <span className="topbar-add-text">{t('library.add')}</span>
              </button>
            </div>
          </header>
          <UpdateBanner />
          <main id="main" ref={mainRef} tabIndex={-1} className="main">
            {children}
          </main>
        </div>
        <nav className="tabbar" aria-label={t('nav.primary')}>
          {mobileTabs.map((n) => (
            <div key={n.key}>{navLink(n, true)}</div>
          ))}
          <button type="button" className={`nav-link ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen((v) => !v)}>
            <MoreHorizontal size={20} aria-hidden="true" />
            <span className="nav-label-compact">{t('nav.more')}</span>
          </button>
        </nav>
        {moreOpen && (
          <div id="more-sheet" className="more-sheet" role="region" aria-label={t('nav.more')}>
            {[NAV[2], NAV[5], NAV[6], NAV[7], ...NAV_BOTTOM].map((n) => (
              <div key={n.key}>{navLink(n)}</div>
            ))}
          </div>
        )}
      </div>
      <CommandPalette open={searchOpen} seed={searchSeed} onClose={() => setSearchOpen(false)} />
      <Onboarding />
    </ShellCtx.Provider>
  );
}

/* ------------------------------ Komut paleti / arama ------------------------------ */

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Home;
  run: () => void;
  group: string;
}

function CommandPalette({ open, seed, onClose }: { open: boolean; seed: string; onClose: () => void }) {
  const { t } = useI18n();
  const { openImport, openCardEditor } = useDialogs();
  const [q, setQ] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ(seed);
    setActive(0);
    let live = true;
    void Promise.all([listSources(), getAllSegments(), listCards(), listConcepts(), listAllAnnotations()]).then(([sources, segments, cards, concepts, annotations]) => {
      if (live) setIndex(new SearchIndex({ sources, segments, cards, concepts, annotations }));
    });
    return () => {
      live = false;
    };
  }, [open, seed]);

  const go = (href: string) => () => {
    onClose();
    navigate(href);
  };

  const commands: PaletteItem[] = [
    { id: 'c-import', label: t('palette.import'), icon: Upload, run: () => (onClose(), openImport('file')), group: t('palette.actions') },
    { id: 'c-note', label: t('palette.newNote'), icon: StickyNote, run: () => (onClose(), openImport('note')), group: t('palette.actions') },
    { id: 'c-card', label: t('palette.newCard'), icon: Plus, run: () => (onClose(), openCardEditor({})), group: t('palette.actions') },
    { id: 'c-review', label: t('palette.startReview'), icon: RotateCcw, run: go(routes.review()), group: t('palette.actions') },
    ...[...NAV, ...NAV_BOTTOM]
      .filter((n) => n.key !== 'read')
      .map((n) => ({ id: `n-${n.key}`, label: t(`nav.${n.key}`), icon: n.icon, run: go(n.href), group: t('palette.navigate') })),
  ];

  const ql = q.trim().toLocaleLowerCase('tr');
  const cmdMatches = ql ? commands.filter((c) => c.label.toLocaleLowerCase('tr').includes(ql)) : commands;
  const hits: SearchHit[] = index && q.trim().length >= 2 ? index.search(q, 25) : [];
  const hitIcon = { source: FileText, segment: BookOpen, card: Layers, concept: Network, note: StickyNote } as const;
  const hitItems: PaletteItem[] = hits.map((h) => ({
    id: `h-${h.kind}-${h.id}`,
    label: h.kind === 'segment' || h.kind === 'note' ? h.snippet : h.title,
    hint:
      h.kind === 'segment'
        ? `${h.title}${h.pageNumber ? ` · ${t('common.pageN', { n: h.pageNumber })}` : ''}`
        : h.kind === 'note'
          ? `${t('palette.kind.note')} · ${h.title}`
          : t(`palette.kind.${h.kind}`),
    icon: hitIcon[h.kind],
    group: t('palette.results'),
    run:
      h.kind === 'source'
        ? go(routes.read(h.id))
        : h.kind === 'segment'
          ? go(routes.read(h.sourceId, h.id))
          : h.kind === 'note'
            ? go(routes.read(h.sourceId, h.segmentId))
            : h.kind === 'card'
              ? go(routes.card(h.id))
              : go(routes.map(h.id)),
  }));
  const items = [...hitItems, ...cmdMatches];
  const clamped = Math.min(active, Math.max(0, items.length - 1));

  return (
    <Modal open={open} onClose={onClose} title={t('search.title')} size="lg" initialFocus="#palette-input">
      <div className="palette">
        <div className="palette-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            id="palette-input"
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[clamped] ? `pi-${items[clamped].id}` : undefined}
            aria-autocomplete="list"
            placeholder={t('search.inputPlaceholder')}
            aria-label={t('search.inputPlaceholder')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && items[clamped]) {
                e.preventDefault();
                items[clamped].run();
              }
            }}
          />
        </div>
        {q.trim().length >= 2 && !hits.length && index && <p className="palette-empty">{t('search.noResults')}</p>}
        <ul id="palette-list" role="listbox" className="palette-list" aria-label={t('search.results')}>
          {items.map((it, i) => {
            const Icon = it.icon;
            const showGroup = i === 0 || items[i - 1].group !== it.group;
            return (
              <li key={it.id} role="presentation">
                {showGroup && <p className="palette-group" aria-hidden="true">{it.group}</p>}
                <div
                  id={`pi-${it.id}`}
                  role="option"
                  aria-selected={i === clamped}
                  className={`palette-item ${i === clamped ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="palette-label">{it.label}</span>
                  {it.hint && <span className="palette-hint">{it.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="palette-footer">
          <Command size={14} aria-hidden="true" /> {t('search.footer')}
        </p>
      </div>
    </Modal>
  );
}

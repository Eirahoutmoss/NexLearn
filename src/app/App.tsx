import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { recoverInterruptedImports } from '../services/sources';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../services/settings';
import type { Settings } from '../domain/types';
import { I18nProvider, useI18n } from '../i18n';
import { applyTokens, resolveTheme, tokensFor } from '../styles/themes';
import { AppProvider } from './AppContext';
import { DialogsProvider } from './Dialogs';
import { Shell } from './Shell';
import { useRoute } from './router';
import { subscribeChanges } from '../adapters/storage/db';
import { Spinner } from '../components/ui';
import { HomePage } from '../modules/home/HomePage';

const LibraryPage = lazy(() => import('../modules/library/LibraryPage'));
const ReaderPage = lazy(() => import('../modules/read/ReaderPage'));
const ReviewPage = lazy(() => import('../modules/memory/ReviewPage'));
const MapPage = lazy(() => import('../modules/learn/MapPage'));
const NotesPage = lazy(() => import('../modules/notes/NotesPage'));
const TasksPage = lazy(() => import('../modules/tasks/TasksPage'));
const ProgressPage = lazy(() => import('../modules/progress/ProgressPage'));
const SettingsPage = lazy(() => import('../modules/settings/SettingsPage'));
const HelpPage = lazy(() => import('../modules/help/HelpPage'));

const FONT_STACKS: Record<Settings['readingFont'], string> = {
  literata: "'Literata', Georgia, 'Times New Roman', serif",
  inter: "'Inter Variable', 'Inter', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
  opendyslexic: "'OpenDyslexic', 'Atkinson Hyperlegible', sans-serif",
};

/** Tema, hareket ve okuma tipografisi tercihlerini belge köküne uygular. */
function useApplyPreferences(settings: Settings) {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setPrefersDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const theme = resolveTheme(settings.theme, prefersDark);
    const tokens = tokensFor(theme, settings.accent);
    applyTokens(root, tokens, theme);
    root.dataset.motion = settings.motion;
    root.lang = settings.language;
    root.style.setProperty('--read-font', FONT_STACKS[settings.readingFont]);
    root.style.setProperty('--read-size', `${settings.fontSizePx}px`);
    root.style.setProperty('--read-lh', String(settings.lineHeight));
    root.style.setProperty('--read-measure', `${settings.measureCh}ch`);
    root.style.setProperty('--read-ls', `${settings.letterSpacingEm}em`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bg);
  }, [settings, prefersDark]);
}

function Routes() {
  const route = useRoute();
  const { t } = useI18n();
  const [first] = route.segments;
  let page;
  switch (first) {
    case undefined:
      page = <HomePage />;
      break;
    case 'library':
      page = <LibraryPage />;
      break;
    case 'read':
      page = <ReaderPage sourceId={route.segments[1]} segmentId={route.query.get('seg') ?? undefined} />;
      break;
    case 'review':
      page = <ReviewPage tab={route.query.get('tab') ?? 'today'} cardId={route.query.get('card') ?? undefined} scope={route.query.get('scope') ?? undefined} />;
      break;
    case 'map':
      page = <MapPage conceptId={route.query.get('concept') ?? undefined} view={route.query.get('view') ?? undefined} />;
      break;
    case 'notes':
      page = <NotesPage />;
      break;
    case 'tasks':
      page = <TasksPage />;
      break;
    case 'progress':
      page = <ProgressPage />;
      break;
    case 'settings':
      page = <SettingsPage section={route.query.get('section') ?? undefined} />;
      break;
    case 'help':
      page = <HelpPage />;
      break;
    default:
      page = <HomePage />;
  }
  return (
    <Shell route={route}>
      <Suspense fallback={<Spinner label={t('common.loading')} />}>{page}</Suspense>
    </Shell>
  );
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fatal, setFatal] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      getSettings()
        .then((s) => live && setSettings(s))
        .catch(() => live && setFatal(true));
    void load();
    void recoverInterruptedImports().catch(() => undefined);
    const off = subscribeChanges((stores) => {
      if (stores.has('settings')) void load();
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  const onUpdate = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setSettings(await updateSettings(patch));
  }, []);

  const effective = settings ?? DEFAULT_SETTINGS;
  useApplyPreferences(effective);

  if (fatal) {
    return (
      <I18nProvider lang="tr">
        <FatalScreen />
      </I18nProvider>
    );
  }
  if (!settings) return null;

  return (
    <I18nProvider lang={settings.language}>
      <AppProvider settings={settings} onUpdateSettings={onUpdate}>
        <DialogsProvider>
          <Routes />
        </DialogsProvider>
      </AppProvider>
    </I18nProvider>
  );
}

function FatalScreen() {
  const { t } = useI18n();
  return (
    <main className="fatal" role="alert">
      <h1>{t('errors.DB-001.title')}</h1>
      <p>{t('fatal.storage')}</p>
      <button type="button" className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
        {t('fatal.reload')}
      </button>
    </main>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Download, Upload, ShieldCheck, RefreshCw, Trash2, Undo2, FlaskConical, FileJson, FileText, Table, Keyboard, Check, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useQuery } from '../../app/useQuery';
import { Badge, Button, Card, Kbd, ProgressBar, SelectField, Switch, TextField } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { Landscape } from '../../components/Brand';
import { THEMES, tokensFor, type ConcreteTheme } from '../../styles/themes';
import type { AccentId, MotionPref, ReadingFont, ThemeId } from '../../domain/types';
import { DEFAULT_SHORTCUTS } from '../../services/settings';
import { backupScope, collectData, createBackup, deleteAllData, getLatestSnapshot, parseBackupFile, restoreBackup, toExportJson, undoLastRestore, type ParsedBackup } from '../../services/backup/backup';
import { isEncryptedBackup } from '../../services/backup/crypto';
import { notesMarkdown } from '../../services/export/markdown';
import { cardsCsv, reviewEventsCsv } from '../../services/export/csv';
import { downloadBytes, downloadText } from '../../services/export/download';
import { listReviewStates } from '../../services/memory';
import { canSelfUpdate, checkForUpdate, checkWebUpdate, downloadAndInstall, isTauri, RELEASES_PAGE, type UpdateCheck } from '../../services/update';
import { hasSample, loadSample, removeSample } from '../../sample/sample';
import { eventToCombo } from '../../app/shortcuts';
import { isAppError } from '../../domain/errors';

const SECTIONS = ['appearance', 'reading', 'review', 'home', 'privacy', 'data', 'keyboard', 'language', 'about'] as const;

export default function SettingsPage({ section }: { section?: string }) {
  const { t } = useI18n();
  useEffect(() => {
    if (section && (SECTIONS as readonly string[]).includes(section)) {
      document.getElementById(`set-${section}`)?.scrollIntoView({ block: 'start' });
    }
  }, [section]);
  return (
    <div className="page page-settings">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.sections')}>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s}>
                <a
                  href={`#/settings?section=${s}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`set-${s}`)?.scrollIntoView({ block: 'start' });
                    document.getElementById(`set-${s}`)?.focus({ preventScroll: true });
                  }}
                >
                  {t(`settings.section.${s}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-content">
          <Appearance />
          <Reading />
          <ReviewPrefs />
          <HomePrefs />
          <Privacy />
          <DataSection />
          <KeyboardSection />
          <LanguageSection />
          <About />
        </div>
      </div>
    </div>
  );
}

function Section({ id, children }: { id: (typeof SECTIONS)[number]; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <Card className="settings-section" aria-labelledby={`set-${id}`}>
      <h2 id={`set-${id}`} tabIndex={-1} className="card-title">
        {t(`settings.section.${id}`)}
      </h2>
      {children}
    </Card>
  );
}

/* ------------------------------ Görünüm ------------------------------ */

function Appearance() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  const themes: ThemeId[] = ['system', 'aydinlik', 'sicak', 'pastel', 'gece', 'ametist', 'kontrast'];
  const preview = (id: ThemeId): CSSProperties => {
    const concrete: ConcreteTheme = id === 'system' ? 'aydinlik' : id;
    const tk = THEMES[concrete];
    return {
      ['--land-sky1' as string]: tk.landSky1,
      ['--land-sky2' as string]: tk.landSky2,
      ['--land-sun' as string]: tk.landSun,
      ['--land1' as string]: tk.land1,
      ['--land2' as string]: tk.land2,
      ['--land3' as string]: tk.land3,
      ['--land4' as string]: tk.land4,
    };
  };
  return (
    <Section id="appearance">
      <fieldset className="theme-grid">
        <legend className="field-label">{t('settings.theme')}</legend>
        {themes.map((id) => (
          <label key={id} className={`theme-option ${settings.theme === id ? 'selected' : ''}`}>
            <input type="radio" name="theme" value={id} checked={settings.theme === id} onChange={() => void updateSettings({ theme: id })} className="sr-only-input" />
            <span className={`theme-preview ${id === 'system' ? 'theme-preview-split' : ''}`} style={preview(id)} aria-hidden="true">
              <Landscape />
            </span>
            <span className="theme-name">{t(`themes.${id}.name`)}</span>
            <span className="theme-desc">{t(`themes.${id}.desc`)}</span>
            {settings.theme === id && <Check size={16} className="theme-check" aria-hidden="true" />}
          </label>
        ))}
      </fieldset>
      <fieldset className="accent-row" disabled={settings.theme === 'kontrast'}>
        <legend className="field-label">{t('settings.accent')}</legend>
        {(['theme', 'orange', 'sea', 'green', 'purple'] as AccentId[]).map((a) => {
          const sample = a === 'theme' ? undefined : tokensFor('aydinlik', a).accent;
          return (
            <label key={a} className={`accent-option ${settings.accent === a ? 'selected' : ''}`}>
              <input type="radio" name="accent" value={a} checked={settings.accent === a} onChange={() => void updateSettings({ accent: a })} className="sr-only-input" />
              <span className="accent-swatch" style={{ background: sample ?? 'var(--accent)' }} aria-hidden="true" />
              {t(`accents.${a}`)}
            </label>
          );
        })}
        {settings.theme === 'kontrast' && <p className="field-hint">{t('settings.accentContrastNote')}</p>}
      </fieldset>
      <SelectField
        label={t('settings.motion')}
        hint={t('settings.motionHint')}
        value={settings.motion}
        onChange={(e) => void updateSettings({ motion: e.target.value as MotionPref })}
        options={[
          { value: 'system', label: t('settings.motionSystem') },
          { value: 'reduce', label: t('settings.motionReduce') },
          { value: 'full', label: t('settings.motionFull') },
        ]}
      />
    </Section>
  );
}

/* ------------------------------ Okuma ------------------------------ */

function Reading() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  const range = (key: 'fontSizePx' | 'lineHeight' | 'measureCh' | 'letterSpacingEm', min: number, max: number, step: number, unit: string) => (
    <div className="field range-field">
      <label className="field-label" htmlFor={`r-${key}`}>
        {t(`settings.${key === 'fontSizePx' ? 'fontSize' : key === 'measureCh' ? 'measure' : key === 'letterSpacingEm' ? 'letterSpacing' : 'lineHeight'}`)}{' '}
        <span className="range-value">
          {Number.isInteger(step) ? settings[key] : settings[key].toFixed(2)}
          {unit}
        </span>
      </label>
      <input id={`r-${key}`} type="range" min={min} max={max} step={step} value={settings[key]} onChange={(e) => void updateSettings({ [key]: Number(e.target.value) })} />
    </div>
  );
  return (
    <Section id="reading">
      <SelectField
        label={t('settings.readingFont')}
        value={settings.readingFont}
        onChange={(e) => void updateSettings({ readingFont: e.target.value as ReadingFont })}
        options={(['literata', 'inter', 'atkinson', 'opendyslexic'] as const).map((f) => ({ value: f, label: t(`fonts.${f}`) }))}
        hint={t('settings.fontHint')}
      />
      <div className="grid-2">
        {range('fontSizePx', 14, 32, 1, 'px')}
        {range('lineHeight', 1.3, 2.2, 0.05, '')}
        {range('measureCh', 40, 100, 2, 'ch')}
        {range('letterSpacingEm', 0, 0.12, 0.01, 'em')}
      </div>
      <p className="reading-sample" aria-label={t('settings.preview')}>
        {t('settings.previewText')}
      </p>
      <Switch label={t('reader.ruler')} hint={t('reader.rulerHint')} checked={settings.readingRuler} onChange={(v) => void updateSettings({ readingRuler: v })} />
    </Section>
  );
}

/* ------------------------------ Tekrar ------------------------------ */

function ReviewPrefs() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  return (
    <Section id="review">
      <Switch label={t('settings.interleave')} hint={t('settings.interleaveHint')} checked={settings.interleave} onChange={(v) => void updateSettings({ interleave: v })} />
      <Switch label={t('settings.askConfidence')} hint={t('settings.askConfidenceHint')} checked={settings.askConfidence} onChange={(v) => void updateSettings({ askConfidence: v })} />
    </Section>
  );
}

/* ------------------------------ Ana sayfa ------------------------------ */

function HomePrefs() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  const g = settings.dailyGoals;
  const setGoal = (k: keyof typeof g, v: number) => void updateSettings({ dailyGoals: { ...g, [k]: Math.max(0, Math.min(500, Math.round(v) || 0)) } });
  return (
    <Section id="home">
      <Switch label={t('settings.showQuotes')} checked={settings.showQuotes} onChange={(v) => void updateSettings({ showQuotes: v })} />
      <Switch label={t('settings.goals')} hint={t('settings.goalsHint')} checked={g.enabled} onChange={(v) => void updateSettings({ dailyGoals: { ...g, enabled: v } })} />
      {g.enabled && (
        <div className="grid-2">
          <TextField label={t('settings.goalReviews')} type="number" min={0} max={500} value={g.reviewCards} onChange={(e) => setGoal('reviewCards', Number(e.target.value))} />
          <TextField label={t('settings.goalMinutes')} type="number" min={0} max={500} value={g.readingMinutes} onChange={(e) => setGoal('readingMinutes', Number(e.target.value))} />
          <TextField label={t('settings.goalNotes')} type="number" min={0} max={500} value={g.notes} onChange={(e) => setGoal('notes', Number(e.target.value))} />
          <TextField label={t('settings.goalTasks')} type="number" min={0} max={500} value={g.tasks} onChange={(e) => setGoal('tasks', Number(e.target.value))} />
        </div>
      )}
    </Section>
  );
}

/* ------------------------------ Gizlilik ------------------------------ */

function Privacy() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  return (
    <Section id="privacy">
      <ul className="privacy-list">
        <li>
          <ShieldCheck size={18} aria-hidden="true" /> {t('settings.privacy1')}
        </li>
        <li>
          <ShieldCheck size={18} aria-hidden="true" /> {t('settings.privacy2')}
        </li>
        <li>
          <ShieldCheck size={18} aria-hidden="true" /> {t('settings.privacy3')}
        </li>
      </ul>
      <Switch label={t('settings.storeAnswers')} hint={t('settings.storeAnswersHint')} checked={settings.storeTypedAnswers} onChange={(v) => void updateSettings({ storeTypedAnswers: v })} />
    </Section>
  );
}

/* ------------------------------ Veri ve yedekleme ------------------------------ */

function DataSection() {
  const { t, formatNumber, formatDate } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const { data: scope } = useQuery(backupScope, [], ['sources', 'segments', 'annotations', 'concepts', 'relations', 'items', 'reviewEvents', 'tasks', 'files']);
  const { data: snapshot } = useQuery(getLatestSnapshot, [], ['snapshots', 'sources']);
  const { data: sampleLoaded } = useQuery(hasSample, [], ['sources']);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [encrypt, setEncrypt] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePw, setRestorePw] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [restoreError, setRestoreError] = useState<string>();

  const pwError = encrypt && pw && pw.length < 8 ? t('settings.pwShort') : encrypt && pw2 && pw !== pw2 ? t('settings.pwMismatch') : undefined;
  const mb = (b: number) => formatNumber(b / 1024 / 1024, { maximumFractionDigits: 1 });

  const exportAs = async (kind: 'json' | 'md' | 'cards' | 'events') => {
    setBusy(kind);
    try {
      const d = await collectData();
      const stamp = d.createdAt.slice(0, 10);
      if (kind === 'json') downloadText(toExportJson(d), `nexlearn-export-${stamp}.json`, 'application/json');
      if (kind === 'md') {
        const md = notesMarkdown(d, {
          title: t('export.mdTitle'),
          highlights: t('export.highlights'),
          notes: t('export.notes'),
          explanations: t('export.explanations'),
          cards: t('export.cards'),
          concepts: t('export.concepts'),
          tasks: t('export.tasks'),
          page: t('common.pageShortLabel'),
          question: t('export.question'),
          answer: t('export.answer'),
          relationLabel: (r) => t(`relation.${r}`),
          exportedAt: t('export.exportedAt'),
        });
        downloadText(md, `nexlearn-notlar-${stamp}.md`, 'text/markdown');
      }
      const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
      if (kind === 'cards') downloadText(cardsCsv(live(d.items), await listReviewStates(), new Map(d.sources.map((s) => [s.id, s]))), `nexlearn-kartlar-${stamp}.csv`, 'text/csv');
      if (kind === 'events') downloadText(reviewEventsCsv(d.reviewEvents, new Map(d.items.map((i) => [i.id, i]))), `nexlearn-tekrar-gecmisi-${stamp}.csv`, 'text/csv');
      toast(t('settings.exported'), { tone: 'success' });
    } catch (e) {
      reportError(e, `export-${kind}`);
    } finally {
      setBusy(null);
    }
  };

  const makeBackup = async () => {
    if (encrypt && (!pw || pw.length < 8 || pw !== pw2)) return;
    setBusy('backup');
    try {
      const { bytes, fileName } = await createBackup({ includeOriginals, password: encrypt ? pw : undefined });
      downloadBytes(bytes, fileName, encrypt ? 'application/octet-stream' : 'application/zip');
      setPw('');
      setPw2('');
      toast(t('settings.backupDone', { name: fileName }), { tone: 'success' });
    } catch (e) {
      reportError(e, 'backup');
    } finally {
      setBusy(null);
    }
  };

  const validateRestore = async (file: File, password?: string) => {
    setRestoreError(undefined);
    setBusy('validate');
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (isEncryptedBackup(head) && !password) {
        setNeedPw(true);
        return;
      }
      setParsed(await parseBackupFile(file, password));
      setNeedPw(false);
    } catch (e) {
      const code = isAppError(e) ? e.code : 'UNK-000';
      setRestoreError(`${t(`errors.${code}.title`)} ${t(`errors.${code}.action`)}`);
      if (code === 'RST-003') setNeedPw(true);
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    if (!parsed) return;
    const ok = await confirm({ title: t('settings.restoreConfirmTitle'), message: t('settings.restoreConfirmText'), confirmLabel: t('settings.restore'), danger: true });
    if (!ok) return;
    setBusy('restore');
    try {
      await restoreBackup(parsed);
      setParsed(null);
      setRestoreFile(null);
      toast(t('settings.restored'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'restore');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section id="data">
      <p className="muted">{t('settings.dataIntro')}</p>

      <h3 className="section-mini">{t('settings.export')}</h3>
      <div className="row-wrap">
        <Button icon={FileJson} loading={busy === 'json'} onClick={() => void exportAs('json')}>
          JSON
        </Button>
        <Button icon={FileText} loading={busy === 'md'} onClick={() => void exportAs('md')}>
          {t('settings.exportMd')}
        </Button>
        <Button icon={Table} loading={busy === 'cards'} onClick={() => void exportAs('cards')}>
          {t('settings.exportCardsCsv')}
        </Button>
        <Button icon={Table} loading={busy === 'events'} onClick={() => void exportAs('events')}>
          {t('settings.exportEventsCsv')}
        </Button>
      </div>
      <p className="field-hint">{t('settings.exportHint')}</p>

      <h3 className="section-mini">{t('settings.backup')}</h3>
      {scope && (
        <p className="muted" aria-live="polite">
          {t('settings.scope', {
            sources: scope.counts.sources,
            notes: scope.counts.annotations,
            cards: scope.counts.items,
            concepts: scope.counts.concepts,
            reviews: scope.counts.reviewEvents,
          })}
          {includeOriginals ? ` ${t('settings.scopeOriginals', { n: scope.originals, mb: mb(scope.originalsBytes) })}` : ''}
        </p>
      )}
      <Switch label={t('settings.includeOriginals')} hint={t('settings.includeOriginalsHint')} checked={includeOriginals} onChange={setIncludeOriginals} />
      <Switch label={t('settings.encrypt')} hint={t('settings.encryptHint')} checked={encrypt} onChange={setEncrypt} />
      {encrypt && (
        <div className="grid-2">
          <TextField label={t('settings.password')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={pw && pw.length < 8 ? pwError : undefined} />
          <TextField label={t('settings.password2')} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={pw2 && pw !== pw2 ? t('settings.pwMismatch') : undefined} />
          <p className="field-hint warn-text">
            <AlertTriangle size={14} aria-hidden="true" /> {t('settings.noRecovery')}
          </p>
        </div>
      )}
      <Button variant="primary" icon={Download} loading={busy === 'backup'} onClick={() => void makeBackup()} disabled={encrypt && (!pw || pw.length < 8 || pw !== pw2)}>
        {t('settings.createBackup')}
      </Button>

      <h3 className="section-mini">{t('settings.restoreTitle')}</h3>
      <p className="field-hint">{t('settings.restoreHint')}</p>
      <div className="row-wrap">
        <Button icon={Upload} onClick={() => fileRef.current?.click()} loading={busy === 'validate'}>
          {t('settings.chooseBackup')}
        </Button>
        {snapshot && (
          <Button
            icon={Undo2}
            variant="ghost"
            onClick={async () => {
              if (!(await confirm({ title: t('settings.undoRestoreTitle'), message: t('settings.undoRestoreText', { date: formatDate(snapshot.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }), danger: true }))) return;
              try {
                await undoLastRestore();
                toast(t('settings.undoRestoreDone'), { tone: 'success' });
              } catch (e) {
                reportError(e, 'undo-restore');
              }
            }}
          >
            {t('settings.undoRestore')}
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".zip,.json,.nexlearn-enc,application/zip,application/json"
        data-testid="restore-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setRestoreFile(f);
          setParsed(null);
          setRestorePw('');
          void validateRestore(f);
        }}
      />
      {restoreError && (
        <p className="field-error-text" role="alert">
          {restoreError}
        </p>
      )}
      {needPw && restoreFile && (
        <form
          className="row-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void validateRestore(restoreFile, restorePw);
          }}
        >
          <TextField label={t('settings.backupPassword')} type="password" autoComplete="off" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} />
          <Button type="submit" variant="primary">
            {t('settings.unlock')}
          </Button>
        </form>
      )}
      <Modal
        open={Boolean(parsed)}
        onClose={() => setParsed(null)}
        title={t('settings.restorePreview')}
        description={restoreFile?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setParsed(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy === 'restore'} onClick={() => void doRestore()}>
              {t('settings.restore')}
            </Button>
          </>
        }
      >
        {parsed && (
          <div className="stack">
            <p>
              <Badge tone="success">{t('settings.validated')}</Badge> {parsed.encrypted && <Badge>{t('settings.encrypted')}</Badge>} <Badge>{parsed.format.toUpperCase()}</Badge>
            </p>
            <dl className="stat-dl">
              <div>
                <dt>{t('settings.backupDate')}</dt>
                <dd>{parsed.data.createdAt ? formatDate(parsed.data.createdAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
              </div>
              <div>
                <dt>{t('settings.schema')}</dt>
                <dd>{parsed.data.schemaVersion}</dd>
              </div>
              <div>
                <dt>{t('progress.sources')}</dt>
                <dd>{parsed.data.sources.length}</dd>
              </div>
              <div>
                <dt>{t('progress.cards')}</dt>
                <dd>{parsed.data.items.length}</dd>
              </div>
              <div>
                <dt>{t('progress.concepts')}</dt>
                <dd>{parsed.data.concepts.length}</dd>
              </div>
              <div>
                <dt>{t('notes.title')}</dt>
                <dd>{parsed.data.annotations.length}</dd>
              </div>
              <div>
                <dt>{t('settings.originalsInBackup')}</dt>
                <dd>{parsed.originals.length}</dd>
              </div>
            </dl>
            {parsed.compatibility === 'newer-minor' && <p className="inline-notice">{t('settings.newerMinor')}</p>}
            {(parsed.warnings.orphanSegments > 0 || parsed.warnings.orphanStates > 0 || parsed.warnings.orphanEvents > 0) && (
              <p className="inline-notice">{t('settings.orphans', { n: parsed.warnings.orphanSegments + parsed.warnings.orphanStates + parsed.warnings.orphanEvents })}</p>
            )}
            <p className="warn-text">
              <AlertTriangle size={16} aria-hidden="true" /> {t('settings.overwriteWarning')}
            </p>
          </div>
        )}
      </Modal>

      <h3 className="section-mini">{t('settings.sample')}</h3>
      <div className="row-wrap">
        {sampleLoaded ? (
          <Button icon={Trash2} onClick={() => void removeSample().then(() => toast(t('home.sampleRemoved'), { tone: 'success' })).catch((e) => reportError(e, 'sample-remove'))}>
            {t('home.removeSample')}
          </Button>
        ) : (
          <Button icon={FlaskConical} onClick={() => void loadSample().then(() => toast(t('settings.sampleLoaded'), { tone: 'success' })).catch((e) => reportError(e, 'sample'))}>
            {t('onboarding.trySample')}
          </Button>
        )}
      </div>

      <h3 className="section-mini danger-text">{t('settings.danger')}</h3>
      <p className="field-hint">{t('settings.deleteAllHint')}</p>
      <Button
        variant="danger"
        icon={Trash2}
        onClick={async () => {
          const word = t('settings.deleteWord');
          const ok = await confirm({ title: t('settings.deleteAllTitle'), message: t('settings.deleteAllText'), confirmLabel: t('settings.deleteAll'), danger: true, typeToConfirm: word });
          if (!ok) return;
          try {
            await deleteAllData();
            toast(t('settings.deletedAll'), { tone: 'success' });
          } catch (e) {
            reportError(e, 'delete-all');
          }
        }}
      >
        {t('settings.deleteAll')}
      </Button>
    </Section>
  );
}

/* ------------------------------ Klavye ------------------------------ */

function KeyboardSection() {
  const { t } = useI18n();
  const { settings, updateSettings, toast } = useApp();
  const [capturing, setCapturing] = useState<string | null>(null);
  const remappable = ['showAnswer', 'rateAgain', 'rateHard', 'rateGood', 'rateEasy', 'nextParagraph', 'prevParagraph', 'highlight', 'addNote', 'createCard', 'focusMode'];

  useEffect(() => {
    if (!capturing) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) return;
      const clash = Object.entries(settings.shortcuts).find(([k, v]) => k !== capturing && v.toUpperCase() === combo.toUpperCase());
      if (clash) {
        toast(t('settings.shortcutClash', { key: combo, action: t(`shortcuts.${clash[0]}`) }), { tone: 'error' });
        return;
      }
      void updateSettings({ shortcuts: { ...settings.shortcuts, [capturing]: combo } });
      setCapturing(null);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [capturing, settings.shortcuts, updateSettings, toast, t]);

  return (
    <Section id="keyboard">
      <p className="muted">{t('settings.keyboardIntro')}</p>
      <table className="shortcut-table">
        <thead>
          <tr>
            <th scope="col">{t('settings.action')}</th>
            <th scope="col">{t('settings.key')}</th>
            <th scope="col">
              <span className="sr-only">{t('common.edit')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(DEFAULT_SHORTCUTS).map((k) => (
            <tr key={k}>
              <th scope="row">{t(`shortcuts.${k}`)}</th>
              <td>
                <Kbd>{capturing === k ? t('settings.pressKey') : settings.shortcuts[k]}</Kbd>
              </td>
              <td>
                {remappable.includes(k) && (
                  <Button size="sm" variant="ghost" icon={Keyboard} onClick={() => setCapturing(capturing === k ? null : k)} aria-pressed={capturing === k}>
                    {capturing === k ? t('common.cancel') : t('settings.change')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" onClick={() => void updateSettings({ shortcuts: { ...DEFAULT_SHORTCUTS } })}>
        {t('settings.resetShortcuts')}
      </Button>
    </Section>
  );
}

/* ------------------------------ Dil ------------------------------ */

function LanguageSection() {
  const { t } = useI18n();
  const { settings, updateSettings } = useApp();
  return (
    <Section id="language">
      <SelectField
        label={t('settings.language')}
        hint={t('settings.languageHint')}
        value={settings.language}
        onChange={(e) => void updateSettings({ language: e.target.value as 'tr' | 'en' })}
        options={[
          { value: 'tr', label: 'Türkçe' },
          { value: 'en', label: 'English' },
        ]}
      />
    </Section>
  );
}

/* ------------------------------ Hakkında + güncelleme ------------------------------ */

function About() {
  const { t, formatDate } = useI18n();
  const { reportError, toast } = useApp();
  const [state, setState] = useState<'idle' | 'checking' | 'downloading'>('idle');
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState(0);
  const desktop = isTauri();
  const native = canSelfUpdate();
  const android = native && !desktop;

  const check = async () => {
    setState('checking');
    setResult(null);
    try {
      if (native) {
        setResult(await checkForUpdate());
      } else {
        const r = await checkWebUpdate();
        toast(r === 'checked' ? t('update.webChecked') : t('update.webUnsupported'));
      }
    } catch (e) {
      reportError(e, 'update-check');
    } finally {
      setState('idle');
    }
  };

  const install = async () => {
    if (!result || result.status !== 'available') return;
    setState('downloading');
    setProgress(0);
    try {
      await downloadAndInstall(result.latest, setProgress);
      if (android) setState('idle');
    } catch (e) {
      if (isAppError(e) && e.details === 'needs-permission') toast(t('update.androidPermission'), { tone: 'info' });
      else reportError(e, 'update-install');
      setState('idle');
    }
  };

  return (
    <Section id="about">
      <dl className="stat-dl">
        <div>
          <dt>{t('about.version')}</dt>
          <dd>{__APP_VERSION__}</dd>
        </div>
        <div>
          <dt>{t('about.platform')}</dt>
          <dd>{desktop ? t('about.desktop') : android ? t('about.android') : t('about.web')}</dd>
        </div>
        <div>
          <dt>{t('about.license')}</dt>
          <dd>MPL-2.0</dd>
        </div>
        <div>
          <dt>{t('about.developer')}</dt>
          <dd>Hasan Güler</dd>
        </div>
        <div>
          <dt>{t('about.family')}</dt>
          <dd>{t('about.familyValue')}</dd>
        </div>
      </dl>
      <p className="about-repo">
        {t('about.source')}: <code>github.com/Eirahoutmoss/NexLearn</code>
      </p>
      <p className="field-hint">© {new Date().getFullYear()} Hasan Güler · {t('about.rights')}</p>
      <p>{t('about.mission')}</p>
      <div className="row-wrap">
        <Button variant="primary" icon={RefreshCw} loading={state === 'checking'} onClick={() => void check()} disabled={state === 'downloading'}>
          {t('update.check')}
        </Button>
      </div>
      <p className="field-hint">{desktop ? t('update.desktopHint') : android ? t('update.androidHint') : t('update.webHint')}</p>
      {result?.status === 'up-to-date' && (
        <p className="inline-notice" role="status">
          {t('update.upToDate', { version: result.current })}
        </p>
      )}
      {result?.status === 'available' && (
        <div className="update-box" role="status">
          <p>
            <strong>{t('update.available', { version: result.latest.version })}</strong>
            {result.latest.publishedAt && ` · ${formatDate(result.latest.publishedAt)}`}
          </p>
          {result.latest.notes && <pre className="release-notes">{result.latest.notes}</pre>}
          {(android ? result.latest.apk : result.latest.installer) && result.latest.checksums ? (
            <>
              {state === 'downloading' && <ProgressBar value={progress * 100} label={t('update.downloading')} showValue />}
              <Button variant="primary" icon={Download} loading={state === 'downloading'} onClick={() => void install()}>
                {t('update.install')}
              </Button>
              <p className="field-hint">{t('update.verifyNote')}</p>
            </>
          ) : (
            <p className="field-hint">{t('update.noInstaller', { url: RELEASES_PAGE })}</p>
          )}
        </div>
      )}
      <details>
        <summary>{t('about.thirdParty')}</summary>
        <ul className="third-party">
          {[
            ['React', 'MIT'],
            ['pdf.js (pdfjs-dist)', 'Apache-2.0'],
            ['idb', 'ISC'],
            ['fflate', 'MIT'],
            ['Lucide', 'ISC'],
            ['Inter, Literata, Atkinson Hyperlegible, OpenDyslexic (Fontsource)', 'SIL OFL 1.1'],
            ['Workbox (vite-plugin-pwa)', 'MIT'],
            ['Tauri', 'Apache-2.0 / MIT'],
          ].map(([n, l]) => (
            <li key={n}>
              {n} — {l}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

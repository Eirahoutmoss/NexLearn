import { BookOpen, Brain, Share2, Target, ArrowRight, Upload, StickyNote, Sparkles, X, CheckCircle2, Circle, FlaskConical } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { navigate, routes } from '../../app/router';
import { Landscape } from '../../components/Brand';
import { Button, Ring, ProgressBar, Card } from '../../components/ui';
import { SourceCover } from '../../components/SourceCover';
import { listSources } from '../../services/sources';
import { getAllReadingStates, listSessions, progressPercent } from '../../services/reading';
import { getDueQueue, getNextDue, listReviewEvents } from '../../services/memory';
import { listConcepts, listTasks } from '../../services/learn';
import { listAllAnnotations } from '../../services/annotations';
import { todayProgress } from '../../services/progress';
import { loadSample, removeSample } from '../../sample/sample';

function greetingKey(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'home.greetNight';
  if (h < 12) return 'home.greetMorning';
  if (h < 18) return 'home.greetDay';
  return 'home.greetEvening';
}

async function loadHome() {
  const now = new Date();
  const [sources, states, due, nextDue, events, sessions, annotations, tasks, concepts] = await Promise.all([
    listSources(),
    getAllReadingStates(),
    getDueQueue(now),
    getNextDue(now),
    listReviewEvents(),
    listSessions(),
    listAllAnnotations(),
    listTasks(),
    listConcepts(),
  ]);
  const stateBy = new Map(states.map((s) => [s.sourceId, s]));
  const recent = [...sources]
    .sort((a, b) => (stateBy.get(b.id)?.updatedAt ?? b.createdAt).localeCompare(stateBy.get(a.id)?.updatedAt ?? a.createdAt))
    .slice(0, 5);
  const lastRead = states
    .filter((s) => sources.some((x) => x.id === s.sourceId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    sources,
    recent,
    stateBy,
    lastRead: lastRead ? sources.find((s) => s.id === lastRead.sourceId) : undefined,
    dueCount: due.length,
    nextDue,
    today: todayProgress(now, events, sessions, annotations, tasks),
    concepts: concepts.length,
    tasks: tasks.length,
    hasSample: sources.some((s) => s.isSample),
  };
}

export function HomePage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { settings, updateSettings, toast, reportError } = useApp();
  const { openImport } = useDialogs();
  const { data } = useQuery(loadHome, [], ['sources', 'readingStates', 'items', 'reviewStates', 'reviewEvents', 'sessions', 'annotations', 'tasks', 'concepts']);
  const now = new Date();
  const quotes = [t('quotes.q1'), t('quotes.q2'), t('quotes.q3'), t('quotes.q4'), t('quotes.q5')];
  const quote = quotes[Math.floor(now.getTime() / 86_400_000) % quotes.length];

  const reviewedToday = data?.today.reviews ?? 0;
  const dueTotal = reviewedToday + (data?.dueCount ?? 0);
  const goals = settings.dailyGoals;

  const startSample = async () => {
    try {
      const id = await loadSample();
      navigate(routes.read(id));
    } catch (e) {
      reportError(e, 'sample');
    }
  };

  return (
    <div className="page page-home">
      <h1 className="sr-only">{t('nav.home')}</h1>
      <section className="hero" aria-labelledby="hero-title">
        <Landscape />
        <div className="hero-content">
          <p className="hero-greeting" id="hero-title">
            {t(greetingKey(now))}
          </p>
          <p className="hero-sub">{t('home.subtitle')}</p>
        </div>
        {settings.showQuotes && (
          <figure className="hero-quote">
            <blockquote>“{quote}”</blockquote>
            <button
              type="button"
              className="hero-quote-close"
              aria-label={t('home.hideQuotes')}
              title={t('home.hideQuotes')}
              onClick={() => {
                void updateSettings({ showQuotes: false });
                toast(t('home.quotesHidden'));
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </figure>
        )}
      </section>

      {data?.hasSample && (
        <div className="inline-notice sample-notice" role="note">
          <FlaskConical size={18} aria-hidden="true" />
          <p>{t('home.sampleMode')}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void removeSample()
                .then(() => toast(t('home.sampleRemoved'), { tone: 'success' }))
                .catch((e) => reportError(e, 'sample-remove'))
            }
          >
            {t('home.removeSample')}
          </Button>
        </div>
      )}

      <div className="home-grid">
        <div className="home-main">
          <nav className="action-cards" aria-label={t('home.quickActions')}>
            <button type="button" className="action-card mod-read" onClick={() => (data?.lastRead ? navigate(routes.read(data.lastRead.id)) : navigate(routes.library()))}>
              <BookOpen size={30} aria-hidden="true" />
              <span className="action-title">{t('home.read')}</span>
              <span className="action-sub">{data?.lastRead ? t('home.continue', { title: data.lastRead.title }) : t('home.readSub')}</span>
            </button>
            <button type="button" className="action-card mod-memory" onClick={() => navigate(routes.review())}>
              <Brain size={30} aria-hidden="true" />
              <span className="action-title">{t('home.review')}</span>
              <span className="action-sub">{data && data.dueCount > 0 ? t('home.dueCards', { count: data.dueCount }) : t('home.reviewSub')}</span>
            </button>
            <button type="button" className="action-card mod-learn" onClick={() => navigate(routes.map())}>
              <Share2 size={30} aria-hidden="true" />
              <span className="action-title">{t('home.connect')}</span>
              <span className="action-sub">{data && data.concepts > 0 ? t('home.conceptCount', { count: data.concepts }) : t('home.connectSub')}</span>
            </button>
            <button type="button" className="action-card mod-apply" onClick={() => navigate(routes.tasks())}>
              <Target size={30} aria-hidden="true" />
              <span className="action-title">{t('home.apply')}</span>
              <span className="action-sub">{data && data.tasks > 0 ? t('home.taskCount', { count: data.tasks }) : t('home.applySub')}</span>
            </button>
          </nav>

          <section aria-labelledby="recent-title" className="section">
            <div className="section-head">
              <h2 id="recent-title">{t('home.recent')}</h2>
              {data && data.sources.length > 0 && (
                <a href={`#${routes.library()}`} className="link-arrow">
                  {t('home.seeAll')} <ArrowRight size={16} aria-hidden="true" />
                </a>
              )}
            </div>
            {data && data.sources.length === 0 ? (
              <Card className="welcome">
                <h3>{t('home.emptyTitle')}</h3>
                <p>{t('home.emptyText')}</p>
                <div className="row-wrap">
                  <Button variant="primary" icon={Upload} onClick={() => openImport('file')}>
                    {t('home.addSource')}
                  </Button>
                  <Button icon={StickyNote} onClick={() => openImport('note')}>
                    {t('home.writeNote')}
                  </Button>
                  <Button variant="ghost" icon={Sparkles} onClick={() => void startSample()}>
                    {t('onboarding.trySample')}
                  </Button>
                </div>
              </Card>
            ) : (
              <ul className="recent-grid">
                {data?.recent.map((s) => {
                  const pct = progressPercent(data.stateBy.get(s.id), s.segmentCount);
                  return (
                    <li key={s.id}>
                      <a href={`#${routes.read(s.id)}`} className="recent-card">
                        <SourceCover source={s} />
                        <span className="recent-title">{s.title}</span>
                        <span className="recent-meta">
                          {t(`sourceType.${s.sourceType}`)}
                          {s.pageCount ? ` · ${t('common.pagesN', { n: s.pageCount })}` : ''}
                        </span>
                        {s.sourceType !== 'image' && <ProgressBar value={pct} label={t('library.progressOf', { title: s.title })} showValue />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="home-side" aria-label={t('home.today')}>
          <Card className="today-card">
            <h2 className="card-title">{t('home.today')}</h2>
            <p className="card-sub">{t('home.todaySub')}</p>
            <div className="today-ring">
              <Ring value={reviewedToday} max={Math.max(dueTotal, 1)} label={t('home.ringLabel', { done: reviewedToday, total: dueTotal })}>
                <span className="ring-big">
                  {formatNumber(reviewedToday)} / {formatNumber(dueTotal)}
                </span>
                <span className="ring-small">{t('home.cardsDone')}</span>
              </Ring>
            </div>
            {data && data.dueCount > 0 ? (
              <Button variant="primary" className="btn-block" onClick={() => navigate(routes.review())}>
                {t('home.startReview')}
              </Button>
            ) : (
              <p className="muted center">
                {data?.nextDue ? t('home.nextDue', { date: formatDate(data.nextDue, { weekday: 'long', day: 'numeric', month: 'long' }) }) : t('home.noCardsYet')}
              </p>
            )}
          </Card>
          {goals.enabled ? (
            <Card className="goals-card">
              <h2 className="card-title">{t('home.goals')}</h2>
              <ul className="goal-list">
                {[
                  { key: 'reviewCards', target: goals.reviewCards, done: data?.today.reviews ?? 0 },
                  { key: 'readingMinutes', target: goals.readingMinutes, done: data?.today.readingMinutes ?? 0 },
                  { key: 'notes', target: goals.notes, done: data?.today.notes ?? 0 },
                  { key: 'tasks', target: goals.tasks, done: data?.today.taskAttempts ?? 0 },
                ]
                  .filter((g) => g.target > 0)
                  .map((g) => {
                    const ok = g.done >= g.target;
                    return (
                      <li key={g.key} className={ok ? 'goal-done' : ''}>
                        {ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                        <span>{t(`home.goal.${g.key}`, { count: g.target })}</span>
                        <span className="goal-count">
                          {formatNumber(Math.min(g.done, g.target))}/{formatNumber(g.target)}
                          <span className="sr-only">{ok ? t('home.goalDone') : ''}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
              <p className="field-hint">{t('home.goalsNote')}</p>
            </Card>
          ) : (
            <a href={`#${routes.settings('home')}`} className="subtle-link">
              {t('home.setGoals')}
            </a>
          )}
        </aside>
      </div>
    </div>
  );
}

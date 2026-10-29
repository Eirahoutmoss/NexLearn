import { useMemo, useState } from 'react';
import { Download, Info, ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { routes } from '../../app/router';
import { Button, Card, Spinner, Tabs, TabPanel } from '../../components/ui';
import { BarChart } from '../../components/BarChart';
import { listSources } from '../../services/sources';
import { getAllReadingStates, listSessions, progressPercent } from '../../services/reading';
import { listCards, listReviewEvents, listReviewStates } from '../../services/memory';
import { listConcepts, listRelations, listTasks } from '../../services/learn';
import { listAllAnnotations } from '../../services/annotations';
import { countByDay, hardCards, lastNDays, readingMinutesByDay, recallBreakdown, summarize, totalReadingMinutes, type Rate } from '../../services/progress';
import { downloadText } from '../../services/export/download';
import { calibration } from '../../domain/learning';

async function loadProgress() {
  const [sources, states, sessions, items, reviewStates, events, concepts, relations, tasks, annotations] = await Promise.all([
    listSources(),
    getAllReadingStates(),
    listSessions(),
    listCards(),
    listReviewStates(),
    listReviewEvents(),
    listConcepts(),
    listRelations(),
    listTasks(),
    listAllAnnotations(),
  ]);
  return { sources, states, sessions, items, reviewStates, events, concepts, relations, tasks, annotations };
}

export default function ProgressPage() {
  const { t, formatNumber, formatDate, lang } = useI18n();
  const { toast } = useApp();
  const [tab, setTab] = useState('overview');
  const { data } = useQuery(loadProgress, [], ['sources', 'readingStates', 'sessions', 'items', 'reviewStates', 'reviewEvents', 'concepts', 'relations', 'tasks', 'annotations']);

  const days = useMemo(() => lastNDays(14), []);
  const dayLabels = days.map((d) => formatDate(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'numeric' }));
  const dayFull = days.map((d) => formatDate(new Date(`${d}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' }));

  const derived = useMemo(() => {
    if (!data) return null;
    const summary = summarize({ sources: data.sources.length, items: data.items, concepts: data.concepts, relations: data.relations, annotations: data.annotations, tasks: data.tasks, events: data.events });
    const recall = recallBreakdown(data.events, data.items);
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      summary,
      recall,
      readingWeek: totalReadingMinutes(data.sessions, weekAgo),
      readingAll: totalReadingMinutes(data.sessions),
      readingByDay: readingMinutesByDay(data.sessions, days),
      reviewsByDay: countByDay(data.events, (e) => e.reviewedAt, days),
      conceptsByDay: countByDay(data.concepts, (c) => c.createdAt, days),
      notesByDay: countByDay(data.annotations.filter((a) => a.annotationType === 'note' || a.annotationType === 'explanation'), (a) => a.createdAt, days),
      attemptsByDay: countByDay(data.tasks.flatMap((x) => x.attempts), (a) => a.at, days),
      hard: hardCards(data.items, data.reviewStates).slice(0, 10),
      calib: calibration(data.events),
      practice: data.sessions.filter((x) => x.sessionType === 'practice').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10),
      itemById: new Map(data.items.map((i) => [i.id, i])),
      stateBy: new Map(data.states.map((s) => [s.sourceId, s])),
    };
  }, [data, days]);

  if (!data || !derived) return <Spinner label={t('common.loading')} />;
  const { summary, recall } = derived;
  const pct = (r: Rate) => (r.percent == null ? '—' : `%${r.percent}`);

  const exportReport = () => {
    const lines = [
      `# ${t('progress.reportTitle')}`,
      '',
      `_${t('progress.generated')}: ${formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}_`,
      '',
      `## ${t('progress.tabReading')}`,
      `- ${t('progress.readingWeek')}: ${derived.readingWeek} ${t('progress.minutes')}`,
      `- ${t('progress.readingAll')}: ${derived.readingAll} ${t('progress.minutes')}`,
      '',
      `## ${t('progress.tabReview')}`,
      `- ${t('progress.reviews')}: ${summary.reviews}`,
      `- ${t('progress.immediate')}: ${pct(recall.immediate)} (${recall.immediate.attempts})`,
      `- ${t('progress.oneDay')}: ${pct(recall.oneDay)} (${recall.oneDay.attempts})`,
      `- ${t('progress.oneWeek')}: ${pct(recall.oneWeek)} (${recall.oneWeek.attempts})`,
      '',
      `## ${t('progress.tabConcepts')}`,
      `- ${t('progress.confirmedConcepts')}: ${summary.confirmedConcepts}`,
      `- ${t('progress.confirmedRelations')}: ${summary.confirmedRelations}`,
      `- ${t('progress.explanations')}: ${summary.explanations}`,
      '',
      `## ${t('progress.tabApply')}`,
      `- ${t('progress.taskAttempts')}: ${summary.taskAttempts}`,
      `- ${t('progress.tasksDone')}: ${summary.tasksDone}`,
      '',
      `> ${t('progress.honest')}`,
      '',
    ];
    downloadText(lines.join('\n'), `nexlearn-ogrenme-raporu-${days[days.length - 1]}.md`, 'text/markdown');
    toast(t('progress.reportSaved'), { tone: 'success' });
  };

  const fmt1 = (v: number) => formatNumber(v, { maximumFractionDigits: 1 });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('progress.title')}</h1>
          <p className="page-sub">{t('progress.subtitle')}</p>
        </div>
        <Button icon={Download} onClick={exportReport}>
          {t('progress.exportReport')}
        </Button>
      </header>
      <p className="inline-notice">
        <Info size={18} aria-hidden="true" /> <span>{t('progress.honest')}</span>
      </p>
      <Tabs
        idPrefix="pg"
        label={t('progress.title')}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: t('progress.tabOverview') },
          { id: 'reading', label: t('progress.tabReading') },
          { id: 'review', label: t('progress.tabReview') },
          { id: 'concepts', label: t('progress.tabConcepts') },
          { id: 'apply', label: t('progress.tabApply') },
        ]}
      />
      <TabPanel idPrefix="pg" id={tab} className="stack">
        {tab === 'overview' && (
          <>
            <ul className="stat-grid" aria-label={t('progress.summary')}>
              <Stat label={t('progress.sources')} value={formatNumber(summary.sources)} />
              <Stat label={t('progress.readingWeek')} value={`${formatNumber(derived.readingWeek)} ${t('progress.minShort')}`} />
              <Stat label={t('progress.cards')} value={formatNumber(summary.cards)} />
              <Stat label={t('progress.immediate')} value={pct(recall.immediate)} sub={t('progress.attemptsN', { n: recall.immediate.attempts })} />
              <Stat label={t('progress.oneDay')} value={pct(recall.oneDay)} sub={t('progress.attemptsN', { n: recall.oneDay.attempts })} />
              <Stat label={t('progress.oneWeek')} value={pct(recall.oneWeek)} sub={t('progress.attemptsN', { n: recall.oneWeek.attempts })} />
              <Stat label={t('progress.confirmedConcepts')} value={formatNumber(summary.confirmedConcepts)} />
              <Stat label={t('progress.explanations')} value={formatNumber(summary.explanations)} />
              <Stat label={t('progress.taskAttempts')} value={formatNumber(summary.taskAttempts)} />
            </ul>
            <div className="chart-grid-3">
              <BarChart title={t('progress.chartReading')} values={derived.readingByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-read)" unit={t('progress.minShort')} format={fmt1} />
              <BarChart title={t('progress.chartReviews')} values={derived.reviewsByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-memory)" unit={t('progress.reviewsUnit')} />
              <BarChart title={t('progress.chartConcepts')} values={derived.conceptsByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-learn)" unit={t('progress.conceptsUnit')} />
            </div>
          </>
        )}
        {tab === 'reading' && (
          <>
            <ul className="stat-grid">
              <Stat label={t('progress.readingWeek')} value={`${formatNumber(derived.readingWeek)} ${t('progress.minShort')}`} />
              <Stat label={t('progress.readingAll')} value={`${formatNumber(derived.readingAll)} ${t('progress.minShort')}`} />
              <Stat label={t('progress.sessions')} value={formatNumber(data.sessions.filter((s) => s.sessionType === 'reading').length)} />
            </ul>
            <BarChart title={t('progress.chartReading')} values={derived.readingByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-read)" unit={t('progress.minShort')} format={fmt1} />
            <Card>
              <h2 className="card-title">{t('progress.perSource')}</h2>
              <ul className="list">
                {data.sources
                  .filter((s) => s.sourceType !== 'image')
                  .map((s) => (
                    <li key={s.id} className="list-row">
                      <a href={`#${routes.read(s.id)}`} className="list-title">
                        {s.title}
                      </a>
                      <span className="muted">%{progressPercent(derived.stateBy.get(s.id), s.segmentCount)}</span>
                    </li>
                  ))}
              </ul>
              <p className="field-hint">{t('progress.readingNote')}</p>
            </Card>
          </>
        )}
        {tab === 'review' && (
          <>
            <ul className="stat-grid">
              <Stat label={t('progress.reviews')} value={formatNumber(summary.reviews)} />
              <Stat label={t('progress.immediate')} value={pct(recall.immediate)} sub={t('progress.immediateHint')} />
              <Stat label={t('progress.oneDay')} value={pct(recall.oneDay)} sub={t('progress.oneDayHint')} />
              <Stat label={t('progress.oneWeek')} value={pct(recall.oneWeek)} sub={t('progress.oneWeekHint')} />
            </ul>
            <BarChart title={t('progress.chartReviews')} values={derived.reviewsByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-memory)" unit={t('progress.reviewsUnit')} />
            <Card>
              <h2 className="card-title">{t('progress.calibTitle')}</h2>
              {derived.calib.answered === 0 ? (
                <p className="muted">{t('progress.calibEmpty')}</p>
              ) : (
                <>
                  <table className="shortcut-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('progress.calibConfidence')}</th>
                        <th scope="col">{t('progress.calibAttempts')}</th>
                        <th scope="col">{t('progress.calibCorrect')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derived.calib.rows.map((r) => (
                        <tr key={r.confidence}>
                          <th scope="row">{t(`review.confidence.${r.confidence}`)}</th>
                          <td>{formatNumber(r.attempts)}</td>
                          <td>{r.percent == null ? '—' : `%${r.percent}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="field-hint">{t('progress.calibNote', { under: derived.calib.underconfident })}</p>
                  {derived.calib.confidentlyWrong.length > 0 && (
                    <>
                      <h3 className="section-mini">{t('progress.confidentlyWrong')}</h3>
                      <ul className="list">
                        {derived.calib.confidentlyWrong.slice(0, 10).map((id) => {
                          const it = derived.itemById.get(id);
                          if (!it) return null;
                          return (
                            <li key={id} className="list-row">
                              <p className="list-title">{it.prompt}</p>
                              {it.sourceRefs[0] && (
                                <a className="link-inline" href={`#${routes.read(it.sourceRefs[0].sourceId, it.sourceRefs[0].segmentId)}`}>
                                  <ExternalLink size={14} aria-hidden="true" /> {t('progress.restudy')}
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </>
              )}
            </Card>
            <Card>
              <h2 className="card-title">{t('progress.practiceTitle')}</h2>
              {derived.practice.length === 0 ? (
                <p className="muted">{t('progress.practiceEmpty')}</p>
              ) : (
                <ul className="list">
                  {derived.practice.map((p) => (
                    <li key={p.id} className="list-row">
                      <span>{formatDate(p.startedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="muted">
                        {t('progress.practiceRow', { score: p.activitySummary.score ?? 0, total: p.activitySummary.total ?? 0, knew: p.activitySummary.knew ?? 0 })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="field-hint">{t('progress.practiceNote')}</p>
            </Card>
            <Card>
              <h2 className="card-title">{t('progress.hardCards')}</h2>
              {derived.hard.length === 0 ? (
                <p className="muted">{t('progress.noHard')}</p>
              ) : (
                <ul className="list">
                  {derived.hard.map(({ item, state }) => (
                    <li key={item.id} className="list-row">
                      <div>
                        <p className="list-title">{item.prompt}</p>
                        <p className="list-meta">{t('progress.hardMeta', { lapses: state.lapseCount, ease: state.easeFactor.toFixed(2) })}</p>
                      </div>
                      {item.sourceRefs[0] && (
                        <a className="link-inline" href={`#${routes.read(item.sourceRefs[0].sourceId, item.sourceRefs[0].segmentId)}`}>
                          <ExternalLink size={14} aria-hidden="true" /> {t('progress.restudy')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
        {tab === 'concepts' && (
          <>
            <ul className="stat-grid">
              <Stat label={t('progress.concepts')} value={formatNumber(summary.concepts)} />
              <Stat label={t('progress.confirmedConcepts')} value={formatNumber(summary.confirmedConcepts)} />
              <Stat label={t('progress.confirmedRelations')} value={formatNumber(summary.confirmedRelations)} />
              <Stat label={t('progress.explanations')} value={formatNumber(summary.explanations)} />
            </ul>
            <div className="chart-grid-2">
              <BarChart title={t('progress.chartConcepts')} values={derived.conceptsByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-learn)" unit={t('progress.conceptsUnit')} />
              <BarChart title={t('progress.chartNotes')} values={derived.notesByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-learn)" unit={t('progress.notesUnit')} />
            </div>
          </>
        )}
        {tab === 'apply' && (
          <>
            <ul className="stat-grid">
              <Stat label={t('progress.tasks')} value={formatNumber(data.tasks.length)} />
              <Stat label={t('progress.taskAttempts')} value={formatNumber(summary.taskAttempts)} />
              <Stat label={t('progress.tasksDone')} value={formatNumber(summary.tasksDone)} />
            </ul>
            <BarChart title={t('progress.chartAttempts')} values={derived.attemptsByDay} labels={dayLabels} fullLabels={dayFull} color="var(--mod-apply)" unit={t('progress.attemptsUnit')} />
            <p className="field-hint">{t('progress.applyNote')}</p>
          </>
        )}
      </TabPanel>
      <span hidden>{lang}</span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <li className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </li>
  );
}

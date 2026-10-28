import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Plus, Pencil, Pause, Play, Trash2, History, Search, Undo2, ExternalLink, CheckCircle2, Link2Off, PartyPopper } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { navigate, routes } from '../../app/router';
import { useShortcuts } from '../../app/shortcuts';
import { Badge, Button, Card, EmptyState, IconButton, ProgressBar, SelectField, Spinner, Tabs, TabPanel } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { getDueQueue, getNextDue, listCards, listReviewEvents, listReviewStates, purgeCard, recordReview, restoreCard, setSuspended, trashCard, type QueueEntry } from '../../services/memory';
import { listDeleted } from '../../adapters/storage/repo';
import { listSources } from '../../services/sources';
import { recordSession } from '../../services/reading';
import { BUTTON_RATING, schedule, type ScheduleReason } from '../../domain/scheduler';
import { normalizeForSearch } from '../../domain/text';
import type { LearningItem, ReviewButton, ReviewState, Source } from '../../domain/types';
import { hardCards } from '../../services/progress';

const BUTTONS: ReviewButton[] = ['again', 'hard', 'good', 'easy'];

export default function ReviewPage({ tab, cardId }: { tab: string; cardId?: string }) {
  const { t } = useI18n();
  const { openCardEditor } = useDialogs();
  const current = ['today', 'cards', 'history'].includes(tab) ? tab : 'today';
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('review.title')}</h1>
          <p className="page-sub">{t('review.subtitle')}</p>
        </div>
        <Button icon={Plus} onClick={() => openCardEditor({})}>
          {t('review.newCard')}
        </Button>
      </header>
      <Tabs
        idPrefix="rv"
        label={t('review.title')}
        value={current}
        onChange={(v) => navigate(routes.review(v as 'today' | 'cards' | 'history'), { replace: true })}
        items={[
          { id: 'today', label: t('review.tabToday') },
          { id: 'cards', label: t('review.tabCards') },
          { id: 'history', label: t('review.tabHistory') },
        ]}
      />
      <TabPanel idPrefix="rv" id={current}>
        {current === 'today' && <ReviewSession />}
        {current === 'cards' && <CardList openCardId={cardId} />}
        {current === 'history' && <HistoryList />}
      </TabPanel>
    </div>
  );
}

/* ------------------------------ Tekrar oturumu ------------------------------ */

function intervalLabel(days: number, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (days < 30) return t('review.days', { n: days });
  if (days < 365) return t('review.months', { n: Math.round(days / 30) });
  return t('review.years', { n: Math.round((days / 365) * 10) / 10 });
}

function ReviewSession() {
  const { t, formatDate } = useI18n();
  const { settings, reportError } = useApp();
  const { openCardEditor } = useDialogs();
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState<ScheduleReason | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, again: 0 });
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionStart = useRef(new Date());
  const activeMs = useRef(0);
  const repeats = useRef(new Map<string, number>());
  const answerRef = useRef<HTMLDivElement>(null);
  const showBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const [q, nd, srcs] = await Promise.all([getDueQueue(), getNextDue(), listSources()]);
    setQueue(q);
    setPos(0);
    setRevealed(false);
    setNextDue(nd);
    setSources(new Map(srcs.map((s) => [s.id, s])));
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Oturum bitince/terk edilince tekrar süresi kaydedilir.
  useEffect(
    () => () => {
      if (activeMs.current > 0) void recordSession('review', sessionStart.current, new Date(), activeMs.current, [], {});
    },
    [],
  );

  const entry = queue?.[pos];

  const reveal = () => {
    setRevealed(true);
    requestAnimationFrame(() => answerRef.current?.focus());
  };

  const rate = async (button: ReviewButton) => {
    if (!entry || busy) return;
    setBusy(true);
    const elapsed = Date.now() - shownAt.current;
    activeMs.current += Math.min(elapsed, 120_000);
    try {
      const res = await recordReview(entry.item.id, button, {
        responseDurationMs: elapsed,
        answerText: settings.storeTypedAnswers ? typed : undefined,
      });
      setReason(res.reason);
      setStats((s) => ({ reviewed: s.reviewed + 1, again: s.again + (button === 'again' ? 1 : 0) }));
      let nextQueue = queue!;
      // Unutulan kart oturum sonunda yeniden sorulur (en fazla 2 kez).
      const n = repeats.current.get(entry.item.id) ?? 0;
      if (button === 'again' && n < 2) {
        repeats.current.set(entry.item.id, n + 1);
        nextQueue = [...queue!, { item: entry.item, state: res.state }];
        setQueue(nextQueue);
      }
      setPos((p) => p + 1);
      setRevealed(false);
      setTyped('');
      shownAt.current = Date.now();
      requestAnimationFrame(() => showBtnRef.current?.focus());
      if (pos + 1 >= nextQueue.length) setNextDue(await getNextDue());
    } catch (e) {
      reportError(e, 'review');
    } finally {
      setBusy(false);
    }
  };

  const sc = settings.shortcuts;
  useShortcuts(
    {
      [sc.showAnswer]: () => (revealed ? undefined : reveal()),
      [sc.rateAgain]: () => revealed && void rate('again'),
      [sc.rateHard]: () => revealed && void rate('hard'),
      [sc.rateGood]: () => revealed && void rate('good'),
      [sc.rateEasy]: () => revealed && void rate('easy'),
    },
    Boolean(entry),
  );

  const previews = useMemo(() => {
    if (!entry) return null;
    const now = new Date();
    return Object.fromEntries(BUTTONS.map((b) => [b, schedule(entry.state, BUTTON_RATING[b], now).intervalDays])) as Record<ReviewButton, number>;
  }, [entry]);

  if (!queue) return <Spinner label={t('common.loading')} />;

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t('review.noneTitle')}
        text={nextDue ? t('review.nextDue', { date: formatDate(nextDue, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }) : t('review.noneText')}
        action={
          <Button icon={Plus} onClick={() => openCardEditor({})}>
            {t('review.newCard')}
          </Button>
        }
      />
    );
  }

  if (!entry) {
    return (
      <Card className="review-done">
        <PartyPopper size={32} aria-hidden="true" />
        <h2>{t('review.doneTitle')}</h2>
        {reason && (
          <p className="review-reason" role="status">
            {t(`review.reason.${reason.key}`, { days: intervalLabel(reason.days, t), count: 'count' in reason ? reason.count : 0 })}
          </p>
        )}
        <p>{t('review.doneText', { n: stats.reviewed, again: stats.again })}</p>
        {nextDue && <p className="muted">{t('review.nextDue', { date: formatDate(nextDue, { weekday: 'long', day: 'numeric', month: 'long' }) })}</p>}
        <p className="field-hint">{t('review.honestNote')}</p>
        <div className="row-wrap center">
          <Button onClick={() => navigate(routes.home())}>{t('nav.home')}</Button>
          <Button variant="ghost" onClick={() => navigate(routes.progress())}>
            {t('nav.progress')}
          </Button>
        </div>
      </Card>
    );
  }

  const ref = entry.item.sourceRefs[0];
  const src = ref ? sources.get(ref.sourceId) : undefined;
  const total = queue.length;

  return (
    <div className="review">
      <div className="review-top">
        <span className="review-count" aria-live="polite">
          {t('review.position', { n: pos + 1, total })}
        </span>
        <ProgressBar value={(pos / total) * 100} label={t('review.sessionProgress')} />
      </div>
      <Card className="flashcard" aria-labelledby="fc-prompt">
        <p className="flashcard-kind">{entry.item.itemType === 'question' ? t('cardEditor.typeQuestion') : t('cardEditor.typeQa')}</p>
        <h2 id="fc-prompt" className="flashcard-prompt">
          {entry.item.prompt}
        </h2>
        {!revealed ? (
          <>
            <label className="sr-only" htmlFor="typed-answer">
              {t('review.typeAnswer')}
            </label>
            <textarea
              id="typed-answer"
              className="input textarea flashcard-input"
              rows={2}
              placeholder={t('review.typeAnswer')}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  reveal();
                }
              }}
            />
            <p className="field-hint">{settings.storeTypedAnswers ? t('review.typedStored') : t('review.typedNotStored')}</p>
            <Button ref={showBtnRef} variant="soft" size="lg" onClick={reveal} className="flashcard-show" aria-keyshortcuts={sc.showAnswer === 'Space' ? 'Space' : sc.showAnswer}>
              {t('review.showAnswer')}
            </Button>
          </>
        ) : (
          <div className="flashcard-answer" ref={answerRef} tabIndex={-1} aria-live="polite">
            {typed.trim() && (
              <p className="typed-echo">
                <span className="muted">{t('review.yourAnswer')}:</span> {typed}
              </p>
            )}
            <p className="answer-text">{entry.item.answer}</p>
            {entry.item.explanation && <p className="answer-expl">{entry.item.explanation}</p>}
            {ref && (
              <p className="answer-source">
                {src && !src.deletedAt ? (
                  <a href={`#${routes.read(ref.sourceId, ref.segmentId)}`}>
                    <ExternalLink size={14} aria-hidden="true" /> {src.title}
                    {ref.pageNumber ? ` · ${t('common.pageN', { n: ref.pageNumber })}` : ''}
                  </a>
                ) : (
                  <span className="muted">
                    <Link2Off size={14} aria-hidden="true" /> {t('sourceRef.broken')}
                  </span>
                )}
              </p>
            )}
            <p className="rate-question" id="rate-q">
              {t('review.howWell')}
            </p>
            <div className="rate-buttons" role="group" aria-labelledby="rate-q">
              {BUTTONS.map((b, i) => (
                <button key={b} type="button" className={`rate-btn rate-${b}`} onClick={() => void rate(b)} disabled={busy} aria-keyshortcuts={String(i + 1)}>
                  <span className="rate-label">{t(`review.btn.${b}`)}</span>
                  <span className="rate-interval">{previews ? intervalLabel(previews[b], t) : ''}</span>
                  <kbd className="kbd">{[sc.rateAgain, sc.rateHard, sc.rateGood, sc.rateEasy][i]}</kbd>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
      <p className="review-reason" role="status" aria-live="polite">
        {reason ? t(`review.reason.${reason.key}`, { days: intervalLabel(reason.days, t), count: 'count' in reason ? reason.count : 0 }) : ''}
      </p>
    </div>
  );
}

/* ------------------------------ Kart listesi ------------------------------ */

function CardList({ openCardId }: { openCardId?: string }) {
  const { t, formatDate } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const { openCardEditor } = useDialogs();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [historyFor, setHistoryFor] = useState<LearningItem | null>(null);
  const { data } = useQuery(
    async () => {
      const [items, states, trash, sources] = await Promise.all([listCards(), listReviewStates(), listDeleted('items'), listSources()]);
      return { items, states, trash, sources: new Map(sources.map((s) => [s.id, s])) };
    },
    [],
    ['items', 'reviewStates', 'sources'],
  );

  useEffect(() => {
    if (openCardId && data) {
      const it = data.items.find((i) => i.id === openCardId);
      if (it) setHistoryFor(it);
    }
  }, [openCardId, data]);

  const now = Date.now();
  const hardSet = useMemo(() => new Set(data ? hardCards(data.items, data.states).map((h) => h.item.id) : []), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const nq = normalizeForSearch(q);
    return data.items
      .filter((i) => {
        const st = data.states.get(i.id);
        if (filter === 'due' && (i.suspended || !st || new Date(st.dueAt).getTime() > now)) return false;
        if (filter === 'suspended' && !i.suspended) return false;
        if (filter === 'hard' && !hardSet.has(i.id)) return false;
        if (filter === 'questions' && i.itemType !== 'question') return false;
        return !nq || normalizeForSearch(`${i.prompt} ${i.answer} ${i.tags.join(' ')}`).includes(nq);
      })
      .sort((a, b) => (data.states.get(a.id)?.dueAt ?? '').localeCompare(data.states.get(b.id)?.dueAt ?? ''));
  }, [data, q, filter, hardSet, now]);

  const act = async (fn: () => Promise<unknown>, msg: string, ctx: string, undo?: () => Promise<unknown>) => {
    try {
      await fn();
      toast(msg, { tone: 'success', action: undo ? { label: t('common.undo'), run: () => void undo() } : undefined });
    } catch (e) {
      reportError(e, ctx);
    }
  };

  if (!data) return <Spinner label={t('common.loading')} />;
  if (data.items.length === 0 && data.trash.length === 0) {
    return <EmptyState icon={Layers} title={t('review.noCards')} text={t('review.noCardsText')} action={<Button icon={Plus} onClick={() => openCardEditor({})}>{t('review.newCard')}</Button>} />;
  }

  return (
    <div className="stack">
      <div className="filters" role="search">
        <div className="filter-search">
          <Search size={18} aria-hidden="true" />
          <input className="input" type="search" placeholder={t('review.searchCards')} aria-label={t('review.searchCards')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <SelectField
          label={t('review.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'due', label: t('review.filterDue') },
            { value: 'hard', label: t('review.filterHard') },
            { value: 'suspended', label: t('review.filterSuspended') },
            { value: 'questions', label: t('review.filterQuestions') },
          ]}
        />
      </div>
      <p className="muted" aria-live="polite">
        {t('review.cardCount', { count: shown.length })}
      </p>
      <ul className="list">
        {shown.map((i) => {
          const st = data.states.get(i.id);
          const ref = i.sourceRefs[0];
          const src = ref ? data.sources.get(ref.sourceId) : undefined;
          return (
            <li key={i.id} className="list-row card-row">
              <div className="card-row-main">
                <p className="list-title">{i.prompt}</p>
                <p className="list-meta">{i.answer.length > 140 ? `${i.answer.slice(0, 140)}…` : i.answer}</p>
                <p className="list-meta">
                  {i.suspended ? <Badge>{t('review.suspended')}</Badge> : st && <span>{t('review.dueOn', { date: formatDate(st.dueAt) })}</span>}
                  {st && st.repetitionCount + st.lapseCount > 0 && <span> · {t('review.intervalInfo', { n: st.intervalDays, lapses: st.lapseCount })}</span>}
                  {hardSet.has(i.id) && (
                    <>
                      {' '}
                      <Badge tone="warning">{t('review.hard')}</Badge>
                    </>
                  )}
                  {ref && !src && (
                    <>
                      {' '}
                      <Badge tone="warning">{t('sourceRef.brokenShort')}</Badge>
                    </>
                  )}
                  {i.isSample && (
                    <>
                      {' '}
                      <Badge tone="accent">{t('common.sample')}</Badge>
                    </>
                  )}
                </p>
              </div>
              <div className="row-wrap">
                <IconButton icon={History} size="sm" label={t('review.history', { prompt: i.prompt.slice(0, 40) })} onClick={() => setHistoryFor(i)} />
                <IconButton icon={Pencil} size="sm" label={t('common.edit')} onClick={() => openCardEditor({ item: i })} />
                <IconButton
                  icon={i.suspended ? Play : Pause}
                  size="sm"
                  label={i.suspended ? t('review.resume') : t('review.suspend')}
                  onClick={() => void act(() => setSuspended(i.id, !i.suspended), i.suspended ? t('review.resumed') : t('review.suspendedMsg'), 'suspend')}
                />
                <IconButton icon={Trash2} size="sm" label={t('common.delete')} onClick={() => void act(() => trashCard(i.id), t('review.trashed'), 'card-trash', () => restoreCard(i.id))} />
              </div>
            </li>
          );
        })}
      </ul>
      {data.trash.length > 0 && (
        <details className="trash-details">
          <summary>{t('review.trash', { count: data.trash.length })}</summary>
          <ul className="list">
            {data.trash.map((i) => (
              <li key={i.id} className="list-row">
                <p className="list-title">{i.prompt}</p>
                <div className="row-wrap">
                  <Button size="sm" icon={Undo2} onClick={() => void act(() => restoreCard(i.id), t('review.restored'), 'card-restore')}>
                    {t('common.restore')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (await confirm({ title: t('review.purgeTitle'), message: t('review.purgeMessage'), danger: true, confirmLabel: t('library.purge') })) {
                        await act(() => purgeCard(i.id), t('review.purged'), 'card-purge');
                      }
                    }}
                  >
                    {t('library.purge')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <CardHistory item={historyFor} state={historyFor ? data.states.get(historyFor.id) : undefined} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function CardHistory({ item, state, onClose }: { item: LearningItem | null; state?: ReviewState; onClose: () => void }) {
  const { t, formatDate } = useI18n();
  const { data: events } = useQuery(() => (item ? listReviewEvents(item.id) : Promise.resolve([])), [item?.id], ['reviewEvents']);
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={t('review.historyTitle')} description={item?.prompt}>
      {state && (
        <dl className="stat-dl">
          <div>
            <dt>{t('review.nextReview')}</dt>
            <dd>{formatDate(state.dueAt, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>{t('review.interval')}</dt>
            <dd>{t('review.days', { n: state.intervalDays })}</dd>
          </div>
          <div>
            <dt>{t('review.ease')}</dt>
            <dd>{state.easeFactor.toFixed(2)}</dd>
          </div>
          <div>
            <dt>{t('review.lapses')}</dt>
            <dd>{state.lapseCount}</dd>
          </div>
        </dl>
      )}
      {events && events.length === 0 && <p className="muted">{t('review.noHistory')}</p>}
      <ol className="history-list">
        {events?.map((e) => (
          <li key={e.id}>
            <span>{formatDate(e.reviewedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <Badge tone={e.rating >= 3 ? 'success' : 'danger'}>{t(`review.btn.${e.button}`)}</Badge>
            <span className="muted">{t('review.intervalChange', { from: e.scheduleBefore.intervalDays, to: e.scheduleAfter.intervalDays })}</span>
          </li>
        ))}
      </ol>
      <p className="field-hint">{t('review.algorithmNote')}</p>
    </Modal>
  );
}

function HistoryList() {
  const { t, formatDate } = useI18n();
  const { data } = useQuery(
    async () => {
      const [events, items] = await Promise.all([listReviewEvents(), listCards()]);
      return { events: events.slice(-300).reverse(), items: new Map(items.map((i) => [i.id, i])) };
    },
    [],
    ['reviewEvents', 'items'],
  );
  if (!data) return <Spinner label={t('common.loading')} />;
  if (!data.events.length) return <EmptyState icon={History} title={t('review.noHistoryTitle')} text={t('review.noHistoryText')} />;
  return (
    <ul className="list">
      {data.events.map((e) => (
        <li key={e.id} className="list-row">
          <div>
            <p className="list-title">{data.items.get(e.learningItemId)?.prompt ?? t('review.deletedCard')}</p>
            <p className="list-meta">
              {formatDate(e.reviewedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t('review.intervalChange', { from: e.scheduleBefore.intervalDays, to: e.scheduleAfter.intervalDays })}
            </p>
          </div>
          <Badge tone={e.rating >= 3 ? 'success' : 'danger'}>{t(`review.btn.${e.button}`)}</Badge>
        </li>
      ))}
    </ul>
  );
}

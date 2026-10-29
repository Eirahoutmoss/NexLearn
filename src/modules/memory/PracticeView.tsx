import { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, ExternalLink, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { routes } from '../../app/router';
import { Button, Card, EmptyState, ProgressBar, SelectField, Spinner } from '../../components/ui';
import { listCards, listReviewStates } from '../../services/memory';
import { listConcepts } from '../../services/learn';
import { listSources } from '../../services/sources';
import { buildPracticeSet, savePracticeSession, summarizePractice, type PracticeGrade, type PracticeScope } from '../../services/practice';
import type { LearningItem } from '../../domain/types';

/** Sınav provası: tekrar planını değiştirmeden karışık sorularla kendini sınama. */
export function PracticeView({ initialScope }: { initialScope?: string }) {
  const { t } = useI18n();
  const { reportError } = useApp();
  const { data } = useQuery(
    async () => {
      const [items, states, concepts, sources] = await Promise.all([listCards(), listReviewStates(), listConcepts(), listSources()]);
      return { items, states, concepts, sources };
    },
    [],
    ['items', 'reviewStates', 'concepts', 'sources'],
  );
  const [scopeKey, setScopeKey] = useState(initialScope ?? 'all');
  const [count, setCount] = useState(10);
  const [set, setSet] = useState<LearningItem[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [grades, setGrades] = useState<PracticeGrade[]>([]);
  const started = useRef(new Date());
  const activeMs = useRef(0);
  const shownAt = useRef(Date.now());

  const tags = useMemo(() => [...new Set((data?.items ?? []).flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, 'tr')), [data]);

  if (!data) return <Spinner label={t('common.loading')} />;
  if (!data.items.length) return <EmptyState icon={ClipboardCheck} title={t('review.noCards')} text={t('practice.needCards')} />;

  const parseScope = (): PracticeScope => {
    const [kind, id] = scopeKey.split(':');
    if (kind === 'source') return { kind, sourceId: id };
    if (kind === 'concept') return { kind, conceptId: id };
    if (kind === 'tag') return { kind, tag: id };
    if (kind === 'hard') return { kind };
    return { kind: 'all' };
  };

  const start = () => {
    const s = buildPracticeSet(data.items, data.states, parseScope(), count);
    setSet(s);
    setPos(0);
    setGrades([]);
    setRevealed(false);
    setTyped('');
    started.current = new Date();
    activeMs.current = 0;
    shownAt.current = Date.now();
  };

  const grade = (g: PracticeGrade) => {
    if (!set) return;
    activeMs.current += Math.min(Date.now() - shownAt.current, 120_000);
    const next = [...grades, g];
    setGrades(next);
    setRevealed(false);
    setTyped('');
    shownAt.current = Date.now();
    if (pos + 1 >= set.length) {
      const sourceIds = [...new Set(set.flatMap((i) => i.sourceRefs.map((r) => r.sourceId)))];
      void savePracticeSession(started.current, activeMs.current, summarizePractice(next), sourceIds).catch((e) => reportError(e, 'practice-save'));
    }
    setPos(pos + 1);
  };

  // Kurulum ekranı
  if (!set) {
    return (
      <Card className="practice-setup">
        <h2 className="card-title">{t('practice.title')}</h2>
        <p className="muted">{t('practice.intro')}</p>
        <div className="grid-2">
          <SelectField
            label={t('practice.scope')}
            value={scopeKey}
            onChange={(e) => setScopeKey(e.target.value)}
            options={[
              { value: 'all', label: t('practice.scopeAll') },
              { value: 'hard', label: t('practice.scopeHard') },
              ...data.sources.filter((s) => data.items.some((i) => i.sourceRefs.some((r) => r.sourceId === s.id))).map((s) => ({ value: `source:${s.id}`, label: `${t('practice.source')}: ${s.title}` })),
              ...data.concepts.filter((c) => data.items.some((i) => i.conceptIds.includes(c.id))).map((c) => ({ value: `concept:${c.id}`, label: `${t('practice.concept')}: ${c.label}` })),
              ...tags.map((x) => ({ value: `tag:${x}`, label: `#${x}` })),
            ]}
          />
          <SelectField
            label={t('practice.count')}
            value={String(count)}
            onChange={(e) => setCount(Number(e.target.value))}
            options={[5, 10, 20, 30, 50].map((n) => ({ value: String(n), label: t('practice.countN', { n }) }))}
          />
        </div>
        <p className="field-hint">{t('practice.noSchedule')}</p>
        <Button variant="primary" onClick={start}>
          {t('practice.start')}
        </Button>
      </Card>
    );
  }

  if (!set.length) {
    return (
      <Card className="practice-setup">
        <p>{t('practice.emptyScope')}</p>
        <Button onClick={() => setSet(null)}>{t('practice.back')}</Button>
      </Card>
    );
  }

  // Sonuç ekranı
  if (pos >= set.length) {
    const sum = summarizePractice(grades);
    const missed = set.filter((_, i) => grades[i] !== 'knew');
    return (
      <Card className="review-done practice-done">
        <h2>{t('practice.doneTitle')}</h2>
        <p className="stat-value" aria-label={t('practice.scoreAria', { score: sum.score })}>
          %{sum.score}
        </p>
        <p>{t('practice.doneText', { knew: sum.knew, partial: sum.partial, missed: sum.missed })}</p>
        {missed.length > 0 && (
          <div className="practice-missed">
            <h3 className="section-mini">{t('practice.toRestudy')}</h3>
            <ul className="mini-list">
              {missed.map((i) => {
                const ref = i.sourceRefs[0];
                return (
                  <li key={i.id} className="mini-item">
                    <p className="mini-title">{i.prompt}</p>
                    <p className="mini-text">{i.answer}</p>
                    {ref && (
                      <a className="link-inline" href={`#${routes.read(ref.sourceId, ref.segmentId)}`}>
                        <ExternalLink size={14} aria-hidden="true" /> {t('progress.restudy')}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="field-hint">{t('practice.noSchedule')}</p>
        <div className="row-wrap center">
          <Button icon={RotateCcw} onClick={start}>
            {t('practice.again')}
          </Button>
          <Button variant="ghost" onClick={() => setSet(null)}>
            {t('practice.back')}
          </Button>
        </div>
      </Card>
    );
  }

  const item = set[pos];
  return (
    <div className="review">
      <div className="review-top">
        <span className="review-count" aria-live="polite">
          {t('review.position', { n: pos + 1, total: set.length })}
        </span>
        <ProgressBar value={(pos / set.length) * 100} label={t('review.sessionProgress')} />
      </div>
      <Card className="flashcard" aria-labelledby="pr-prompt">
        <p className="flashcard-kind">{t('practice.badge')}</p>
        <h2 id="pr-prompt" className="flashcard-prompt">
          {item.prompt}
        </h2>
        {!revealed ? (
          <>
            <label className="sr-only" htmlFor="pr-typed">
              {t('review.typeAnswer')}
            </label>
            <textarea id="pr-typed" className="input textarea flashcard-input" rows={2} placeholder={t('review.typeAnswer')} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Button variant="soft" size="lg" className="flashcard-show" onClick={() => setRevealed(true)}>
              {t('review.showAnswer')}
            </Button>
          </>
        ) : (
          <div className="flashcard-answer" aria-live="polite">
            {typed.trim() && (
              <p className="typed-echo">
                <span className="muted">{t('review.yourAnswer')}:</span> {typed}
              </p>
            )}
            <p className="answer-text">{item.answer}</p>
            <p className="rate-question" id="pr-q">
              {t('practice.howDid')}
            </p>
            <div className="rate-buttons rate-3" role="group" aria-labelledby="pr-q">
              <button type="button" className="rate-btn rate-again" onClick={() => grade('missed')}>
                <span className="rate-label">{t('practice.missed')}</span>
              </button>
              <button type="button" className="rate-btn rate-hard" onClick={() => grade('partial')}>
                <span className="rate-label">{t('practice.partial')}</span>
              </button>
              <button type="button" className="rate-btn rate-easy" onClick={() => grade('knew')}>
                <span className="rate-label">{t('practice.knew')}</span>
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

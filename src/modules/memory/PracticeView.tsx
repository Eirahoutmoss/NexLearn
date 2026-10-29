import { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, ExternalLink, RotateCcw, Swords } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { routes } from '../../app/router';
import { Button, Card, EmptyState, SelectField, Spinner } from '../../components/ui';
import { QuizRunner, type QuizOutcome } from './QuizRunner';
import { ChallengeModal } from './DuelView';
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
  const [grades, setGrades] = useState<PracticeGrade[] | null>(null);
  const [run, setRun] = useState(0);
  const started = useRef(new Date());
  const [duelOpen, setDuelOpen] = useState(false);

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
    setGrades(null);
    setRun((r) => r + 1);
    started.current = new Date();
  };

  const finish = (o: QuizOutcome) => {
    if (!set) return;
    setGrades(o.grades);
    const sourceIds = [...new Set(set.flatMap((i) => i.sourceRefs.map((r) => r.sourceId)))];
    void savePracticeSession(started.current, o.activeMs, summarizePractice(o.grades), sourceIds).catch((e) => reportError(e, 'practice-save'));
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
        <div className="row-wrap">
          <Button variant="primary" onClick={start}>
            {t('practice.start')}
          </Button>
          <Button icon={Swords} onClick={() => setDuelOpen(true)}>
            {t('duel.challengeFriend')}
          </Button>
        </div>
        <ChallengeModal
          open={duelOpen}
          onClose={() => setDuelOpen(false)}
          build={() => buildPracticeSet(data.items, data.states, parseScope(), count)}
        />
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
  if (grades) {
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

  return <QuizRunner key={run} questions={set} badge={t('practice.badge')} onFinish={finish} />;
}

import { useEffect, useRef, useState } from 'react';
import { Brain, Plus, Pencil, Square } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { routes } from '../../app/router';
import { getSegments } from '../../services/sources';
import { createCard } from '../../services/memory';
import { createSegmentAnnotation } from '../../services/annotations';
import type { SourceSegment } from '../../domain/types';
import { useZihinState, startZihin } from '../../zihin/state';
import { wllamaProvider } from '../../zihin/engine';
import { reviewExplanation, simplify, suggestCards, type CardSuggestion, type ExplanationReview } from '../../zihin/tasks';
import { isAppError } from '../../domain/errors';

/** Geçerli bölümün metni (aynı başlık altındaki komşu paragraflar, en çok ~3500 karakter). */
async function sectionText(segment: SourceSegment): Promise<string> {
  const all = await getSegments(segment.sourceId);
  const key = segment.headingPath.join('›');
  const idx = all.findIndex((s) => s.id === segment.id);
  const parts: string[] = [];
  let len = 0;
  for (let i = Math.max(0, idx); i < all.length && len < 3500; i++) {
    const s = all[i];
    if (i > idx && s.headingPath.join('›') !== key && s.segmentType === 'heading') break;
    parts.push(s.text);
    len += s.text.length;
  }
  return parts.join('\n');
}

/**
 * Okuma ekranında Zihin (yerel yapay zekâ) eylemleri. Her öneri kullanıcı onayı bekler;
 * eklenen kartlar "otomatik öneri" kökeniyle işaretlenir.
 */
export function ZihinActions({ segment, explanation }: { segment: SourceSegment; explanation: string }) {
  const { t, lang } = useI18n();
  const { toast, reportError } = useApp();
  const { openCardEditor } = useDialogs();
  const z = useZihinState();
  const [busy, setBusy] = useState<null | 'cards' | 'simple' | 'review'>(null);
  const [cards, setCards] = useState<CardSuggestion[] | null>(null);
  const [simple, setSimple] = useState('');
  const [review, setReview] = useState<ExplanationReview | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    setCards(null);
    setSimple('');
    setReview(null);
  }, [segment.id]);

  const run = async (kind: 'cards' | 'simple' | 'review') => {
    setBusy(kind);
    ctrl.current = new AbortController();
    const signal = ctrl.current.signal;
    try {
      const text = await sectionText(segment);
      if (kind === 'cards') setCards(await suggestCards(wllamaProvider, text, lang, signal));
      if (kind === 'simple') {
        setSimple('');
        setSimple(await simplify(wllamaProvider, text, lang, { signal, onToken: setSimple }));
      }
      if (kind === 'review') setReview(await reviewExplanation(wllamaProvider, text, explanation, lang, signal));
    } catch (e) {
      if (!(isAppError(e) && e.code === 'SRC-006')) reportError(e, `zihin-${kind}`);
    } finally {
      setBusy(null);
    }
  };

  const ref = { sourceId: segment.sourceId, segmentId: segment.id, pageNumber: segment.pageNumber };
  const addCard = async (c: CardSuggestion) => {
    try {
      await createCard({ prompt: c.question, answer: c.answer, sourceRefs: [ref] }, { provenance: 'automatic' });
      setCards((cs) => cs?.filter((x) => x !== c) ?? null);
      toast(t('zihin.cardAdded'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'zihin-card');
    }
  };

  if (z.phase !== 'ready') {
    return (
      <div className="zihin-box">
        <p className="zihin-head">
          <Brain size={16} aria-hidden="true" /> {t('zihin.name')}
        </p>
        {z.phase === 'loading' ? (
          <p className="field-hint" role="status">
            {t('zihin.loading', { pct: Math.round(z.progress * 100) })}
          </p>
        ) : (
          <div className="row-wrap">
            <Button size="sm" icon={Brain} onClick={() => void startZihin().catch((e) => reportError(e, 'zihin-start'))}>
              {t('zihin.start')}
            </Button>
            <a className="link-inline" href={`#${routes.settings('zihin')}`}>
              {t('zihin.settingsLink')}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="zihin-box" aria-busy={busy != null}>
      <p className="zihin-head">
        <Brain size={16} aria-hidden="true" /> {t('zihin.name')} <Badge>{t('zihin.local')}</Badge>
      </p>
      <div className="row-wrap">
        <Button size="sm" onClick={() => void run('cards')} disabled={busy != null} loading={busy === 'cards'}>
          {t('zihin.suggestCards')}
        </Button>
        <Button size="sm" onClick={() => void run('simple')} disabled={busy != null} loading={busy === 'simple'}>
          {t('zihin.simplify')}
        </Button>
        <Button size="sm" onClick={() => void run('review')} disabled={busy != null || !explanation.trim()} loading={busy === 'review'}>
          {t('zihin.review')}
        </Button>
        {busy && (
          <Button size="sm" variant="ghost" icon={Square} onClick={() => ctrl.current?.abort()}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
      <p className="field-hint">{t('zihin.disclaimer')}</p>

      {cards && (
        <ul className="mini-list zihin-cards" aria-label={t('zihin.cardsTitle')}>
          {cards.map((c) => (
            <li key={c.question} className="mini-item">
              <p className="mini-title">{c.question}</p>
              <p className="mini-text">{c.answer}</p>
              <div className="row-wrap">
                <Button size="sm" variant="soft" icon={Plus} onClick={() => void addCard(c)}>
                  {t('zihin.addCard')}
                </Button>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openCardEditor({ prompt: c.question, answer: c.answer, sourceRef: ref })}>
                  {t('zihin.editCard')}
                </Button>
              </div>
            </li>
          ))}
          {cards.length === 0 && <li className="muted">{t('zihin.allHandled')}</li>}
        </ul>
      )}

      {simple && (
        <div className="zihin-simple" aria-live="polite">
          <p>{simple}</p>
          {!busy && (
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                void createSegmentAnnotation('note', segment, { noteText: `${t('zihin.simpleNotePrefix')} ${simple}` })
                  .then(() => toast(t('zihin.noteSaved'), { tone: 'success' }))
                  .catch((e) => reportError(e, 'zihin-note'))
              }
            >
              {t('zihin.saveAsNote')}
            </Button>
          )}
        </div>
      )}

      {review && (
        <div className="zihin-review">
          <p>
            <Badge tone={review.verdict === 'good' ? 'success' : review.verdict === 'partial' ? 'warning' : 'danger'}>{t(`zihin.verdict.${review.verdict}`)}</Badge>
          </p>
          {review.missing.length > 0 && (
            <>
              <p className="section-mini">{t('zihin.missing')}</p>
              <ul>
                {review.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
          {review.wrong.length > 0 && (
            <>
              <p className="section-mini">{t('zihin.wrong')}</p>
              <ul>
                {review.wrong.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
          {review.tip && <p className="field-hint">{review.tip}</p>}
        </div>
      )}
    </div>
  );
}

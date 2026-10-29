import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Lightbulb } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useQuery } from '../../app/useQuery';
import { Button } from '../../components/ui';
import { getSegments } from '../../services/sources';
import { updateConcept } from '../../services/learn';
import { extractKeywords } from '../../services/keywords';
import { feynmanCheck, type FeynmanResult } from '../../domain/learning';
import { normalizeForSearch } from '../../domain/text';
import type { Concept, SourceSegment } from '../../domain/types';

/** Bir kaynaktaki bölümün anahtar terimleri: verilen segmentin çevresindeki (±radius) segmentlerden. */
export async function keyTermsAround(refs: { sourceId: string; segmentId?: string }[], exclude: string[], radius = 4, limit = 8): Promise<string[]> {
  const pool: SourceSegment[] = [];
  for (const r of refs.slice(0, 3)) {
    const segs = await getSegments(r.sourceId);
    const idx = r.segmentId ? segs.findIndex((s) => s.id === r.segmentId) : 0;
    pool.push(...segs.slice(Math.max(0, idx - radius), idx + radius + 1));
  }
  const ex = new Set(exclude.map((e) => normalizeForSearch(e)));
  return extractKeywords(pool, limit + ex.size)
    .map((k) => k.term)
    .filter((term) => !ex.has(normalizeForSearch(term)))
    .slice(0, limit);
}

export function FeynmanResultView({ result }: { result: FeynmanResult }) {
  const { t } = useI18n();
  return (
    <div className="feynman-result" aria-live="polite">
      {result.covered.length > 0 && (
        <p className="mini-meta">
          <Check size={14} aria-hidden="true" /> {t('feynman.covered')}:{' '}
          {result.covered.map((c) => (
            <span key={c} className="tag tag-ok">{c}</span>
          ))}
        </p>
      )}
      {result.missing.length > 0 && (
        <p className="mini-meta">
          <Plus size={14} aria-hidden="true" /> {t('feynman.missing')}:{' '}
          {result.missing.map((c) => (
            <span key={c} className="tag tag-missing">{c}</span>
          ))}
        </p>
      )}
      <p className="field-hint">
        {result.avgSentenceWords > 20 ? t('feynman.longSentences', { n: result.avgSentenceWords }) : t('feynman.sentencesOk', { n: result.avgSentenceWords })}
        {result.longWordRatio > 15 ? ` ${t('feynman.jargon', { n: result.longWordRatio })}` : ''}
      </p>
      {result.missing.length === 0 && result.covered.length > 0 && <p className="field-hint">{t('feynman.allCovered')}</p>}
    </div>
  );
}

/** Feynman modu: kavramı 12 yaşındaki birine anlatır gibi yaz; kaynaktaki önemli terimlerle karşılaştır. */
export function FeynmanPanel({ concept }: { concept: Concept }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [text, setText] = useState(concept.explanation);
  const [result, setResult] = useState<FeynmanResult | null>(null);
  useEffect(() => {
    setText(concept.explanation);
    setResult(null);
  }, [concept.id, concept.explanation]);
  const { data: terms } = useQuery(() => keyTermsAround(concept.sourceRefs, [concept.label]), [concept.id, concept.sourceRefs.length], ['segments']);
  const keyTerms = useMemo(() => terms ?? [], [terms]);
  return (
    <section aria-labelledby="fy-title" className="feynman">
      <h3 id="fy-title" className="section-mini">
        <Lightbulb size={16} aria-hidden="true" /> {t('feynman.title')}
      </h3>
      <p className="field-hint">{t('feynman.prompt', { label: concept.label })}</p>
      <textarea className="input textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-labelledby="fy-title" placeholder={t('feynman.placeholder')} />
      <div className="row-wrap">
        <Button size="sm" onClick={() => setResult(feynmanCheck(text, keyTerms))} disabled={!text.trim() || keyTerms.length === 0}>
          {t('feynman.check')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!text.trim() || text === concept.explanation}
          onClick={() =>
            void updateConcept(concept.id, { explanation: text })
              .then(() => toast(t('common.saved'), { tone: 'success' }))
              .catch((e) => reportError(e, 'feynman-save'))
          }
        >
          {t('feynman.save')}
        </Button>
      </div>
      {keyTerms.length === 0 && <p className="field-hint">{t('feynman.noTerms')}</p>}
      {result && <FeynmanResultView result={result} />}
    </section>
  );
}

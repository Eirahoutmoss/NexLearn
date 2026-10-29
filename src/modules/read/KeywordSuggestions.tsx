import { useMemo, useState } from 'react';
import { Sparkles, Plus, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useQuery } from '../../app/useQuery';
import { Button, IconButton } from '../../components/ui';
import { extractKeywords } from '../../services/keywords';
import { createConcept, listConcepts } from '../../services/learn';
import { updateEntity } from '../../adapters/storage/repo';
import { normalizeForSearch } from '../../domain/text';
import type { Source, SourceSegment } from '../../domain/types';

/**
 * Modelsiz kavram önerileri (TF-IDF). Öneriler "otomatik" olarak işaretlenir; kullanıcı eklemeden
 * hiçbir kavram oluşmaz. Yoksayılanlar kaynak bazında hatırlanır.
 */
export function KeywordSuggestions({ source, segments, onGo }: { source: Source; segments: SourceSegment[]; onGo: (index: number) => void }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [open, setOpen] = useState(false);
  const { data: concepts = [] } = useQuery(listConcepts, [], ['concepts']);
  const dismissed = useMemo(() => new Set(String(source.metadata.dismissedKeywords ?? '').split('\n').filter(Boolean)), [source.metadata.dismissedKeywords]);
  const suggestions = useMemo(() => {
    if (!open) return [];
    const existing = new Set(concepts.map((c) => normalizeForSearch(c.label)));
    return extractKeywords(segments, 25)
      .filter((k) => !existing.has(normalizeForSearch(k.term)) && !dismissed.has(normalizeForSearch(k.term)))
      .slice(0, 12);
  }, [open, segments, concepts, dismissed]);
  const indexOf = useMemo(() => new Map(segments.map((s) => [s.id, s.index])), [segments]);

  const dismiss = async (term: string) => {
    const next = [...dismissed, normalizeForSearch(term)].join('\n');
    try {
      await updateEntity('sources', source.id, { metadata: { ...source.metadata, dismissedKeywords: next } });
    } catch (e) {
      reportError(e, 'dismiss-keyword');
    }
  };

  const add = async (term: string, segmentId: string) => {
    try {
      const seg = segments.find((s) => s.id === segmentId);
      await createConcept({ label: term, sourceRefs: [{ sourceId: source.id, segmentId, pageNumber: seg?.pageNumber }] }, { provenance: 'automatic' });
      toast(t('keywords.added', { term }), { tone: 'success' });
    } catch (e) {
      reportError(e, 'keyword-add');
    }
  };

  if (!segments.length) return null;
  if (!open) {
    return (
      <Button size="sm" variant="soft" icon={Sparkles} onClick={() => setOpen(true)}>
        {t('keywords.show')}
      </Button>
    );
  }
  return (
    <section className="keyword-box" aria-labelledby="kw-title">
      <h3 id="kw-title" className="section-mini">
        <Sparkles size={16} aria-hidden="true" /> {t('keywords.title')}
      </h3>
      <p className="field-hint">{t('keywords.note')}</p>
      {suggestions.length === 0 ? (
        <p className="muted">{t('keywords.none')}</p>
      ) : (
        <ul className="keyword-list">
          {suggestions.map((k) => (
            <li key={k.term} className="keyword-item">
              <button type="button" className="link-btn" onClick={() => indexOf.has(k.segmentId) && onGo(indexOf.get(k.segmentId)!)}>
                {k.term}
              </button>
              <span className="muted">×{k.count}</span>
              <IconButton icon={Plus} size="sm" label={t('keywords.add', { term: k.term })} onClick={() => void add(k.term, k.segmentId)} />
              <IconButton icon={X} size="sm" label={t('keywords.dismiss', { term: k.term })} onClick={() => void dismiss(k.term)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

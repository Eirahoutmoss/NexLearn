import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { Plus, Share2, List, Network, ZoomIn, ZoomOut, Maximize2, Shuffle, Layers, Target, Pencil, Trash2, X, Check, ExternalLink, Link2Off, HelpCircle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { useDialogs } from '../../app/Dialogs';
import { navigate, routes } from '../../app/router';
import { Badge, Button, EmptyState, IconButton, SelectField, Switch, TextArea } from '../../components/ui';
import { Modal } from '../../components/Modal';
import {
  GUIDING_QUESTION_KEYS,
  conceptImpact,
  confirmRelation,
  createRelation,
  createTask,
  deleteRelation,
  listConcepts,
  listRelations,
  trashConcept,
  restoreConcept,
  updateConcept,
  updateRelationType,
} from '../../services/learn';
import { listSources } from '../../services/sources';
import { RELATION_TYPES, type Concept, type ConceptRelation, type RelationType, type Source } from '../../domain/types';
import { normalizeForSearch } from '../../domain/text';
import { forceLayout, nearestInDirection } from './layout';

const W = 1200;
const H = 800;

interface MapData {
  concepts: Concept[];
  relations: ConceptRelation[];
  sources: Map<string, Source>;
}

async function loadMap(): Promise<MapData> {
  const [concepts, relations, sources] = await Promise.all([listConcepts(), listRelations(), listSources()]);
  const ids = new Set(concepts.map((c) => c.id));
  return { concepts, relations: relations.filter((r) => ids.has(r.fromConceptId) && ids.has(r.toConceptId)), sources: new Map(sources.map((s) => [s.id, s])) };
}

export default function MapPage({ conceptId, view }: { conceptId?: string; view?: string }) {
  const { t } = useI18n();
  const { openConceptEditor } = useDialogs();
  const { data } = useQuery(loadMap, [], ['concepts', 'relations', 'sources']);
  const [mode, setMode] = useState<'map' | 'list'>(view === 'list' ? 'list' : 'map');
  const [selected, setSelected] = useState<string | undefined>(conceptId);
  const [q, setQ] = useState('');
  const [relFilter, setRelFilter] = useState<'all' | RelationType>('all');
  const [srcFilter, setSrcFilter] = useState('all');
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);

  useEffect(() => setSelected(conceptId), [conceptId]);

  const filtered = useMemo(() => {
    if (!data) return { concepts: [], relations: [] };
    const nq = normalizeForSearch(q);
    const concepts = data.concepts.filter(
      (c) =>
        (!nq || normalizeForSearch(`${c.label} ${c.description}`).includes(nq)) &&
        (srcFilter === 'all' || c.sourceRefs.some((r) => r.sourceId === srcFilter)) &&
        (!onlyConfirmed || c.userConfirmed),
    );
    const ids = new Set(concepts.map((c) => c.id));
    const relations = data.relations.filter(
      (r) => ids.has(r.fromConceptId) && ids.has(r.toConceptId) && (relFilter === 'all' || r.relationType === relFilter) && (!onlyConfirmed || r.userConfirmed),
    );
    return { concepts, relations };
  }, [data, q, relFilter, srcFilter, onlyConfirmed]);

  const usedSources = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.concepts.flatMap((c) => c.sourceRefs.map((r) => r.sourceId)));
    return [...ids].map((id) => data.sources.get(id)).filter((s): s is Source => Boolean(s));
  }, [data]);

  const selectedConcept = data?.concepts.find((c) => c.id === selected);

  return (
    <div className="page page-map">
      <header className="page-header">
        <div>
          <h1>{t('map.title')}</h1>
          <p className="page-sub">{t('map.subtitle')}</p>
        </div>
        <div className="row-wrap">
          <div className="segmented" role="group" aria-label={t('map.viewMode')}>
            <button type="button" className={mode === 'map' ? 'active' : ''} aria-pressed={mode === 'map'} onClick={() => setMode('map')}>
              <Network size={16} aria-hidden="true" /> <span>{t('map.mapView')}</span>
            </button>
            <button type="button" className={mode === 'list' ? 'active' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
              <List size={16} aria-hidden="true" /> <span>{t('map.listView')}</span>
            </button>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => openConceptEditor({})}>
            {t('map.newConcept')}
          </Button>
        </div>
      </header>

      {data && data.concepts.length === 0 ? (
        <EmptyState icon={Share2} title={t('map.emptyTitle')} text={t('map.emptyText')} action={<Button variant="primary" icon={Plus} onClick={() => openConceptEditor({})}>{t('map.newConcept')}</Button>} />
      ) : (
        <>
          <div className="filters" role="search">
            <div className="filter-search">
              <input className="input" type="search" placeholder={t('map.search')} aria-label={t('map.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <SelectField
              label={t('map.relationFilter')}
              value={relFilter}
              onChange={(e) => setRelFilter(e.target.value as 'all' | RelationType)}
              options={[{ value: 'all', label: t('common.all') }, ...RELATION_TYPES.map((r) => ({ value: r, label: t(`relation.${r}`) }))]}
            />
            {usedSources.length > 0 && (
              <SelectField label={t('map.sourceFilter')} value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...usedSources.map((s) => ({ value: s.id, label: s.title }))]} />
            )}
            <Switch label={t('map.onlyConfirmed')} checked={onlyConfirmed} onChange={setOnlyConfirmed} />
          </div>
          <div className={`map-layout ${selectedConcept ? 'with-detail' : ''}`}>
            {mode === 'map' ? (
              <MapCanvas concepts={filtered.concepts} relations={filtered.relations} selected={selected} onSelect={setSelected} />
            ) : (
              <ConceptList concepts={filtered.concepts} relations={filtered.relations} all={data?.concepts ?? []} selected={selected} onSelect={setSelected} />
            )}
            {selectedConcept && data && (
              <ConceptDetail key={selectedConcept.id} concept={selectedConcept} data={data} onClose={() => setSelected(undefined)} onSelect={setSelected} />
            )}
          </div>
          <p className="field-hint">{t('map.legend')}</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Harita tuvali ------------------------------ */

function MapCanvas({ concepts, relations, selected, onSelect }: { concepts: Concept[]; relations: ConceptRelation[]; selected?: string; onSelect: (id?: string) => void }) {
  const { t } = useI18n();
  const { reportError } = useApp();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [pan, setPan] = useState<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const [focusId, setFocusId] = useState<string | undefined>(selected ?? concepts[0]?.id);
  const nodeRefs = useRef(new Map<string, SVGGElement>());

  const layoutKey = concepts.map((c) => `${c.id}:${c.position?.x ?? ''},${c.position?.y ?? ''}`).join('|') + relations.map((r) => r.id).join('|');
  const positions = useMemo(
    () =>
      forceLayout(
        concepts.map((c) => ({ id: c.id, x: c.position?.x, y: c.position?.y, fixed: Boolean(c.position) })),
        relations.map((r) => ({ from: r.fromConceptId, to: r.toConceptId })),
        { width: W, height: H },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const pos = (id: string) => (dragPos?.id === id ? dragPos : positions.get(id)) ?? { x: W / 2, y: H / 2 };
  const gRef = useRef<SVGGElement>(null);

  // Görünüm kutusu düğümlerin kapladığı alana sığdırılır: az kavramda yazılar küçülmez.
  const vb = useMemo(() => {
    const pts = [...positions.values()];
    if (!pts.length) return { x: 0, y: 0, w: W, h: H };
    const pad = 120;
    let minX = Math.min(...pts.map((p) => p.x)) - pad;
    let maxX = Math.max(...pts.map((p) => p.x)) + pad;
    let minY = Math.min(...pts.map((p) => p.y)) - pad * 0.7;
    let maxY = Math.max(...pts.map((p) => p.y)) + pad * 0.7;
    const minW = 640;
    const minH = 420;
    if (maxX - minX < minW) {
      const c = (minX + maxX) / 2;
      minX = c - minW / 2;
      maxX = c + minW / 2;
    }
    if (maxY - minY < minH) {
      const c = (minY + maxY) / 2;
      minY = c - minH / 2;
      maxY = c + minH / 2;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [positions]);

  /** Ekran koordinatını (yakınlaştırma/kaydırma dahil) harita koordinatına çevirir. */
  const toSvg = (clientX: number, clientY: number) => {
    const g = gRef.current;
    const ctm = g?.getScreenCTM();
    if (!g || !ctm) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const unitsPerPx = () => {
    const ctm = svgRef.current?.getScreenCTM();
    return ctm && ctm.a ? 1 / ctm.a : 1;
  };

  const persist = useCallback(
    (id: string, x: number, y: number) => {
      void updateConcept(id, { position: { x: Math.round(x), y: Math.round(y) } }).catch((e) => reportError(e, 'position'));
    },
    [reportError],
  );

  const onNodePointerDown = (e: RPointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    const cur = pos(id);
    setDrag({ id, dx: p.x - cur.x, dy: p.y - cur.y });
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (drag) {
      const p = toSvg(e.clientX, e.clientY);
      setDragPos({ id: drag.id, x: Math.max(40, Math.min(W - 40, p.x - drag.dx)), y: Math.max(30, Math.min(H - 30, p.y - drag.dy)) });
    } else if (pan) {
      const u = unitsPerPx();
      setView((v) => ({ ...v, x: pan.vx + (e.clientX - pan.sx) * u, y: pan.vy + (e.clientY - pan.sy) * u }));
    }
  };

  const onPointerUp = () => {
    if (drag) {
      if (dragPos) persist(drag.id, dragPos.x, dragPos.y);
      else onSelect(drag.id);
    }
    setDrag(null);
    setDragPos(null);
    setPan(null);
  };

  const zoom = (factor: number) =>
    setView((v) => {
      const k = Math.max(0.4, Math.min(2.5, v.k * factor));
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });

  const onKeyNode = (e: RKeyboardEvent, id: string) => {
    const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (dirs[e.key]) {
      e.preventDefault();
      const p = pos(id);
      if (e.shiftKey) {
        // Shift + ok: düğümü klavyeyle taşı.
        const step = 24;
        const nx = p.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
        const ny = p.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        persist(id, Math.max(40, Math.min(W - 40, nx)), Math.max(30, Math.min(H - 30, ny)));
        return;
      }
      const next = nearestInDirection(p, concepts.filter((c) => c.id !== id).map((c) => ({ id: c.id, ...pos(c.id) })), dirs[e.key]);
      if (next) {
        setFocusId(next);
        nodeRefs.current.get(next)?.focus();
      }
    } else if (e.key === 'Escape') onSelect(undefined);
  };

  const resetLayout = async () => {
    try {
      for (const c of concepts) if (c.position) await updateConcept(c.id, { position: null });
    } catch (e) {
      reportError(e, 'layout-reset');
    }
  };

  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (!selected) return s;
    for (const r of relations) {
      if (r.fromConceptId === selected) s.add(r.toConceptId);
      if (r.toConceptId === selected) s.add(r.fromConceptId);
    }
    return s;
  }, [selected, relations]);

  const label = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

  return (
    <div className="map-canvas-wrap">
      <div className="map-controls" role="toolbar" aria-label={t('map.controls')}>
        <IconButton icon={ZoomIn} size="sm" variant="secondary" label={t('map.zoomIn')} onClick={() => zoom(1.2)} />
        <IconButton icon={ZoomOut} size="sm" variant="secondary" label={t('map.zoomOut')} onClick={() => zoom(1 / 1.2)} />
        <IconButton icon={Maximize2} size="sm" variant="secondary" label={t('map.fit')} onClick={() => setView({ x: 0, y: 0, k: 1 })} />
        <IconButton icon={Shuffle} size="sm" variant="secondary" label={t('map.relayout')} onClick={() => void resetLayout()} />
      </div>
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="application"
        aria-roledescription={t('map.roleDescription')}
        aria-label={t('map.canvasLabel', { count: concepts.length })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerDown={(e) => {
          if (e.target === svgRef.current || (e.target as Element).classList.contains('map-bg')) setPan({ sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
          }
        }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="map-arrow" />
          </marker>
        </defs>
        <rect className="map-bg" x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} />
        <g ref={gRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {relations.map((r) => {
            const a = pos(r.fromConceptId);
            const b = pos(r.toConceptId);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            // Kenar düğüm kutusunun kenarında bitsin.
            const pad = 34;
            const x1 = a.x + (dx / len) * pad;
            const y1 = a.y + (dy / len) * pad;
            const x2 = b.x - (dx / len) * pad;
            const y2 = b.y - (dy / len) * pad;
            const dim = selected && r.fromConceptId !== selected && r.toConceptId !== selected;
            const directed = r.relationType !== 'related_to' && r.relationType !== 'contrasts_with';
            return (
              <g key={r.id} className={`map-edge rel-${r.relationType} ${r.userConfirmed ? '' : 'map-edge-suggested'} ${dim ? 'dim' : ''}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={directed ? 'url(#arrow)' : undefined} />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} className="map-edge-label" textAnchor="middle">
                  {t(`relation.${r.relationType}`)}
                </text>
              </g>
            );
          })}
          {concepts.map((c) => {
            const p = pos(c.id);
            const w = Math.max(90, Math.min(200, label(c.label).length * 8.5 + 32));
            const isSel = c.id === selected;
            const dim = selected && !isSel && !neighbors.has(c.id);
            return (
              <g
                key={c.id}
                ref={(el) => {
                  if (el) nodeRefs.current.set(c.id, el);
                  else nodeRefs.current.delete(c.id);
                }}
                className={`map-node ${isSel ? 'selected' : ''} ${dim ? 'dim' : ''} ${c.userConfirmed ? '' : 'map-node-suggested'}`}
                transform={`translate(${p.x} ${p.y})`}
                tabIndex={c.id === (focusId ?? concepts[0]?.id) ? 0 : -1}
                role="button"
                aria-pressed={isSel}
                aria-label={t('map.nodeLabel', { label: c.label, count: relations.filter((r) => r.fromConceptId === c.id || r.toConceptId === c.id).length })}
                onFocus={() => setFocusId(c.id)}
                onKeyDown={(e) => onKeyNode(e, c.id)}
                onPointerDown={(e) => onNodePointerDown(e, c.id)}
              >
                <rect x={-w / 2} y={-22} width={w} height={44} rx={22} />
                <text textAnchor="middle" dy="5">
                  {label(c.label)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="field-hint">{t('map.keyboardHint')}</p>
    </div>
  );
}

/* ------------------------------ Liste görünümü (erişilebilir alternatif) ------------------------------ */

function ConceptList({ concepts, relations, all, selected, onSelect }: { concepts: Concept[]; relations: ConceptRelation[]; all: Concept[]; selected?: string; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const byId = new Map(all.map((c) => [c.id, c]));
  return (
    <ul className="concept-list" aria-label={t('map.listLabel')}>
      {[...concepts].sort((a, b) => a.label.localeCompare(b.label, 'tr')).map((c) => {
        const out = relations.filter((r) => r.fromConceptId === c.id);
        const inc = relations.filter((r) => r.toConceptId === c.id);
        return (
          <li key={c.id} className={`concept-item ${selected === c.id ? 'selected' : ''}`}>
            <button type="button" className="concept-item-title" aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>
              {c.label}
              {!c.userConfirmed && <Badge tone="warning">{t('map.suggested')}</Badge>}
            </button>
            {c.description && <p className="mini-text">{c.description}</p>}
            {(out.length > 0 || inc.length > 0) && (
              <ul className="relation-lines">
                {out.map((r) => (
                  <li key={r.id}>
                    {c.label} <em>{t(`relation.${r.relationType}`)}</em> → {byId.get(r.toConceptId)?.label}
                  </li>
                ))}
                {inc.map((r) => (
                  <li key={r.id}>
                    {byId.get(r.fromConceptId)?.label} <em>{t(`relation.${r.relationType}`)}</em> → {c.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ Kavram ayrıntısı ------------------------------ */

function ConceptDetail({ concept, data, onClose, onSelect }: { concept: Concept; data: MapData; onClose: () => void; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const { openCardEditor, openConceptEditor } = useDialogs();
  const [relType, setRelType] = useState<RelationType>('related_to');
  const [relTarget, setRelTarget] = useState('');
  const [relDir, setRelDir] = useState<'out' | 'in'>('out');
  const [examples, setExamples] = useState(concept.examples.join('\n'));
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskText, setTaskText] = useState('');
  const byId = new Map(data.concepts.map((c) => [c.id, c]));
  const rels = data.relations.filter((r) => r.fromConceptId === concept.id || r.toConceptId === concept.id);
  const others = data.concepts.filter((c) => c.id !== concept.id).sort((a, b) => a.label.localeCompare(b.label, 'tr'));

  const addRelation = async () => {
    if (!relTarget) return;
    try {
      await createRelation(relDir === 'out' ? { fromConceptId: concept.id, toConceptId: relTarget, relationType: relType } : { fromConceptId: relTarget, toConceptId: concept.id, relationType: relType });
      setRelTarget('');
      toast(t('map.relationAdded'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'relation');
    }
  };

  const remove = async () => {
    const impact = await conceptImpact(concept.id);
    const ok = await confirm({ title: t('map.deleteTitle', { label: concept.label }), message: t('map.deleteImpact', impact as unknown as Record<string, number>), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await trashConcept(concept.id);
      onClose();
      toast(t('map.deleted'), { tone: 'success', action: { label: t('common.undo'), run: () => void restoreConcept(concept.id) } });
    } catch (e) {
      reportError(e, 'concept-delete');
    }
  };

  return (
    <aside className="concept-detail card" aria-labelledby="cd-title">
      <div className="row-between">
        <h2 id="cd-title" className="card-title">
          {concept.label}
        </h2>
        <IconButton icon={X} size="sm" label={t('common.close')} onClick={onClose} />
      </div>
      <p className="mini-meta">
        <Badge tone={concept.userConfirmed ? 'success' : 'warning'}>{concept.userConfirmed ? t('map.confirmed') : t('map.suggested')}</Badge> <Badge>{t(`provenance.${concept.provenance}`)}</Badge>
      </p>
      {concept.description && <p>{concept.description}</p>}
      {concept.explanation ? (
        <blockquote className="own-words">
          <span className="sr-only">{t('map.ownWords')}: </span>
          {concept.explanation}
        </blockquote>
      ) : (
        <p className="muted">{t('map.noExplanation')}</p>
      )}
      <div className="row-wrap">
        <Button size="sm" icon={Pencil} onClick={() => openConceptEditor({ concept })}>
          {t('common.edit')}
        </Button>
        {!concept.userConfirmed && (
          <Button size="sm" icon={Check} onClick={() => void updateConcept(concept.id, { userConfirmed: true }).catch((e) => reportError(e, 'confirm'))}>
            {t('map.confirm')}
          </Button>
        )}
        <Button
          size="sm"
          icon={Layers}
          onClick={() => openCardEditor({ prompt: t('map.cardPrompt', { label: concept.label }), answer: concept.explanation || concept.description, conceptIds: [concept.id], sourceRef: concept.sourceRefs[0] })}
        >
          {t('map.makeCard')}
        </Button>
        <Button size="sm" icon={Target} onClick={() => setTaskOpen(true)}>
          {t('map.addTask')}
        </Button>
        <IconButton icon={Trash2} size="sm" label={t('common.delete')} onClick={() => void remove()} />
      </div>

      <section aria-labelledby="cd-src">
        <h3 id="cd-src" className="section-mini">
          {t('map.sources')}
        </h3>
        {concept.sourceRefs.length === 0 && <p className="muted">{t('map.noSources')}</p>}
        <ul className="mini-list">
          {concept.sourceRefs.map((r, i) => {
            const s = data.sources.get(r.sourceId);
            return (
              <li key={`${r.sourceId}-${r.segmentId ?? i}`}>
                {s ? (
                  <a href={`#${routes.read(r.sourceId, r.segmentId)}`} className="link-inline">
                    <ExternalLink size={14} aria-hidden="true" /> {s.title}
                    {r.pageNumber ? ` · ${t('common.pageN', { n: r.pageNumber })}` : ''}
                  </a>
                ) : (
                  <span className="muted">
                    <Link2Off size={14} aria-hidden="true" /> {t('sourceRef.broken')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cd-rel">
        <h3 id="cd-rel" className="section-mini">
          {t('map.relations')}
        </h3>
        {rels.length === 0 && <p className="muted">{t('map.noRelations')}</p>}
        <ul className="mini-list">
          {rels.map((r) => {
            const other = byId.get(r.fromConceptId === concept.id ? r.toConceptId : r.fromConceptId);
            const outgoing = r.fromConceptId === concept.id;
            return (
              <li key={r.id} className="relation-row">
                <span className="relation-text">
                  {outgoing ? concept.label : (
                    <button type="button" className="link-btn" onClick={() => other && onSelect(other.id)}>
                      {other?.label}
                    </button>
                  )}{' '}
                  <select
                    className="input input-xs"
                    aria-label={t('map.relationType')}
                    value={r.relationType}
                    onChange={(e) => void updateRelationType(r.id, e.target.value as RelationType).catch((er) => reportError(er, 'relation-type'))}
                  >
                    {RELATION_TYPES.map((rt) => (
                      <option key={rt} value={rt}>
                        {t(`relation.${rt}`)}
                      </option>
                    ))}
                  </select>{' '}
                  →{' '}
                  {outgoing ? (
                    <button type="button" className="link-btn" onClick={() => other && onSelect(other.id)}>
                      {other?.label}
                    </button>
                  ) : (
                    concept.label
                  )}
                </span>
                {!r.userConfirmed && (
                  <IconButton icon={Check} size="sm" label={t('map.confirmRelation')} onClick={() => void confirmRelation(r.id, true).catch((e) => reportError(e, 'rel-confirm'))} />
                )}
                <IconButton icon={Trash2} size="sm" label={t('map.deleteRelation')} onClick={() => void deleteRelation(r.id).catch((e) => reportError(e, 'rel-delete'))} />
              </li>
            );
          })}
        </ul>
        {others.length > 0 && (
          <form
            className="relation-form"
            onSubmit={(e) => {
              e.preventDefault();
              void addRelation();
            }}
          >
            <SelectField
              label={t('map.direction')}
              value={relDir}
              onChange={(e) => setRelDir(e.target.value as 'out' | 'in')}
              options={[
                { value: 'out', label: t('map.dirOut', { label: concept.label }) },
                { value: 'in', label: t('map.dirIn', { label: concept.label }) },
              ]}
            />
            <SelectField label={t('map.relationType')} value={relType} onChange={(e) => setRelType(e.target.value as RelationType)} options={RELATION_TYPES.map((r) => ({ value: r, label: t(`relation.${r}`) }))} />
            <SelectField label={t('map.target')} value={relTarget} onChange={(e) => setRelTarget(e.target.value)} options={[{ value: '', label: t('map.chooseConcept') }, ...others.map((c) => ({ value: c.id, label: c.label }))]} />
            <Button type="submit" size="sm" variant="primary" icon={Plus} disabled={!relTarget}>
              {t('map.addRelation')}
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby="cd-ex">
        <h3 id="cd-ex" className="section-mini">
          {t('map.examples')}
        </h3>
        <TextArea label={t('map.examplesField')} hint={t('map.examplesHint')} value={examples} onChange={(e) => setExamples(e.target.value)} rows={3} />
        <Button size="sm" onClick={() => void updateConcept(concept.id, { examples: examples.split('\n') }).then(() => toast(t('common.saved'), { tone: 'success' })).catch((e) => reportError(e, 'examples'))}>
          {t('common.save')}
        </Button>
      </section>

      <section aria-labelledby="cd-q">
        <h3 id="cd-q" className="section-mini">
          <HelpCircle size={16} aria-hidden="true" /> {t('map.guiding')}
        </h3>
        <ul className="guiding">
          {GUIDING_QUESTION_KEYS.map((k) => (
            <li key={k}>{t(`map.q.${k}`, { label: concept.label })}</li>
          ))}
        </ul>
      </section>

      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title={t('map.addTask')}
        description={t('tasks.taskHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!taskText.trim()}
              onClick={() =>
                void createTask({ prompt: taskText, conceptIds: [concept.id], sourceRefs: concept.sourceRefs.slice(0, 1) })
                  .then(() => {
                    setTaskOpen(false);
                    setTaskText('');
                    toast(t('tasks.created'), { tone: 'success', action: { label: t('nav.tasks'), run: () => navigate(routes.tasks()) } });
                  })
                  .catch((e) => reportError(e, 'task'))
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <TextArea label={t('tasks.prompt')} value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={4} placeholder={t('tasks.placeholder', { label: concept.label })} data-autofocus />
      </Modal>
    </aside>
  );
}

import { describe, expect, it } from 'vitest';
import { cardsCsv, csvCell, reviewEventsCsv } from '../services/export/csv';
import { recallBreakdown, readingMinutesByDay, lastNDays, todayProgress, hardCards } from '../services/progress';
import { SearchIndex } from '../services/search';
import type { LearningItem, ReviewEvent, ReviewState, Source, SourceSegment } from '../domain/types';
import { notesMarkdown } from '../services/export/markdown';
import { DEFAULT_SETTINGS } from '../services/settings';

const ev = (id: string, item: string, reviewedAt: string, last: string | null, rating: number): ReviewEvent => ({
  id, learningItemId: item, reviewedAt, rating, button: rating >= 3 ? 'good' : 'again',
  scheduleBefore: { repetitionCount: 0, intervalDays: 0, easeFactor: 2.5, lapseCount: 0, dueAt: reviewedAt, lastReviewedAt: last },
  scheduleAfter: { repetitionCount: 1, intervalDays: 1, easeFactor: 2.5, lapseCount: 0, dueAt: reviewedAt, lastReviewedAt: reviewedAt },
});

describe('dürüst ölçüm: anlık ve gecikmeli hatırlama ayrı', () => {
  it('aralığa göre sınıflandırır, deneme yoksa yüzde null', () => {
    const items = [{ id: 'a', createdAt: '2026-01-01T08:00:00Z' }];
    const events = [
      ev('1', 'a', '2026-01-01T09:00:00Z', null, 4),
      ev('2', 'a', '2026-01-03T09:00:00Z', '2026-01-01T09:00:00Z', 2),
      ev('3', 'a', '2026-01-12T09:00:00Z', '2026-01-03T09:00:00Z', 5),
    ];
    const r = recallBreakdown(events, items);
    expect(r.immediate).toEqual({ attempts: 1, successes: 1, percent: 100 });
    expect(r.oneDay).toEqual({ attempts: 1, successes: 0, percent: 0 });
    expect(r.oneWeek).toEqual({ attempts: 1, successes: 1, percent: 100 });
    expect(recallBreakdown([], []).oneWeek.percent).toBeNull();
  });

  it('günlük okuma dakikası yalnızca okuma oturumlarından', () => {
    const now = new Date(2026, 4, 10, 15);
    const days = lastNDays(3, now);
    const today = new Date(2026, 4, 10, 9).toISOString();
    const m = readingMinutesByDay(
      [
        { id: 's', sessionType: 'reading', startedAt: today, endedAt: today, durationMs: 600_000, sourceIds: [], activitySummary: {} },
        { id: 't', sessionType: 'review', startedAt: today, endedAt: today, durationMs: 600_000, sourceIds: [], activitySummary: {} },
      ],
      days,
    );
    expect(m).toEqual([0, 0, 10]);
    expect(todayProgress(now, [], [], [], []).reviews).toBe(0);
  });

  it('zor kartlar', () => {
    const item = { id: 'a' } as LearningItem;
    const st = new Map<string, ReviewState>([['a', { learningItemId: 'a', repetitionCount: 0, intervalDays: 1, easeFactor: 1.5, lapseCount: 3, dueAt: '', lastReviewedAt: null, algorithmVersion: 'sm2-v1', revision: 1 }]]);
    expect(hardCards([item], st)).toHaveLength(1);
  });
});

describe('CSV', () => {
  it('tırnaklama ve formül enjeksiyonu koruması', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(null)).toBe('');
  });
  it('kart ve tekrar CSV başlıkları', () => {
    const item = { id: 'li', itemType: 'qa', prompt: 'Soru', answer: 'Cevap', explanation: '', tags: [], suspended: false, sourceRefs: [], createdAt: 'x' } as unknown as LearningItem;
    const csv = cardsCsv([item], new Map(), new Map<string, Source>());
    expect(csv.startsWith('\uFEFFid,type,prompt')).toBe(true);
    expect(reviewEventsCsv([ev('1', 'li', 'x', null, 4)], new Map([['li', item]]))).toContain('Soru');
  });
});

describe('arama', () => {
  const source = { id: 'src', title: 'Işık ve Madde', tags: ['fizik'] } as unknown as Source;
  const mkSeg = (i: number, text: string): SourceSegment => ({ id: `seg${i}`, sourceId: 'src', index: i, segmentType: 'paragraph', text, startOffset: 0, endOffset: 1, headingPath: [], extractionMethod: 'text', locator: { type: 'offset', value: 0 }, pageNumber: 2 });

  it('Türkçe normalleştirilmiş arama ve sonuç türleri', () => {
    const idx = new SearchIndex({ sources: [source], segments: [mkSeg(0, 'Işığın dalga özellikleri vardır.')], cards: [], concepts: [], annotations: [] });
    const hits = idx.search('isigin dalga');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'segment', pageNumber: 2 });
    expect(idx.search('ışık')[0]).toMatchObject({ kind: 'source' });
    expect(idx.search('a')).toEqual([]);
  });

  it('performans bütçesi: 10k segmentte arama < 100 ms', () => {
    const words = ['ağ', 'protokol', 'paket', 'yönlendirici', 'anahtar', 'katman', 'çerçeve', 'adres'];
    const segs = Array.from({ length: 10_000 }, (_, i) => mkSeg(i, Array.from({ length: 60 }, (_, j) => words[(i * 7 + j) % words.length]).join(' ') + (i === 9_999 ? ' benzersizterim' : '')));
    const idx = new SearchIndex({ sources: [source], segments: segs, cards: [], concepts: [], annotations: [] });
    const t0 = performance.now();
    const hits = idx.search('benzersizterim');
    const ms = performance.now() - t0;
    expect(hits).toHaveLength(1);
    expect(ms).toBeLessThan(100);
  });
});

describe('Markdown dışa aktarma', () => {
  it('silinmiş kayıtları dışarıda bırakır', () => {
    const md = notesMarkdown(
      {
        schemaVersion: '1.0.0', appVersion: '0', createdAt: '2026-01-01',
        sources: [{ id: 's', title: 'Kaynak', deletedAt: null } as unknown as Source],
        segments: [], concepts: [], relations: [], items: [], reviewStates: [], reviewEvents: [], tasks: [], sessions: [], readingStates: [],
        annotations: [
          { id: 'a', sourceId: 's', segmentId: 'x', annotationType: 'note', noteText: 'Görünür not', tags: [], deletedAt: null } as never,
          { id: 'b', sourceId: 's', segmentId: 'x', annotationType: 'note', noteText: 'Silinmiş not', tags: [], deletedAt: '2026' } as never,
        ],
        settings: { ...DEFAULT_SETTINGS },
      },
      { title: 'T', highlights: 'V', notes: 'Notlar', explanations: 'A', cards: 'K', concepts: 'C', tasks: 'G', page: 's.', question: 'S', answer: 'C', relationLabel: (t) => t, exportedAt: 'Tarih' },
    );
    expect(md).toContain('Görünür not');
    expect(md).not.toContain('Silinmiş not');
  });
});

describe('performans bütçesi: yedek', () => {
  it('10.000 kartlık yedek oluşturma < 5 sn', async () => {
    const { buildBackupZip } = await import('../services/backup/backup');
    const now = '2026-01-01T00:00:00.000Z';
    const items = Array.from({ length: 10_000 }, (_, i) => ({
      id: `li_${i}`, createdAt: now, updatedAt: now, revision: 1, deletedAt: null, itemType: 'qa', prompt: `Soru ${i} — TCP nedir?`,
      answer: `Cevap ${i}: güvenilir iletim protokolü`, explanation: '', sourceRefs: [], conceptIds: [], tags: [], suspended: false, provenance: 'user',
    })) as unknown as LearningItem[];
    const reviewStates = items.map((it) => ({ learningItemId: it.id, repetitionCount: 1, intervalDays: 1, easeFactor: 2.5, lapseCount: 0, dueAt: now, lastReviewedAt: now, algorithmVersion: 'sm2-v1', revision: 1 }));
    const t0 = performance.now();
    const zip = await buildBackupZip(
      { schemaVersion: '1.0.0', appVersion: '0', createdAt: now, sources: [], segments: [], annotations: [], concepts: [], relations: [], items, reviewStates, reviewEvents: [], tasks: [], sessions: [], readingStates: [], settings: { ...DEFAULT_SETTINGS } },
      [],
    );
    const ms = performance.now() - t0;
    expect(zip.byteLength).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(5000);
  });
});

import { DATA_STORES, emitChange, getDb } from '../adapters/storage/db';
import { createSegmentAnnotation } from '../services/annotations';
import { createCard } from '../services/memory';
import { createConcept, createRelation, createTask } from '../services/learn';
import { createTextSource, getSegments } from '../services/sources';

/**
 * Deneme modu için SENTETİK örnek içerik. Bu metin NexLearn için özgün olarak yazılmıştır
 * (lisans: CC BY 4.0). Gerçek bir kitaptan veya kullanıcı belgesinden alınmamıştır.
 */
export const SAMPLE_TITLE = 'Örnek: Ağ Temelleri';

export const SAMPLE_MARKDOWN = `# Ağ Temelleri

Bu metin NexLearn'i denemen için hazırlanmış kısa ve özgün bir örnektir. Okurken bir cümleyi seçip vurgulayabilir, not ekleyebilir, oradan bir hatırlama kartı ya da kavram oluşturabilirsin.

## Katmanlı düşünmek

Bilgisayar ağlarını anlamanın en kolay yolu, iletişimi katmanlara ayırmaktır. Her katman yalnızca kendi işine odaklanır ve bir alttaki katmanın sunduğu hizmeti kullanır. Böylece bir katmandaki değişiklik, diğerlerini bozmadan yapılabilir.

Gündelik bir benzetmeyle düşünelim: Bir mektup yazarken içeriği sen belirlersin, zarfın üzerindeki adresi posta sistemi okur, mektubu taşıyan araç ise yolu bilir. Hiçbiri diğerinin işini yapmak zorunda değildir.

## IP: Adresleme ve yönlendirme

IP (İnternet Protokolü), verinin paketler hâlinde bir ağdan diğerine taşınmasını sağlar. Her cihazın bir IP adresi vardır ve yönlendiriciler bu adreslere bakarak paketi bir sonraki durağa gönderir.

IP tek başına teslimatı garanti etmez. Paketler kaybolabilir, gecikebilir ya da farklı sırayla ulaşabilir. Bu "en iyi çaba" yaklaşımı, ağı basit ve ölçeklenebilir tutar.

## TCP: Güvenilir bağlantı

TCP (İletim Kontrol Protokolü), IP'nin üzerinde çalışır ve güvenilirlik ekler. Kaybolan paketleri yeniden gönderir, sırayı düzeltir ve alıcının kapasitesine göre gönderim hızını ayarlar.

Bir TCP bağlantısı üç yönlü el sıkışma ile başlar: önce SYN, ardından SYN-ACK, en son ACK mesajı gönderilir. Bu adımlar, iki tarafın da iletişime hazır olduğunu doğrular.

## UDP: Hız ve sadelik

UDP (Kullanıcı Datagram Protokolü) de IP'nin üzerinde çalışır, ancak bağlantı kurmaz ve teslimatı doğrulamaz. Bu yüzden daha az ek yük taşır.

Canlı ses ve görüntü gibi uygulamalarda, geç gelen bir paketi beklemek yerine yolu devam ettirmek daha önemlidir. Bu durumda UDP, TCP'ye göre daha uygun bir seçim olabilir.

## Kendine sor

TCP ile UDP arasındaki farkı bir arkadaşına günlük bir örnekle nasıl anlatırdın? Hangi uygulamada güvenilirlik, hangisinde hız daha önemli?
`;

export async function hasSample(): Promise<boolean> {
  const db = await getDb();
  return (await db.getAll('sources')).some((s) => s.isSample && !s.deletedAt);
}

/** Örnek kaynağı ve ona bağlı örnek kart, kavram, ilişki ve görevi yükler. Hepsi `isSample` ile işaretlidir. */
export async function loadSample(): Promise<string> {
  const opts = { isSample: true };
  const source = await createTextSource('note', SAMPLE_TITLE, SAMPLE_MARKDOWN, { ...opts, sourceType: 'markdown' });
  const segs = await getSegments(source.id);
  const find = (needle: string) => segs.find((s) => s.text.includes(needle))!;
  const tcpSeg = find('üç yönlü el sıkışma');
  const ipSeg = find('paketler hâlinde');
  const udpSeg = find('bağlantı kurmaz');
  const ref = (seg: { id: string }) => [{ sourceId: source.id, segmentId: seg.id }];

  await markSample(await createSegmentAnnotation('highlight', tcpSeg, { color: 'definition' }));

  const ip = await createConcept({ label: 'IP', description: 'Paketleri adreslere göre yönlendiren protokol.', sourceRefs: ref(ipSeg) }, opts);
  const tcp = await createConcept({ label: 'TCP', description: 'IP üzerinde güvenilir, sıralı iletim.', sourceRefs: ref(tcpSeg) }, opts);
  const udp = await createConcept({ label: 'UDP', description: 'Bağlantısız, düşük ek yüklü iletim.', sourceRefs: ref(udpSeg) }, opts);
  const hs = await createConcept({ label: 'Üç yönlü el sıkışma', description: 'SYN → SYN-ACK → ACK.', sourceRefs: ref(tcpSeg) }, opts);
  await createRelation({ fromConceptId: ip.id, toConceptId: tcp.id, relationType: 'prerequisite_of', sourceRefs: ref(tcpSeg) }, opts);
  await createRelation({ fromConceptId: ip.id, toConceptId: udp.id, relationType: 'prerequisite_of', sourceRefs: ref(udpSeg) }, opts);
  await createRelation({ fromConceptId: hs.id, toConceptId: tcp.id, relationType: 'part_of', sourceRefs: ref(tcpSeg) }, opts);
  await createRelation({ fromConceptId: tcp.id, toConceptId: udp.id, relationType: 'contrasts_with' }, opts);

  await createCard({ prompt: 'TCP bağlantısı hangi üç mesajla başlar?', answer: 'SYN, SYN-ACK, ACK', sourceRefs: ref(tcpSeg), conceptIds: [hs.id, tcp.id] }, opts);
  await createCard({ prompt: 'IP teslimatı garanti eder mi?', answer: 'Hayır; "en iyi çaba" ile çalışır, paketler kaybolabilir veya sırası değişebilir.', sourceRefs: ref(find('en iyi çaba')), conceptIds: [ip.id] }, opts);
  await createCard({ prompt: 'Canlı görüntü aktarımında neden çoğu zaman UDP tercih edilir?', answer: 'Geç gelen paketi beklemek yerine akışı sürdürmek daha önemli olduğu için.', sourceRefs: ref(find('Canlı ses')), conceptIds: [udp.id] }, opts);

  await createTask({ prompt: 'Evindeki bir uygulamayı seç (görüntülü arama, dosya indirme...). TCP mi UDP mi kullanıyor olabilir? Gerekçeni yaz.', conceptIds: [tcp.id, udp.id], sourceRefs: ref(udpSeg) }, opts);
  return source.id;
}

async function markSample(a: { id: string }): Promise<void> {
  const db = await getDb();
  const rec = await db.get('annotations', a.id);
  if (rec) await db.put('annotations', { ...rec, isSample: true });
}

/** Tüm örnek içeriği kalıcı olarak kaldırır (yalnızca `isSample` kayıtları; kullanıcı verisine dokunmaz). */
export async function removeSample(): Promise<void> {
  const db = await getDb();
  const stores = [...DATA_STORES, 'files'] as const;
  const tx = db.transaction([...stores], 'readwrite');
  const sampleSources = new Set((await tx.objectStore('sources').getAll()).filter((s) => s.isSample).map((s) => s.id));
  const sampleConcepts = new Set((await tx.objectStore('concepts').getAll()).filter((c) => c.isSample).map((c) => c.id));
  for (const s of stores) {
    let c = await tx.objectStore(s).openCursor();
    while (c) {
      const v = c.value as { isSample?: boolean; sourceId?: string; fromConceptId?: string; toConceptId?: string };
      // Örnek kaynağa eklenen kullanıcı vurguları/okuma durumu ve örnek kavramlara bağlanan ilişkiler de
      // kaynakları kalmadığı için birlikte kaldırılır (yetim kayıt bırakılmaz).
      const orphan =
        (v.sourceId != null && sampleSources.has(v.sourceId) && (s === 'annotations' || s === 'readingStates' || s === 'segments' || s === 'files')) ||
        (s === 'relations' && (sampleConcepts.has(v.fromConceptId ?? '') || sampleConcepts.has(v.toConceptId ?? '')));
      if (v.isSample || orphan) await c.delete();
      c = await c.continue();
    }
  }
  await tx.done;
  emitChange([...stores]);
}

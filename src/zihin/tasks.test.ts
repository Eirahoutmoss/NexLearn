import { describe, expect, it } from 'vitest';
import { parseCards, parseReview, suggestCards, extractJson } from './tasks';
import { parseManifest } from './manifest';
import type { ModelProvider } from './engine';
import { isAppError } from '../domain/errors';

const SRC = 'TCP bağlantı yönelimli ve güvenilir bir protokoldür. UDP bağlantısızdır ve düşük gecikme sağlar.';

describe('Zihin görevleri', () => {
  it('kart önerileri doğrulanır: tekrarlar, boşlar ve kaynakta geçmeyen cevaplar atılır', () => {
    const raw = JSON.stringify({
      cards: [
        { question: 'TCP nasıl bir protokoldür?', answer: 'Bağlantı yönelimli ve güvenilir' },
        { question: 'TCP nasıl bir protokoldür?', answer: 'Güvenilir' },
        { question: 'UDP ne sağlar?', answer: 'Düşük gecikme' },
        { question: 'Kısa', answer: 'x' },
        { question: 'HTTP hangi portu kullanır?', answer: 'Seksen numaralı port' },
      ],
    });
    expect(parseCards(raw, SRC)).toEqual([
      { question: 'TCP nasıl bir protokoldür?', answer: 'Bağlantı yönelimli ve güvenilir' },
      { question: 'UDP ne sağlar?', answer: 'Düşük gecikme' },
    ]);
  });

  it('kod bloğu içindeki JSON ayıklanır; bozuk çıktı ZHN-006 verir', () => {
    expect(extractJson('İşte:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('önce {"a":2} sonra')).toEqual({ a: 2 });
    try {
      parseCards('saçma', SRC);
      throw new Error('hata bekleniyordu');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('ZHN-006');
    }
  });

  it('sağlayıcı arayüzüyle uçtan uca (sahte model) ve değerlendirme ayrıştırma', async () => {
    const fake: ModelProvider = { generate: async (msgs, opts) => (expect(opts?.jsonSchema).toBeTruthy(), expect(msgs[1].content).toContain('TCP'), '{"cards":[{"question":"UDP bağlantılı mıdır?","answer":"Hayır, bağlantısızdır"}]}') };
    expect(await suggestCards(fake, SRC, 'tr')).toHaveLength(1);
    expect(parseReview('{"verdict":"partial","missing":["UDP"],"wrong":[],"tip":"UDP’yi de anlat."}')).toEqual({ verdict: 'partial', missing: ['UDP'], wrong: [], tip: 'UDP’yi de anlat.' });
  });

  it('manifest yalnızca bu deponun sürüm adreslerini ve geçerli özetleri kabul eder', () => {
    const base = 'https://github.com/Eirahoutmoss/NexLearn/releases/download/zihin-v1/';
    const ok = {
      format: 'nexlearn-zihin',
      formatVersion: 1,
      runtime: { engine: 'wllama', version: '3.8.1', name: 'wllama.wasm', url: `${base}wllama.wasm`, size: 8763949, sha256: 'a'.repeat(64) },
      models: [{ id: 'qwen3-0-6b', label: 'Qwen3 0.6B', license: 'Apache-2.0', name: 'm.gguf', url: `${base}m.gguf`, size: 400, sha256: 'b'.repeat(64), contextLength: 4096, languages: ['tr', 'en'] }],
    };
    expect(parseManifest(JSON.stringify(ok)).models[0].id).toBe('qwen3-0-6b');
    for (const bad of [
      { ...ok, runtime: { ...ok.runtime, url: 'https://evil.example/wllama.wasm' } },
      { ...ok, models: [{ ...ok.models[0], sha256: 'zz' }] },
      { ...ok, models: [{ ...ok.models[0], name: '../m.gguf', url: `${base}../m.gguf` }] },
      { ...ok, format: 'x' },
    ]) {
      expect(() => parseManifest(JSON.stringify(bad))).toThrow();
    }
  });
});

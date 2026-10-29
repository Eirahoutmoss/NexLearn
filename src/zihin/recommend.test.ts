import { describe, expect, it } from 'vitest';
import { fitOf, recommend } from './recommend';
import type { ZihinModel } from './manifest';

const m = (id: string, tier: ZihinModel['tier'], gb: number, minRamGB: number): ZihinModel => ({
  id, tier, minRamGB, label: id, license: 'Apache-2.0', contextLength: 4096, languages: ['tr'], name: `${id}.gguf`, url: '', size: gb * 1024 ** 3, sha256: '',
});
const models = [m('strong', 'strong', 1.9, 6), m('light', 'light', 0.4, 2), m('balanced', 'balanced', 1.1, 4)];

describe('Zihin model önerisi', () => {
  it('güçlü cihaz + ekran kartı → güçlü model', () => {
    expect(recommend(models, { memoryGB: 8, cores: 8, webgpu: true }).id).toBe('strong');
  });
  it('ekran kartı yok → güçlü model "ağır" sayılır, dengeli önerilir', () => {
    const p = { memoryGB: 8, cores: 8, webgpu: false };
    expect(fitOf(models[0], p)).toBe('heavy');
    expect(recommend(models, p).id).toBe('balanced');
  });
  it('az bellek ya da az çekirdek → hafif model; bellek bilinmiyorsa temkinli', () => {
    expect(recommend(models, { memoryGB: 2, cores: 8, webgpu: true }).id).toBe('light');
    expect(recommend(models, { memoryGB: 8, cores: 2, webgpu: false }).id).toBe('light');
    expect(recommend(models, { memoryGB: null, cores: 4, webgpu: false }).id).toBe('balanced');
  });
});

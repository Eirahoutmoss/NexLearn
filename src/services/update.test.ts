import { describe, expect, it } from 'vitest';
import { compareVersions, parseRelease, pickLatest } from './update';

const base = 'https://github.com/Eirahoutmoss/NexLearn/releases/download/';
const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  body: 'notlar',
  html_url: `https://github.com/Eirahoutmoss/NexLearn/releases/tag/${tag}`,
  assets: [
    { name: `NexLearn_${tag.slice(1)}_x64-setup.exe`, browser_download_url: `${base}${tag}/NexLearn_${tag.slice(1)}_x64-setup.exe`, size: 10 },
    { name: `NexLearn_${tag.slice(1)}_x64_tr-TR.msi`, browser_download_url: `${base}${tag}/NexLearn_${tag.slice(1)}_x64_tr-TR.msi`, size: 10 },
    { name: `NexLearn_${tag.slice(1)}_android.apk`, browser_download_url: `${base}${tag}/NexLearn_${tag.slice(1)}_android.apk`, size: 10 },
    { name: 'SHA256SUMS.txt', browser_download_url: `${base}${tag}/SHA256SUMS.txt`, size: 1 },
    { name: 'evil.exe', browser_download_url: 'https://evil.example/evil.exe', size: 1 },
  ],
  ...extra,
});

describe('güncelleme', () => {
  it('sürüm karşılaştırma', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('x', '1.0.0')).toBe(0);
  });

  it('yalnızca bu deponun dosyaları; kurucu, MSI ve APK ayrı seçilir', () => {
    const r = parseRelease(rel('v0.2.0'));
    expect(r.installer?.name).toBe('NexLearn_0.2.0_x64-setup.exe');
    expect(r.msi?.name).toBe('NexLearn_0.2.0_x64_tr-TR.msi');
    expect(r.apk?.name).toBe('NexLearn_0.2.0_android.apk');
    expect(r.checksums?.name).toBe('SHA256SUMS.txt');
  });

  it('Zihin etiketi, taslak ve ön sürümler atlanır; en yüksek uygulama sürümü seçilir', () => {
    const list = [rel('zihin-v1' as string), rel('v0.3.0', { prerelease: true }), rel('v0.2.1'), rel('v0.10.0', { draft: true }), rel('v0.2.0')];
    expect(pickLatest(list).version).toBe('0.2.1');
  });
});

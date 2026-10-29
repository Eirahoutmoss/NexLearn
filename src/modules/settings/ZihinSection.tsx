import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Download, FileUp, Power, Trash2, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, ProgressBar, Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import type { ZihinManifest, ZihinModel } from '../../zihin/manifest';
import { useZihinState, startZihin, stopZihin } from '../../zihin/state';

function mb(n: number): string {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

/**
 * Zihin: isteğe bağlı, tamamen cihaz üzerinde çalışan küçük dil modeli.
 * Çekirdeğin parçası değildir; paket indirilmeden hiçbir yapay zekâ kodu ya da modeli yüklenmez.
 */
export function ZihinSection() {
  const { t } = useI18n();
  const { settings, updateSettings, toast, reportError, confirm } = useApp();
  const z = useZihinState();
  const [platform, setPlatform] = useState<'desktop' | 'android' | 'web' | null>(null);
  const [local, setLocal] = useState<{ runtime: boolean; model: { name: string; size: number } | null } | null>(null);
  const [manifest, setManifest] = useState<ZihinManifest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const s = await import('../../zihin/storage');
    setPlatform(await s.zihinPlatform());
    const l = await s.localStatus();
    setLocal({ runtime: Boolean(l.runtimeUrl), model: l.model ? { name: l.model.name, size: l.model.size } : null });
  }, []);

  useEffect(() => {
    void refresh().catch(() => setLocal({ runtime: false, model: null }));
  }, [refresh]);

  const loadList = async () => {
    setBusy('manifest');
    try {
      const s = await import('../../zihin/storage');
      setManifest(await s.fetchManifest());
    } catch (e) {
      reportError(e, 'zihin-manifest');
    } finally {
      setBusy(null);
    }
  };

  const download = async (m: ZihinModel) => {
    if (!manifest) return;
    setBusy(m.id);
    setProgress(0);
    try {
      const s = await import('../../zihin/storage');
      await stopZihin();
      await s.removeLocal();
      const total = manifest.runtime.size + m.size;
      await s.downloadFile(manifest.runtime, (f) => setProgress((f * manifest.runtime.size) / total));
      await s.downloadFile(m, (f) => setProgress((manifest.runtime.size + f * m.size) / total));
      toast(t('zihin.downloaded'), { tone: 'success' });
      await refresh();
    } catch (e) {
      reportError(e, 'zihin-download');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const pickFiles = async (list: FileList | null) => {
    // FileList canlıdır: girdi temizlenince boşalır, bu yüzden hemen kopyalanır.
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy('file');
    try {
      const s = await import('../../zihin/storage');
      await stopZihin();
      for (const f of files) await s.importLocalFile(f);
      toast(t('zihin.fileLoaded'), { tone: 'success' });
      await refresh();
    } catch (e) {
      reportError(e, 'zihin-file');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t('zihin.removeTitle'), message: t('zihin.removeText'), confirmLabel: t('common.delete') }))) return;
    await stopZihin();
    const s = await import('../../zihin/storage');
    await s.removeLocal();
    await updateSettings({ zihinEnabled: false });
    await refresh();
  };

  const ready = Boolean(local?.runtime && local.model);
  return (
    <Card className="settings-section" aria-labelledby="set-zihin">
      <h2 id="set-zihin" tabIndex={-1} className="card-title">
        {t('settings.section.zihin')}
      </h2>
      <p>{t('zihin.intro')}</p>
      <ul className="zihin-facts">
        <li>{t('zihin.fact1')}</li>
        <li>{t('zihin.fact2')}</li>
        <li>{t('zihin.fact3')}</li>
      </ul>

      <dl className="stat-dl">
        <div>
          <dt>{t('zihin.runtime')}</dt>
          <dd>{local?.runtime ? <Badge tone="success">{t('zihin.present')}</Badge> : <Badge>{t('zihin.absent')}</Badge>}</dd>
        </div>
        <div>
          <dt>{t('zihin.model')}</dt>
          <dd>{local?.model ? `${local.model.name} · ${mb(local.model.size)}` : <Badge>{t('zihin.absent')}</Badge>}</dd>
        </div>
        <div>
          <dt>{t('zihin.status')}</dt>
          <dd>{t(`zihin.phase.${z.phase}`)}</dd>
        </div>
      </dl>

      {busy && busy !== 'manifest' && busy !== 'file' && <ProgressBar value={progress * 100} label={t('zihin.downloading')} showValue />}
      {z.phase === 'loading' && <ProgressBar value={z.progress * 100} label={t('zihin.loadingModel')} />}

      <div className="row-wrap">
        {ready && z.phase !== 'ready' && (
          <Button variant="primary" icon={Brain} loading={z.phase === 'loading'} onClick={() => void startZihin().catch((e) => reportError(e, 'zihin-start'))}>
            {t('zihin.start')}
          </Button>
        )}
        {z.phase === 'ready' && (
          <Button icon={Power} onClick={() => void stopZihin()}>
            {t('zihin.stop')}
          </Button>
        )}
        {platform && platform !== 'web' && (
          <Button icon={RefreshCw} onClick={() => void loadList()} loading={busy === 'manifest'} disabled={Boolean(busy)}>
            {t('zihin.listPacks')}
          </Button>
        )}
        <Button icon={FileUp} onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
          {t('zihin.fromFile')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept=".gguf,.wasm"
          data-testid="zihin-file"
          onChange={(e) => {
            void pickFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {(local?.model || local?.runtime) && (
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()} disabled={Boolean(busy)}>
            {t('zihin.remove')}
          </Button>
        )}
      </div>
      <p className="field-hint">{platform === 'web' ? t('zihin.webHint') : t('zihin.fileHint')}</p>

      {manifest && (
        <ul className="mini-list zihin-models">
          {manifest.models.map((m) => (
            <li key={m.id} className="mini-item">
              <p className="mini-title">
                {m.label} <Badge>{mb(m.size)}</Badge>
              </p>
              <p className="mini-text">
                {t('zihin.modelMeta', { license: m.license || '—', langs: m.languages.join(', ') || '—' })}
              </p>
              <Button size="sm" variant="soft" icon={Download} onClick={() => void download(m)} loading={busy === m.id} disabled={Boolean(busy)}>
                {t('zihin.download', { size: mb(m.size + manifest.runtime.size) })}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Switch label={t('zihin.enable')} hint={t('zihin.enableHint')} checked={settings.zihinEnabled} onChange={(v) => void updateSettings({ zihinEnabled: v })} disabled={!ready} />
    </Card>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Download, FileUp, Power, Trash2, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, ProgressBar, Switch } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import type { ZihinManifest, ZihinModel } from '../../zihin/manifest';
import { useZihinState, startZihin, stopZihin, activateZihin } from '../../zihin/state';

function mb(n: number): string {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

/**
 * Zihin: isteğe bağlı, tamamen cihaz üzerinde çalışan küçük dil modeli.
 * Kullanıcı için tek düğme: "Zihin'i etkinleştir" → model indirilir, doğrulanır, başlatılır, öneriler açılır.
 * Elle dosya seçme yalnızca "Gelişmiş" altında (internetsiz kullanım için).
 */
export function ZihinSection() {
  const { t } = useI18n();
  const { settings, updateSettings, toast, reportError, confirm } = useApp();
  const z = useZihinState();
  const [platform, setPlatform] = useState<'desktop' | 'android' | 'web' | null>(null);
  const [model, setModel] = useState<{ name: string; size: number } | null | undefined>(undefined);
  const [manifest, setManifest] = useState<ZihinManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const s = await import('../../zihin/storage');
    setPlatform(await s.zihinPlatform());
    const l = await s.localStatus();
    setModel(l.model ? { name: l.model.name, size: l.model.size } : null);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setModel(null));
  }, [refresh]);

  const activate = async (m?: ZihinModel) => {
    if (platform === 'web' && !model) {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      if (model && !m) await startZihin();
      else await activateZihin(m);
      await updateSettings({ zihinEnabled: true });
      toast(t('zihin.activated'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'zihin-activate');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const pickFiles = async (list: FileList | null) => {
    // FileList canlıdır: girdi temizlenince boşalır, bu yüzden hemen kopyalanır.
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const s = await import('../../zihin/storage');
      await stopZihin();
      for (const f of files) await s.importLocalFile(f);
      await refresh();
      if (files.some((f) => /\.gguf$/i.test(f.name))) {
        await startZihin();
        await updateSettings({ zihinEnabled: true });
        toast(t('zihin.activated'), { tone: 'success' });
      } else toast(t('zihin.fileLoaded'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'zihin-file');
    } finally {
      setBusy(false);
    }
  };

  const loadList = async () => {
    try {
      const s = await import('../../zihin/storage');
      setManifest(await s.fetchManifest());
    } catch (e) {
      reportError(e, 'zihin-manifest');
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

  const working = busy || z.phase === 'downloading' || z.phase === 'loading';
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

      {model === undefined ? null : z.phase === 'ready' ? (
        <div className="zihin-status zihin-on" role="status">
          <Brain size={20} aria-hidden="true" />
          <span>
            <strong>{t('zihin.runningTitle')}</strong> {z.modelName}
          </span>
        </div>
      ) : working ? (
        <div className="stack-sm" role="status">
          <ProgressBar value={z.progress * 100} label={z.phase === 'downloading' ? t('zihin.downloading') : t('zihin.loadingModel')} showValue />
          <p className="field-hint">{z.phase === 'downloading' ? t('zihin.downloadingHint') : t('zihin.loadingHint')}</p>
        </div>
      ) : (
        <div className="stack-sm">
          <Button variant="primary" size="lg" icon={Brain} onClick={() => void activate()}>
            {model ? t('zihin.start') : t('zihin.activate')}
          </Button>
          <p className="field-hint">{model ? t('zihin.installedHint', { name: model.name, size: mb(model.size) }) : platform === 'web' ? t('zihin.webHint') : t('zihin.activateHint')}</p>
        </div>
      )}

      <Switch
        label={t('zihin.enable')}
        hint={t('zihin.enableHint')}
        checked={settings.zihinEnabled}
        disabled={working}
        onChange={(v) => {
          if (v && !model) void activate();
          else void updateSettings({ zihinEnabled: v });
        }}
      />

      <details className="zihin-advanced">
        <summary>{t('zihin.advanced')}</summary>
        <div className="stack-sm">
          <div className="row-wrap">
            {z.phase === 'ready' && (
              <Button size="sm" icon={Power} onClick={() => void stopZihin()}>
                {t('zihin.stop')}
              </Button>
            )}
            {platform && platform !== 'web' && (
              <Button size="sm" icon={RefreshCw} onClick={() => void loadList()} disabled={working}>
                {t('zihin.listPacks')}
              </Button>
            )}
            <Button size="sm" icon={FileUp} onClick={() => fileRef.current?.click()} disabled={working}>
              {t('zihin.fromFile')}
            </Button>
            {model && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void remove()} disabled={working}>
                {t('zihin.remove')}
              </Button>
            )}
          </div>
          <p className="field-hint">{t('zihin.fileHint')}</p>
          {manifest && (
            <ul className="mini-list zihin-models">
              {manifest.models.map((m) => (
                <li key={m.id} className="mini-item">
                  <p className="mini-title">
                    {m.label} <Badge>{mb(m.size)}</Badge>
                  </p>
                  <p className="mini-text">{t('zihin.modelMeta', { license: m.license || '—', langs: m.languages.join(', ') || '—' })}</p>
                  <Button size="sm" variant="soft" icon={Download} onClick={() => void activate(m)} disabled={working || model?.name === m.name}>
                    {model?.name === m.name ? t('zihin.present') : t('zihin.download', { size: mb(m.size) })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
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
    </Card>
  );
}

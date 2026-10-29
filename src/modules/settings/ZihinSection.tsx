import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { deviceProfile, fitOf, recommend } from '../../zihin/recommend';
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
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const profile = useMemo(() => deviceProfile(), []);

  const refresh = useCallback(async () => {
    const s = await import('../../zihin/storage');
    setPlatform(await s.zihinPlatform());
    const l = await s.localStatus();
    setModel(l.model ? { name: l.model.name, size: l.model.size } : null);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setModel(null));
  }, [refresh]);

  /** Model seçim penceresini açar: liste bu düğmeye basılınca indirilir (kendiliğinden ağ isteği yok). */
  const openChooser = async () => {
    if (platform === 'web') {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    try {
      const s = await import('../../zihin/storage');
      const mf = manifest ?? (await s.fetchManifest());
      setManifest(mf);
      const rec = recommend(mf.models, profile);
      setChosen(model && mf.models.some((x) => x.name === model.name) ? mf.models.find((x) => x.name === model.name)!.id : rec.id);
      setChooserOpen(true);
    } catch (e) {
      reportError(e, 'zihin-manifest');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (m?: ZihinModel) => {
    if (!model && !m) {
      await openChooser();
      return;
    }
    setChooserOpen(false);
    setBusy(true);
    try {
      if (model && (!m || m.name === model.name)) await startZihin();
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
              <Button size="sm" icon={RefreshCw} onClick={() => void openChooser()} disabled={working}>
                {t('zihin.chooseModel')}
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
        </div>
      </details>
      <Modal
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        title={t('zihin.chooserTitle')}
        description={t('zihin.chooserIntro')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setChooserOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              icon={Download}
              disabled={!chosen}
              onClick={() => {
                const m = manifest?.models.find((x) => x.id === chosen);
                if (m) void activate(m);
              }}
            >
              {manifest?.models.find((x) => x.id === chosen)?.name === model?.name ? t('zihin.start') : t('zihin.downloadAndStart')}
            </Button>
          </>
        }
      >
        {manifest && (
          <fieldset className="choice-group">
            <legend className="sr-only">{t('zihin.chooserTitle')}</legend>
            <p className="field-hint">{t('zihin.deviceLine', { mem: profile.memoryGB ? (profile.memoryGB >= 8 ? '8+' : String(profile.memoryGB)) : '?', gpu: profile.webgpu ? t('zihin.gpuYes') : t('zihin.gpuNo') })}</p>
            {[...manifest.models]
              .sort((a, b) => a.size - b.size)
              .map((m) => {
                const rec = recommend(manifest.models, profile).id === m.id;
                const fit = fitOf(m, profile);
                return (
                  <label key={m.id} className={`choice zihin-choice ${chosen === m.id ? 'selected' : ''}`}>
                    <input type="radio" name="zihin-model" checked={chosen === m.id} onChange={() => setChosen(m.id)} />
                    <span>
                      <span className="zihin-choice-head">
                        <strong>{t(`zihin.tier.${m.tier}.title`)}</strong> · {m.label} <Badge>{mb(m.size)}</Badge>
                        {rec && <Badge tone="success">{t('zihin.recommended')}</Badge>}
                        {fit === 'heavy' && <Badge tone="warning">{t('zihin.heavy')}</Badge>}
                        {model?.name === m.name && <Badge tone="accent">{t('zihin.installed')}</Badge>}
                      </span>
                      <span className="field-hint">{t(`zihin.tier.${m.tier}.why`)}</span>
                      <span className="field-hint">{t('zihin.modelFacts', { ram: m.minRamGB, license: m.license || '—', langs: m.languages.join(', ') || '—' })}</span>
                    </span>
                  </label>
                );
              })}
          </fieldset>
        )}
      </Modal>
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

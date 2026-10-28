import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';
import { Button } from '../components/ui';
import { isTauri } from '../services/update';

/**
 * Web/PWA: service worker yeni sürümü indirdiğinde kullanıcıya sorar (otomatik yenileme yapılmaz).
 * Masaüstünde (Tauri) güncellemeler Ayarlar > Hakkında'daki düğmeyle denetlenir.
 */
export function UpdateBanner() {
  const { t } = useI18n();
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null);

  useEffect(() => {
    if (isTauri() || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          if (!cancelled) setUpdate(() => updateSW);
        },
      });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;
  return (
    <div className="update-banner" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <span>{t('update.swReady')}</span>
      <Button size="sm" variant="primary" onClick={() => void update(true)}>
        {t('update.reload')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setUpdate(null)}>
        {t('common.later')}
      </Button>
    </div>
  );
}

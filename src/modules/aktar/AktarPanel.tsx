import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, Check, X, Send, Timer, Power } from 'lucide-react';
import { Button, IconButton } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import {
  aktarStatus,
  extendAktar,
  offerAktar,
  onAktarEvents,
  pendingAktar,
  qrDataUrl,
  rejectAktar,
  startAktar,
  stopAktar,
  takeAktar,
  unofferAktar,
  type AktarIncoming,
  type AktarSession,
} from '../../services/aktar';
import { createBackup } from '../../services/backup/backup';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * NexAktar: telefonun kamerasıyla QR kodu okut, açılan sayfadan dosya gönder.
 * Gelen her dosya burada onay bekler; onaylananlar `onAccept` ile normal içe aktarma akışına girer.
 */
export function AktarPanel({ onAccept }: { onAccept: (files: File[]) => void }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [session, setSession] = useState<AktarSession | null>(null);
  const [pending, setPending] = useState<AktarIncoming[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const s = await aktarStatus().catch(() => null);
    setSession(s);
    setRemaining(s?.remainingSecs ?? 0);
    setPending(s ? await pendingAktar().catch(() => []) : []);
  }, []);

  useEffect(() => {
    void refresh();
    let off: (() => void) | undefined;
    void onAktarEvents({
      incoming: (i) => setPending((p) => (p.some((x) => x.id === i.id) ? p : [...p, i])),
      stopped: (reason) => {
        setSession(null);
        setPending([]);
        if (reason === 'abuse') toast(t('aktar.abuse'), { tone: 'error' });
      },
    }).then((f) => (off = f));
    return () => off?.();
  }, [refresh, t, toast]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (session && remaining === 0) void refresh();
  }, [remaining, session, refresh]);

  const start = async () => {
    setBusy(true);
    try {
      const s = await startAktar();
      setSession(s);
      setRemaining(s.remainingSecs);
    } catch (e) {
      reportError(e, 'aktar-start');
    } finally {
      setBusy(false);
    }
  };

  const accept = async (items: AktarIncoming[]) => {
    try {
      const files: File[] = [];
      for (const i of items) files.push(await takeAktar(i));
      setPending((p) => p.filter((x) => !items.some((i) => i.id === x.id)));
      onAccept(files);
    } catch (e) {
      reportError(e, 'aktar-take');
      void refresh();
    }
  };

  const reject = async (i: AktarIncoming) => {
    await rejectAktar(i.id).catch((e) => reportError(e, 'aktar-reject'));
    setPending((p) => p.filter((x) => x.id !== i.id));
  };

  const offerFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      let out = session?.outgoing ?? [];
      for (const f of Array.from(files)) out = await offerAktar(f.name, new Uint8Array(await f.arrayBuffer()));
      setSession((s) => (s ? { ...s, outgoing: out } : s));
      toast(t('aktar.offered'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'aktar-offer');
    }
  };

  const offerBackup = async () => {
    setBusy(true);
    try {
      const b = await createBackup({ includeOriginals: true });
      const out = await offerAktar(b.fileName, b.bytes);
      setSession((s) => (s ? { ...s, outgoing: out } : s));
      toast(t('aktar.offered'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'aktar-offer-backup');
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <section className="aktar" aria-labelledby="aktar-h">
        <h3 id="aktar-h" className="section-mini">
          <Smartphone size={18} aria-hidden="true" /> {t('aktar.title')}
        </h3>
        <p className="field-hint">{t('aktar.intro')}</p>
        <Button icon={Smartphone} onClick={() => void start()} loading={busy}>
          {t('aktar.start')}
        </Button>
      </section>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  return (
    <section className="aktar aktar-live" aria-labelledby="aktar-h">
      <h3 id="aktar-h" className="section-mini">
        <Smartphone size={18} aria-hidden="true" /> {t('aktar.title')}
      </h3>
      <div className="aktar-grid">
        <img className="aktar-qr" src={qrDataUrl(session.qrSvg)} alt={t('aktar.qrAlt')} width={200} height={200} />
        <div className="stack-sm">
          <ol className="aktar-steps">
            <li>{t('aktar.step1')}</li>
            <li>{t('aktar.step2')}</li>
            <li>{t('aktar.step3')}</li>
          </ol>
          <p className="field-hint">
            {t('aktar.address')}: <code className="aktar-url">{session.url.replace(/\?t=.*/, '')}</code>
          </p>
          <p className="aktar-timer" aria-live="off">
            <Timer size={16} aria-hidden="true" /> {t('aktar.remaining', { time: `${mins}:${secs}` })}
          </p>
          <div className="row-wrap">
            <Button size="sm" variant="ghost" onClick={() => void extendAktar().then(refresh).catch((e) => reportError(e, 'aktar-extend'))}>
              {t('aktar.extend')}
            </Button>
            <Button size="sm" variant="ghost" icon={Power} onClick={() => void stopAktar().then(refresh)}>
              {t('aktar.stop')}
            </Button>
          </div>
        </div>
      </div>

      <div className="aktar-incoming" aria-live="polite">
        <h4 className="section-mini">{t('aktar.incoming')}</h4>
        {pending.length === 0 ? (
          <p className="muted">{t('aktar.waiting')}</p>
        ) : (
          <>
            <ul className="mini-list">
              {pending.map((i) => (
                <li key={i.id} className="aktar-item">
                  <span className="aktar-name">{i.name}</span>
                  <span className="muted">{formatBytes(i.size)}</span>
                  <IconButton icon={Check} size="sm" label={t('aktar.accept', { name: i.name })} onClick={() => void accept([i])} />
                  <IconButton icon={X} size="sm" label={t('aktar.reject', { name: i.name })} onClick={() => void reject(i)} />
                </li>
              ))}
            </ul>
            {pending.length > 1 && (
              <Button size="sm" variant="primary" icon={Check} onClick={() => void accept(pending)}>
                {t('aktar.acceptAll', { n: pending.length })}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="aktar-outgoing">
        <h4 className="section-mini">{t('aktar.toPhone')}</h4>
        <p className="field-hint">{t('aktar.toPhoneHint')}</p>
        <div className="row-wrap">
          <Button size="sm" icon={Send} onClick={() => pickRef.current?.click()}>
            {t('aktar.pickFile')}
          </Button>
          <Button size="sm" onClick={() => void offerBackup()} loading={busy}>
            {t('aktar.sendBackup')}
          </Button>
          <input
            ref={pickRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void offerFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {session.outgoing.length > 0 && (
          <ul className="mini-list">
            {session.outgoing.map((o) => (
              <li key={o.id} className="aktar-item">
                <span className="aktar-name">{o.name}</span>
                <span className="muted">{formatBytes(o.size)}</span>
                <IconButton
                  icon={X}
                  size="sm"
                  label={t('aktar.unoffer', { name: o.name })}
                  onClick={() =>
                    void unofferAktar(o.id)
                      .then((out) => setSession((s) => (s ? { ...s, outgoing: out } : s)))
                      .catch((e) => reportError(e, 'aktar-unoffer'))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="field-hint">{t('aktar.security')}</p>
    </section>
  );
}

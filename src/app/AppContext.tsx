import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { toAppError, logError, type AppError } from '../domain/errors';
import type { Settings } from '../domain/types';
import { useI18n } from '../i18n';
import { Button, IconButton } from '../components/ui';
import { Modal } from '../components/Modal';

export type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Kullanıcının yazması gereken onay metni (kalıcı silme gibi işlemler için). */
  typeToConfirm?: string;
}

interface AppApi {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toast: (message: string, opts?: { tone?: ToastTone; action?: Toast['action']; detail?: string }) => void;
  reportError: (e: unknown, context: string) => AppError;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider eksik');
  return v;
}

export function AppProvider({ settings, onUpdateSettings, children }: { settings: Settings; onUpdateSettings: (p: Partial<Settings>) => Promise<void>; children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const toast = useCallback<AppApi['toast']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { id, tone: opts.tone ?? 'info', message, action: opts.action, detail: opts.detail }]);
      const ms = opts.tone === 'error' ? 10000 : opts.action ? 8000 : 5000;
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const reportError = useCallback<AppApi['reportError']>(
    (e, context) => {
      const err = toAppError(e);
      logError(err, context);
      const title = t(`errors.${err.code}.title`);
      const action = t(`errors.${err.code}.action`);
      toast(`${title} ${action}`, { tone: 'error', detail: `${err.code}${err.details ? ` · ${err.details}` : ''}` });
      return err;
    },
    [t, toast],
  );

  const confirm = useCallback<AppApi['confirm']>((opts) => {
    setTyped('');
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));
  }, []);

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  const api = useMemo<AppApi>(() => ({ settings, updateSettings: onUpdateSettings, toast, reportError, confirm }), [settings, onUpdateSettings, toast, reportError, confirm]);

  const canConfirm = !confirmState?.typeToConfirm || typed.trim() === confirmState.typeToConfirm;

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label={t('common.notifications')} aria-live="polite">
        {toasts.map((ts) => (
          <div key={ts.id} className={`toast toast-${ts.tone}`} role={ts.tone === 'error' ? 'alert' : 'status'}>
            {ts.tone === 'success' ? <CheckCircle2 size={18} aria-hidden="true" /> : ts.tone === 'error' ? <AlertTriangle size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
            <div className="toast-body">
              <p>{ts.message}</p>
              {ts.detail && (
                <details className="toast-detail">
                  <summary>{t('common.details')}</summary>
                  <code>{ts.detail}</code>
                </details>
              )}
            </div>
            {ts.action && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  ts.action!.run();
                  dismiss(ts.id);
                }}
              >
                {ts.action.label}
              </Button>
            )}
            <IconButton icon={X} size="sm" label={t('common.close')} onClick={() => dismiss(ts.id)} />
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(confirmState)}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => closeConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} disabled={!canConfirm} onClick={() => closeConfirm(true)} data-autofocus={confirmState?.typeToConfirm ? undefined : true}>
              {confirmState?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="confirm-message">{confirmState?.message}</p>
        {confirmState?.typeToConfirm && (
          <div className="field">
            <label className="field-label" htmlFor="confirm-type">
              {t('common.typeToConfirm', { text: confirmState.typeToConfirm })}
            </label>
            <input id="confirm-type" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

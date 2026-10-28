import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';
import { useI18n } from '../i18n';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** İlk odaklanacak öğe seçicisi (yoksa ilk form alanı). */
  initialFocus?: string;
}

/**
 * Yerel <dialog> üzerine modal: odak hapsi, Esc ile kapanma ve arka planın etkisizleşmesi tarayıcıdan gelir.
 * Kapanınca odak, açan öğeye geri döner.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', initialFocus }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
      requestAnimationFrame(() => {
        const target =
          (initialFocus && d.querySelector<HTMLElement>(initialFocus)) ||
          d.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ||
          d.querySelector<HTMLElement>('.modal-body input:not([type=hidden]):not([hidden]), .modal-body textarea, .modal-body select, .modal-body button');
        target?.focus();
      });
    } else if (!open && d.open) {
      d.close();
      returnTo.current?.focus?.();
    }
  }, [open, initialFocus]);

  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-inner">
          <header className="modal-header">
            <div>
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
              {description && (
                <p id={descId} className="modal-desc">
                  {description}
                </p>
              )}
            </div>
            <IconButton icon={X} label={t('common.close')} onClick={onClose} />
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

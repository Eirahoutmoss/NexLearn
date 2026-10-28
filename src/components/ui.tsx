import {
  forwardRef,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, children, className = '', type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon ? <Icon size={size === 'sm' ? 16 : 18} aria-hidden="true" /> : null}
      {children != null && <span>{children}</span>}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Erişilebilir ad zorunludur; aynı zamanda araç ipucu olarak gösterilir. */
  label: string;
  variant?: 'ghost' | 'secondary' | 'soft' | 'primary';
  size?: 'sm' | 'md';
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', pressed, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`icon-btn icon-btn-${variant} icon-btn-${size} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 20} aria-hidden="true" />
    </button>
  );
});

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  children: ReactNode;
  optional?: string;
}

function FieldShell({ label, hint, error, id, children, optional }: FieldShellProps) {
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="field-optional"> ({optional})</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, hint, error, optional, id, className = '', ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} optional={optional}>
      <input ref={ref} id={fid} className={`input ${className}`} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy(fid, hint, error)} {...rest} />
    </FieldShell>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, hint, error, optional, id, className = '', ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} optional={optional}>
      <textarea ref={ref} id={fid} className={`input textarea ${className}`} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy(fid, hint, error)} {...rest} />
    </FieldShell>
  );
});

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, hint, options, id, className = '', ...rest }: SelectFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} id={fid}>
      <select id={fid} className={`input select ${className}`} aria-describedby={describedBy(fid, hint)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Switch({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-text">
        <label htmlFor={id} className="switch-label">
          {label}
        </label>
        {hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, label, showValue = false }: { value: number; label: string; showValue?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress-wrap">
      <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <div className="progress-fill" style={{ width: `${v}%` }} />
      </div>
      {showValue && <span className="progress-value">%{v}</span>}
    </div>
  );
}

/** Dairesel ilerleme; değer metin olarak da sunulur (yalnızca görsele dayanmaz). */
export function Ring({ value, max, size = 120, label, children }: { value: number; max: number; size?: number; label: string; children?: ReactNode }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        <Icon size={28} />
      </div>
      <h2 className="empty-title">{title}</h2>
      {text && <p className="empty-text">{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

/** Erişilebilir sekmeler (WAI-ARIA tabs): ok tuşlarıyla gezinme, Home/End. */
export function Tabs({ items, value, onChange, label, idPrefix }: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    else return;
    e.preventDefault();
    refs.current[n]?.focus();
    onChange(items[n].id);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          id={`${idPrefix}-tab-${it.id}`}
          aria-selected={value === it.id}
          aria-controls={`${idPrefix}-panel-${it.id}`}
          tabIndex={value === it.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {it.label}
          {it.count != null && <span className="tab-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children, className = '' }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className={className} tabIndex={0}>
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Card({ children, className = '', as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li'; 'aria-labelledby'?: string }) {
  return (
    <As className={`card ${className}`} {...rest}>
      {children}
    </As>
  );
}

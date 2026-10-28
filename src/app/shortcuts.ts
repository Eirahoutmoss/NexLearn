import { useEffect, useRef } from 'react';

/** Yazı alanındayken tek tuşlu kısayollar devre dışıdır. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(type);
  }
  return false;
}

/** Tuş olayını "Ctrl+K", "Shift+J", "Space", "1" biçiminde adlandırır. */
export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && e.key.length > 1) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toLocaleUpperCase('en-US');
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return '';
  parts.push(key);
  return parts.join('+');
}

export function matchesCombo(e: KeyboardEvent, spec: string): boolean {
  if (!spec || spec.includes(' ')) return false;
  return eventToCombo(e).toUpperCase() === spec.toUpperCase();
}

/**
 * Kısayol dinleyicisi. `bindings`: kısayol metni → işlev. "G H" gibi iki adımlı diziler desteklenir.
 * `allowInInputs` yalnızca Ctrl'li kombinasyonlar için anlamlıdır.
 */
export function useShortcuts(bindings: Record<string, (e: KeyboardEvent) => void>, enabled = true): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  const pending = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const combo = eventToCombo(e);
      if (!combo) return;
      const typing = isTypingTarget(e.target);
      if (typing && !combo.startsWith('Ctrl')) return;
      // Açık bir modal varken yalnızca modalın kendisi tuşları işler.
      if (document.querySelector('dialog[open]') && !combo.startsWith('Ctrl')) return;
      const now = Date.now();
      if (pending.current && now - pending.current.at < 1200) {
        const seq = `${pending.current.key} ${combo}`;
        pending.current = null;
        const fn = Object.entries(ref.current).find(([k]) => k.toUpperCase() === seq.toUpperCase())?.[1];
        if (fn) {
          e.preventDefault();
          fn(e);
          return;
        }
      }
      for (const [spec, fn] of Object.entries(ref.current)) {
        if (spec.includes(' ')) {
          if (spec.split(' ')[0].toUpperCase() === combo.toUpperCase()) {
            pending.current = { key: combo, at: now };
          }
          continue;
        }
        if (matchesCombo(e, spec)) {
          e.preventDefault();
          fn(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return { path: clean, segments: clean.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

/** Basit hash yönlendirici: masaüstü (Tauri), PWA ve dosya sisteminden açılışta sorunsuz çalışır. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (opts.replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export const routes = {
  home: () => '/',
  library: () => '/library',
  read: (sourceId: string, segmentId?: string) => `/read/${encodeURIComponent(sourceId)}${segmentId ? `?seg=${encodeURIComponent(segmentId)}` : ''}`,
  review: (tab?: 'today' | 'cards' | 'history') => `/review${tab && tab !== 'today' ? `?tab=${tab}` : ''}`,
  card: (id: string) => `/review?tab=cards&card=${encodeURIComponent(id)}`,
  map: (conceptId?: string) => `/map${conceptId ? `?concept=${encodeURIComponent(conceptId)}` : ''}`,
  notes: () => '/notes',
  tasks: () => '/tasks',
  progress: () => '/progress',
  settings: (section?: string) => `/settings${section ? `?section=${section}` : ''}`,
  help: () => '/help',
};

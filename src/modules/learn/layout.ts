/** Deterministik kuvvet yönelimli yerleşim (Fruchterman–Reingold). Aynı girdi → aynı çıktı. */

export interface LayoutNode {
  id: string;
  x?: number;
  y?: number;
  fixed?: boolean;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function forceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: { width?: number; height?: number; iterations?: number } = {},
): Map<string, { x: number; y: number }> {
  const W = opts.width ?? 1200;
  const H = opts.height ?? 800;
  const n = nodes.length;
  const out = new Map<string, { x: number; y: number }>();
  if (n === 0) return out;
  const iterations = opts.iterations ?? (n > 150 ? 120 : 250);
  const k = Math.min(200, Math.sqrt((W * H) / n) * 0.75);
  const pos = nodes.map((nd, i) => {
    if (nd.x != null && nd.y != null) return { x: nd.x, y: nd.y };
    const a = hash(nd.id) * Math.PI * 2 + i * 0.001;
    const r = Math.min(W, H) * (0.2 + 0.25 * hash(`${nd.id}r`));
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
  });
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  const links = edges.map((e) => [index.get(e.from), index.get(e.to)]).filter((p): p is [number, number] => p[0] != null && p[1] != null && p[0] !== p[1]);
  const disp = pos.map(() => ({ x: 0, y: 0 }));
  let temp = W / 8;
  for (let it = 0; it < iterations; it++) {
    for (const d of disp) {
      d.x = 0;
      d.y = 0;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.01 * (i - j);
          dy = 0.01;
          dist = 0.015;
        }
        const f = (k * k) / dist;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        disp[i].x += fx;
        disp[i].y += fy;
        disp[j].x -= fx;
        disp[j].y -= fy;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const f = (dist * dist) / k;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      disp[a].x -= fx;
      disp[a].y -= fy;
      disp[b].x += fx;
      disp[b].y += fy;
    }
    for (let i = 0; i < n; i++) {
      if (nodes[i].fixed) continue;
      // Merkeze hafif çekim: bağlantısız düğümler dağılmasın.
      disp[i].x += (W / 2 - pos[i].x) * 0.02 * k / 10;
      disp[i].y += (H / 2 - pos[i].y) * 0.02 * k / 10;
      const d = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
      pos[i].x = Math.min(W - 60, Math.max(60, pos[i].x));
      pos[i].y = Math.min(H - 40, Math.max(40, pos[i].y));
    }
    temp = Math.max(1, temp * 0.97);
  }
  nodes.forEach((nd, i) => out.set(nd.id, { x: Math.round(pos[i].x), y: Math.round(pos[i].y) }));
  return out;
}

/** Klavye gezinmesi: verilen yöndeki en yakın düğüm. */
export function nearestInDirection(
  from: { x: number; y: number },
  candidates: { id: string; x: number; y: number }[],
  dir: 'up' | 'down' | 'left' | 'right',
): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const c of candidates) {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const primary = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (primary <= 1) continue;
    const score = primary + secondary * 2;
    if (!best || score < best.score) best = { id: c.id, score };
  }
  return best?.id;
}

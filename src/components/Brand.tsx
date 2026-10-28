import { useId } from 'react';

/** NexLearn logosu: güneşe doğru açılan beş yaprak (oku · anla · ilişkilendir · hatırla · uygula). */
export function LogoMark({ size = 36, title }: { size?: number; title?: string }) {
  const leaf = 'M0 0 C 15 -20, 15 -50, 0 -72 C -15 -50, -15 -20, 0 0 Z';
  const leaves: [number, string][] = [
    [-62, '#2E9E8F'],
    [-31, '#5DB85A'],
    [0, '#2F6FD6'],
    [31, '#F2A03D'],
    [62, '#E4573F'],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="50" cy="20" r="12" fill="#F6B23C" />
      <g transform="translate(50 94)">
        {leaves.map(([a, c]) => (
          <path key={a} d={leaf} fill={c} opacity="0.93" transform={`rotate(${a})`} />
        ))}
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark" aria-label="NexLearn">
      <span className="wordmark-nex" aria-hidden="true">
        Nex
      </span>
      <span className="wordmark-learn" aria-hidden="true">
        Learn
      </span>
    </span>
  );
}

/** Temaya göre renklenen sakin manzara (tüm renkler CSS token'larından gelir; dış görsel kullanılmaz). */
export function Landscape({ className = '' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const sky = `nl-sky-${uid}`;
  const glow = `nl-glow-${uid}`;
  return (
    <svg className={`landscape ${className}`} viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--land-sky1)" />
          <stop offset="1" stopColor="var(--land-sky2)" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--land-sun)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--land-sun)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="300" fill={`url(#${sky})`} />
      <g className="landscape-stars" fill="var(--land-sun)">
        {[
          [80, 40], [150, 90], [230, 30], [320, 70], [420, 25], [610, 50], [700, 95], [760, 30], [520, 85], [380, 110],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" opacity="0.8" />
        ))}
      </g>
      <circle cx="560" cy="120" r="90" fill={`url(#${glow})`} />
      <circle cx="560" cy="120" r="34" fill="var(--land-sun)" />
      <path d="M0 190 L90 150 L170 175 L260 120 L350 165 L430 130 L520 170 L610 115 L700 160 L800 135 L800 300 L0 300 Z" fill="var(--land1)" />
      <path d="M0 215 L110 175 L200 205 L300 160 L390 200 L480 170 L590 210 L690 175 L800 200 L800 300 L0 300 Z" fill="var(--land2)" />
      <path d="M0 245 C 120 215, 220 230, 330 238 C 450 246, 560 214, 680 226 C 740 232, 780 240, 800 236 L800 300 L0 300 Z" fill="var(--land3)" />
      <path d="M0 272 C 150 252, 300 262, 420 268 C 560 275, 680 255, 800 262 L800 300 L0 300 Z" fill="var(--land4)" />
      <g fill="var(--land4)">
        <path d="M120 262 l10 -34 l10 34 z" />
        <path d="M138 264 l8 -26 l8 26 z" />
        <path d="M690 252 l11 -38 l11 38 z" />
        <path d="M712 256 l8 -26 l8 26 z" />
      </g>
    </svg>
  );
}

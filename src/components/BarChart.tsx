import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * Tek seriden oluşan, sade sütun grafiği. Okuma/tekrar/kavram gibi farklı ölçüler asla tek eksende
 * birleştirilmez; her biri kendi küçük grafiğinde gösterilir (small multiples).
 * Erişilebilirlik: başlık seriyi adlandırır, her sütunda üzerine gelince ipucu, ayrıca tablo görünümü.
 */
export function BarChart({
  title,
  values,
  labels,
  fullLabels,
  color,
  unit,
  format = (v) => String(v),
}: {
  title: string;
  values: number[];
  labels: string[];
  fullLabels: string[];
  color: string;
  unit: string;
  format?: (v: number) => string;
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  // SVG koordinatları gerçek genişliğe eşitlenir: eksen yazıları her boyutta okunur kalır.
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 170;
  const padL = 34;
  const padB = 24;
  const padT = 12;
  const max = Math.max(1, ...values);
  const niceMax = niceCeil(max);
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const slot = plotW / values.length;
  const barW = Math.max(4, Math.min(22, slot - 2));
  const ticks = [0, niceMax / 2, niceMax];
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="chart-title">
        {title}
        <span className="chart-total">
          {t('progress.total')}: {format(total)} {unit}
        </span>
      </figcaption>
      <div className="chart-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('progress.chartAria', { title, total: format(total), unit })} onPointerLeave={() => setHover(null)}>
          {ticks.map((tk) => {
            const y = padT + plotH - (tk / niceMax) * plotH;
            return (
              <g key={tk} className="chart-grid">
                <line x1={padL} x2={W - 8} y1={y} y2={y} />
                <text x={padL - 6} y={y + 4} textAnchor="end">
                  {format(tk)}
                </text>
              </g>
            );
          })}
          {values.map((v, i) => {
            const h = (v / niceMax) * plotH;
            const x = padL + i * slot + (slot - barW) / 2;
            const y = padT + plotH - h;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={labels[i] + i}>
                {v > 0 && (
                  <path
                    d={`M${x} ${padT + plotH} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + barW - r} Q${x + barW} ${y} ${x + barW} ${y + r} V${padT + plotH} Z`}
                    fill={color}
                    opacity={hover == null || hover === i ? 1 : 0.45}
                  />
                )}
                {/* Geniş, görünmez isabet alanı: ince sütunlarda da ipucu kolay açılır. */}
                <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} />
                {(values.length - 1 - i) % Math.ceil(values.length / 7) === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="chart-axis">
                    {labels[i]}
                  </text>
                )}
              </g>
            );
          })}
          <line className="chart-baseline" x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} />
        </svg>
        {hover != null && (
          <div className="chart-tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }} role="status">
            <span className="chart-tip-label">{fullLabels[hover]}</span>
            <span className="chart-tip-value">
              <span className="chart-tip-swatch" style={{ background: color }} aria-hidden="true" />
              {format(values[hover])} {unit}
            </span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>{t('progress.showTable')}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('progress.day')}</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={fullLabels[i]}>
                <th scope="row">{fullLabels[i]}</th>
                <td>{format(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceCeil(v: number): number {
  if (v <= 5) return Math.max(2, Math.ceil(v / 2) * 2);
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * A small log-scaled area sparkline; a marker shows the shown month unless it is the latest, where it would read
 * as a spike. The latest month is still running, so its segment is dashed and lighter: a partial count is not a drop.
 */
export function sparkline(values: number[], current: number, label: string): SVGSVGElement {
  const w = 300;
  const h = 44;
  const scaled = values.map((v) => Math.log10(1 + v));
  const max = Math.max(...scaled, 1e-9);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * w : 0);
  const y = (v: number) => h - 3 - (v / max) * (h - 8);
  const pts = scaled.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${label}; the latest month is still running`);
  const el = (tag: string, attrs: Record<string, string>) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const split = Math.max(0, pts.length - 2);
  const done = pts.slice(0, split + 1);
  const running = pts.slice(split);
  svg.append(
    el('polygon', { points: `${x(0)},${h} ${done.join(' ')} ${x(split)},${h}`, class: 'spark-area' }),
    el('polyline', { points: done.join(' '), class: 'spark-line' }),
  );
  if (running.length > 1)
    svg.append(
      el('polygon', { points: `${x(split)},${h} ${running.join(' ')} ${w},${h}`, class: 'spark-area spark-running' }),
      el('polyline', { points: running.join(' '), class: 'spark-line spark-running' }),
    );
  if (current < values.length - 1) svg.append(el('line', { x1: String(x(current)), x2: String(x(current)), y1: '0', y2: String(h), class: 'spark-now' }));
  return svg;
}

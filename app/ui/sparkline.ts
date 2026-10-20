const NS = 'http://www.w3.org/2000/svg';

/** A small log-scaled area sparkline; a marker shows the shown month unless it is the latest, where it would read as a spike. */
export function sparkline(values: number[], current: number, label: string): SVGSVGElement {
  const w = 300;
  const h = 44;
  const scaled = values.map((v) => Math.log10(1 + v));
  const max = Math.max(...scaled, 1e-9);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * w : 0);
  const y = (v: number) => h - 3 - (v / max) * (h - 8);
  const points = scaled.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const area = document.createElementNS(NS, 'polygon');
  area.setAttribute('points', `0,${h} ${points} ${w},${h}`);
  area.setAttribute('class', 'spark-area');
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('class', 'spark-line');
  svg.append(area, line);
  if (current < values.length - 1) {
    const now = document.createElementNS(NS, 'line');
    now.setAttribute('x1', String(x(current)));
    now.setAttribute('x2', String(x(current)));
    now.setAttribute('y1', '0');
    now.setAttribute('y2', String(h));
    now.setAttribute('class', 'spark-now');
    svg.append(now);
  }
  return svg;
}

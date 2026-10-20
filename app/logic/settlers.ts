import type { World } from '../../pipeline/emit';

export interface Settler {
  edgeId: string;
  /** starting position along the path, 0..1 */
  phase: number;
  /** tiles per second */
  speed: number;
}

const MAX_PER_EDGE = 8;

export function planSettlers(world: World, cap: number): Settler[] {
  const busy = world.edges.filter((e) => e.traffic > 0).sort((a, b) => b.traffic - a.traffic || (a.id < b.id ? -1 : 1));
  const wanted = busy.map((e) => Math.min(MAX_PER_EDGE, Math.max(1, Math.round(e.traffic * 2))));
  const total = wanted.reduce((s, n) => s + n, 0);
  const factor = total > cap ? cap / total : 1;
  const settlers: Settler[] = [];
  busy.forEach((e, i) => {
    const n = Math.max(1, Math.floor(wanted[i] * factor));
    for (let k = 0; k < n; k++) {
      const seed = (i * 7 + k * 13) % 97;
      settlers.push({ edgeId: e.id, phase: (k / n + (seed / 97) * 0.2) % 1, speed: 0.7 + (seed % 10) * 0.05 });
    }
  });
  return settlers.slice(0, cap);
}

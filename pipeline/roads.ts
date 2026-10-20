import type { Graph, GraphEdge } from './graph';
import type { Bounds, Layout, Pos } from './layout';
import type { Traffic } from './traffic';
import { cmp } from './util';

export const BASE_COST = 1;
export const REUSE_COST = 0.5;
export const GRID_MARGIN = 4;
/** traffic >= 1 → mud, >= 4 → gravel, >= 10 → cobblestone; below 1 → footprints. */
export const SURFACE_THRESHOLDS = [1, 4, 10] as const;

export type Surface = 0 | 1 | 2 | 3;
export interface RoadTile { pos: Pos; traffic: number; surface: Surface; dashed: boolean; rumor: boolean }
export interface Roads { paths: Map<string, Pos[]>; tiles: RoadTile[]; warnings: string[] }

const key = (x: number, y: number) => `${x},${y}`;
const DIRECTIONS: Pos[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function surfaceFor(traffic: number): Surface {
  let surface: Surface = 0;
  SURFACE_THRESHOLDS.forEach((threshold, i) => {
    if (traffic >= threshold) surface = (i + 1) as Surface;
  });
  return surface;
}

interface OpenEntry { x: number; y: number; f: number; seq: number }

class MinHeap {
  private items: OpenEntry[] = [];
  get size() { return this.items.length; }
  private less(a: OpenEntry, b: OpenEntry) { return a.f < b.f || (a.f === b.f && a.seq < b.seq); }
  push(item: OpenEntry) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop(): OpenEntry | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** A* on a 4-connected grid; tiles already on a road are cheaper so routes merge. */
export function findPath(start: Pos, goal: Pos, opts: { blocked: Set<string>; roads: Set<string>; bounds: Bounds }): Pos[] | null {
  const { blocked, roads, bounds } = opts;
  const goalKey = key(goal[0], goal[1]);
  const h = (x: number, y: number) => (Math.abs(x - goal[0]) + Math.abs(y - goal[1])) * REUSE_COST;
  const g = new Map<string, number>([[key(start[0], start[1]), 0]]);
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  const open = new MinHeap();
  let seq = 0;
  open.push({ x: start[0], y: start[1], f: h(start[0], start[1]), seq: seq++ });

  while (open.size > 0) {
    const current = open.pop()!;
    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    if (ck === goalKey) {
      const path: Pos[] = [];
      for (let k: string | undefined = ck; k !== undefined; k = cameFrom.get(k)) {
        const [x, y] = k.split(',').map(Number);
        path.push([x, y]);
      }
      return path.reverse();
    }
    closed.add(ck);
    for (const [dx, dy] of DIRECTIONS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      if (closed.has(nk) || (nk !== goalKey && blocked.has(nk))) continue;
      const cost = g.get(ck)! + (roads.has(nk) ? REUSE_COST : BASE_COST);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        cameFrom.set(nk, ck);
        open.push({ x: nx, y: ny, f: cost + h(nx, ny), seq: seq++ });
      }
    }
  }
  return null;
}

export function straightPath(start: Pos, goal: Pos): Pos[] {
  const path: Pos[] = [[start[0], start[1]]];
  let [x, y] = start;
  while (x !== goal[0]) {
    x += Math.sign(goal[0] - x);
    path.push([x, y]);
  }
  while (y !== goal[1]) {
    y += Math.sign(goal[1] - y);
    path.push([x, y]);
  }
  return path;
}

export function routeRoads(graph: Graph, layout: Layout, traffic: Traffic, rumorTraffic: Traffic): Roads {
  const harborOf = new Map<string, Pos>(graph.data.customers.map((c) => [c.id, layout.harbors.get(c.sectors[0])!]));
  const posOf = (id: string): Pos => layout.nodes.get(id) ?? harborOf.get(id)!;
  const blocked = new Set([...layout.nodes.values(), ...layout.harbors.values()].map((p) => key(p[0], p[1])));
  const bounds: Bounds = {
    minX: layout.bounds.minX - GRID_MARGIN,
    minY: layout.bounds.minY - GRID_MARGIN,
    maxX: layout.bounds.maxX + GRID_MARGIN,
    maxY: layout.bounds.maxY + GRID_MARGIN,
  };
  const t = (e: GraphEdge) => traffic.edge.get(e.id) ?? 0;
  const rt = (e: GraphEdge) => rumorTraffic.edge.get(e.id) ?? 0;
  const solid = graph.edges.filter((e) => e.confidence !== 'inferred').sort((a, b) => t(b) - t(a) || cmp(a.id, b.id));
  const rumors = graph.edges.filter((e) => e.confidence === 'inferred').sort((a, b) => rt(b) - rt(a) || cmp(a.id, b.id));

  const roads = new Set<string>();
  const paths = new Map<string, Pos[]>();
  const warnings: string[] = [];
  for (const e of [...solid, ...rumors]) {
    const start = posOf(e.from);
    const goal = posOf(e.to);
    let path = findPath(start, goal, { blocked, roads, bounds });
    if (!path) {
      warnings.push(`edge ${e.id}: no free route, drawing a straight path`);
      path = straightPath(start, goal);
    }
    paths.set(e.id, path);
    for (const [x, y] of path) roads.add(key(x, y));
  }

  const acc = new Map<string, { pos: Pos; traffic: number; verified: boolean; solid: boolean }>();
  for (const e of graph.edges) {
    for (const [x, y] of paths.get(e.id)!) {
      const k = key(x, y);
      if (blocked.has(k)) continue;
      const tile = acc.get(k) ?? { pos: [x, y] as Pos, traffic: 0, verified: false, solid: false };
      tile.traffic += t(e);
      if (e.confidence !== 'inferred') tile.solid = true;
      if (e.confidence === 'verified') tile.verified = true;
      acc.set(k, tile);
    }
  }
  const tiles = [...acc.values()]
    .sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1])
    .map((a) => ({ pos: a.pos, traffic: a.traffic, surface: surfaceFor(a.traffic), dashed: a.solid && !a.verified, rumor: !a.solid }));

  return { paths, tiles, warnings };
}

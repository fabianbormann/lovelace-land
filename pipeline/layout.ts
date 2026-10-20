import { z } from 'zod';
import type { Graph } from './graph';
import { formatPath } from './load';
import { cmp } from './util';

export type Pos = [number, number];

export const PLOT = 4;
export const MOUNTAIN_WIDTH = 16;
export const DISTRICT_GAP = 2;
export const COAST_GAP = 6;

export interface LayoutLock {
  version: 1;
  districts: Record<string, { x0: number; columns: number }>;
  nodes: Record<string, Pos>;
}
export interface Region { x0: number; x1: number; y0: number; y1: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Layout {
  lock: LayoutLock;
  nodes: Map<string, Pos>;
  districts: Map<string, Region>;
  harbors: Map<string, Pos>;
  bounds: Bounds;
}

const LockSchema = z
  .object({
    version: z.literal(1),
    districts: z.record(z.object({ x0: z.number().int(), columns: z.number().int().min(1) }).strict()),
    nodes: z.record(z.tuple([z.number().int(), z.number().int()])),
  })
  .strict();

const REGENERATE = 'delete the file to regenerate positions';

export function emptyLock(): LayoutLock {
  return { version: 1, districts: {}, nodes: {} };
}

export function parseLock(text: string): LayoutLock {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON (${(e as Error).message}); ${REGENERATE}`);
  }
  const result = LockSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${formatPath(issue.path)} ${issue.message}; ${REGENERATE}`);
  }
  return result.data as LayoutLock;
}

export function serializeLock(lock: LayoutLock): string {
  const block = (lines: string[]) => (lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}');
  const districts = Object.keys(lock.districts)
    .sort(cmp)
    .map((id) => `    ${JSON.stringify(id)}: { "x0": ${lock.districts[id].x0}, "columns": ${lock.districts[id].columns} }`);
  const nodes = Object.keys(lock.nodes)
    .sort(cmp)
    .map((id) => `    ${JSON.stringify(id)}: [${lock.nodes[id][0]}, ${lock.nodes[id][1]}]`);
  return `{\n  "version": 1,\n  "districts": ${block(districts)},\n  "nodes": ${block(nodes)}\n}\n`;
}

// Math.round can produce -0; "+ 0" normalises it so output is stable.
const round = (v: number) => Math.round(v) + 0;
const lexLess = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

export function computeLayout(graph: Graph, lock: LayoutLock): Layout {
  const { districts, sectors, nodes } = graph.data;
  const sortedDistricts = [...districts].sort((a, b) => a.order - b.order || cmp(a.id, b.id));
  const next: LayoutLock = emptyLock();

  // 1. District columns: locked ones keep their place, new ones are appended east.
  let nextX0 = MOUNTAIN_WIDTH;
  for (const d of sortedDistricts) {
    const locked = lock.districts[d.id];
    if (!locked) continue;
    next.districts[d.id] = { ...locked };
    nextX0 = Math.max(nextX0, locked.x0 + locked.columns * PLOT + DISTRICT_GAP);
  }
  for (const d of sortedDistricts) {
    if (next.districts[d.id]) continue;
    next.districts[d.id] = { x0: nextX0, columns: d.columns };
    nextX0 += d.columns * PLOT + DISTRICT_GAP;
  }

  const plotPos = (districtId: string, c: number, r: number): Pos => [
    next.districts[districtId].x0 + c * PLOT + PLOT / 2,
    r * PLOT,
  ];
  const toPlot = (districtId: string, [x, y]: Pos): [number, number] | null => {
    const { x0, columns } = next.districts[districtId];
    const c = (x - x0 - PLOT / 2) / PLOT;
    const r = y / PLOT;
    return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < columns ? [c, r + 0] : null;
  };

  // 2. Keep valid locked positions; on collision the smaller id wins.
  const occupied = new Map<string, Set<string>>(sortedDistricts.map((d) => [d.id, new Set<string>()]));
  const positions = new Map<string, Pos>();
  const sortedNodes = [...nodes].sort((a, b) => cmp(a.id, b.id));
  for (const n of sortedNodes) {
    const locked = lock.nodes[n.id];
    if (!locked) continue;
    const plot = toPlot(n.district, locked);
    if (!plot) continue;
    const key = `${plot[0]},${plot[1]}`;
    const taken = occupied.get(n.district)!;
    if (taken.has(key)) continue;
    taken.add(key);
    positions.set(n.id, [locked[0], locked[1]]);
  }

  // 3. Place new nodes on the free plot closest to their placed neighbours.
  const districtIndex = new Map<string, number>(sortedDistricts.map((d, i) => [d.id, i]));
  const pending = sortedNodes
    .filter((n) => !positions.has(n.id))
    .sort((a, b) => districtIndex.get(a.district)! - districtIndex.get(b.district)! || cmp(a.id, b.id));
  for (const n of pending) {
    const { x0, columns } = next.districts[n.district];
    const neighbours = [
      ...(graph.out.get(n.id) ?? []).map((e) => e.to),
      ...(graph.incoming.get(n.id) ?? []).map((e) => e.from),
    ]
      .map((id) => positions.get(id))
      .filter((p): p is Pos => p !== undefined);
    const target: Pos = neighbours.length
      ? [neighbours.reduce((s, p) => s + p[0], 0) / neighbours.length, neighbours.reduce((s, p) => s + p[1], 0) / neighbours.length]
      : [x0 + (columns * PLOT) / 2, 0];

    const taken = occupied.get(n.district)!;
    let maxRow = 0;
    for (const key of taken) maxRow = Math.max(maxRow, Math.abs(Number(key.split(',')[1])));
    let best: { c: number; r: number; score: number[] } | null = null;
    for (let r = -(maxRow + 1); r <= maxRow + 1; r++) {
      for (let c = 0; c < columns; c++) {
        if (taken.has(`${c},${r}`)) continue;
        const [x, y] = plotPos(n.district, c, r);
        const score = [(x - target[0]) ** 2 + (y - target[1]) ** 2, Math.abs(r), r, c];
        if (!best || lexLess(score, best.score)) best = { c, r, score };
      }
    }
    taken.add(`${best!.c},${best!.r}`);
    positions.set(n.id, plotPos(n.district, best!.c, best!.r));
  }
  for (const n of sortedNodes) next.nodes[n.id] = positions.get(n.id)!;

  // 4. District regions.
  const regions = new Map<string, Region>();
  for (const d of sortedDistricts) {
    const { x0, columns } = next.districts[d.id];
    const rows = [...occupied.get(d.id)!].map((key) => Number(key.split(',')[1]));
    const minRow = rows.length ? Math.min(...rows) : 0;
    const maxRow = rows.length ? Math.max(...rows) : 0;
    regions.set(d.id, { x0, x1: x0 + columns * PLOT - 1, y0: minRow * PLOT - PLOT / 2, y1: maxRow * PLOT + PLOT / 2 - 1 });
  }

  // 5. Island bounds and 6. harbors on the coasts.
  const rs = [...regions.values()];
  const island: Bounds = {
    minX: 0,
    maxX: Math.max(MOUNTAIN_WIDTH - 1, ...rs.map((r) => r.x1)),
    minY: Math.min(-PLOT, ...rs.map((r) => r.y0)),
    maxY: Math.max(PLOT, ...rs.map((r) => r.y1)),
  };
  const harbors = new Map<string, Pos>();
  for (const coast of ['east', 'north', 'south'] as const) {
    const list = sectors.filter((s) => s.coast === coast);
    list.forEach((s, i) => {
      const f = (i + 1) / (list.length + 1);
      if (coast === 'east') {
        harbors.set(s.id, [island.maxX + COAST_GAP, round(island.minY + f * (island.maxY - island.minY))]);
      } else {
        const x = round(MOUNTAIN_WIDTH + f * (island.maxX - MOUNTAIN_WIDTH));
        harbors.set(s.id, [x, coast === 'north' ? island.minY - COAST_GAP : island.maxY + COAST_GAP]);
      }
    });
  }
  const hs = [...harbors.values()];
  const bounds: Bounds = {
    minX: island.minX,
    maxX: Math.max(island.maxX, ...hs.map((p) => p[0])),
    minY: Math.min(island.minY, ...hs.map((p) => p[1])),
    maxY: Math.max(island.maxY, ...hs.map((p) => p[1])),
  };

  return { lock: next, nodes: positions, districts: regions, harbors, bounds };
}

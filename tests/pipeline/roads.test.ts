import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import { computeLayout, emptyLock, type Layout, type Pos } from '../../pipeline/layout';
import { findPath, routeRoads, straightPath, surfaceFor } from '../../pipeline/roads';
import { computeTraffic } from '../../pipeline/traffic';
import type { LoadedData } from '../../pipeline/load';
import { customer, makeData, node } from '../helpers';

const BOUNDS = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
const k = (p: Pos) => p.join(',');
const isConnected = (path: Pos[]) =>
  path.every((p, i) => i === 0 || Math.abs(p[0] - path[i - 1][0]) + Math.abs(p[1] - path[i - 1][1]) === 1);

function route(data: LoadedData, layout?: Layout) {
  const g = buildGraph(data);
  const l = layout ?? computeLayout(g, emptyLock());
  const roads = routeRoads(g, l, computeTraffic(g, { includeInferred: false }), computeTraffic(g, { includeInferred: true }));
  return { g, l, roads };
}

describe('surfaceFor', () => {
  it('maps traffic to footprints, mud, gravel, cobblestone', () => {
    expect([0, 0.5, 1, 7.9, 8, 49.9, 50, 500].map(surfaceFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('findPath', () => {
  it('finds a shortest straight path on an empty grid', () => {
    const p = findPath([0, 0], [3, 0], { blocked: new Set(), roads: new Set(), bounds: BOUNDS })!;
    expect(p).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('walks around blocked tiles', () => {
    const p = findPath([0, 0], [2, 0], { blocked: new Set(['1,0']), roads: new Set(), bounds: BOUNDS })!;
    expect(p.map(k)).not.toContain('1,0');
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]).toEqual([2, 0]);
    expect(isConnected(p)).toBe(true);
  });

  it('prefers existing roads when the detour is cheaper', () => {
    const roads = new Set(['0,1', '1,1', '2,1', '3,1', '4,1']);
    const p = findPath([0, 0], [4, 0], { blocked: new Set(), roads, bounds: BOUNDS })!;
    expect(p.map(k)).toContain('2,1');
  });

  it('returns null when the goal is enclosed', () => {
    const blocked = new Set(['4,0', '6,0', '5,1', '5,-1']);
    expect(findPath([0, 0], [5, 0], { blocked, roads: new Set(), bounds: BOUNDS })).toBeNull();
  });
});

describe('straightPath', () => {
  it('goes along x first, then y', () => {
    expect(straightPath([0, 0], [2, -1])).toEqual([[0, 0], [1, 0], [2, 0], [2, -1]]);
  });
});

describe('routeRoads', () => {
  const data = makeData({
    nodes: [
      node('app', 'products', ['lib', { target: 'idx', confidence: 'reported', relation: 'service' }]),
      node('idx', 'core'),
      node('lib', 'sdks', ['idx']),
      node('maybe', 'products', [{ target: 'lib', confidence: 'inferred' }]),
    ],
    customers: [customer('c', ['defi'], ['app'])],
  });

  it('routes every edge from source position to target position', () => {
    const { g, l, roads } = route(data);
    for (const e of g.edges) {
      const path = roads.paths.get(e.id)!;
      const start = l.nodes.get(e.from) ?? l.harbors.get('defi')!;
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(l.nodes.get(e.to));
      expect(isConnected(path)).toBe(true);
    }
    expect(roads.warnings).toEqual([]);
  });

  it('builds tiles without building or harbor tiles, with consistent surfaces', () => {
    const { l, roads } = route(data);
    const occupied = new Set([...l.nodes.values(), ...l.harbors.values()].map(k));
    for (const t of roads.tiles) {
      expect(occupied.has(k(t.pos))).toBe(false);
      expect(t.surface).toBe(surfaceFor(t.traffic));
    }
    const sorted = [...roads.tiles].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    expect(roads.tiles).toEqual(sorted);
  });

  it('marks reported-only tiles dashed and inferred-only tiles as rumors', () => {
    const { roads } = route(data);
    const tileAt = new Map(roads.tiles.map((t) => [k(t.pos), t] as const));
    const only = (edgeId: string) => {
      const others = new Set([...roads.paths].filter(([id]) => id !== edgeId).flatMap(([, p]) => p.map(k)));
      return roads.paths.get(edgeId)!.map(k).filter((key) => tileAt.has(key) && !others.has(key));
    };
    const reportedTiles = only('app->idx');
    const rumorTiles = only('maybe->lib');
    expect(reportedTiles.length + rumorTiles.length).toBeGreaterThan(0);
    for (const key of reportedTiles) expect(tileAt.get(key)).toMatchObject({ dashed: true, rumor: false });
    for (const key of rumorTiles) expect(tileAt.get(key)).toMatchObject({ dashed: false, rumor: true, traffic: 0 });
  });

  it('is deterministic', () => {
    const a = route(data).roads;
    const b = route(data).roads;
    expect(JSON.stringify([...a.paths])).toBe(JSON.stringify([...b.paths]));
    expect(a.tiles).toEqual(b.tiles);
  });

  it('falls back to a straight path with a warning when a node is walled in', () => {
    const walled = makeData({
      nodes: [node('a', 'core', ['t']), node('t', 'core'), node('w1', 'core'), node('w2', 'core'), node('w3', 'core'), node('w4', 'core')],
    });
    const layout: Layout = {
      lock: emptyLock(),
      nodes: new Map<string, Pos>([['a', [0, 0]], ['t', [5, 0]], ['w1', [4, 0]], ['w2', [6, 0]], ['w3', [5, 1]], ['w4', [5, -1]]]),
      districts: new Map(),
      harbors: new Map(),
      bounds: { minX: 0, minY: -1, maxX: 6, maxY: 1 },
    };
    const { roads } = route(walled, layout);
    expect(roads.warnings).toEqual(['edge a->t: no free route, drawing a straight path']);
    expect(roads.paths.get('a->t')).toEqual(straightPath([0, 0], [5, 0]));
  });
});

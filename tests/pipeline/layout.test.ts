import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import {
  COAST_GAP,
  computeLayout,
  emptyLock,
  MOUNTAIN_WIDTH,
  parseLock,
  serializeLock,
  type LayoutLock,
} from '../../pipeline/layout';
import type { LoadedData } from '../../pipeline/load';
import { makeData, node, sector } from '../helpers';

const layoutOf = (data: LoadedData, lock: LayoutLock = emptyLock()) => computeLayout(buildGraph(data), lock);

describe('district columns', () => {
  it('lays districts out west to east by order after the mountain', () => {
    const l = layoutOf(makeData({}));
    expect(l.lock.districts).toEqual({
      core: { x0: 16, columns: 3 },
      sdks: { x0: 30, columns: 3 },
      products: { x0: 44, columns: 3 },
    });
    expect(l.districts.get('core')).toEqual({ x0: 16, x1: 27, y0: -2, y1: 1 });
  });
});

describe('node placement', () => {
  it('places the first node of a district at its centre', () => {
    const l = layoutOf(makeData({ nodes: [node('n', 'core')] }));
    expect(l.nodes.get('n')).toEqual([22, 0]);
  });

  it('pulls a node towards its already placed neighbours', () => {
    const l = layoutOf(makeData({ nodes: [node('base', 'core'), node('far', 'sdks', ['base'])] }));
    expect(l.nodes.get('far')).toEqual([32, 0]);
  });

  it('grows a district instead of failing when it is full', () => {
    const many = Array.from({ length: 10 }, (_, i) => node(`n${String(i).padStart(2, '0')}`, 'core'));
    const l = layoutOf(makeData({ nodes: many }));
    const keys = many.map((n) => l.nodes.get(n.id)!.join(','));
    expect(new Set(keys).size).toBe(10);
    for (const n of many) {
      const [x] = l.nodes.get(n.id)!;
      expect(x).toBeGreaterThanOrEqual(16);
      expect(x).toBeLessThanOrEqual(27);
    }
    const region = l.districts.get('core')!;
    expect(region.y1 - region.y0 + 1).toBeGreaterThanOrEqual(16);
  });

  it('never moves existing nodes when new ones are added', () => {
    const before = makeData({ nodes: [node('a', 'core'), node('b', 'core'), node('c', 'sdks', ['a'])] });
    const first = layoutOf(before);
    const after = makeData({ nodes: [...before.nodes, node('d', 'core', ['c']), node('e', 'sdks')] });
    const second = layoutOf(after, first.lock);
    for (const id of ['a', 'b', 'c']) expect(second.nodes.get(id)).toEqual(first.nodes.get(id));
  });
});

describe('lock robustness', () => {
  it('keeps the smaller id when two nodes claim the same plot', () => {
    const lock: LayoutLock = { version: 1, districts: {}, nodes: { a: [22, 0], b: [22, 0] } };
    const l = layoutOf(makeData({ nodes: [node('a', 'core'), node('b', 'core')] }), lock);
    expect(l.nodes.get('a')).toEqual([22, 0]);
    expect(l.nodes.get('b')).not.toEqual([22, 0]);
  });

  it('drops removed nodes and re-places nodes that moved district', () => {
    const lock: LayoutLock = { version: 1, districts: {}, nodes: { gone: [18, 0], moved: [22, 0] } };
    const l = layoutOf(makeData({ nodes: [node('moved', 'sdks')] }), lock);
    expect(l.lock.nodes.gone).toBeUndefined();
    expect(l.nodes.get('moved')).toEqual([36, 0]);
  });

  it('keeps locked district columns and appends new districts east', () => {
    const lock: LayoutLock = { version: 1, districts: { sdks: { x0: 16, columns: 2 } }, nodes: {} };
    const l = layoutOf(makeData({}), lock);
    expect(l.lock.districts.sdks).toEqual({ x0: 16, columns: 2 });
    expect(l.lock.districts.core).toEqual({ x0: 26, columns: 3 });
    expect(l.lock.districts.products).toEqual({ x0: 40, columns: 3 });
  });

  it('round-trips through serializeLock/parseLock with one entry per line', () => {
    const l = layoutOf(makeData({ nodes: [node('b', 'core'), node('a', 'sdks')] }));
    const text = serializeLock(l.lock);
    expect(parseLock(text)).toEqual(l.lock);
    expect(text).toContain('\n    "a": [36, 0],\n    "b": [22, 0]\n');
    expect(serializeLock(emptyLock())).toBe('{\n  "version": 1,\n  "districts": {},\n  "nodes": {}\n}\n');
  });

  it('explains malformed lock files', () => {
    expect(() => parseLock('{ nope')).toThrow(/invalid JSON.*delete the file to regenerate/);
    expect(() => parseLock('{"version":1,"districts":{},"nodes":{"a":[1]}}')).toThrow(/nodes\.a.*delete the file to regenerate/);
  });
});

describe('harbors and bounds', () => {
  it('puts harbors on their coasts outside the island', () => {
    const l = layoutOf(
      makeData({
        sectors: [sector('defi', 'east'), sector('pay', 'east'), sector('proof', 'north'), sector('gov', 'south')],
        nodes: [node('a', 'core'), node('b', 'products')],
      }),
    );
    const maxRegionX = Math.max(...[...l.districts.values()].map((r) => r.x1));
    expect(l.harbors.get('defi')![0]).toBe(maxRegionX + COAST_GAP);
    expect(l.harbors.get('defi')![1]).toBeLessThan(l.harbors.get('pay')![1]);
    expect(l.harbors.get('proof')![1]).toBe(-4 - COAST_GAP);
    expect(l.harbors.get('gov')![1]).toBe(4 + COAST_GAP);
    expect(l.harbors.get('proof')![0]).toBeGreaterThan(MOUNTAIN_WIDTH);
    for (const [x, y] of l.harbors.values()) {
      expect(x).toBeGreaterThanOrEqual(l.bounds.minX);
      expect(x).toBeLessThanOrEqual(l.bounds.maxX);
      expect(y).toBeGreaterThanOrEqual(l.bounds.minY);
      expect(y).toBeLessThanOrEqual(l.bounds.maxY);
    }
  });

  it('handles a world with no districts, nodes or sectors', () => {
    const l = layoutOf(makeData({ districts: [], sectors: [] }));
    expect(l.bounds).toEqual({ minX: 0, maxX: MOUNTAIN_WIDTH - 1, minY: -4, maxY: 4 });
    expect(l.nodes.size).toBe(0);
  });
});

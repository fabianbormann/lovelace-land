import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import { computeTraffic, STAGE_WEIGHT } from '../../pipeline/traffic';
import { customer, makeData, node } from '../helpers';

const DEFAULT = { includeInferred: false };

describe('computeTraffic', () => {
  it('uses the spec stage weights', () => {
    expect(STAGE_WEIGHT).toEqual({ production: 1, pilot: 0.5, announced: 0.25, ended: 0 });
  });

  it('propagates a customer down the whole dependency chain', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['lib']), node('lib', 'sdks', ['core1']), node('core1', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(Object.fromEntries(t.edge)).toEqual({ 'app->lib': 1, 'c->app': 1, 'lib->core1': 1 });
    expect(Object.fromEntries(t.node)).toEqual({ app: 1, core1: 1, lib: 1 });
  });

  it('counts a customer once per edge and node even with two routes (diamond)', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['a', 'b']), node('a', 'sdks', ['base']), node('b', 'sdks', ['base']), node('base', 'core', ['root']), node('root', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('base')).toBe(1);
    expect(t.edge.get('base->root')).toBe(1);
  });

  it('sums stage weights across customers', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')],
        customers: [
          customer('p1', ['defi'], ['app']),
          customer('p2', ['defi'], ['app'], { stage: 'pilot' }),
          customer('p3', ['defi'], ['app'], { stage: 'announced' }),
          customer('p4', ['defi'], ['app'], { stage: 'ended' }),
        ],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('lib')).toBe(1.75);
    expect(t.edge.get('p4->app')).toBe(0);
  });

  it('terminates on cycles and counts each node once', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['a']), node('a', 'sdks', ['b']), node('b', 'sdks', ['a'])],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('a')).toBe(1);
    expect(t.edge.get('b->a')).toBe(1);
  });

  it('ignores inferred edges by default and includes them on request', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', [{ target: 'lib', confidence: 'inferred' }, { target: 'idx', confidence: 'reported' }]), node('lib', 'sdks'), node('idx', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const def = computeTraffic(g, DEFAULT);
    expect(def.node.get('lib')).toBe(0);
    expect(def.edge.get('app->lib')).toBe(0);
    expect(def.node.get('idx')).toBe(1);
    const rumors = computeTraffic(g, { includeInferred: true });
    expect(rumors.node.get('lib')).toBe(1);
    expect(rumors.edge.get('app->lib')).toBe(1);
  });

  it('gives untouched nodes zero traffic', () => {
    const g = buildGraph(makeData({ nodes: [node('alone', 'sdks')] }));
    expect(computeTraffic(g, DEFAULT).node.get('alone')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { buildGraph, edgeId, findCycles } from '../../pipeline/graph';
import { cmp } from '../../pipeline/util';
import { customer, makeData, node } from '../helpers';

describe('cmp', () => {
  it('orders by code unit, not locale', () => {
    expect(['b', 'B', 'a', 'a-b', 'a2'].sort(cmp)).toEqual(['B', 'a', 'a-b', 'a2', 'b']);
  });
});

describe('buildGraph', () => {
  const data = makeData({
    nodes: [
      node('app', 'products', ['lib', { target: 'idx', confidence: 'reported', relation: 'service' }]),
      node('idx', 'core'),
      node('lib', 'sdks', ['idx']),
    ],
    customers: [customer('cust', ['defi'], ['app'])],
  });
  const graph = buildGraph(data);

  it('creates one edge per uses entry, sorted by id', () => {
    expect(graph.edges.map((e) => e.id)).toEqual(['app->idx', 'app->lib', 'cust->app', 'lib->idx']);
    expect(edgeId('a', 'b')).toBe('a->b');
  });

  it('keeps relation, confidence and evidence; customer edges have no relation', () => {
    const appIdx = graph.edges.find((e) => e.id === 'app->idx')!;
    expect(appIdx).toMatchObject({ from: 'app', to: 'idx', relation: 'service', confidence: 'reported' });
    expect(appIdx.evidence).toHaveLength(1);
    expect(graph.edges.find((e) => e.id === 'cust->app')!.relation).toBeUndefined();
  });

  it('indexes outgoing and incoming edges for every id', () => {
    expect(graph.out.get('app')!.map((e) => e.to)).toEqual(['idx', 'lib']);
    expect(graph.incoming.get('idx')!.map((e) => e.from)).toEqual(['app', 'lib']);
    expect(graph.out.get('idx')).toEqual([]);
    expect(graph.incoming.get('cust')).toEqual([]);
  });
});

describe('findCycles', () => {
  it('returns no cycles for a DAG', () => {
    const data = makeData({ nodes: [node('a', 'core', ['b']), node('b', 'core')] });
    expect(findCycles(buildGraph(data))).toEqual([]);
  });

  it('finds each cycle once, starting at its smallest id', () => {
    const data = makeData({
      nodes: [node('a', 'core', ['b']), node('b', 'core', ['c']), node('c', 'core', ['b']), node('x', 'core', ['y']), node('y', 'core', ['x'])],
    });
    expect(findCycles(buildGraph(data))).toEqual([
      ['b', 'c'],
      ['x', 'y'],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { computeFlags } from '../../pipeline/flags';
import { buildGraph } from '../../pipeline/graph';
import { computeTraffic } from '../../pipeline/traffic';
import type { LoadedData } from '../../pipeline/load';
import { customer, makeData, node } from '../helpers';

function flagsFor(data: LoadedData) {
  const g = buildGraph(data);
  return computeFlags(g, computeTraffic(g, { includeInferred: false }));
}

describe('computeFlags', () => {
  it('marks nodes without non-ended customers as stranded', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('alone', 'sdks'), node('ended-only', 'products'), node('announced', 'products')],
        customers: [
          customer('gone', ['defi'], ['ended-only'], { stage: 'ended' }),
          customer('soon', ['defi'], ['announced'], { stage: 'announced' }),
        ],
      }),
    );
    expect(f.get('alone')!.stranded).toBe(true);
    expect(f.get('ended-only')!.stranded).toBe(true);
    expect(f.get('announced')!.stranded).toBe(false);
  });

  it('does not call a building stranded when it has on-chain transactions of its own', () => {
    const g = buildGraph(makeData({ nodes: [node('busy-dapp', 'products'), node('quiet-lib', 'sdks')] }));
    const f = computeFlags(g, computeTraffic(g, { includeInferred: false }), new Set(['busy-dapp']));
    expect(f.get('busy-dapp')!.stranded).toBe(false);
    expect(f.get('quiet-lib')!.stranded).toBe(true);
  });

  it('flags high-traffic nodes with few direct dependents as hidden highways', () => {
    // ledger <- csl <- sdk <- app1..app8 <- c1..c8
    const apps = Array.from({ length: 8 }, (_, i) => node(`app${i + 1}`, 'products', ['sdk']));
    const f = flagsFor(
      makeData({
        nodes: [...apps, node('csl', 'sdks', ['ledger']), node('ledger', 'core'), node('sdk', 'sdks', ['csl'])],
        customers: apps.map((a, i) => customer(`c${i + 1}`, ['defi'], [a.id])),
      }),
    );
    expect(f.get('ledger')!).toMatchObject({ hiddenHighway: true, dependents: 1 });
    expect(f.get('csl')!).toMatchObject({ hiddenHighway: true, dependents: 1 });
    expect(f.get('sdk')!).toMatchObject({ hiddenHighway: false, dependents: 8 });
    expect(f.get('app1')!.hiddenHighway).toBe(false);
  });

  it('does not count inferred edges as dependents', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('a', 'products', [{ target: 'lib', confidence: 'inferred' }]), node('b', 'products', ['lib']), node('lib', 'sdks')],
      }),
    );
    expect(f.get('lib')!.dependents).toBe(1);
  });

  it('assigns tiers by traffic quartiles; stranded nodes are tier 1', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('a', 'products'), node('b', 'products'), node('c', 'products'), node('d', 'products'), node('e', 'products')],
        customers: [
          customer('c1', ['defi'], ['a', 'b', 'c', 'd']),
          customer('c2', ['defi'], ['b', 'c', 'd']),
          customer('c3', ['defi'], ['c', 'd']),
          customer('c4', ['defi'], ['d']),
        ],
      }),
    );
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => f.get(id)!.tier)).toEqual([1, 2, 3, 4, 1]);
    expect(f.get('e')!.stranded).toBe(true);
  });

  it('handles an empty world', () => {
    expect(flagsFor(makeData({})).size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { Activity, MonthCounts } from '../../pipeline/activity';
import { buildGraph } from '../../pipeline/graph';
import { monthRange } from '../../pipeline/months';
import { computeTimeline } from '../../pipeline/timeline';
import type { LoadedData } from '../../pipeline/load';
import { customer, makeData, node } from '../helpers';

const MONTHS = monthRange('2025-01', '2026-03'); // 15 months, index 0..14
const series = (values: Record<number, number>): MonthCounts =>
  Object.fromEntries(Object.entries(values).map(([i, v]) => [MONTHS[Number(i)], v]));
const every = (v: number, from = 0, to = MONTHS.length - 1) => series(Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, v])));
const act = (tx: Record<string, MonthCounts> = {}, commits: Record<string, MonthCounts> = {}): Activity => ({
  tx: new Map(Object.entries(tx)),
  commits: new Map(Object.entries(commits)),
});
const timeline = (data: LoadedData, activity: Activity) => computeTimeline(buildGraph(data), activity, MONTHS);

describe('customer flow', () => {
  const nodes = [node('app', 'products', ['lib']), node('lib', 'sdks')];

  it('uses the customer’s own transactions first, as log10(1 + tx)', () => {
    const t = timeline(makeData({ nodes, customers: [customer('c', ['defi'], ['app'])] }), act({ c: series({ 0: 9, 1: 99 }) }));
    expect(t.customers.c.tx.slice(0, 3)).toEqual([9, 99, 0]);
    expect(t.customers.c.w.slice(0, 3)).toEqual([1, 2, 0]);
    expect(t.customers.c.source).toBe('onchain');
  });

  it('uses an announced window with a small fixed flow', () => {
    const t = timeline(makeData({ nodes, customers: [customer('c', ['defi'], ['app'], { active: { from: '2025-03', until: '2025-05' } })] }), act());
    expect(t.customers.c.tx.slice(0, 7)).toEqual([0, 0, 10, 10, 10, 0, 0]);
    expect(t.customers.c.source).toBe('announced');
  });

  it('gives a segment the transactions of the products it uses', () => {
    const t = timeline(makeData({ nodes, customers: [customer('s', ['defi'], ['app'], { type: 'segment' })] }), act({ app: series({ 1: 50 }) }));
    expect(t.customers.s.tx.slice(0, 3)).toEqual([0, 50, 0]);
    expect(t.customers.s.source).toBe('products');
  });

  it('docks an organisation while any product it uses is active', () => {
    const t = timeline(makeData({ nodes, customers: [customer('o', ['defi'], ['app'])] }), act({ app: series({ 2: 7, 3: 0, 4: 3 }) }));
    expect(t.customers.o.tx.slice(0, 6)).toEqual([0, 0, 10, 0, 10, 0]);
    expect(t.customers.o.state.slice(0, 6)).toBe('aadada');
  });

  it('keeps a customer without any data docked throughout; an ended one appears as a wreck only today', () => {
    const t = timeline(
      makeData({ nodes, customers: [customer('x', ['defi'], ['app']), customer('y', ['defi'], ['app'], { stage: 'ended' })] }),
      act(),
    );
    expect(t.customers.x.state).toBe('d'.repeat(MONTHS.length));
    expect(t.customers.x.source).toBe('assumed');
    expect(t.customers.y.state).toBe('a'.repeat(MONTHS.length - 1) + 'w');
  });

  it('keeps an ended customer docked through quiet months until its last activity, then wrecked', () => {
    const t = timeline(makeData({ nodes, customers: [customer('e', ['defi'], ['app'], { stage: 'ended' })] }), act({ e: series({ 1: 5, 3: 5 }) }));
    expect(t.customers.e.state.slice(0, 6)).toBe('adadww');
  });

  it('carries last month’s flow into the running month so ships do not leave on a partial month', () => {
    const t = timeline(makeData({ nodes, customers: [customer('c', ['defi'], ['app'])] }), act({ c: series({ 13: 40 }) }));
    expect(t.customers.c.state.slice(13)).toBe('dd');
    expect(t.customers.c.tx[14]).toBe(40);
  });

  it('turns an ended customer into a wreck once its transactions stop', () => {
    const t = timeline(makeData({ nodes, customers: [customer('e', ['defi'], ['app'], { stage: 'ended' })] }), act({ e: series({ 0: 5, 1: 5 }) }));
    expect(t.customers.e.state.slice(0, 4)).toBe('ddww');
  });
});

describe('monthly traffic', () => {
  it('carries each month’s weight down the dependency chain', () => {
    const t = timeline(
      makeData({ nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')], customers: [customer('c', ['defi'], ['app'])] }),
      act({ c: series({ 0: 9, 1: 999 }) }),
    );
    expect(t.nodes.lib.traffic.slice(0, 3)).toEqual([1, 3, 0]);
    const libEdge = buildGraph(makeData({ nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')], customers: [customer('c', ['defi'], ['app'])] })).edges.findIndex((e) => e.id === 'app->lib');
    expect(t.edges[libEdge].slice(0, 2)).toEqual([1, 3]);
  });

  it('sums ecosystem transactions per month from product series', () => {
    const t = timeline(makeData({ nodes: [node('a', 'products'), node('b', 'products')] }), act({ a: series({ 0: 3 }), b: series({ 0: 4, 1: 1 }) }));
    expect(t.totals.slice(0, 2)).toEqual([7, 1]);
  });
});

describe('building lifecycle', () => {
  const lib = (extra = {}) => makeData({ nodes: [node('lib', 'sdks', [], extra)] });

  it('burns after 4, falls to ruin after 6 and returns to grass after 12 inactive months', () => {
    const t = timeline(lib(), act({}, { lib: series({ 0: 5 }) }));
    // month:                      0123456789ABCDE (E = the running month counts like D)
    expect(t.nodes.lib.state).toBe('aaaabbuuuuuuggg');
  });

  it('rebuilds when commits resume', () => {
    const t = timeline(lib(), act({}, { lib: series({ 0: 5, 9: 2 }) }));
    expect(t.nodes.lib.state.slice(6, 11)).toBe('uuuaa');
  });

  it('marks a used but unmaintained building as at risk instead of decaying', () => {
    const data = makeData({ nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')], customers: [customer('c', ['defi'], ['app'])] });
    const t = timeline(data, act({ c: every(100) }, { lib: series({ 0: 1 }) }));
    expect(t.nodes.lib.state.slice(0, 8)).toBe('aaaaaarr');
  });

  it('does not mark a product with its own transactions as at risk, however quiet its repository', () => {
    const t = timeline(makeData({ nodes: [node('dex', 'products')] }), act({ dex: every(500) }, { dex: series({ 0: 1 }) }));
    expect(t.nodes.dex.state.slice(0, 10)).toBe('aaaaaaaaaa');
  });

  it('decays a closed-source product on usage alone', () => {
    const t = timeline(makeData({ nodes: [node('app', 'products')] }), act({ app: series({ 0: 5, 1: 5, 2: 5 }) }));
    expect(t.nodes.app.state.slice(2, 9)).toBe('aaaabbu');
  });

  it('counts an announced active window as use for a product without transactions', () => {
    const t = timeline(makeData({ nodes: [node('card', 'products', [], { active: { from: '2025-02', until: '2025-10' } })] }), act());
    // in use Feb–Oct 2025, then idle: burning from Feb 2026 (4 months after Oct)
    expect(t.nodes.card.state.slice(1, 14)).toBe('caaaaaaaaaaab');
  });

  it('ignores a product’s own transactions after its announced end', () => {
    const t = timeline(makeData({ nodes: [node('shop', 'products', [], { active: { from: '2025-01', until: '2025-03' } })] }), act({ shop: every(10) }));
    expect(t.nodes.shop.state.slice(6, 10)).toBe('bbuu');
  });

  it('keeps a building without any activity data standing', () => {
    const t = timeline(makeData({ nodes: [node('quiet', 'sdks')] }), act());
    expect(t.nodes.quiet.state).toBe('a'.repeat(MONTHS.length));
    expect(t.nodes.quiet.noData).toBe(true);
  });

  it('shows an empty plot before founding and construction in the founding month', () => {
    const t = timeline(lib(), act({}, { lib: series({ 3: 4, 4: 4 }) }));
    expect(t.nodes.lib.state.slice(0, 6)).toBe('eeecaa');
  });

  it('treats a project with commits before the window as already standing', () => {
    const t = timeline(lib(), act({}, { lib: { '2024-11': 3, [MONTHS[0]]: 1 } }));
    expect(t.nodes.lib.state[0]).toBe('a');
  });

  it('does not count the current, still running month as inactive', () => {
    const t = timeline(lib(), act({}, { lib: series({ 10: 1 }) }));
    // last commit in month 10, months 11-13 complete → inactive 3; month 14 is in progress → still 3, not 4
    expect(t.nodes.lib.state.slice(13)).toBe('aa');
  });

  it('records last commit and last use months', () => {
    const data = makeData({ nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')], customers: [customer('c', ['defi'], ['app'])] });
    const t = timeline(data, act({ c: series({ 2: 1 }) }, { lib: series({ 1: 1 }) }));
    expect(t.nodes.lib.lastCommit).toBe(MONTHS[1]);
    expect(t.nodes.lib.lastUse).toBe(MONTHS[2]);
  });

  it('assigns tiers per month and 0 when the plot is empty or grass', () => {
    const t = timeline(lib(), act({}, { lib: series({ 3: 1 }) }));
    expect(t.nodes.lib.tier[0]).toBe('0');
    expect(t.nodes.lib.tier[3]).toBe('1');
  });
});

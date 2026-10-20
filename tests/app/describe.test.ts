import { describe, expect, it } from 'vitest';
import type { World } from '../../pipeline/emit';
import { describeNodeAt, describeShipAt, formatMonth } from '../../app/logic/describe';
import { miniWorld } from './world';

function withNode(state: string, extra: Partial<World['timeline']['nodes'][string]> = {}) {
  const w: World = miniWorld();
  const n = w.timeline.nodes['anvil-lib'];
  Object.assign(n, { state: state.padStart(w.timeline.months.length, 'a'), noData: false, ...extra });
  return w;
}
const last = (w: World) => w.timeline.months.length - 1;

describe('formatMonth', () => {
  it('reads like a calendar month', () => {
    expect(formatMonth('2026-02')).toBe('Feb 2026');
  });
});

describe('describeNodeAt', () => {
  it('explains burning, ruin and grass with the last sign of life', () => {
    const w = withNode('b', { lastCommit: '2026-02', lastUse: null, commits: [], traffic: [] });
    w.timeline.nodes['anvil-lib'].commits = w.timeline.months.map((m) => (m === '2026-02' ? 3 : 0));
    w.timeline.nodes['anvil-lib'].traffic = w.timeline.months.map(() => 0);
    w.timeline.nodes['anvil-lib'].tx = w.timeline.months.map(() => 0);
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('No commits or traffic since Feb 2026, so it is burning.');
    w.timeline.nodes['anvil-lib'].state = w.timeline.nodes['anvil-lib'].state.slice(0, -1) + 'u';
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('No commits or traffic since Feb 2026, so it has fallen into ruin.');
    w.timeline.nodes['anvil-lib'].state = w.timeline.nodes['anvil-lib'].state.slice(0, -1) + 'g';
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('No commits or traffic since Feb 2026, so it has returned to grass.');
  });

  it('explains at-risk buildings in terms of the public repository', () => {
    const w = withNode('r');
    w.timeline.nodes['anvil-lib'].commits = w.timeline.months.map((m) => (m === '2026-02' ? 3 : 0));
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('Still used in Oct 2026, but its public repository has had no commits since Feb 2026.');
  });

  it('covers construction, empty plots, activity and missing data', () => {
    const w = withNode('c');
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('Founded in Oct 2026: under construction.');
    w.timeline.nodes['anvil-lib'].state = 'e'.repeat(w.timeline.months.length);
    expect(describeNodeAt(w, 'anvil-lib', 0)).toBe('Not founded yet in Sep 2021.');
    w.timeline.nodes['anvil-lib'].state = 'a'.repeat(w.timeline.months.length);
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('Active in Oct 2026.');
    w.timeline.nodes['anvil-lib'].noData = true;
    expect(describeNodeAt(w, 'anvil-lib', last(w))).toBe('No activity data, so it is shown standing throughout.');
  });
});

describe('describeShipAt', () => {
  it('explains where a ship is and why', () => {
    const w = miniWorld();
    const i = w.timeline.months.indexOf('2026-07');
    expect(describeShipAt(w, 'harbor-traders', i)).toBe('Docked in Jul 2026 with 999 transactions through the products it uses.');
    expect(describeShipAt(w, 'harbor-traders', i + 2)).toBe('Away in Sep 2026: no transactions that month.');
    expect(describeShipAt(w, 'old-pilot', i)).toBe('A wreck: this customer stopped using the product.');
  });
});

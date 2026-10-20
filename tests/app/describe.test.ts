import { describe, expect, it } from 'vitest';
import type { World } from '../../pipeline/emit';
import { describeAnnouncedPeriod, describeNodeAt, describeShipAt, formatMonth } from '../../app/logic/describe';
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
    const i = w.timeline.months.indexOf('2026-05');
    expect(describeShipAt(w, 'harbor-traders', i)).toBe('Docked in May 2026 with 999 transactions through the products it uses.');
    expect(describeShipAt(w, 'harbor-traders', w.timeline.months.indexOf('2026-09'))).toBe(
      'Away in Sep 2026: no transactions through the products it uses since Jun 2026.',
    );
    expect(describeShipAt(w, 'harbor-traders', w.timeline.months.indexOf('2026-01'))).toBe(
      'Away in Jan 2026: no transactions through the products it uses yet.',
    );
    expect(describeShipAt(w, 'old-pilot', w.timeline.months.length - 1)).toBe(
      'A wreck: it is recorded as no longer using the product, and there is no activity data to date when it stopped.',
    );
  });

  it('dates a wreck by its last activity', () => {
    const w = miniWorld();
    const c = w.timeline.customers['harbor-traders'];
    c.state = c.state.replace(/a+$/, (rest) => 'w'.repeat(rest.length));
    expect(describeShipAt(w, 'harbor-traders', w.timeline.months.indexOf('2026-10'))).toBe('A wreck: it stopped using the product after Jun 2026.');
    c.source = 'announced';
    c.announced = { from: '2026-04', confirmed: '2026-06', until: '2026-06', ended: true };
    expect(describeShipAt(w, 'harbor-traders', w.timeline.months.indexOf('2026-10'))).toBe('A wreck: its announced use ended in Jun 2026.');
  });

  it('says when announced use was last confirmed, and why the ship left', () => {
    const w = miniWorld();
    const months = w.timeline.months;
    const at = (m: string) => months.indexOf(m);
    const docked = months.map((m) => (m >= '2026-01' && m <= '2026-03' ? 'd' : 'a')).join('');
    w.timeline.customers['harbor-traders'] = {
      ...w.timeline.customers['harbor-traders'],
      source: 'announced',
      state: docked,
      announced: { from: '2026-01', confirmed: '2026-01', until: '2026-02', ended: false },
    };
    expect(describeShipAt(w, 'harbor-traders', at('2026-02'))).toBe('Docked in Feb 2026, based on announced use last confirmed in Jan 2026 (no on-chain data).');
    expect(describeShipAt(w, 'harbor-traders', at('2026-06'))).toBe(
      'Away in Jun 2026: its announced use was last confirmed in Jan 2026, and nothing newer is on record.',
    );
    w.timeline.customers['harbor-traders'].announced = { from: '2026-01', confirmed: '2026-02', until: '2026-02', ended: true };
    expect(describeShipAt(w, 'harbor-traders', at('2026-06'))).toBe('Away in Jun 2026: its announced period of use ended in Feb 2026.');
  });
});

describe('describeAnnouncedPeriod', () => {
  it('summarises the window without pretending to show transactions', () => {
    const p = (announced: World['timeline']['customers'][string]['announced']) => describeAnnouncedPeriod(announced);
    expect(p({ from: '2022-01', confirmed: '2022-01', until: '2023-12', ended: false })).toBe(
      'No on-chain data. Use announced from Jan 2022 and not confirmed since, so it counts until Dec 2023.',
    );
    expect(p({ from: '2022-01', confirmed: '2025-06', until: '2027-05', ended: false })).toBe(
      'No on-chain data. Use announced from Jan 2022, last confirmed Jun 2025, so it counts until May 2027.',
    );
    expect(p({ from: '2022-01', confirmed: '2022-03', until: '2022-03', ended: true })).toBe('No on-chain data. Use announced from Jan 2022 until Mar 2022.');
  });
});

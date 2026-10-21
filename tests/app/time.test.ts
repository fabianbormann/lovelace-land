import { describe, expect, it } from 'vitest';
import type { World } from '../../pipeline/emit';
import { indexWorld } from '../../app/logic/index';
import { computeAppearance, defaultViewState } from '../../app/logic/lenses';
import { cursorAt, edgeTrafficAt, flagsAt, shipPresence, statsAt, surfaceAt, tierAt } from '../../app/logic/time';
import { miniWorld } from './world';

const world = miniWorld();
const tl = world.timeline;
const last = tl.months.length - 1;

describe('cursorAt', () => {
  it('splits a continuous time into month index and fraction, clamped to the range', () => {
    expect(cursorAt(tl.months, 2.25)).toEqual({ index: 2, frac: 0.25, month: tl.months[2] });
    expect(cursorAt(tl.months, -3).index).toBe(0);
    expect(cursorAt(tl.months, 999)).toEqual({ index: last, frac: 0, month: tl.months[last] });
  });
});

describe('interpolation', () => {
  it('blends edge traffic between months', () => {
    const e = world.edges.findIndex((x) => x.id === 'harbor-traders->swap-town');
    const i = tl.months.indexOf('2026-06');
    const a = tl.edges[e][i];
    const b = tl.edges[e][i + 1];
    expect(edgeTrafficAt(tl, e, i + 0.5)).toBeCloseTo((a + b) / 2);
  });

  it('gives tier 0 for empty plots and the month value otherwise', () => {
    expect(tierAt(tl, 'swap-town', last)).toBe(Number(tl.nodes['swap-town'].tier[last]));
  });
});

describe('shipPresence', () => {
  it('sails between docked (1) and away (0) across a month', () => {
    const i = tl.months.indexOf('2026-08'); // docked in 2026-08, away in 2026-09
    expect(tl.customers['harbor-traders'].state.slice(i, i + 2)).toBe('da');
    expect(shipPresence(tl, 'harbor-traders', i).docked).toBe(1);
    expect(shipPresence(tl, 'harbor-traders', i + 0.5).docked).toBeCloseTo(0.5);
    expect(shipPresence(tl, 'harbor-traders', i + 1).docked).toBe(0);
  });

  it('keeps wrecks at the harbor', () => {
    expect(shipPresence(tl, 'old-pilot', last)).toEqual({ docked: 1, wreck: true, arrived: 1 });
  });

  it('sails in from the horizon on its first active month, and stays as a ghost once it has been there', () => {
    const at = (m: string, frac = 0) => shipPresence(tl, 'harbor-traders', tl.months.indexOf(m) + frac);
    expect(tl.customers['harbor-traders'].state.slice(tl.months.indexOf('2026-02'), tl.months.indexOf('2026-02') + 3)).toBe('aad');
    expect(at('2026-02').arrived).toBe(0);
    expect(at('2026-03', 0.5)).toMatchObject({ arrived: 0.5, docked: 0.5 });
    expect(at('2026-04')).toMatchObject({ arrived: 1, docked: 1 });
    expect(at('2026-09')).toMatchObject({ arrived: 1, docked: 0 });
    expect(shipPresence(tl, 'old-pilot', last - 1).arrived).toBe(0);
  });
});

describe('flagsAt', () => {
  it('marks standing buildings without traffic in that month as stranded', () => {
    const i = tl.months.indexOf('2026-05');
    const { stranded } = flagsAt(world, i);
    expect(stranded.has('swap-town')).toBe(false);
    expect(stranded.has('lonely-tool')).toBe(true);
  });
});

describe('time-aware appearance', () => {
  it('hides buildings that are not standing, but only dims roads to ships that are away', () => {
    const idx = indexWorld(world);
    const w: World = JSON.parse(JSON.stringify(world));
    const i = w.timeline.months.indexOf('2026-09');
    w.timeline.nodes['lonely-tool'].state = w.timeline.nodes['lonely-tool'].state.slice(0, i) + 'g' + w.timeline.nodes['lonely-tool'].state.slice(i + 1);
    const a = computeAppearance(indexWorld(w), { ...defaultViewState(), time: i });
    expect(a.nodes.get('lonely-tool')!.hidden).toBe(true);
    expect(a.edges.get('lonely-tool->hearth-node')!.hidden).toBe(true);
    expect(a.edges.get('harbor-traders->swap-town')).toMatchObject({ hidden: false, dim: true });
    void idx;
  });

  it('uses that month’s stranded set for the stranded lens', () => {
    const i = tl.months.indexOf('2026-05');
    const a = computeAppearance(indexWorld(world), { ...defaultViewState(), lens: 'stranded', time: i });
    expect(a.nodes.get('swap-town')!.glow).toBe(false);
  });
});

describe('statsAt and surfaceAt', () => {
  it('counts standing buildings, docked ships and stranded buildings', () => {
    const s = statsAt(world, last);
    expect(s.buildings).toBe(world.nodes.filter((n) => !'eg'.includes(tl.nodes[n.id].state[last])).length);
    expect(s.ships).toBeGreaterThanOrEqual(0);
  });

  it('maps monthly tile traffic to a surface', () => {
    expect([0, 0.4, 0.5, 4.9, 5, 24.9, 25].map(surfaceAt)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});

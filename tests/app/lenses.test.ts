import { describe, expect, it } from 'vitest';
import { indexWorld } from '../../app/logic/index';
import { computeAppearance, defaultViewState } from '../../app/logic/lenses';
import { miniWorld } from './world';

const idx = indexWorld(miniWorld());

describe('computeAppearance', () => {
  it('shows everything plainly by default but hides rumors', () => {
    const a = computeAppearance(idx, defaultViewState());
    expect([...a.nodes.values()].every((v) => !v.dim && !v.glow)).toBe(true);
    expect(a.edges.get('seal-notary->mill-indexer')!.hidden).toBe(true);
    expect(a.edges.get('swap-town->mill-indexer')!.hidden).toBe(false);
  });

  it('shows rumors when asked', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), showRumors: true });
    expect(a.edges.get('seal-notary->mill-indexer')!.hidden).toBe(false);
  });

  it('stranded lens dims everything except stranded buildings', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'stranded' });
    expect(a.nodes.get('lonely-tool')).toMatchObject({ dim: false, glow: true });
    expect(a.nodes.get('anvil-lib')!.dim).toBe(true);
  });

  it('highways lens glows hidden highways and their roads', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'highways' });
    expect(a.nodes.get('hearth-node')!.glow).toBe(true);
    expect(a.nodes.get('swap-town')!.dim).toBe(true);
    expect(a.edges.get('swap-town->anvil-lib')!.glow).toBe(true);
    expect(a.edges.get('harbor-traders->swap-town')!.dim).toBe(true);
  });

  it('follow lens lights up one ship and its whole chain', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'follow', follow: 'harbor-traders' });
    expect(a.customers.get('harbor-traders')!.glow).toBe(true);
    expect(a.customers.get('old-pilot')!.dim).toBe(true);
    expect(a.nodes.get('hearth-node')!.glow).toBe(true);
    expect(a.nodes.get('seal-notary')!.dim).toBe(true);
    expect(a.edges.get('swap-town->mill-indexer')!.glow).toBe(true);
  });

  it('dims filtered districts and sectors', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), hiddenDistricts: new Set(['sdks']), hiddenSectors: new Set(['defi']) });
    expect(a.nodes.get('anvil-lib')!.dim).toBe(true);
    expect(a.nodes.get('swap-town')!.dim).toBe(true); // primarySector defi
    expect(a.nodes.get('seal-notary')!.dim).toBe(false);
    expect(a.customers.get('harbor-traders')!.dim).toBe(true);
  });

  it('dims a road tile only when every edge crossing it is dimmed, hides it when all are hidden', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'stranded' });
    for (const [key, edges] of idx.edgesAtTile) {
      const visible = edges.filter((e) => !a.edges.get(e.id)!.hidden);
      expect(a.tiles.get(key)!.hidden).toBe(visible.length === 0);
      if (visible.length) expect(a.tiles.get(key)!.dim).toBe(visible.every((e) => a.edges.get(e.id)!.dim));
    }
  });
});

describe('confidence filter', () => {
  it('hides reported roads when asked', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), hideReported: true });
    expect(a.edges.get('swap-town->mill-indexer')!.hidden).toBe(true);
    expect(a.edges.get('swap-town->anvil-lib')!.hidden).toBe(false);
  });
});

describe('follow lens from a building', () => {
  it('lights up the building, everything that depends on it and the ships behind them', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'follow', follow: 'anvil-lib' });
    expect(a.nodes.get('anvil-lib')!.glow).toBe(true);
    expect(a.nodes.get('swap-town')!.glow).toBe(true);
    expect(a.nodes.get('hearth-node')!.dim).toBe(true);
    expect(a.customers.get('harbor-traders')!.glow).toBe(true);
    expect(a.edges.get('swap-town->anvil-lib')!.glow).toBe(true);
    expect(a.edges.get('anvil-lib->hearth-node')!.dim).toBe(true);
  });
});

describe('ships that are away', () => {
  const at = (m: string) => idx.world.timeline.months.indexOf(m);

  it('keep their roads, dimmed, so the island still shows who relied on what', () => {
    const away = computeAppearance(idx, { ...defaultViewState(), time: at('2026-09') });
    expect(away.edges.get('harbor-traders->swap-town')).toMatchObject({ hidden: false, dim: true });
    const docked = computeAppearance(idx, { ...defaultViewState(), time: at('2026-05') });
    expect(docked.edges.get('harbor-traders->swap-town')).toMatchObject({ hidden: false, dim: false });
    const wreck = computeAppearance(idx, { ...defaultViewState(), time: idx.world.timeline.months.length - 1 });
    expect(wreck.edges.get('old-pilot->seal-notary')).toMatchObject({ hidden: false, dim: true });
  });

  it('have no road yet before they first arrive', () => {
    // old-pilot never docked: it only shows up, as a wreck, in the latest month
    const months = idx.world.timeline.months;
    const before = computeAppearance(idx, { ...defaultViewState(), time: months.length - 2 });
    expect(idx.world.timeline.nodes['seal-notary'].state.at(-2)).toMatch(/[ar]/);
    expect(before.edges.get('old-pilot->seal-notary')!.hidden).toBe(true);
    const now = computeAppearance(idx, { ...defaultViewState(), time: months.length - 1 });
    expect(now.edges.get('old-pilot->seal-notary')!.hidden).toBe(false);
  });

  it('are still reached when a building is traced back to its ships', () => {
    const a = computeAppearance(idx, { ...defaultViewState(), lens: 'follow', follow: 'anvil-lib', time: at('2026-09') });
    expect(a.customers.get('harbor-traders')!.glow).toBe(true);
    expect(a.edges.get('harbor-traders->swap-town')).toMatchObject({ hidden: false, glow: true });
  });
});

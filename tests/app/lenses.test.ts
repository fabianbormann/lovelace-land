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

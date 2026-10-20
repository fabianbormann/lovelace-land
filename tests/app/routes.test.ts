import { describe, expect, it } from 'vitest';
import { indexWorld } from '../../app/logic/index';
import { settlerPosition, settlerRoutes } from '../../app/logic/routes';
import { MOUNTAIN_PEAK } from '../../app/logic/terrain';
import { miniWorld } from './world';

const world = miniWorld();
const idx = indexWorld(world);

describe('settlerRoutes', () => {
  it('leads from the ship’s harbor through the products down to the Cardano mark', () => {
    const routes = settlerRoutes(world, idx, 'harbor-traders');
    expect(routes.length).toBeGreaterThan(0);
    const harbor = world.sectors.find((s) => s.id === 'defi')!.harbor.pos;
    for (const r of routes) {
      expect(r[0]).toEqual(harbor);
      expect(r[r.length - 1]).toEqual(MOUNTAIN_PEAK);
      for (let i = 1; i < r.length; i++) expect(Math.abs(r[i][0] - r[i - 1][0]) + Math.abs(r[i][1] - r[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    expect(settlerRoutes(world, idx, 'harbor-traders')).toEqual(settlerRoutes(world, idx, 'harbor-traders'));
  });
});

describe('settlerPosition', () => {
  const route: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  it('spreads settlers along the route and moves them with time', () => {
    expect(settlerPosition(route, 0, 3, 0)).toEqual([0, 0]);
    expect(settlerPosition(route, 1, 3, 0)).toEqual([1, 0]);
    expect(settlerPosition(route, 0, 3, 1.5)[0]).toBeCloseTo(1.5 * 0.8 % 3);
  });
  it('returns the same position for the same inputs', () => {
    expect(settlerPosition(route, 2, 5, 12.34)).toEqual(settlerPosition(route, 2, 5, 12.34));
  });
});

describe('trail to the Cardano mark', () => {
  it('walks over land, never through water, from any building to the peak', async () => {
    const { buildTerrain } = await import('../../app/logic/terrain');
    const { makeTrail } = await import('../../app/logic/routes');
    const terrain = buildTerrain(world);
    const trail = makeTrail(world, terrain);
    for (const n of world.nodes) {
      const path = trail(n.pos);
      expect(path[path.length - 1]).toEqual(MOUNTAIN_PEAK);
      for (const [x, y] of path) expect(terrain.isLand(x, y)).toBe(true);
      for (let i = 1; i < path.length; i++) expect(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])).toBe(1);
    }
  });

  it('is used for the last leg of every settler route', () => {
    const marker: [number, number] = [-99, -99];
    const routes = settlerRoutes(world, idx, 'harbor-traders', () => [marker]);
    for (const r of routes) expect(r[r.length - 1]).toEqual(marker);
  });
});

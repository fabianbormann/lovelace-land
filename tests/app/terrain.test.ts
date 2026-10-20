import { describe, expect, it } from 'vitest';
import { buildTerrain, MOUNTAIN_PEAK } from '../../app/logic/terrain';
import { miniWorld } from './world';

const world = miniWorld();
const t = buildTerrain(world);

describe('buildTerrain', () => {
  it('covers the world bounds with a water margin', () => {
    expect(t.minX).toBeLessThan(world.bounds.minX);
    expect(t.minY).toBeLessThan(world.bounds.minY);
    expect(t.minX + t.width - 1).toBeGreaterThan(world.bounds.maxX);
    expect(t.minY + t.height - 1).toBeGreaterThan(world.bounds.maxY);
  });

  it('puts every building and road tile on land', () => {
    for (const n of world.nodes) expect(t.isLand(n.pos[0], n.pos[1])).toBe(true);
    for (const tile of world.tiles) expect(t.isLand(tile.pos[0], tile.pos[1])).toBe(true);
  });

  it('surrounds the island with water', () => {
    expect(t.isLand(t.minX, t.minY)).toBe(false);
    expect(t.isLand(t.minX + t.width - 1, t.minY + t.height - 1)).toBe(false);
  });

  it('raises the mountain in the west', () => {
    expect(t.heightAt(MOUNTAIN_PEAK[0], MOUNTAIN_PEAK[1])).toBeGreaterThan(5);
    expect(t.heightAt(MOUNTAIN_PEAK[0], MOUNTAIN_PEAK[1])).toBeGreaterThan(t.heightAt(world.nodes[0].pos[0], world.nodes[0].pos[1]));
  });

  it('keeps water below sea level and land above', () => {
    expect(t.heightAt(t.minX, t.minY)).toBeLessThan(0);
    const n = world.nodes[0];
    expect(t.heightAt(n.pos[0], n.pos[1])).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const again = buildTerrain(world);
    expect(Array.from(again.land)).toEqual(Array.from(t.land));
  });

  it('places each harbor on land next to water', () => {
    for (const s of world.sectors) {
      const [x, y] = s.harbor.pos;
      expect(t.isLand(x, y)).toBe(true);
      const nearWater = [-3, -2, -1, 1, 2, 3].some((d) => !t.isLand(x + d, y) || !t.isLand(x, y + d));
      expect(nearWater).toBe(true);
    }
  });
});

describe('river path', () => {
  it('runs in flow order from the mountain to the sea over river tiles', () => {
    const { riverPath } = buildTerrain(world);
    expect(riverPath.length).toBeGreaterThan(5);
    for (const [x, y] of riverPath) expect(t.isRiver(x, y)).toBe(true);
    for (let i = 1; i < riverPath.length; i++)
      expect(Math.abs(riverPath[i][0] - riverPath[i - 1][0]) + Math.abs(riverPath[i][1] - riverPath[i - 1][1])).toBe(1);
  });
});

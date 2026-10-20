import type { World } from '../../pipeline/emit';

/** Water margin around the world bounds, in tiles. */
export const SEA_MARGIN = 14;
export const MOUNTAIN_PEAK: [number, number] = [7, 0];
export const PEAK_HEIGHT = 9;
const MOUNTAIN_RADIUS = 11;
const LAND_HEIGHT = 0.35;
const SHORE_HEIGHT = 0.12;
const WATER_HEIGHT = -0.9;
const RIVER_HEIGHT = -0.3;
const COAST_JITTER = 1.5;

export interface Terrain {
  minX: number;
  minY: number;
  width: number;
  height: number;
  land: Uint8Array;
  heights: Float32Array;
  river: Uint8Array;
  /** river tiles from the mountain to the sea, in flow order */
  riverPath: [number, number][];
  isLand(x: number, y: number): boolean;
  isRiver(x: number, y: number): boolean;
  heightAt(x: number, y: number): number;
}

/** Deterministic hash noise in [0, 1). */
export function noise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildTerrain(world: World): Terrain {
  const minX = world.bounds.minX - SEA_MARGIN;
  const minY = world.bounds.minY - SEA_MARGIN;
  const width = world.bounds.maxX - world.bounds.minX + 1 + 2 * SEA_MARGIN;
  const height = world.bounds.maxY - world.bounds.minY + 1 + 2 * SEA_MARGIN;
  const size = width * height;
  const inside = (x: number, y: number) => x >= minX && y >= minY && x < minX + width && y < minY + height;
  const at = (x: number, y: number) => (y - minY) * width + (x - minX);

  // Feature groups with their land radius: districts and the mountain reach furthest, roads less, harbors least.
  const groups: { radius: number; seeds: [number, number][] }[] = [
    { radius: 3, seeds: [] },
    { radius: 2, seeds: [] },
    { radius: 1, seeds: [] },
  ];
  for (let x = 0; x <= 15; x++) for (let y = -8; y <= 8; y++) groups[0].seeds.push([x, y]);
  for (const d of world.districts)
    for (let x = d.region.x0; x <= d.region.x1; x++) for (let y = d.region.y0; y <= d.region.y1; y++) groups[0].seeds.push([x, y]);
  for (const t of world.tiles) groups[1].seeds.push(t.pos);
  for (const n of world.nodes) groups[1].seeds.push(n.pos);
  const inward = { east: [-1, 0], north: [0, 1], south: [0, -1] } as const;
  for (const s of world.sectors) {
    const [hx, hy] = s.harbor.pos;
    const [dx, dy] = inward[s.coast];
    for (let k = 0; k <= 7; k++) groups[2].seeds.push([hx + dx * k, hy + dy * k]);
  }

  const land = new Uint8Array(size);
  for (const group of groups) {
    const dist = new Float32Array(size).fill(Infinity);
    const queue: number[] = [];
    for (const [x, y] of group.seeds) {
      if (!inside(x, y)) continue;
      const i = at(x, y);
      if (dist[i] === 0) continue;
      dist[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = (i % width) + minX;
      const y = Math.floor(i / width) + minY;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inside(nx, ny)) continue;
        const j = at(nx, ny);
        if (dist[j] !== Infinity) continue;
        dist[j] = dist[i] + 1;
        if (dist[j] <= group.radius + COAST_JITTER) queue.push(j);
      }
    }
    for (let i = 0; i < size; i++) {
      const x = (i % width) + minX;
      const y = Math.floor(i / width) + minY;
      if (dist[i] <= group.radius + noise(x, y) * COAST_JITTER) land[i] = 1;
    }
  }

  // The chain river: from the mountain foot east to the first district gap, then south to the sea.
  const river = new Uint8Array(size);
  const riverPath: [number, number][] = [];
  const ordered = [...world.districts].sort((a, b) => a.order - b.order);
  const flat = new Set<number>();
  for (const t of world.tiles) if (inside(t.pos[0], t.pos[1])) flat.add(at(t.pos[0], t.pos[1]));
  for (const n of world.nodes) if (inside(n.pos[0], n.pos[1])) flat.add(at(n.pos[0], n.pos[1]));
  if (ordered.length >= 2) {
    const riverX = ordered[0].region.x1 + 1;
    const startX = MOUNTAIN_PEAK[0] + 4;
    for (let x = startX; x <= riverX; x++)
      if (inside(x, 2)) {
        river[at(x, 2)] = 1;
        riverPath.push([x, 2]);
      }
    for (let y = 3; inside(riverX, y) && land[at(riverX, y)]; y++) {
      river[at(riverX, y)] = 1;
      riverPath.push([riverX, y]);
    }
  }

  const heights = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i % width) + minX;
    const y = Math.floor(i / width) + minY;
    if (!land[i]) {
      heights[i] = WATER_HEIGHT;
      continue;
    }
    const shore = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => !inside(nx, ny) || !land[at(nx, ny)]);
    let h = flat.has(i) ? LAND_HEIGHT : shore ? SHORE_HEIGHT : LAND_HEIGHT + noise(y, x) * 0.25;
    const d = Math.hypot(x - MOUNTAIN_PEAK[0], y - MOUNTAIN_PEAK[1]);
    if (d < MOUNTAIN_RADIUS && !flat.has(i)) h = Math.max(h, PEAK_HEIGHT * Math.pow(1 - d / MOUNTAIN_RADIUS, 1.3) + noise(x, y) * 0.5);
    if (river[i] && !flat.has(i)) h = RIVER_HEIGHT;
    heights[i] = h;
  }

  return {
    minX,
    minY,
    width,
    height,
    land,
    heights,
    river,
    riverPath,
    isLand: (x, y) => inside(x, y) && land[at(x, y)] === 1,
    isRiver: (x, y) => inside(x, y) && river[at(x, y)] === 1,
    heightAt: (x, y) => (inside(x, y) ? heights[at(x, y)] : WATER_HEIGHT),
  };
}

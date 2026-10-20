import type { World } from '../../pipeline/emit';
import { findPath } from '../../pipeline/roads';
import type { WorldIndex } from './index';
import { MOUNTAIN_PEAK, type Terrain } from './terrain';

type Pos = [number, number];
/** tiles per second */
export const SETTLER_SPEED = 0.8;

function straight(from: Pos, to: Pos): Pos[] {
  const path: Pos[] = [];
  let [x, y] = from;
  while (x !== to[0]) {
    x += Math.sign(to[0] - x);
    path.push([x, y]);
  }
  while (y !== to[1]) {
    y += Math.sign(to[1] - y);
    path.push([x, y]);
  }
  return path;
}

/** The last leg of a route: from a building to the Cardano mark, excluding the start tile. */
export type Trail = (from: Pos) => Pos[];

/** Straight line to the peak; only for tests and as a fallback when no land route exists. */
export const straightTrail: Trail = (from) => straight(from, MOUNTAIN_PEAK);

/**
 * Walk to the mark over land, preferring roads: back through the districts and up the mountain,
 * never across the sea. Paths are cached per starting tile.
 */
export function makeTrail(world: World, terrain: Terrain): Trail {
  const blocked = new Set<string>();
  for (let y = terrain.minY; y < terrain.minY + terrain.height; y++)
    for (let x = terrain.minX; x < terrain.minX + terrain.width; x++) if (!terrain.isLand(x, y)) blocked.add(`${x},${y}`);
  const roads = new Set(world.tiles.map((t) => `${t.pos[0]},${t.pos[1]}`));
  const bounds = { minX: terrain.minX, minY: terrain.minY, maxX: terrain.minX + terrain.width - 1, maxY: terrain.minY + terrain.height - 1 };
  const cache = new Map<string, Pos[]>();
  return (from) => {
    const key = `${from[0]},${from[1]}`;
    let path = cache.get(key);
    if (!path) {
      path = (findPath(from, MOUNTAIN_PEAK, { blocked, roads, bounds }) ?? [from, ...straight(from, MOUNTAIN_PEAK)]).slice(1);
      cache.set(key, path);
    }
    return path;
  };
}

/**
 * Routes a ship's settlers walk: harbor → each product the customer uses → that product's busiest
 * dependency, step by step, until nothing is left → a trail up to the Cardano mark.
 */
export function settlerRoutes(world: World, idx: WorldIndex, customerId: string, trail: Trail = straightTrail): Pos[][] {
  const routes: Pos[][] = [];
  for (const first of idx.out.get(customerId) ?? []) {
    if (first.confidence === 'inferred') continue;
    const route: Pos[] = [...first.path];
    const visited = new Set([first.to]);
    let current = first.to;
    for (;;) {
      const next = (idx.out.get(current) ?? [])
        .filter((e) => e.confidence !== 'inferred' && !visited.has(e.to))
        .sort((a, b) => b.traffic - a.traffic || (a.id < b.id ? -1 : 1))[0];
      if (!next) break;
      route.push(...next.path.slice(1));
      visited.add(next.to);
      current = next.to;
    }
    route.push(...trail(route[route.length - 1]));
    routes.push(route);
  }
  return routes;
}

/** Tiles walked along the route by settler i of n after `seconds` (wraps back to the harbor). */
export function settlerDistance(route: Pos[], i: number, n: number, seconds: number): number {
  const len = route.length - 1;
  if (len <= 0) return 0;
  // positive modulo: the first animation frame can report a slightly negative clock
  return ((((i / n) * len + seconds * SETTLER_SPEED) % len) + len) % len;
}

export function pointAt(route: Pos[], d: number): Pos {
  const len = route.length - 1;
  if (len <= 0) return [route[0][0], route[0][1]];
  const k = Math.min(Math.max(Math.floor(d), 0), len - 1);
  const f = d - k;
  const [ax, ay] = route[k];
  const [bx, by] = route[k + 1];
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
}

/** Position of settler i of n on a route after `seconds`; a pure function of its inputs. */
export function settlerPosition(route: Pos[], i: number, n: number, seconds: number): Pos {
  return pointAt(route, settlerDistance(route, i, n, seconds));
}

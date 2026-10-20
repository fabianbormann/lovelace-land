import type { World } from '../../pipeline/emit';
import type { WorldIndex } from './index';
import { MOUNTAIN_PEAK } from './terrain';

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

/**
 * Routes a ship's settlers walk: harbor → each product the customer uses → that product's busiest
 * dependency, step by step, until nothing is left → a trail up to the Cardano mark.
 */
export function settlerRoutes(world: World, idx: WorldIndex, customerId: string): Pos[][] {
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
    route.push(...straight(route[route.length - 1], MOUNTAIN_PEAK));
    routes.push(route);
  }
  return routes;
}

/** Tiles walked along the route by settler i of n after `seconds` (wraps back to the harbor). */
export function settlerDistance(route: Pos[], i: number, n: number, seconds: number): number {
  const len = route.length - 1;
  return len <= 0 ? 0 : ((i / n) * len + seconds * SETTLER_SPEED) % len;
}

export function pointAt(route: Pos[], d: number): Pos {
  const len = route.length - 1;
  if (len <= 0) return [route[0][0], route[0][1]];
  const k = Math.min(Math.floor(d), len - 1);
  const f = d - k;
  const [ax, ay] = route[k];
  const [bx, by] = route[k + 1];
  return [ax + (bx - ax) * f, ay + (by - ay) * f];
}

/** Position of settler i of n on a route after `seconds`; a pure function of its inputs. */
export function settlerPosition(route: Pos[], i: number, n: number, seconds: number): Pos {
  return pointAt(route, settlerDistance(route, i, n, seconds));
}

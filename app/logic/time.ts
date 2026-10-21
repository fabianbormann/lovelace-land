import type { World } from '../../pipeline/emit';
import type { Timeline } from '../../pipeline/timeline';

/** Road surfaces for monthly traffic (sums of log10(1 + tx) weights). */
export const TIME_SURFACE = [0.5, 5, 25] as const;
const TOP_FRACTION = 0.15;
const MAX_DEPENDENTS = 3;

export interface Cursor {
  index: number;
  frac: number;
  month: string;
}

/** A continuous time T (in months from the first month) as month index plus fraction. */
export function cursorAt(months: string[], T: number): Cursor {
  const last = months.length - 1;
  const t = Math.min(Math.max(T, 0), last);
  const index = Math.min(Math.floor(t), last);
  const frac = index === last ? 0 : t - index;
  return { index, frac, month: months[index] };
}

/** Value of a monthly series at continuous time T (no allocations: runs every frame during playback). */
export function seriesAt(series: number[], T: number) {
  const last = series.length - 1;
  const t = Math.min(Math.max(T, 0), last);
  const index = Math.min(Math.floor(t), last);
  const frac = index === last ? 0 : t - index;
  return series[index] + (series[Math.min(index + 1, last)] - series[index]) * frac;
}
const lerp = seriesAt;

export const isStanding = (state: string) => state !== 'e' && state !== 'g';

export function edgeTrafficAt(tl: Timeline, edgeIndex: number, T: number) {
  return lerp(tl.edges[edgeIndex], T);
}

export function tierAt(tl: Timeline, nodeId: string, T: number) {
  return Number(tl.nodes[nodeId].tier[cursorAt(tl.months, T).index]);
}

export function nodeStateAt(tl: Timeline, nodeId: string, T: number) {
  return tl.nodes[nodeId].state[cursorAt(tl.months, T).index];
}

const DOCKED: Record<string, number> = { d: 1, a: 0, w: 1 };

/**
 * docked: 1 = docked, 0 = away (a ghost at its berth); ships fade during the month their activity changes.
 * arrived: 0 = still beyond the horizon, 1 = at the harbor; a ship sails in during the month before it first docks,
 * and once it has arrived it stays, as a ghost when it is quiet.
 */
export function shipPresence(tl: Timeline, customerId: string, T: number): { docked: number; wreck: boolean; arrived: number } {
  const { index, frac } = cursorAt(tl.months, T);
  const state = tl.customers[customerId].state;
  const now = state[index];
  if (now === 'w') return { docked: 1, wreck: true, arrived: 1 };
  const next = state[Math.min(index + 1, state.length - 1)];
  const target = next === 'w' ? 0 : DOCKED[next];
  const seen = state.lastIndexOf('d', index) !== -1;
  const arrived = seen ? 1 : next === 'd' && index < state.length - 1 ? frac : 0;
  return { docked: DOCKED[now] + (target - DOCKED[now]) * frac, wreck: false, arrived };
}

/** Stranded and hidden-highway buildings in a given month. */
export function flagsAt(world: World, monthIndex: number) {
  const tl = world.timeline;
  const standing = world.nodes.filter((n) => isStanding(tl.nodes[n.id].state[monthIndex]));
  const traffic = (id: string) => tl.nodes[id].traffic[monthIndex];
  const stranded = new Set(standing.filter((n) => traffic(n.id) === 0).map((n) => n.id));
  const desc = standing.map((n) => traffic(n.id)).sort((a, b) => b - a);
  const k = Math.ceil(desc.length * TOP_FRACTION);
  const threshold = k > 0 ? desc[k - 1] : Infinity;
  const highways = new Set(
    standing.filter((n) => traffic(n.id) > 0 && traffic(n.id) >= threshold && n.dependents <= MAX_DEPENDENTS).map((n) => n.id),
  );
  return { stranded, highways };
}

export function statsAt(world: World, monthIndex: number) {
  const tl = world.timeline;
  return {
    buildings: world.nodes.filter((n) => isStanding(tl.nodes[n.id].state[monthIndex])).length,
    ships: world.customers.filter((c) => tl.customers[c.id].state[monthIndex] === 'd').length,
    stranded: flagsAt(world, monthIndex).stranded.size,
    tx: tl.totals[monthIndex],
  };
}

export function surfaceAt(traffic: number): 0 | 1 | 2 | 3 {
  let s: 0 | 1 | 2 | 3 = 0;
  TIME_SURFACE.forEach((t, i) => {
    if (traffic >= t) s = (i + 1) as 1 | 2 | 3;
  });
  return s;
}

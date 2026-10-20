import type { Stage } from '../../pipeline/schema';

export type ShipKind = 'galleon' | 'rowboat' | 'horizon' | 'wreck';
export type Coast = 'east' | 'north' | 'south';

const KIND: Record<Stage, ShipKind> = { production: 'galleon', pilot: 'rowboat', announced: 'horizon', ended: 'wreck' };
export const shipKind = (stage: Stage): ShipKind => KIND[stage];

const PER_ROW = 5;
const ALONG = 2.4;
const ROW_GAP = 2.6;
const BASE = 5;
const HORIZON_EXTRA = 6;

const OUTWARD: Record<Coast, [number, number]> = { east: [1, 0], north: [0, -1], south: [0, 1] };
const ALONG_DIR: Record<Coast, [number, number]> = { east: [0, 1], north: [1, 0], south: [1, 0] };

/** Where a customer's ship floats, in tile coordinates, plus its heading (radians around the vertical axis). */
export function shipPlacement(coast: Coast, harbor: [number, number], slot: number, stage: Stage): { x: number; y: number; rotation: number } {
  const [ox, oy] = OUTWARD[coast];
  const [ax, ay] = ALONG_DIR[coast];
  const row = Math.floor(slot / PER_ROW);
  const along = ((slot % PER_ROW) - (PER_ROW - 1) / 2) * ALONG;
  const out = BASE + row * ROW_GAP + (stage === 'announced' ? HORIZON_EXTRA : 0);
  return { x: harbor[0] + ox * out + ax * along, y: harbor[1] + oy * out + ay * along, rotation: Math.atan2(ax, ay) };
}

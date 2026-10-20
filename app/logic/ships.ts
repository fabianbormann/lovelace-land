import type { Stage } from '../../pipeline/schema';

export type ShipKind = 'galleon' | 'rowboat' | 'horizon' | 'wreck';
export type Coast = 'east' | 'north' | 'south';

const KIND: Record<Stage, ShipKind> = { production: 'galleon', pilot: 'rowboat', announced: 'horizon', ended: 'wreck' };
export const shipKind = (stage: Stage): ShipKind => KIND[stage];

const PER_ROW = 6;
const ALONG = 3.2;
const ROW_GAP = 4.4;
const BASE = 6;
const HORIZON_EXTRA = 7;

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

/** Ships closer than this (in tiles) would overlap. */
export const MIN_SHIP_GAP = 2.6;

interface HarborSector {
  id: string;
  coast: Coast;
  harbor: { pos: [number, number] };
}
interface Mooring {
  id: string;
  harbor: string;
  slot: number;
  stage: Stage;
}

/**
 * Berths for every ship. Harbors that share a coast get narrower rows so their fleets don't
 * spill into each other, and any berth that would still touch another ship moves one berth on.
 */
export function placeShips(sectors: HarborSector[], customers: Mooring[]): Map<string, { x: number; y: number; rotation: number }> {
  const placed = new Map<string, { x: number; y: number; rotation: number }>();
  const all: { x: number; y: number }[] = [];
  for (const s of sectors) {
    const along = s.coast === 'east' ? 1 : 0;
    let gap = Infinity;
    for (const o of sectors) if (o !== s && o.coast === s.coast) gap = Math.min(gap, Math.abs(o.harbor.pos[along] - s.harbor.pos[along]));
    const cols = Math.max(1, Math.min(PER_ROW, Math.floor((gap - MIN_SHIP_GAP) / ALONG) + 1));
    const fleet = customers.filter((c) => c.harbor === s.id).sort((a, b) => a.slot - b.slot || (a.id < b.id ? -1 : 1));
    const [ox, oy] = OUTWARD[s.coast];
    const [ax, ay] = ALONG_DIR[s.coast];
    let k = 0;
    for (const c of fleet) {
      for (;; k++) {
        const row = Math.floor(k / cols);
        const offset = ((k % cols) - (cols - 1) / 2) * ALONG;
        const out = BASE + row * ROW_GAP + (c.stage === 'announced' ? HORIZON_EXTRA : 0);
        const spot = { x: s.harbor.pos[0] + ox * out + ax * offset, y: s.harbor.pos[1] + oy * out + ay * offset, rotation: Math.atan2(ax, ay) };
        if (all.every((p) => Math.hypot(p.x - spot.x, p.y - spot.y) >= MIN_SHIP_GAP)) {
          placed.set(c.id, spot);
          all.push(spot);
          k++;
          break;
        }
      }
    }
  }
  return placed;
}

import { describe, expect, it } from 'vitest';
import { MIN_SHIP_GAP, placeShips, shipKind, shipPlacement } from '../../app/logic/ships';

describe('ships', () => {
  it('maps stage to ship kind', () => {
    expect(['production', 'pilot', 'announced', 'ended'].map((s) => shipKind(s as never))).toEqual(['galleon', 'rowboat', 'horizon', 'wreck']);
  });

  it('places ships seaward of the harbor', () => {
    expect(shipPlacement('east', [100, 0], 0, 'production').x).toBeGreaterThan(100);
    expect(shipPlacement('north', [50, -20], 0, 'production').y).toBeLessThan(-20);
    expect(shipPlacement('south', [50, 20], 0, 'production').y).toBeGreaterThan(20);
  });

  it('spreads slots so ships do not overlap', () => {
    const spots = Array.from({ length: 12 }, (_, i) => shipPlacement('east', [100, 0], i, 'production'));
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(1.5);
  });

  it('puts announced ships further out than production ships', () => {
    expect(shipPlacement('east', [100, 0], 0, 'announced').x).toBeGreaterThan(shipPlacement('east', [100, 0], 0, 'production').x);
  });
});

describe('placeShips', () => {
  const sectors = [
    { id: 'a', coast: 'east' as const, harbor: { pos: [100, -16] as [number, number] } },
    { id: 'b', coast: 'east' as const, harbor: { pos: [100, -6] as [number, number] } },
    { id: 'c', coast: 'east' as const, harbor: { pos: [100, 5] as [number, number] } },
    { id: 'lonely', coast: 'north' as const, harbor: { pos: [50, -30] as [number, number] } },
  ];
  const fleet = (harbor: string, n: number, stage = 'production') =>
    Array.from({ length: n }, (_, slot) => ({ id: `${harbor}-${slot}`, harbor, slot, stage: stage as never }));
  const customers = [...fleet('a', 14), ...fleet('b', 14), ...fleet('c', 5), ...fleet('lonely', 6), ...fleet('c', 2, 'announced').map((c, i) => ({ ...c, id: `c-far-${i}`, slot: 5 + i }))];

  it('keeps every ship clear of every other ship, across neighbouring harbors', () => {
    const spots = [...placeShips(sectors, customers).values()];
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThanOrEqual(MIN_SHIP_GAP);
  });

  it('uses a wide row when a harbor has the coast to itself', () => {
    const spots = fleet('lonely', 6).map((c) => placeShips(sectors, customers).get(c.id)!);
    expect(new Set(spots.map((s) => s.y)).size).toBe(1);
  });

  it('is deterministic', () => {
    expect([...placeShips(sectors, customers)]).toEqual([...placeShips(sectors, customers)]);
  });
});

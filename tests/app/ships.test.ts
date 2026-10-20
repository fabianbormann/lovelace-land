import { describe, expect, it } from 'vitest';
import { shipKind, shipPlacement } from '../../app/logic/ships';

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

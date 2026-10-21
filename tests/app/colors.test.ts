import { describe, expect, it } from 'vitest';
import { accentFor } from '../../app/logic/colors';

const sectors = new Map([['defi', '#c0392b']]);

describe('accentFor', () => {
  it('uses the brand color for roofs when the project has one', () => {
    expect(accentFor({ brand: { color: '#1e5bd8', source: 'https://fluidtokens.com' }, primarySector: 'defi' }, '#888888', sectors)).toBe('#1e5bd8');
  });

  it('falls back to the sector color, then the district color', () => {
    expect(accentFor({ primarySector: 'defi' }, '#888888', sectors)).toBe('#c0392b');
    expect(accentFor({ primarySector: 'unknown' }, '#888888', sectors)).toBe('#888888');
    expect(accentFor({ primarySector: null }, '#888888', sectors)).toBe('#888888');
  });
});

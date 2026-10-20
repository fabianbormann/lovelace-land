import { describe, expect, it } from 'vitest';
import { monthDiff, monthOf, monthRange } from '../../pipeline/months';

describe('months', () => {
  it('builds inclusive ranges across years', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03']);
    expect(monthRange('2026-04', '2026-03')).toEqual([]);
  });
  it('takes the month of an ISO timestamp', () => {
    expect(monthOf('2026-10-20T00:00:00.000Z')).toBe('2026-10');
  });
  it('counts months between two months', () => {
    expect(monthDiff('2025-11', '2026-02')).toBe(3);
    expect(monthDiff('2026-02', '2025-11')).toBe(-3);
  });
});

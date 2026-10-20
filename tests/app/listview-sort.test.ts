import { describe, expect, it } from 'vitest';
import { indexWorld } from '../../app/logic/index';
import { tableRows } from '../../app/ui/listview';
import { miniWorld } from './world';

describe('list view rows', () => {
  it('sorts building size by tier while showing its name', () => {
    const { columns, rows } = tableRows(indexWorld(miniWorld()), 'nodes');
    const size = columns.find((c) => c.key === 'size')!;
    const sorted = [...rows].sort((a, b) => (size.value(a) as number) - (size.value(b) as number));
    const labels = sorted.map((r) => size.display!(r));
    expect(labels.indexOf('hut')).toBeLessThan(labels.lastIndexOf('house') === -1 ? Infinity : labels.lastIndexOf('house'));
    expect(typeof size.value(rows[0])).toBe('number');
  });
});

import { describe, expect, it } from 'vitest';
import { indexWorld } from '../../app/logic/index';
import { search } from '../../app/logic/search';
import { miniWorld } from './world';

const idx = indexWorld(miniWorld());

describe('search', () => {
  it('returns nothing for a blank query', () => {
    expect(search(idx, '  ')).toEqual([]);
  });

  it('ranks name prefix over word prefix over substring', () => {
    const r = search(idx, 'mill');
    expect(r[0]).toMatchObject({ kind: 'node', id: 'mill-indexer', name: 'Mill Indexer' });
    expect(search(idx, 'town').map((x) => x.id)).toEqual(['swap-town']);
    expect(search(idx, 'ild').map((x) => x.id)).toEqual(['guild-of-scribes']);
  });

  it('is case and accent insensitive and finds customers', () => {
    expect(search(idx, 'GUÍLD')[0]).toMatchObject({ kind: 'customer', id: 'guild-of-scribes' });
  });

  it('respects the limit', () => {
    expect(search(idx, 'e', 2)).toHaveLength(2);
  });
});

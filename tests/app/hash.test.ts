import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from '../../app/logic/hash';

describe('deep links', () => {
  it('parses node and customer links', () => {
    expect(parseHash('#node=yaci-store')).toEqual({ kind: 'node', id: 'yaci-store' });
    expect(parseHash('#customer=bolnisi')).toEqual({ kind: 'customer', id: 'bolnisi' });
    expect(parseHash('#edge=a-%3Eb')).toEqual({ kind: 'edge', id: 'a->b' });
  });

  it('ignores empty or unknown hashes', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#foo=bar')).toBeNull();
    expect(parseHash('#node=')).toBeNull();
  });

  it('round-trips', () => {
    expect(parseHash(formatHash({ kind: 'edge', id: 'a->b' }))).toEqual({ kind: 'edge', id: 'a->b' });
    expect(formatHash(null)).toBe('');
  });
});

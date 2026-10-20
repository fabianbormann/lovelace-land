import { describe, expect, it } from 'vitest';
import { collectUrls } from '../../scripts/lib/links';
import { customer, makeData, node } from '../helpers';

describe('collectUrls', () => {
  it('collects every link, evidence and metric URL with the file that cites it, once per URL', () => {
    const data = makeData({
      nodes: [node('a', 'core', [], { links: { repo: 'https://github.com/x/a' } }), node('p', 'products', ['a'])],
      customers: [
        customer('c', ['defi'], ['p'], { metric: { label: 'Users', value: 5, source: 'https://example.org/evidence', retrieved: '2026-10-20' } }),
      ],
    });
    expect(collectUrls(data)).toEqual([
      { url: 'https://example.org/evidence', files: ['customers/c.yaml', 'nodes/p.yaml'] },
      { url: 'https://github.com/x/a', files: ['nodes/a.yaml'] },
    ]);
  });
});

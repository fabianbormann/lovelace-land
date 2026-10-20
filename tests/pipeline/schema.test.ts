import { describe, expect, it } from 'vitest';
import { CustomerSchema, DistrictSchema, NodeSchema } from '../../pipeline/schema';

const evidence = [{ url: 'https://example.org/a', kind: 'manifest', retrieved: '2026-10-20' }];
const baseNode = {
  id: 'yaci-store',
  name: 'Yaci Store',
  district: 'indexers',
  description: 'Indexer',
  status: 'active',
  lastVerified: '2026-10-20',
};

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.success ? [] : result.error!.issues.map((i) => i.message);
}

describe('NodeSchema', () => {
  it('parses a minimal node and fills defaults', () => {
    const node = NodeSchema.parse(baseNode);
    expect(node.links).toEqual({});
    expect(node.packages).toEqual([]);
    expect(node.uses).toEqual([]);
    expect(node.primarySector).toBeNull();
  });

  it('parses a node with a sourced edge', () => {
    const node = NodeSchema.parse({
      ...baseNode,
      uses: [{ target: 'cardano-client-lib', relation: 'library', confidence: 'verified', evidence }],
    });
    expect(node.uses[0].target).toBe('cardano-client-lib');
  });

  it('rejects unknown keys such as a typo of "uses"', () => {
    const r = NodeSchema.safeParse({ ...baseNode, use: [] });
    expect(messages(r).join()).toContain("'use'");
  });

  it('rejects an edge without evidence', () => {
    const r = NodeSchema.safeParse({
      ...baseNode,
      uses: [{ target: 'x', relation: 'library', confidence: 'verified', evidence: [] }],
    });
    expect(messages(r)).toContain('needs at least one evidence entry');
  });

  it('rejects non-http(s) URLs in evidence and links', () => {
    const bad = NodeSchema.safeParse({
      ...baseNode,
      links: { repo: 'javascript:alert(1)' },
      uses: [{ target: 'x', relation: 'library', confidence: 'verified', evidence: [{ ...evidence[0], url: 'ftp://example.org' }] }],
    });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues).toHaveLength(2);
  });

  it('rejects a malformed date and a non-slug id', () => {
    const r = NodeSchema.safeParse({ ...baseNode, id: 'Yaci Store', lastVerified: '20 Oct 2026' });
    expect(messages(r)).toEqual(
      expect.arrayContaining(['must be a lowercase slug like "yaci-store"', 'must be a date like 2026-10-20']),
    );
  });
});

describe('CustomerSchema', () => {
  const baseCustomer = {
    id: 'usdm-holders',
    name: 'USDM holders',
    type: 'segment',
    sectors: ['defi'],
    stage: 'production',
    description: 'Holders',
    lastVerified: '2026-10-20',
  };

  it('requires at least one used product', () => {
    const r = CustomerSchema.safeParse({ ...baseCustomer, uses: [] });
    expect(messages(r)).toContain('a customer must use at least one product');
  });

  it('does not accept a relation on customer edges', () => {
    const r = CustomerSchema.safeParse({
      ...baseCustomer,
      uses: [{ target: 'usdm', relation: 'library', confidence: 'verified', evidence }],
    });
    expect(messages(r).join()).toContain("'relation'");
  });

  it('accepts a numeric or string metric value', () => {
    const c = CustomerSchema.parse({
      ...baseCustomer,
      uses: [{ target: 'usdm', confidence: 'verified', evidence }],
      metric: { label: 'Supply', value: 1000000, source: 'https://example.org/m', retrieved: '2026-10-20' },
    });
    expect(c.metric?.value).toBe(1000000);
  });
});

describe('DistrictSchema', () => {
  it('defaults columns to 3 and validates color', () => {
    const d = DistrictSchema.parse({ id: 'sdks', name: 'SDKs', description: 'd', building: 'workshop', order: 2, color: '#aabbcc' });
    expect(d.columns).toBe(3);
    expect(DistrictSchema.safeParse({ ...d, color: 'red' }).success).toBe(false);
  });
});

describe('time axis fields', () => {
  const hash = 'e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309';
  it('accepts onchain identifiers and an active window on nodes and customers', () => {
    const n = NodeSchema.parse({ ...baseNode, onchain: { scripts: [hash], metadataLabels: [674], source: 'https://example.org/x' }, active: { from: '2023-05', until: '2025-01' } });
    expect(n.onchain?.scripts).toEqual([hash]);
    expect(n.active).toEqual({ from: '2023-05', until: '2025-01' });
    const c = CustomerSchema.parse({
      id: 'x', name: 'X', type: 'organization', sectors: ['defi'], stage: 'pilot', description: 'd', lastVerified: '2026-10-20',
      uses: [{ target: 'p', confidence: 'verified', evidence }],
      onchain: { addresses: ['addr1qxyz0123'] }, active: { from: '2024-02' },
    });
    expect(c.active?.from).toBe('2024-02');
  });

  it('accepts a confirmation month on a customer’s announced window, but not on a node’s', () => {
    const c = CustomerSchema.parse({
      id: 'x', name: 'X', type: 'organization', sectors: ['defi'], stage: 'pilot', description: 'd', lastVerified: '2026-10-20',
      uses: [{ target: 'p', confidence: 'verified', evidence }],
      active: { from: '2022-01', confirmed: '2025-06' },
    });
    expect(c.active).toEqual({ from: '2022-01', confirmed: '2025-06' });
    expect(NodeSchema.safeParse({ ...baseNode, active: { from: '2022-01', confirmed: '2025-06' } }).success).toBe(false);
  });

  it('rejects malformed hashes and months', () => {
    expect(NodeSchema.safeParse({ ...baseNode, onchain: { scripts: ['ABC'] } }).success).toBe(false);
    expect(NodeSchema.safeParse({ ...baseNode, active: { from: '2024-13' } }).success).toBe(false);
    expect(NodeSchema.safeParse({ ...baseNode, active: { from: 'May 2024' } }).success).toBe(false);
  });
});

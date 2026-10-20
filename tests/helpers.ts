import type { LoadedData } from '../pipeline/load';
import {
  CustomerSchema,
  DistrictSchema,
  NodeSchema,
  SectorSchema,
  type Confidence,
  type Customer,
  type District,
  type Node,
  type Relation,
  type Sector,
} from '../pipeline/schema';

const EVIDENCE = [{ url: 'https://example.org/evidence', kind: 'docs', retrieved: '2026-10-20' }];

export type UseSpec = string | { target: string; confidence?: Confidence; relation?: Relation };

const toUse = (u: UseSpec) =>
  typeof u === 'string'
    ? { target: u, confidence: 'verified', evidence: EVIDENCE }
    : { confidence: 'verified', evidence: EVIDENCE, ...u };

export function district(id: string, order: number, extra: Record<string, unknown> = {}): District {
  return DistrictSchema.parse({ id, name: id, description: id, building: 'workshop', order, color: '#888888', ...extra });
}

export function sector(id: string, coast: 'east' | 'north' | 'south' = 'east'): Sector {
  return SectorSchema.parse({ id, name: id, description: id, inclusion: id, coast });
}

export function node(id: string, districtId: string, uses: UseSpec[] = [], extra: Record<string, unknown> = {}): Node {
  return NodeSchema.parse({
    id,
    name: id,
    district: districtId,
    description: id,
    status: 'active',
    lastVerified: '2026-10-20',
    uses: uses.map((u) => ({ relation: 'library', ...toUse(u) })),
    ...extra,
  });
}

export function customer(id: string, sectors: string[], uses: UseSpec[], extra: Record<string, unknown> = {}): Customer {
  return CustomerSchema.parse({
    id,
    name: id,
    type: 'organization',
    sectors,
    stage: 'production',
    description: id,
    lastVerified: '2026-10-20',
    uses: uses.map(toUse),
    ...extra,
  });
}

export function makeData(parts: Partial<LoadedData>): LoadedData {
  return {
    districts: parts.districts ?? [district('core', 0), district('sdks', 1), district('products', 2, { building: 'town' })],
    sectors: parts.sectors ?? [sector('defi', 'east'), sector('proof', 'north')],
    nodes: parts.nodes ?? [],
    customers: parts.customers ?? [],
  };
}

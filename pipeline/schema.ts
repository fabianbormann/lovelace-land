import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug like "yaci-store"');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-20');
// The public site renders these as links, so only http(s) is allowed.
const httpUrl = z.string().regex(/^https?:\/\/\S+$/, 'must be a full URL starting with http:// or https://');
const text = z.string().min(1, 'must not be empty');
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be a month like 2024-05');
export const SlugSchema = slug;
export const IsoDateSchema = isoDate;

/** On-chain identifiers whose transactions count as this entity's usage (time axis). */
const OnchainSchema = z
  .object({
    scripts: z.array(z.string().regex(/^[0-9a-f]{56}$/, 'must be a 56-character lowercase hex script hash')).optional(),
    metadataLabels: z.array(z.number().int().nonnegative()).optional(),
    addresses: z.array(z.string().regex(/^addr1[0-9a-z]+$/, 'must be a mainnet bech32 address')).optional(),
    source: httpUrl.optional(),
    note: z.string().optional(),
  })
  .strict();
/** Announced activity window for entities without on-chain data. */
const ActiveSchema = z.object({ from: YearMonthSchema, until: YearMonthSchema.optional() }).strict();
/** A customer's window may also say when its use was last publicly confirmed; without an end date it fades after that. */
const CustomerActiveSchema = ActiveSchema.extend({ confirmed: YearMonthSchema.optional() }).strict();

export const BUILDINGS = [
  'relay-tower',
  'watermill',
  'market-hall',
  'forge',
  'workshop',
  'lighthouse',
  'vault',
  'tool-shed',
  'town',
  'bridge',
] as const;

export const ConfidenceSchema = z.enum(['verified', 'reported', 'inferred']);
export const RelationSchema = z.enum(['library', 'service', 'language', 'infrastructure']);
export const StageSchema = z.enum(['announced', 'pilot', 'production', 'ended']);

export const DistrictSchema = z
  .object({
    id: slug,
    name: text,
    description: text,
    building: z.enum(BUILDINGS),
    order: z.number().int(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #6b8e23'),
    columns: z.number().int().min(1).max(12).default(3),
  })
  .strict();
export const DistrictsFileSchema = z.array(DistrictSchema);

export const SectorSchema = z
  .object({
    id: slug,
    name: text,
    description: text,
    inclusion: text,
    coast: z.enum(['east', 'north', 'south']),
  })
  .strict();
export const SectorsFileSchema = z.array(SectorSchema);

export const EvidenceSchema = z
  .object({
    url: httpUrl,
    kind: z.enum(['manifest', 'plutus-json', 'docs', 'announcement', 'case-study', 'talk', 'article']),
    retrieved: isoDate,
    note: z.string().optional(),
  })
  .strict();

const usesFields = {
  target: slug,
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema).min(1, 'needs at least one evidence entry'),
};
export const NodeUsesSchema = z.object({ ...usesFields, relation: RelationSchema }).strict();
export const CustomerUsesSchema = z.object(usesFields).strict();

export const NodeSchema = z
  .object({
    id: slug,
    name: text,
    district: slug,
    description: text,
    maintainer: text.optional(),
    links: z
      .object({ website: httpUrl.optional(), repo: httpUrl.optional(), docs: httpUrl.optional() })
      .strict()
      .default({}),
    packages: z
      .array(
        z
          .object({
            ecosystem: z.enum(['npm', 'maven', 'cargo', 'hackage', 'go', 'pypi', 'nuget']),
            name: text,
          })
          .strict(),
      )
      .default([]),
    status: z.enum(['active', 'maintenance', 'deprecated']),
    primarySector: slug.nullable().default(null),
    uses: z.array(NodeUsesSchema).default([]),
    onchain: OnchainSchema.optional(),
    active: ActiveSchema.optional(),
    lastVerified: isoDate,
  })
  .strict();

export const CustomerSchema = z
  .object({
    id: slug,
    name: text,
    type: z.enum(['organization', 'government', 'dao', 'segment']),
    sectors: z.array(slug).min(1, 'must list at least one sector'),
    stage: StageSchema,
    description: text,
    metric: z
      .object({
        label: text,
        value: z.union([z.string().min(1), z.number()]),
        source: httpUrl,
        retrieved: isoDate,
      })
      .strict()
      .optional(),
    uses: z.array(CustomerUsesSchema).min(1, 'a customer must use at least one product'),
    onchain: OnchainSchema.optional(),
    active: CustomerActiveSchema.optional(),
    lastVerified: isoDate,
  })
  .strict();

export type Building = (typeof BUILDINGS)[number];
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type District = z.infer<typeof DistrictSchema>;
export type Sector = z.infer<typeof SectorSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type NodeUses = z.infer<typeof NodeUsesSchema>;
export type CustomerUses = z.infer<typeof CustomerUsesSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Customer = z.infer<typeof CustomerSchema>;

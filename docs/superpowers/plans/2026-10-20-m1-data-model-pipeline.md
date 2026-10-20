# Cardano Island — Milestone 1: Data Model + Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested TypeScript pipeline that turns the YAML dataset in `data/` into `public/world.json` (traffic, flags, stable layout, routed roads) and a committed `data/layout.lock.json`.

**Architecture:** Pure functions in `pipeline/`, one per stage (load → validate → graph → traffic → flags → layout → roads → emit), orchestrated by `runPipeline()` and wrapped by a thin CLI. Every stage is deterministic and unit-tested with small in-memory worlds built by `tests/helpers.ts`; one fictional fixture world in `fixtures/mini/` exercises the full pipeline end to end.

**Tech Stack:** Node 22, TypeScript 5.x (strict), zod 3.25.x, yaml 2.x, vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-20-cardano-island-design.md` (Milestone 1 = sections 2, 3, 6, 8, 9-pipeline).

## Global Constraints

- Stage weights: `production` = 1, `pilot` = 0.5, `announced` = 0.25, `ended` = 0.
- Each customer adds its weight to an edge/node **once**, regardless of how many routes reach it; cycles must not loop.
- Default traffic counts only `verified` and `reported` edges; `trafficWithRumors` also counts `inferred`.
- Stranded = node traffic is 0 (ended customers weigh 0).
- Hidden highway = node traffic in top 15% of nodes AND ≤ 3 direct dependents (thresholds are constants in `flags.ts`).
- Size tier 1–4 = quartiles (nearest-rank) of traffic among non-stranded nodes; stranded nodes are tier 1.
- Error message format: `<file>: <path> <problem>`, e.g. `nodes/foo.yaml: uses[1].target "bar" not found`.
- Cycles → warning, not failure. Full district → region grows.
- Adding entries must never move existing node positions (layout lock).
- Same input → byte-identical `world.json` (given the same `generatedAt`) and lockfile.
- Licensing: code MIT, `data/` CC-BY-4.0.
- Out of scope for M1: manifest scanner, link checker, CI workflows, CONTRIBUTING.md, renderer (later milestones).

### Spec refinements decided in this plan (Task 9 writes them back into spec §3.5)

- `districts[]` gain `region: {x0,x1,y0,y1}`; `sectors[]` gain `harbor: {pos}`; `world` gains `bounds`; `tiles[]` gain `rumor` (tile crossed only by `inferred` edges); `customers[]` gain `weight`; nodes/customers are emitted without `uses` (edges carry them).
- Harbor positions are recomputed each build from the island bounds (they move outward as the island grows); node positions are locked.
- A district's `x0`/`columns` are locked once assigned; districts added later are appended east of all existing ones.

## Review Focus

1. A contributor typos a key (`use:` instead of `uses:`) → validation fails naming the unknown key, instead of silently producing a node with no edges.
2. A contributor saves `nodes/foo.yml` or names the file differently from its `id` → explicit error, never silently skipped.
3. An evidence or link URL with a non-http(s) scheme (`javascript:alert(1)`) → rejected, because the public site will render these as clickable links.
4. Two merged PRs each claim the same plot in `layout.lock.json`, or the lock lists removed nodes → the first id keeps the plot, the other is re-placed, stale entries are dropped; never two buildings on one tile.
5. A fresh repo with zero nodes and zero customers → pipeline emits a valid, empty `world.json` without crashing (empty quantiles, empty bounds).

---

## File Structure

```
package.json, tsconfig.json, .gitignore, LICENSE, README.md
pipeline/
  schema.ts     zod schemas + inferred types for every YAML entity
  load.ts       read data dir → LoadedData; YAML/schema/filename errors
  validate.ts   cross-reference checks (targets, districts, sectors, clashes)
  util.ts       cmp() deterministic string compare
  graph.ts      edges, adjacency, cycle detection
  traffic.ts    transitive customer traffic per edge/node
  flags.ts      stranded, hidden highway, tier, dependents
  layout.ts     plot layout, lock parse/serialize, harbors, bounds
  roads.ts      A* routing with road reuse, road tiles
  emit.ts       World type, buildWorld, serializeWorld
  run.ts        runPipeline orchestration
  cli.ts        npm run build:world / check:data
tests/
  helpers.ts    builders for in-memory worlds
  pipeline/*.test.ts
fixtures/mini/  fictional end-to-end fixture world
data/           districts.yaml, sectors.yaml, nodes/, customers/, LICENSE
```

---

### Task 1: Project scaffold + schemas

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `README.md`
- Create: `pipeline/schema.ts`
- Test: `tests/pipeline/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `pipeline/schema.ts`):
  - Schemas: `DistrictSchema`, `DistrictsFileSchema`, `SectorSchema`, `SectorsFileSchema`, `EvidenceSchema`, `NodeUsesSchema`, `CustomerUsesSchema`, `NodeSchema`, `CustomerSchema`, `ConfidenceSchema`, `RelationSchema`, `StageSchema`
  - Types: `District`, `Sector`, `Evidence`, `NodeUses`, `CustomerUses`, `Node`, `Customer`, `Confidence` (`'verified'|'reported'|'inferred'`), `Relation` (`'library'|'service'|'language'|'infrastructure'`), `Stage` (`'announced'|'pilot'|'production'|'ended'`), `Building`
  - Const: `BUILDINGS`

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/fabianbormann/workspace/CardanoTechnologyLandscape
npm init -y
npm pkg set name=cardano-island private=true type=module
npm pkg delete main
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.build:world="tsx pipeline/cli.ts" scripts.check:data="tsx pipeline/cli.ts --check"
npm install zod@^3.25.0 yaml@^2.9.0
npm install -D typescript@^5.9.0 vitest tsx @types/node@^22
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["pipeline", "tests"]
}
```

Create `.gitignore`:

```
node_modules/
public/world.json
dist/
```

Create `LICENSE` (MIT):

```
MIT License

Copyright (c) 2026 Cardano Island contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Create `README.md`:

```markdown
# Cardano Island

A Settlers-style isometric map of the Cardano technology landscape: tools are buildings,
"uses" relationships are roads that grow with end-user traffic, end customers are ships in harbors.

- Design: `docs/superpowers/specs/2026-10-20-cardano-island-design.md`
- Data: `data/` (CC-BY-4.0) — one YAML file per project or customer
- Build the world: `npm run build:world` → `public/world.json`
- Validate only: `npm run check:data`
- Tests: `npm test`

Code is MIT licensed; data in `data/` is CC-BY-4.0.
```

- [ ] **Step 2: Write the failing schema tests**

Create `tests/pipeline/schema.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/schema.test.ts`
Expected: FAIL — `Failed to resolve import "../../pipeline/schema"`.

- [ ] **Step 4: Implement `pipeline/schema.ts`**

```ts
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug like "yaci-store"');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-20');
// The public site renders these as links, so only http(s) is allowed.
const httpUrl = z.string().regex(/^https?:\/\/\S+$/, 'must be a full URL starting with http:// or https://');
const text = z.string().min(1, 'must not be empty');

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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/schema.test.ts && npm run typecheck`
Expected: all tests PASS, tsc reports no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore LICENSE README.md pipeline/schema.ts tests/pipeline/schema.test.ts
git commit -m "feat(pipeline): project scaffold and zod schemas for the island data model"
```

---

### Task 2: Data loader + fixture world

**Files:**
- Create: `pipeline/load.ts`
- Create: `fixtures/mini/districts.yaml`, `fixtures/mini/sectors.yaml`, `fixtures/mini/nodes/*.yaml` (6 files), `fixtures/mini/customers/*.yaml` (3 files)
- Test: `tests/pipeline/load.test.ts`

**Interfaces:**
- Consumes: `DistrictsFileSchema`, `SectorsFileSchema`, `NodeSchema`, `CustomerSchema`, types from Task 1.
- Produces (from `pipeline/load.ts`):
  - `interface LoadedData { districts: District[]; sectors: Sector[]; nodes: Node[]; customers: Customer[] }`
  - `loadDataDir(dir: string): { data: LoadedData; errors: string[] }`
  - `formatPath(path: (string | number)[]): string` — `['uses', 1, 'target']` → `uses[1].target`
  - `nodeFile(id: string): string` → `nodes/<id>.yaml`; `customerFile(id: string): string` → `customers/<id>.yaml`

- [ ] **Step 1: Create the fictional fixture world**

All names are fictional on purpose so fixture data is never mistaken for real ecosystem data.

`fixtures/mini/districts.yaml`:

```yaml
- id: core
  name: Node & Network
  description: Nodes and network infrastructure.
  building: relay-tower
  order: 0
  color: "#8d7b68"
- id: indexers
  name: Chain Indexers
  description: Chain followers and indexers.
  building: watermill
  order: 1
  color: "#5b8fb9"
- id: sdks
  name: Off-chain SDKs
  description: Libraries for building transactions.
  building: workshop
  order: 2
  color: "#c08b5c"
- id: products
  name: Products & dApps
  description: End-user facing products.
  building: town
  order: 3
  color: "#9bbb59"
```

`fixtures/mini/sectors.yaml`:

```yaml
- id: defi
  name: DeFi
  description: Trading, lending and stable value.
  inclusion: The customer moves or earns value through financial protocols.
  coast: east
- id: proof-verification
  name: Proof & Verification
  description: Notarisation and credential checks.
  inclusion: The customer proves that a document or claim existed or is authentic.
  coast: north
```

`fixtures/mini/nodes/hearth-node.yaml`:

```yaml
id: hearth-node
name: Hearth Node
district: core
description: The fictional block-producing node.
status: active
lastVerified: 2026-10-20
```

`fixtures/mini/nodes/anvil-lib.yaml`:

```yaml
id: anvil-lib
name: Anvil Lib
district: sdks
description: Fictional transaction-building library.
packages:
  - ecosystem: npm
    name: "@fixture/anvil"
status: active
uses:
  - target: hearth-node
    relation: infrastructure
    confidence: verified
    evidence:
      - url: https://example.org/anvil/package.json
        kind: manifest
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/nodes/mill-indexer.yaml`:

```yaml
id: mill-indexer
name: Mill Indexer
district: indexers
description: Fictional chain indexer.
status: active
uses:
  - target: hearth-node
    relation: infrastructure
    confidence: verified
    evidence:
      - url: https://example.org/mill/docs
        kind: docs
        retrieved: 2026-10-20
  - target: anvil-lib
    relation: library
    confidence: verified
    evidence:
      - url: https://example.org/mill/build.gradle
        kind: manifest
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/nodes/lonely-tool.yaml`:

```yaml
id: lonely-tool
name: Lonely Tool
district: sdks
description: Fictional tool nobody ships to a customer.
status: maintenance
uses:
  - target: hearth-node
    relation: infrastructure
    confidence: verified
    evidence:
      - url: https://example.org/lonely/readme
        kind: docs
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/nodes/swap-town.yaml`:

```yaml
id: swap-town
name: Swap Town
district: products
description: Fictional DEX.
status: active
primarySector: defi
uses:
  - target: anvil-lib
    relation: library
    confidence: verified
    evidence:
      - url: https://example.org/swap/package.json
        kind: manifest
        retrieved: 2026-10-20
  - target: mill-indexer
    relation: service
    confidence: reported
    evidence:
      - url: https://example.org/news/swap-town-indexer
        kind: article
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/nodes/seal-notary.yaml`:

```yaml
id: seal-notary
name: Seal Notary
district: products
description: Fictional document notarisation service.
status: active
primarySector: proof-verification
uses:
  - target: anvil-lib
    relation: library
    confidence: verified
    evidence:
      - url: https://example.org/seal/pom.xml
        kind: manifest
        retrieved: 2026-10-20
  - target: mill-indexer
    relation: service
    confidence: inferred
    evidence:
      - url: https://example.org/forum/seal-maybe-uses-mill
        kind: article
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/customers/harbor-traders.yaml`:

```yaml
id: harbor-traders
name: Harbor Traders
type: segment
sectors: [defi]
stage: production
description: Fictional retail traders.
metric:
  label: Monthly active traders
  value: 1200
  source: https://example.org/stats
  retrieved: 2026-10-20
uses:
  - target: swap-town
    confidence: verified
    evidence:
      - url: https://example.org/swap/stats
        kind: docs
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/customers/guild-of-scribes.yaml`:

```yaml
id: guild-of-scribes
name: Guild of Scribes
type: organization
sectors: [proof-verification]
stage: pilot
description: Fictional notary guild piloting on-chain seals.
uses:
  - target: seal-notary
    confidence: verified
    evidence:
      - url: https://example.org/guild/case-study
        kind: case-study
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

`fixtures/mini/customers/old-pilot.yaml`:

```yaml
id: old-pilot
name: Old Pilot
type: organization
sectors: [defi]
stage: ended
description: Fictional pilot that ended.
uses:
  - target: seal-notary
    confidence: reported
    evidence:
      - url: https://example.org/news/old-pilot
        kind: article
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

- [ ] **Step 2: Write the failing loader tests**

Create `tests/pipeline/load.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPath, loadDataDir } from '../../pipeline/load';

const DISTRICTS = `- { id: core, name: Core, description: d, building: relay-tower, order: 0, color: "#111111" }\n`;
const SECTORS = `- { id: defi, name: DeFi, description: d, inclusion: i, coast: east }\n`;
const NODE_A = `id: a\nname: A\ndistrict: core\ndescription: d\nstatus: active\nlastVerified: 2026-10-20\n`;

function writeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'island-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

describe('formatPath', () => {
  it('formats zod paths like uses[1].target', () => {
    expect(formatPath(['uses', 1, 'target'])).toBe('uses[1].target');
    expect(formatPath([0, 'color'])).toBe('[0].color');
    expect(formatPath([])).toBe('');
  });
});

describe('loadDataDir', () => {
  it('loads the mini fixture without errors', () => {
    const { data, errors } = loadDataDir('fixtures/mini');
    expect(errors).toEqual([]);
    expect(data.districts.map((d) => d.id)).toEqual(['core', 'indexers', 'sdks', 'products']);
    expect(data.sectors).toHaveLength(2);
    expect(data.nodes.map((n) => n.id)).toEqual([
      'anvil-lib',
      'hearth-node',
      'lonely-tool',
      'mill-indexer',
      'seal-notary',
      'swap-town',
    ]);
    expect(data.customers.map((c) => c.id)).toEqual(['guild-of-scribes', 'harbor-traders', 'old-pilot']);
  });

  it('reports missing districts.yaml and sectors.yaml', () => {
    const { errors } = loadDataDir(writeTree({}));
    expect(errors).toEqual(['districts.yaml: file not found', 'sectors.yaml: file not found']);
  });

  it('treats missing nodes/ and customers/ folders as empty', () => {
    const { data, errors } = loadDataDir(writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS }));
    expect(errors).toEqual([]);
    expect(data.nodes).toEqual([]);
    expect(data.customers).toEqual([]);
  });

  it('reports invalid YAML with the file name', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': 'id: [unclosed' });
    const { errors } = loadDataDir(dir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^nodes\/a\.yaml: invalid YAML/);
  });

  it('requires the id to match the filename', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/b.yaml': NODE_A });
    expect(loadDataDir(dir).errors).toEqual(['nodes/b.yaml: id "a" must match the filename "b"']);
  });

  it('rejects .yml files instead of skipping them', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yml': NODE_A });
    expect(loadDataDir(dir).errors).toEqual(['nodes/a.yml: use the .yaml extension']);
  });

  it('ignores hidden files and non-YAML files', () => {
    const dir = writeTree({
      'districts.yaml': DISTRICTS,
      'sectors.yaml': SECTORS,
      'nodes/.gitkeep': '',
      'nodes/README.md': '# notes',
    });
    expect(loadDataDir(dir).errors).toEqual([]);
  });

  it('reports a typo key with file and message', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': NODE_A + 'use: []\n' });
    expect(loadDataDir(dir).errors).toEqual(["nodes/a.yaml: Unrecognized key(s) in object: 'use'"]);
  });

  it('reports nested schema errors with a readable path', () => {
    const yaml =
      NODE_A +
      'uses:\n  - target: b\n    relation: library\n    confidence: verified\n    evidence:\n      - kind: docs\n        retrieved: 2026-10-20\n';
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': yaml });
    expect(loadDataDir(dir).errors).toEqual(['nodes/a.yaml: uses[0].evidence[0].url Required']);
  });

  it('reports errors inside districts.yaml with the list index', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS.replace('#111111', 'brown'), 'sectors.yaml': SECTORS });
    expect(loadDataDir(dir).errors).toEqual(['districts.yaml: [0].color must be a hex color like #6b8e23']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/load.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/load`.

- [ ] **Step 4: Implement `pipeline/load.ts`**

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  CustomerSchema,
  DistrictsFileSchema,
  NodeSchema,
  SectorsFileSchema,
  type Customer,
  type District,
  type Node,
  type Sector,
} from './schema';

export interface LoadedData {
  districts: District[];
  sectors: Sector[];
  nodes: Node[];
  customers: Customer[];
}

export const nodeFile = (id: string) => `nodes/${id}.yaml`;
export const customerFile = (id: string) => `customers/${id}.yaml`;

export function formatPath(path: (string | number)[]): string {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`)).join('');
}

function readYaml(dir: string, rel: string, errors: string[]): unknown {
  let text: string;
  try {
    text = readFileSync(join(dir, rel), 'utf8');
  } catch {
    errors.push(`${rel}: file not found`);
    return undefined;
  }
  try {
    return parse(text);
  } catch (e) {
    errors.push(`${rel}: invalid YAML: ${(e as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

function check<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, rel: string, errors: string[]): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const where = formatPath(issue.path);
    errors.push(where ? `${rel}: ${where} ${issue.message}` : `${rel}: ${issue.message}`);
  }
  return undefined;
}

function listEntryFiles(dir: string, sub: string, errors: string[]): string[] {
  const full = join(dir, sub);
  if (!existsSync(full)) return [];
  const files: string[] = [];
  for (const name of readdirSync(full).sort()) {
    if (name.startsWith('.')) continue;
    if (name.endsWith('.yml')) errors.push(`${sub}/${name}: use the .yaml extension`);
    else if (name.endsWith('.yaml')) files.push(`${sub}/${name}`);
  }
  return files;
}

function loadEntries<T extends { id: string }>(
  dir: string,
  sub: 'nodes' | 'customers',
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  errors: string[],
): T[] {
  const entries: T[] = [];
  for (const rel of listEntryFiles(dir, sub, errors)) {
    const raw = readYaml(dir, rel, errors);
    if (raw === undefined) continue;
    const entry = check(schema, raw, rel, errors);
    if (!entry) continue;
    const expected = rel.slice(sub.length + 1, -'.yaml'.length);
    if (entry.id !== expected) {
      errors.push(`${rel}: id "${entry.id}" must match the filename "${expected}"`);
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

export function loadDataDir(dir: string): { data: LoadedData; errors: string[] } {
  const errors: string[] = [];
  const districtsRaw = readYaml(dir, 'districts.yaml', errors);
  const districts =
    districtsRaw === undefined ? [] : (check(DistrictsFileSchema, districtsRaw, 'districts.yaml', errors) ?? []);
  const sectorsRaw = readYaml(dir, 'sectors.yaml', errors);
  const sectors = sectorsRaw === undefined ? [] : (check(SectorsFileSchema, sectorsRaw, 'sectors.yaml', errors) ?? []);
  const nodes = loadEntries(dir, 'nodes', NodeSchema, errors);
  const customers = loadEntries(dir, 'customers', CustomerSchema, errors);
  return { data: { districts, sectors, nodes, customers }, errors };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/load.test.ts && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add pipeline/load.ts tests/pipeline/load.test.ts fixtures/mini
git commit -m "feat(pipeline): YAML data loader with file-scoped errors and mini fixture world"
```

---

### Task 3: Cross-reference validation + test builders

**Files:**
- Create: `pipeline/validate.ts`
- Create: `tests/helpers.ts`
- Test: `tests/pipeline/validate.test.ts`

**Interfaces:**
- Consumes: `LoadedData`, `nodeFile`, `customerFile` (Task 2); schemas and types (Task 1).
- Produces:
  - `validateReferences(data: LoadedData): { errors: string[]; warnings: string[] }`
  - `tests/helpers.ts`: `district(id, order, extra?)`, `sector(id, coast?)`, `node(id, districtId, uses?, extra?)`, `customer(id, sectors, uses, extra?)`, `makeData(parts)`, type `UseSpec = string | { target: string; confidence?: Confidence; relation?: Relation }`. Default `makeData` districts: `core`(order 0), `sdks`(1), `products`(2, building `town`); default sectors: `defi`(east), `proof`(north).

- [ ] **Step 1: Create the test builders `tests/helpers.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing validation tests**

Create `tests/pipeline/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadDataDir } from '../../pipeline/load';
import { validateReferences } from '../../pipeline/validate';
import { customer, district, makeData, node, sector } from '../helpers';

describe('validateReferences', () => {
  it('accepts the mini fixture', () => {
    const { data } = loadDataDir('fixtures/mini');
    expect(validateReferences(data)).toEqual({ errors: [], warnings: [] });
  });

  it('reports an unknown edge target in the spec format', () => {
    const data = makeData({ nodes: [node('foo', 'core', ['a', 'bar']), node('a', 'core')] });
    expect(validateReferences(data).errors).toEqual(['nodes/foo.yaml: uses[1].target "bar" not found']);
  });

  it('rejects self-references and duplicate targets', () => {
    const data = makeData({ nodes: [node('a', 'core', ['a']), node('b', 'core', ['a', 'a'])] });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: uses[0].target cannot point to itself',
      'nodes/b.yaml: uses[1].target "a" is listed twice',
    ]);
  });

  it('rejects edges that point at customers', () => {
    const data = makeData({
      nodes: [node('a', 'core', ['c']), node('p', 'products')],
      customers: [customer('c', ['defi'], ['p']), customer('d', ['defi'], ['c'])],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: uses[0].target "c" is a customer; only nodes can be used',
      'customers/d.yaml: uses[0].target "c" is a customer; only nodes can be used',
    ]);
  });

  it('reports unknown districts and sectors', () => {
    const data = makeData({
      nodes: [node('a', 'nowhere'), node('p', 'products')],
      customers: [customer('c', ['defi', 'mars'], ['p'])],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: district "nowhere" not found in districts.yaml',
      'customers/c.yaml: sectors[1] "mars" not found in sectors.yaml',
    ]);
  });

  it('only allows primarySector on town districts and requires it to exist', () => {
    const data = makeData({
      nodes: [node('app', 'products', [], { primarySector: 'mars' }), node('lib', 'sdks', [], { primarySector: 'defi' })],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/app.yaml: primarySector "mars" not found in sectors.yaml',
      'nodes/lib.yaml: primarySector is only allowed in districts whose building is "town"',
    ]);
  });

  it('rejects an id used by both a node and a customer', () => {
    const data = makeData({ nodes: [node('x', 'products')], customers: [customer('x', ['defi'], ['x'])] });
    expect(validateReferences(data).errors).toContain('customers/x.yaml: id "x" is also used by nodes/x.yaml');
  });

  it('rejects duplicate district and sector ids', () => {
    const data = makeData({
      districts: [district('core', 0), district('core', 1)],
      sectors: [sector('defi'), sector('defi')],
    });
    expect(validateReferences(data).errors).toEqual([
      'districts.yaml: [1].id "core" is listed twice',
      'sectors.yaml: [1].id "defi" is listed twice',
    ]);
  });

  it('warns when a segment has no metric', () => {
    const data = makeData({
      nodes: [node('p', 'products')],
      customers: [customer('traders', ['defi'], ['p'], { type: 'segment' })],
    });
    expect(validateReferences(data)).toEqual({
      errors: [],
      warnings: ['customers/traders.yaml: segment has no metric; add a sourced metric so its harbor shows how big it is'],
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/validate.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/validate`.

- [ ] **Step 4: Implement `pipeline/validate.ts`**

Nodes are checked in id order (the loader already returns them sorted), then customers.

```ts
import { customerFile, nodeFile, type LoadedData } from './load';
import type { District } from './schema';

export function validateReferences(data: LoadedData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const districts = new Map<string, District>();
  data.districts.forEach((d, i) => {
    if (districts.has(d.id)) errors.push(`districts.yaml: [${i}].id "${d.id}" is listed twice`);
    else districts.set(d.id, d);
  });
  const sectorIds = new Set<string>();
  data.sectors.forEach((s, i) => {
    if (sectorIds.has(s.id)) errors.push(`sectors.yaml: [${i}].id "${s.id}" is listed twice`);
    sectorIds.add(s.id);
  });

  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const customerIds = new Set(data.customers.map((c) => c.id));

  const checkUses = (file: string, selfId: string, uses: { target: string }[]) => {
    const seen = new Set<string>();
    uses.forEach((u, i) => {
      const at = `${file}: uses[${i}].target`;
      if (u.target === selfId) errors.push(`${at} cannot point to itself`);
      else if (seen.has(u.target)) errors.push(`${at} "${u.target}" is listed twice`);
      else if (customerIds.has(u.target) && !nodeIds.has(u.target))
        errors.push(`${at} "${u.target}" is a customer; only nodes can be used`);
      else if (!nodeIds.has(u.target)) errors.push(`${at} "${u.target}" not found`);
      seen.add(u.target);
    });
  };

  for (const n of data.nodes) {
    const file = nodeFile(n.id);
    const district = districts.get(n.district);
    if (!district) errors.push(`${file}: district "${n.district}" not found in districts.yaml`);
    if (n.primarySector !== null) {
      if (!sectorIds.has(n.primarySector)) errors.push(`${file}: primarySector "${n.primarySector}" not found in sectors.yaml`);
      if (district && district.building !== 'town')
        errors.push(`${file}: primarySector is only allowed in districts whose building is "town"`);
    }
    checkUses(file, n.id, n.uses);
  }

  for (const c of data.customers) {
    const file = customerFile(c.id);
    if (nodeIds.has(c.id)) errors.push(`${file}: id "${c.id}" is also used by ${nodeFile(c.id)}`);
    c.sectors.forEach((s, i) => {
      if (!sectorIds.has(s)) errors.push(`${file}: sectors[${i}] "${s}" not found in sectors.yaml`);
    });
    if (c.type === 'segment' && !c.metric)
      warnings.push(`${file}: segment has no metric; add a sourced metric so its harbor shows how big it is`);
    checkUses(file, c.id, c.uses);
  }

  return { errors, warnings };
}
```

Note: the "listed twice" test for nodes `a`,`b` relies on nodes being passed in id order; `makeData` keeps the given order, and the tests list them sorted.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/validate.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline/validate.ts tests/helpers.ts tests/pipeline/validate.test.ts
git commit -m "feat(pipeline): cross-reference validation and in-memory world builders"
```

---

### Task 4: Graph + cycle detection

**Files:**
- Create: `pipeline/util.ts`, `pipeline/graph.ts`
- Test: `tests/pipeline/graph.test.ts`

**Interfaces:**
- Consumes: `LoadedData` (Task 2), `Confidence`, `Evidence`, `Relation` (Task 1), helpers (Task 3).
- Produces:
  - `util.ts`: `cmp(a: string, b: string): number` — code-unit order, locale-independent.
  - `graph.ts`: `interface GraphEdge { id: string; from: string; to: string; relation?: Relation; confidence: Confidence; evidence: Evidence[] }`; `interface Graph { data: LoadedData; edges: GraphEdge[]; out: Map<string, GraphEdge[]>; incoming: Map<string, GraphEdge[]> }`; `edgeId(from, to): string` → `"from->to"`; `buildGraph(data: LoadedData): Graph` (expects validated data; `edges` sorted by id; `out`/`incoming` have an entry, possibly empty, for every node and customer id); `findCycles(graph: Graph): string[][]` (each cycle rotated to start at its smallest id, deduplicated, sorted).

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph, edgeId, findCycles } from '../../pipeline/graph';
import { cmp } from '../../pipeline/util';
import { customer, makeData, node } from '../helpers';

describe('cmp', () => {
  it('orders by code unit, not locale', () => {
    expect(['b', 'B', 'a', 'a-b', 'a2'].sort(cmp)).toEqual(['B', 'a', 'a-b', 'a2', 'b']);
  });
});

describe('buildGraph', () => {
  const data = makeData({
    nodes: [
      node('app', 'products', ['lib', { target: 'idx', confidence: 'reported', relation: 'service' }]),
      node('idx', 'core'),
      node('lib', 'sdks', ['idx']),
    ],
    customers: [customer('cust', ['defi'], ['app'])],
  });
  const graph = buildGraph(data);

  it('creates one edge per uses entry, sorted by id', () => {
    expect(graph.edges.map((e) => e.id)).toEqual(['app->idx', 'app->lib', 'cust->app', 'lib->idx']);
    expect(edgeId('a', 'b')).toBe('a->b');
  });

  it('keeps relation, confidence and evidence; customer edges have no relation', () => {
    const appIdx = graph.edges.find((e) => e.id === 'app->idx')!;
    expect(appIdx).toMatchObject({ from: 'app', to: 'idx', relation: 'service', confidence: 'reported' });
    expect(appIdx.evidence).toHaveLength(1);
    expect(graph.edges.find((e) => e.id === 'cust->app')!.relation).toBeUndefined();
  });

  it('indexes outgoing and incoming edges for every id', () => {
    expect(graph.out.get('app')!.map((e) => e.to)).toEqual(['idx', 'lib']);
    expect(graph.incoming.get('idx')!.map((e) => e.from)).toEqual(['app', 'lib']);
    expect(graph.out.get('idx')).toEqual([]);
    expect(graph.incoming.get('cust')).toEqual([]);
  });
});

describe('findCycles', () => {
  it('returns no cycles for a DAG', () => {
    const data = makeData({ nodes: [node('a', 'core', ['b']), node('b', 'core')] });
    expect(findCycles(buildGraph(data))).toEqual([]);
  });

  it('finds each cycle once, starting at its smallest id', () => {
    const data = makeData({
      nodes: [node('a', 'core', ['b']), node('b', 'core', ['c']), node('c', 'core', ['b']), node('x', 'core', ['y']), node('y', 'core', ['x'])],
    });
    expect(findCycles(buildGraph(data))).toEqual([
      ['b', 'c'],
      ['x', 'y'],
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/graph.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/graph`.

- [ ] **Step 3: Implement `pipeline/util.ts` and `pipeline/graph.ts`**

`pipeline/util.ts`:

```ts
/** Deterministic, locale-independent string comparison for sorting. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
```

`pipeline/graph.ts`:

```ts
import type { LoadedData } from './load';
import type { Confidence, Evidence, Relation } from './schema';
import { cmp } from './util';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation?: Relation;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface Graph {
  data: LoadedData;
  edges: GraphEdge[];
  out: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
}

export const edgeId = (from: string, to: string) => `${from}->${to}`;

/** Expects data that passed validateReferences. */
export function buildGraph(data: LoadedData): Graph {
  const edges: GraphEdge[] = [];
  for (const n of data.nodes)
    for (const u of n.uses)
      edges.push({ id: edgeId(n.id, u.target), from: n.id, to: u.target, relation: u.relation, confidence: u.confidence, evidence: u.evidence });
  for (const c of data.customers)
    for (const u of c.uses)
      edges.push({ id: edgeId(c.id, u.target), from: c.id, to: u.target, confidence: u.confidence, evidence: u.evidence });
  edges.sort((a, b) => cmp(a.id, b.id));

  const out = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const id of [...data.nodes.map((n) => n.id), ...data.customers.map((c) => c.id)]) {
    out.set(id, []);
    incoming.set(id, []);
  }
  for (const e of edges) {
    out.get(e.from)!.push(e);
    incoming.get(e.to)!.push(e);
  }
  return { data, edges, out, incoming };
}

export function findCycles(graph: Graph): string[][] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const found = new Map<string, string[]>();

  const visit = (id: string) => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const e of graph.out.get(id) ?? []) {
      const s = state.get(e.to);
      if (s === 'visiting') {
        const cycle = stack.slice(stack.indexOf(e.to));
        const start = cycle.indexOf([...cycle].sort(cmp)[0]);
        const normalized = [...cycle.slice(start), ...cycle.slice(0, start)];
        found.set(normalized.join('>'), normalized);
      } else if (s === undefined) {
        visit(e.to);
      }
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of graph.data.nodes.map((n) => n.id).sort(cmp)) if (!state.has(id)) visit(id);
  return [...found.keys()].sort(cmp).map((k) => found.get(k)!);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/graph.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/util.ts pipeline/graph.ts tests/pipeline/graph.test.ts
git commit -m "feat(pipeline): dependency graph with adjacency and cycle detection"
```

---

### Task 5: Transitive traffic

**Files:**
- Create: `pipeline/traffic.ts`
- Test: `tests/pipeline/traffic.test.ts`

**Interfaces:**
- Consumes: `Graph` (Task 4), `Stage` (Task 1), helpers (Task 3).
- Produces: `STAGE_WEIGHT: Record<Stage, number>`; `interface Traffic { edge: Map<string, number>; node: Map<string, number> }` (every edge id and every node id present, default 0; customers are not in `node`); `computeTraffic(graph: Graph, opts: { includeInferred: boolean }): Traffic`.

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/traffic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import { computeTraffic, STAGE_WEIGHT } from '../../pipeline/traffic';
import { customer, makeData, node } from '../helpers';

const DEFAULT = { includeInferred: false };

describe('computeTraffic', () => {
  it('uses the spec stage weights', () => {
    expect(STAGE_WEIGHT).toEqual({ production: 1, pilot: 0.5, announced: 0.25, ended: 0 });
  });

  it('propagates a customer down the whole dependency chain', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['lib']), node('lib', 'sdks', ['core1']), node('core1', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(Object.fromEntries(t.edge)).toEqual({ 'app->lib': 1, 'c->app': 1, 'lib->core1': 1 });
    expect(Object.fromEntries(t.node)).toEqual({ app: 1, core1: 1, lib: 1 });
  });

  it('counts a customer once per edge and node even with two routes (diamond)', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['a', 'b']), node('a', 'sdks', ['base']), node('b', 'sdks', ['base']), node('base', 'core', ['root']), node('root', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('base')).toBe(1);
    expect(t.edge.get('base->root')).toBe(1);
  });

  it('sums stage weights across customers', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['lib']), node('lib', 'sdks')],
        customers: [
          customer('p1', ['defi'], ['app']),
          customer('p2', ['defi'], ['app'], { stage: 'pilot' }),
          customer('p3', ['defi'], ['app'], { stage: 'announced' }),
          customer('p4', ['defi'], ['app'], { stage: 'ended' }),
        ],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('lib')).toBe(1.75);
    expect(t.edge.get('p4->app')).toBe(0);
  });

  it('terminates on cycles and counts each node once', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', ['a']), node('a', 'sdks', ['b']), node('b', 'sdks', ['a'])],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const t = computeTraffic(g, DEFAULT);
    expect(t.node.get('a')).toBe(1);
    expect(t.edge.get('b->a')).toBe(1);
  });

  it('ignores inferred edges by default and includes them on request', () => {
    const g = buildGraph(
      makeData({
        nodes: [node('app', 'products', [{ target: 'lib', confidence: 'inferred' }, { target: 'idx', confidence: 'reported' }]), node('lib', 'sdks'), node('idx', 'core')],
        customers: [customer('c', ['defi'], ['app'])],
      }),
    );
    const def = computeTraffic(g, DEFAULT);
    expect(def.node.get('lib')).toBe(0);
    expect(def.edge.get('app->lib')).toBe(0);
    expect(def.node.get('idx')).toBe(1);
    const rumors = computeTraffic(g, { includeInferred: true });
    expect(rumors.node.get('lib')).toBe(1);
    expect(rumors.edge.get('app->lib')).toBe(1);
  });

  it('gives untouched nodes zero traffic', () => {
    const g = buildGraph(makeData({ nodes: [node('alone', 'sdks')] }));
    expect(computeTraffic(g, DEFAULT).node.get('alone')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/traffic.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/traffic`.

- [ ] **Step 3: Implement `pipeline/traffic.ts`**

```ts
import type { Graph } from './graph';
import type { Stage } from './schema';

export const STAGE_WEIGHT: Record<Stage, number> = { production: 1, pilot: 0.5, announced: 0.25, ended: 0 };

export interface Traffic {
  edge: Map<string, number>;
  node: Map<string, number>;
}

/** Each customer adds its stage weight once to every edge and node in its dependency closure. */
export function computeTraffic(graph: Graph, opts: { includeInferred: boolean }): Traffic {
  const edge = new Map<string, number>(graph.edges.map((e) => [e.id, 0]));
  const node = new Map<string, number>(graph.data.nodes.map((n) => [n.id, 0]));

  for (const c of graph.data.customers) {
    const weight = STAGE_WEIGHT[c.stage];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();
    const queue = [c.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of graph.out.get(current) ?? []) {
        if (!opts.includeInferred && e.confidence === 'inferred') continue;
        seenEdges.add(e.id);
        if (!seenNodes.has(e.to)) {
          seenNodes.add(e.to);
          queue.push(e.to);
        }
      }
    }
    for (const id of seenEdges) edge.set(id, edge.get(id)! + weight);
    for (const id of seenNodes) node.set(id, node.get(id)! + weight);
  }
  return { edge, node };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/traffic.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/traffic.ts tests/pipeline/traffic.test.ts
git commit -m "feat(pipeline): transitive customer traffic with stage weights"
```

---

### Task 6: Flags (stranded, hidden highway, tier, dependents)

**Files:**
- Create: `pipeline/flags.ts`
- Test: `tests/pipeline/flags.test.ts`

**Interfaces:**
- Consumes: `Graph` (Task 4), `Traffic` (Task 5).
- Produces: `HIDDEN_HIGHWAY_TOP_FRACTION = 0.15`, `HIDDEN_HIGHWAY_MAX_DEPENDENTS = 3`; `type Tier = 1 | 2 | 3 | 4`; `interface NodeFlags { stranded: boolean; hiddenHighway: boolean; tier: Tier; dependents: number }`; `computeFlags(graph: Graph, traffic: Traffic): Map<string, NodeFlags>` (one entry per node).

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/flags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeFlags } from '../../pipeline/flags';
import { buildGraph } from '../../pipeline/graph';
import { computeTraffic } from '../../pipeline/traffic';
import type { LoadedData } from '../../pipeline/load';
import { customer, makeData, node } from '../helpers';

function flagsFor(data: LoadedData) {
  const g = buildGraph(data);
  return computeFlags(g, computeTraffic(g, { includeInferred: false }));
}

describe('computeFlags', () => {
  it('marks nodes without non-ended customers as stranded', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('alone', 'sdks'), node('ended-only', 'products'), node('announced', 'products')],
        customers: [
          customer('gone', ['defi'], ['ended-only'], { stage: 'ended' }),
          customer('soon', ['defi'], ['announced'], { stage: 'announced' }),
        ],
      }),
    );
    expect(f.get('alone')!.stranded).toBe(true);
    expect(f.get('ended-only')!.stranded).toBe(true);
    expect(f.get('announced')!.stranded).toBe(false);
  });

  it('flags high-traffic nodes with few direct dependents as hidden highways', () => {
    // ledger <- csl <- sdk <- app1..app8 <- c1..c8
    const apps = Array.from({ length: 8 }, (_, i) => node(`app${i + 1}`, 'products', ['sdk']));
    const f = flagsFor(
      makeData({
        nodes: [...apps, node('csl', 'sdks', ['ledger']), node('ledger', 'core'), node('sdk', 'sdks', ['csl'])],
        customers: apps.map((a, i) => customer(`c${i + 1}`, ['defi'], [a.id])),
      }),
    );
    expect(f.get('ledger')!).toMatchObject({ hiddenHighway: true, dependents: 1 });
    expect(f.get('csl')!).toMatchObject({ hiddenHighway: true, dependents: 1 });
    expect(f.get('sdk')!).toMatchObject({ hiddenHighway: false, dependents: 8 });
    expect(f.get('app1')!.hiddenHighway).toBe(false);
  });

  it('does not count inferred edges as dependents', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('a', 'products', [{ target: 'lib', confidence: 'inferred' }]), node('b', 'products', ['lib']), node('lib', 'sdks')],
      }),
    );
    expect(f.get('lib')!.dependents).toBe(1);
  });

  it('assigns tiers by traffic quartiles; stranded nodes are tier 1', () => {
    const f = flagsFor(
      makeData({
        nodes: [node('a', 'products'), node('b', 'products'), node('c', 'products'), node('d', 'products'), node('e', 'products')],
        customers: [
          customer('c1', ['defi'], ['a', 'b', 'c', 'd']),
          customer('c2', ['defi'], ['b', 'c', 'd']),
          customer('c3', ['defi'], ['c', 'd']),
          customer('c4', ['defi'], ['d']),
        ],
      }),
    );
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => f.get(id)!.tier)).toEqual([1, 2, 3, 4, 1]);
    expect(f.get('e')!.stranded).toBe(true);
  });

  it('handles an empty world', () => {
    expect(flagsFor(makeData({})).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/flags.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/flags`.

- [ ] **Step 3: Implement `pipeline/flags.ts`**

```ts
import type { Graph } from './graph';
import type { Traffic } from './traffic';

export const HIDDEN_HIGHWAY_TOP_FRACTION = 0.15;
export const HIDDEN_HIGHWAY_MAX_DEPENDENTS = 3;

export type Tier = 1 | 2 | 3 | 4;

export interface NodeFlags {
  stranded: boolean;
  hiddenHighway: boolean;
  tier: Tier;
  dependents: number;
}

export function computeFlags(graph: Graph, traffic: Traffic): Map<string, NodeFlags> {
  const nodes = graph.data.nodes;
  const t = (id: string) => traffic.node.get(id) ?? 0;

  const descending = nodes.map((n) => t(n.id)).sort((a, b) => b - a);
  const topCount = Math.ceil(descending.length * HIDDEN_HIGHWAY_TOP_FRACTION);
  const topThreshold = topCount > 0 ? descending[topCount - 1] : Infinity;

  const active = nodes.map((n) => t(n.id)).filter((v) => v > 0).sort((a, b) => a - b);
  const nearestRank = (p: number) => active[Math.max(0, Math.ceil(p * active.length) - 1)];
  const [q1, q2, q3] = active.length > 0 ? [nearestRank(0.25), nearestRank(0.5), nearestRank(0.75)] : [0, 0, 0];

  const flags = new Map<string, NodeFlags>();
  for (const n of nodes) {
    const value = t(n.id);
    const stranded = value === 0;
    const dependents = new Set(
      (graph.incoming.get(n.id) ?? []).filter((e) => e.confidence !== 'inferred').map((e) => e.from),
    ).size;
    const hiddenHighway = !stranded && value >= topThreshold && dependents <= HIDDEN_HIGHWAY_MAX_DEPENDENTS;
    const tier: Tier = stranded || value <= q1 ? 1 : value <= q2 ? 2 : value <= q3 ? 3 : 4;
    flags.set(n.id, { stranded, hiddenHighway, tier, dependents });
  }
  return flags;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/flags.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/flags.ts tests/pipeline/flags.test.ts
git commit -m "feat(pipeline): stranded, hidden-highway and size-tier flags"
```

---

### Task 7: Stable layout + lockfile + harbors

**Files:**
- Create: `pipeline/layout.ts`
- Test: `tests/pipeline/layout.test.ts`

**Interfaces:**
- Consumes: `Graph` (Task 4), `cmp` (Task 4), `formatPath` (Task 2), helpers (Task 3).
- Produces:
  - Constants `PLOT = 4`, `MOUNTAIN_WIDTH = 16`, `DISTRICT_GAP = 2`, `COAST_GAP = 6`.
  - Types `Pos = [number, number]`; `LayoutLock { version: 1; districts: Record<string, { x0: number; columns: number }>; nodes: Record<string, Pos> }`; `Region { x0; x1; y0; y1 }`; `Bounds { minX; minY; maxX; maxY }`; `Layout { lock: LayoutLock; nodes: Map<string, Pos>; districts: Map<string, Region>; harbors: Map<string, Pos>; bounds: Bounds }`.
  - `emptyLock(): LayoutLock`; `parseLock(text: string): LayoutLock` (throws `Error` with a human message); `serializeLock(lock: LayoutLock): string` (one entry per line, keys sorted, trailing newline); `computeLayout(graph: Graph, lock: LayoutLock): Layout`.

Layout rules (from spec §3.3 + this plan's refinements):
- District `d` occupies columns `x ∈ [x0, x0 + columns·PLOT − 1]`; plot `(c, r)` sits at tile `(x0 + c·PLOT + PLOT/2, r·PLOT)`, `c ∈ [0, columns)`, `r` any integer.
- First district starts at `x0 = MOUNTAIN_WIDTH`; each following district at previous `x0 + columns·PLOT + DISTRICT_GAP`, sorted by `(order, id)`. Locked districts keep `x0`/`columns`; new districts go east of all locked ones.
- Locked node positions are kept if the node still exists and the position is a valid plot of its current district; on collision the smaller id wins.
- New nodes (sorted by district order, then id) take the free plot minimizing `(squared distance to centroid of already-placed neighbours (else district centre (x0 + columns·PLOT/2, 0)), |r|, r, c)` among rows `−(R+1)…R+1`, where `R` = max |r| occupied in that district.
- Region `y0 = minRow·PLOT − PLOT/2`, `y1 = maxRow·PLOT + PLOT/2 − 1` (rows default to 0 when empty).
- Island bounds: `minX = 0`, `maxX = max(MOUNTAIN_WIDTH − 1, region x1…)`, `minY = min(−PLOT, region y0…)`, `maxY = max(PLOT, region y1…)`.
- Harbors (sectors in file order, per coast, `f = (i+1)/(n+1)`): east `(maxX + COAST_GAP, round(minY + f·(maxY − minY)))`; north `(round(MOUNTAIN_WIDTH + f·(maxX − MOUNTAIN_WIDTH)), minY − COAST_GAP)`; south same x, `maxY + COAST_GAP`.
- `Layout.bounds` = island bounds expanded to include harbors.

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import {
  COAST_GAP,
  computeLayout,
  emptyLock,
  MOUNTAIN_WIDTH,
  parseLock,
  serializeLock,
  type LayoutLock,
} from '../../pipeline/layout';
import type { LoadedData } from '../../pipeline/load';
import { makeData, node, sector } from '../helpers';

const layoutOf = (data: LoadedData, lock: LayoutLock = emptyLock()) => computeLayout(buildGraph(data), lock);

describe('district columns', () => {
  it('lays districts out west to east by order after the mountain', () => {
    const l = layoutOf(makeData({}));
    expect(l.lock.districts).toEqual({
      core: { x0: 16, columns: 3 },
      sdks: { x0: 30, columns: 3 },
      products: { x0: 44, columns: 3 },
    });
    expect(l.districts.get('core')).toEqual({ x0: 16, x1: 27, y0: -2, y1: 1 });
  });
});

describe('node placement', () => {
  it('places the first node of a district at its centre', () => {
    const l = layoutOf(makeData({ nodes: [node('n', 'core')] }));
    expect(l.nodes.get('n')).toEqual([22, 0]);
  });

  it('pulls a node towards its already placed neighbours', () => {
    const l = layoutOf(makeData({ nodes: [node('base', 'core'), node('far', 'sdks', ['base'])] }));
    expect(l.nodes.get('far')).toEqual([32, 0]);
  });

  it('grows a district instead of failing when it is full', () => {
    const many = Array.from({ length: 10 }, (_, i) => node(`n${String(i).padStart(2, '0')}`, 'core'));
    const l = layoutOf(makeData({ nodes: many }));
    const keys = many.map((n) => l.nodes.get(n.id)!.join(','));
    expect(new Set(keys).size).toBe(10);
    for (const n of many) {
      const [x] = l.nodes.get(n.id)!;
      expect(x).toBeGreaterThanOrEqual(16);
      expect(x).toBeLessThanOrEqual(27);
    }
    const region = l.districts.get('core')!;
    expect(region.y1 - region.y0 + 1).toBeGreaterThanOrEqual(16);
  });

  it('never moves existing nodes when new ones are added', () => {
    const before = makeData({ nodes: [node('a', 'core'), node('b', 'core'), node('c', 'sdks', ['a'])] });
    const first = layoutOf(before);
    const after = makeData({ nodes: [...before.nodes, node('d', 'core', ['c']), node('e', 'sdks')] });
    const second = layoutOf(after, first.lock);
    for (const id of ['a', 'b', 'c']) expect(second.nodes.get(id)).toEqual(first.nodes.get(id));
  });
});

describe('lock robustness', () => {
  it('keeps the smaller id when two nodes claim the same plot', () => {
    const lock: LayoutLock = { version: 1, districts: {}, nodes: { a: [22, 0], b: [22, 0] } };
    const l = layoutOf(makeData({ nodes: [node('a', 'core'), node('b', 'core')] }), lock);
    expect(l.nodes.get('a')).toEqual([22, 0]);
    expect(l.nodes.get('b')).not.toEqual([22, 0]);
  });

  it('drops removed nodes and re-places nodes that moved district', () => {
    const lock: LayoutLock = { version: 1, districts: {}, nodes: { gone: [18, 0], moved: [22, 0] } };
    const l = layoutOf(makeData({ nodes: [node('moved', 'sdks')] }), lock);
    expect(l.lock.nodes.gone).toBeUndefined();
    expect(l.nodes.get('moved')).toEqual([36, 0]);
  });

  it('keeps locked district columns and appends new districts east', () => {
    const lock: LayoutLock = { version: 1, districts: { sdks: { x0: 16, columns: 2 } }, nodes: {} };
    const l = layoutOf(makeData({}), lock);
    expect(l.lock.districts.sdks).toEqual({ x0: 16, columns: 2 });
    expect(l.lock.districts.core).toEqual({ x0: 26, columns: 3 });
    expect(l.lock.districts.products).toEqual({ x0: 40, columns: 3 });
  });

  it('round-trips through serializeLock/parseLock with one entry per line', () => {
    const l = layoutOf(makeData({ nodes: [node('b', 'core'), node('a', 'sdks')] }));
    const text = serializeLock(l.lock);
    expect(parseLock(text)).toEqual(l.lock);
    expect(text).toContain('\n    "a": [36, 0],\n    "b": [22, 0]\n');
    expect(serializeLock(emptyLock())).toBe('{\n  "version": 1,\n  "districts": {},\n  "nodes": {}\n}\n');
  });

  it('explains malformed lock files', () => {
    expect(() => parseLock('{ nope')).toThrow(/invalid JSON.*delete the file to regenerate/);
    expect(() => parseLock('{"version":1,"districts":{},"nodes":{"a":[1]}}')).toThrow(/nodes\.a.*delete the file to regenerate/);
  });
});

describe('harbors and bounds', () => {
  it('puts harbors on their coasts outside the island', () => {
    const l = layoutOf(
      makeData({
        sectors: [sector('defi', 'east'), sector('pay', 'east'), sector('proof', 'north'), sector('gov', 'south')],
        nodes: [node('a', 'core'), node('b', 'products')],
      }),
    );
    const maxRegionX = Math.max(...[...l.districts.values()].map((r) => r.x1));
    expect(l.harbors.get('defi')![0]).toBe(maxRegionX + COAST_GAP);
    expect(l.harbors.get('defi')![1]).toBeLessThan(l.harbors.get('pay')![1]);
    expect(l.harbors.get('proof')![1]).toBe(-4 - COAST_GAP);
    expect(l.harbors.get('gov')![1]).toBe(4 + COAST_GAP);
    expect(l.harbors.get('proof')![0]).toBeGreaterThan(MOUNTAIN_WIDTH);
    for (const [x, y] of l.harbors.values()) {
      expect(x).toBeGreaterThanOrEqual(l.bounds.minX);
      expect(x).toBeLessThanOrEqual(l.bounds.maxX);
      expect(y).toBeGreaterThanOrEqual(l.bounds.minY);
      expect(y).toBeLessThanOrEqual(l.bounds.maxY);
    }
  });

  it('handles a world with no districts, nodes or sectors', () => {
    const l = layoutOf(makeData({ districts: [], sectors: [] }));
    expect(l.bounds).toEqual({ minX: 0, maxX: MOUNTAIN_WIDTH - 1, minY: -4, maxY: 4 });
    expect(l.nodes.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/layout.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/layout`.

- [ ] **Step 3: Implement `pipeline/layout.ts`**

```ts
import { z } from 'zod';
import type { Graph } from './graph';
import { formatPath } from './load';
import { cmp } from './util';

export type Pos = [number, number];

export const PLOT = 4;
export const MOUNTAIN_WIDTH = 16;
export const DISTRICT_GAP = 2;
export const COAST_GAP = 6;

export interface LayoutLock {
  version: 1;
  districts: Record<string, { x0: number; columns: number }>;
  nodes: Record<string, Pos>;
}
export interface Region { x0: number; x1: number; y0: number; y1: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Layout {
  lock: LayoutLock;
  nodes: Map<string, Pos>;
  districts: Map<string, Region>;
  harbors: Map<string, Pos>;
  bounds: Bounds;
}

const LockSchema = z
  .object({
    version: z.literal(1),
    districts: z.record(z.object({ x0: z.number().int(), columns: z.number().int().min(1) }).strict()),
    nodes: z.record(z.tuple([z.number().int(), z.number().int()])),
  })
  .strict();

const REGENERATE = 'delete the file to regenerate positions';

export function emptyLock(): LayoutLock {
  return { version: 1, districts: {}, nodes: {} };
}

export function parseLock(text: string): LayoutLock {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON (${(e as Error).message}); ${REGENERATE}`);
  }
  const result = LockSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${formatPath(issue.path)} ${issue.message}; ${REGENERATE}`);
  }
  return result.data as LayoutLock;
}

export function serializeLock(lock: LayoutLock): string {
  const block = (lines: string[]) => (lines.length ? `{\n${lines.join(',\n')}\n  }` : '{}');
  const districts = Object.keys(lock.districts)
    .sort(cmp)
    .map((id) => `    ${JSON.stringify(id)}: { "x0": ${lock.districts[id].x0}, "columns": ${lock.districts[id].columns} }`);
  const nodes = Object.keys(lock.nodes)
    .sort(cmp)
    .map((id) => `    ${JSON.stringify(id)}: [${lock.nodes[id][0]}, ${lock.nodes[id][1]}]`);
  return `{\n  "version": 1,\n  "districts": ${block(districts)},\n  "nodes": ${block(nodes)}\n}\n`;
}

// Math.round can produce -0; "+ 0" normalises it so output is stable.
const round = (v: number) => Math.round(v) + 0;
const lexLess = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

export function computeLayout(graph: Graph, lock: LayoutLock): Layout {
  const { districts, sectors, nodes } = graph.data;
  const sortedDistricts = [...districts].sort((a, b) => a.order - b.order || cmp(a.id, b.id));
  const next: LayoutLock = emptyLock();

  // 1. District columns: locked ones keep their place, new ones are appended east.
  let nextX0 = MOUNTAIN_WIDTH;
  for (const d of sortedDistricts) {
    const locked = lock.districts[d.id];
    if (!locked) continue;
    next.districts[d.id] = { ...locked };
    nextX0 = Math.max(nextX0, locked.x0 + locked.columns * PLOT + DISTRICT_GAP);
  }
  for (const d of sortedDistricts) {
    if (next.districts[d.id]) continue;
    next.districts[d.id] = { x0: nextX0, columns: d.columns };
    nextX0 += d.columns * PLOT + DISTRICT_GAP;
  }

  const plotPos = (districtId: string, c: number, r: number): Pos => [
    next.districts[districtId].x0 + c * PLOT + PLOT / 2,
    r * PLOT,
  ];
  const toPlot = (districtId: string, [x, y]: Pos): [number, number] | null => {
    const { x0, columns } = next.districts[districtId];
    const c = (x - x0 - PLOT / 2) / PLOT;
    const r = y / PLOT;
    return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < columns ? [c, r + 0] : null;
  };

  // 2. Keep valid locked positions; on collision the smaller id wins.
  const occupied = new Map<string, Set<string>>(sortedDistricts.map((d) => [d.id, new Set<string>()]));
  const positions = new Map<string, Pos>();
  const sortedNodes = [...nodes].sort((a, b) => cmp(a.id, b.id));
  for (const n of sortedNodes) {
    const locked = lock.nodes[n.id];
    if (!locked) continue;
    const plot = toPlot(n.district, locked);
    if (!plot) continue;
    const key = `${plot[0]},${plot[1]}`;
    const taken = occupied.get(n.district)!;
    if (taken.has(key)) continue;
    taken.add(key);
    positions.set(n.id, [locked[0], locked[1]]);
  }

  // 3. Place new nodes on the free plot closest to their placed neighbours.
  const districtIndex = new Map<string, number>(sortedDistricts.map((d, i) => [d.id, i]));
  const pending = sortedNodes
    .filter((n) => !positions.has(n.id))
    .sort((a, b) => districtIndex.get(a.district)! - districtIndex.get(b.district)! || cmp(a.id, b.id));
  for (const n of pending) {
    const { x0, columns } = next.districts[n.district];
    const neighbours = [
      ...(graph.out.get(n.id) ?? []).map((e) => e.to),
      ...(graph.incoming.get(n.id) ?? []).map((e) => e.from),
    ]
      .map((id) => positions.get(id))
      .filter((p): p is Pos => p !== undefined);
    const target: Pos = neighbours.length
      ? [neighbours.reduce((s, p) => s + p[0], 0) / neighbours.length, neighbours.reduce((s, p) => s + p[1], 0) / neighbours.length]
      : [x0 + (columns * PLOT) / 2, 0];

    const taken = occupied.get(n.district)!;
    let maxRow = 0;
    for (const key of taken) maxRow = Math.max(maxRow, Math.abs(Number(key.split(',')[1])));
    let best: { c: number; r: number; score: number[] } | null = null;
    for (let r = -(maxRow + 1); r <= maxRow + 1; r++) {
      for (let c = 0; c < columns; c++) {
        if (taken.has(`${c},${r}`)) continue;
        const [x, y] = plotPos(n.district, c, r);
        const score = [(x - target[0]) ** 2 + (y - target[1]) ** 2, Math.abs(r), r, c];
        if (!best || lexLess(score, best.score)) best = { c, r, score };
      }
    }
    taken.add(`${best!.c},${best!.r}`);
    positions.set(n.id, plotPos(n.district, best!.c, best!.r));
  }
  for (const n of sortedNodes) next.nodes[n.id] = positions.get(n.id)!;

  // 4. District regions.
  const regions = new Map<string, Region>();
  for (const d of sortedDistricts) {
    const { x0, columns } = next.districts[d.id];
    const rows = [...occupied.get(d.id)!].map((key) => Number(key.split(',')[1]));
    const minRow = rows.length ? Math.min(...rows) : 0;
    const maxRow = rows.length ? Math.max(...rows) : 0;
    regions.set(d.id, { x0, x1: x0 + columns * PLOT - 1, y0: minRow * PLOT - PLOT / 2, y1: maxRow * PLOT + PLOT / 2 - 1 });
  }

  // 5. Island bounds and 6. harbors on the coasts.
  const rs = [...regions.values()];
  const island: Bounds = {
    minX: 0,
    maxX: Math.max(MOUNTAIN_WIDTH - 1, ...rs.map((r) => r.x1)),
    minY: Math.min(-PLOT, ...rs.map((r) => r.y0)),
    maxY: Math.max(PLOT, ...rs.map((r) => r.y1)),
  };
  const harbors = new Map<string, Pos>();
  for (const coast of ['east', 'north', 'south'] as const) {
    const list = sectors.filter((s) => s.coast === coast);
    list.forEach((s, i) => {
      const f = (i + 1) / (list.length + 1);
      if (coast === 'east') {
        harbors.set(s.id, [island.maxX + COAST_GAP, round(island.minY + f * (island.maxY - island.minY))]);
      } else {
        const x = round(MOUNTAIN_WIDTH + f * (island.maxX - MOUNTAIN_WIDTH));
        harbors.set(s.id, [x, coast === 'north' ? island.minY - COAST_GAP : island.maxY + COAST_GAP]);
      }
    });
  }
  const hs = [...harbors.values()];
  const bounds: Bounds = {
    minX: island.minX,
    maxX: Math.max(island.maxX, ...hs.map((p) => p[0])),
    minY: Math.min(island.minY, ...hs.map((p) => p[1])),
    maxY: Math.max(island.maxY, ...hs.map((p) => p[1])),
  };

  return { lock: next, nodes: positions, districts: regions, harbors, bounds };
}
```

Sanity values the tests rely on: `core` x0 16 → plot x 18/22/26; `sdks` x0 30 → x 32/36/40; `products` x0 44. An island with only row-0 plots has `minY = -4`, `maxY = 4` (raised to ±PLOT), so north harbors sit at y −10 and south harbors at y 10.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/layout.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/layout.ts tests/pipeline/layout.test.ts
git commit -m "feat(pipeline): stable plot layout with lockfile, district growth and coastal harbors"
```

---

### Task 8: Road routing + road tiles

**Files:**
- Create: `pipeline/roads.ts`
- Test: `tests/pipeline/roads.test.ts`

**Interfaces:**
- Consumes: `Graph` (Task 4), `Traffic` (Task 5), `Layout`, `Pos`, `Bounds` (Task 7), `cmp`.
- Produces: constants `BASE_COST = 1`, `REUSE_COST = 0.5`, `GRID_MARGIN = 4`, `SURFACE_THRESHOLDS = [1, 4, 10]`; `type Surface = 0 | 1 | 2 | 3`; `interface RoadTile { pos: Pos; traffic: number; surface: Surface; dashed: boolean; rumor: boolean }`; `interface Roads { paths: Map<string, Pos[]>; tiles: RoadTile[]; warnings: string[] }`; `surfaceFor(traffic: number): Surface`; `findPath(start: Pos, goal: Pos, opts: { blocked: Set<string>; roads: Set<string>; bounds: Bounds }): Pos[] | null`; `straightPath(start: Pos, goal: Pos): Pos[]`; `routeRoads(graph: Graph, layout: Layout, traffic: Traffic, rumorTraffic: Traffic): Roads`.

Rules:
- Customer edges start at the harbor of the customer's first sector.
- Every node and harbor tile is blocked, except the current edge's start and goal.
- Route non-inferred edges first by (traffic desc, id asc), then inferred edges by (rumor traffic desc, id asc).
- Tiles exclude node/harbor tiles. Tile `traffic` = sum of default edge traffic crossing it; `surface = surfaceFor(traffic)`; `dashed` = crossed by ≥ 1 non-inferred edge and no verified edge; `rumor` = crossed only by inferred edges. Tiles sorted by x, then y.
- If A* finds no route: warn `edge <id>: no free route, drawing a straight path` and use `straightPath`.

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/roads.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../pipeline/graph';
import { computeLayout, emptyLock, type Layout, type Pos } from '../../pipeline/layout';
import { findPath, routeRoads, straightPath, surfaceFor } from '../../pipeline/roads';
import { computeTraffic } from '../../pipeline/traffic';
import type { LoadedData } from '../../pipeline/load';
import { customer, makeData, node } from '../helpers';

const BOUNDS = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
const k = (p: Pos) => p.join(',');
const isConnected = (path: Pos[]) =>
  path.every((p, i) => i === 0 || Math.abs(p[0] - path[i - 1][0]) + Math.abs(p[1] - path[i - 1][1]) === 1);

function route(data: LoadedData, layout?: Layout) {
  const g = buildGraph(data);
  const l = layout ?? computeLayout(g, emptyLock());
  const roads = routeRoads(g, l, computeTraffic(g, { includeInferred: false }), computeTraffic(g, { includeInferred: true }));
  return { g, l, roads };
}

describe('surfaceFor', () => {
  it('maps traffic to footprints, mud, gravel, cobblestone', () => {
    expect([0, 0.5, 1, 3.9, 4, 9.9, 10, 50].map(surfaceFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('findPath', () => {
  it('finds a shortest straight path on an empty grid', () => {
    const p = findPath([0, 0], [3, 0], { blocked: new Set(), roads: new Set(), bounds: BOUNDS })!;
    expect(p).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('walks around blocked tiles', () => {
    const p = findPath([0, 0], [2, 0], { blocked: new Set(['1,0']), roads: new Set(), bounds: BOUNDS })!;
    expect(p.map(k)).not.toContain('1,0');
    expect(p[0]).toEqual([0, 0]);
    expect(p[p.length - 1]).toEqual([2, 0]);
    expect(isConnected(p)).toBe(true);
  });

  it('prefers existing roads when the detour is cheaper', () => {
    const roads = new Set(['0,1', '1,1', '2,1', '3,1', '4,1']);
    const p = findPath([0, 0], [4, 0], { blocked: new Set(), roads, bounds: BOUNDS })!;
    expect(p.map(k)).toContain('2,1');
  });

  it('returns null when the goal is enclosed', () => {
    const blocked = new Set(['4,0', '6,0', '5,1', '5,-1']);
    expect(findPath([0, 0], [5, 0], { blocked, roads: new Set(), bounds: BOUNDS })).toBeNull();
  });
});

describe('straightPath', () => {
  it('goes along x first, then y', () => {
    expect(straightPath([0, 0], [2, -1])).toEqual([[0, 0], [1, 0], [2, 0], [2, -1]]);
  });
});

describe('routeRoads', () => {
  const data = makeData({
    nodes: [
      node('app', 'products', ['lib', { target: 'idx', confidence: 'reported', relation: 'service' }]),
      node('idx', 'core'),
      node('lib', 'sdks', ['idx']),
      node('maybe', 'products', [{ target: 'lib', confidence: 'inferred' }]),
    ],
    customers: [customer('c', ['defi'], ['app'])],
  });

  it('routes every edge from source position to target position', () => {
    const { g, l, roads } = route(data);
    for (const e of g.edges) {
      const path = roads.paths.get(e.id)!;
      const start = l.nodes.get(e.from) ?? l.harbors.get('defi')!;
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(l.nodes.get(e.to));
      expect(isConnected(path)).toBe(true);
    }
    expect(roads.warnings).toEqual([]);
  });

  it('builds tiles without building or harbor tiles, with consistent surfaces', () => {
    const { l, roads } = route(data);
    const occupied = new Set([...l.nodes.values(), ...l.harbors.values()].map(k));
    for (const t of roads.tiles) {
      expect(occupied.has(k(t.pos))).toBe(false);
      expect(t.surface).toBe(surfaceFor(t.traffic));
    }
    const sorted = [...roads.tiles].sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1]);
    expect(roads.tiles).toEqual(sorted);
  });

  it('marks reported-only tiles dashed and inferred-only tiles as rumors', () => {
    const { roads } = route(data);
    const tileAt = new Map(roads.tiles.map((t) => [k(t.pos), t] as const));
    const only = (edgeId: string) => {
      const others = new Set([...roads.paths].filter(([id]) => id !== edgeId).flatMap(([, p]) => p.map(k)));
      return roads.paths.get(edgeId)!.map(k).filter((key) => tileAt.has(key) && !others.has(key));
    };
    const reportedTiles = only('app->idx');
    const rumorTiles = only('maybe->lib');
    expect(reportedTiles.length + rumorTiles.length).toBeGreaterThan(0);
    for (const key of reportedTiles) expect(tileAt.get(key)).toMatchObject({ dashed: true, rumor: false });
    for (const key of rumorTiles) expect(tileAt.get(key)).toMatchObject({ dashed: false, rumor: true, traffic: 0 });
  });

  it('is deterministic', () => {
    const a = route(data).roads;
    const b = route(data).roads;
    expect(JSON.stringify([...a.paths])).toBe(JSON.stringify([...b.paths]));
    expect(a.tiles).toEqual(b.tiles);
  });

  it('falls back to a straight path with a warning when a node is walled in', () => {
    const walled = makeData({
      nodes: [node('a', 'core', ['t']), node('t', 'core'), node('w1', 'core'), node('w2', 'core'), node('w3', 'core'), node('w4', 'core')],
    });
    const layout: Layout = {
      lock: emptyLock(),
      nodes: new Map<string, Pos>([['a', [0, 0]], ['t', [5, 0]], ['w1', [4, 0]], ['w2', [6, 0]], ['w3', [5, 1]], ['w4', [5, -1]]]),
      districts: new Map(),
      harbors: new Map(),
      bounds: { minX: 0, minY: -1, maxX: 6, maxY: 1 },
    };
    const { roads } = route(walled, layout);
    expect(roads.warnings).toEqual(['edge a->t: no free route, drawing a straight path']);
    expect(roads.paths.get('a->t')).toEqual(straightPath([0, 0], [5, 0]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/roads.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/roads`.

- [ ] **Step 3: Implement `pipeline/roads.ts`**

```ts
import type { Graph, GraphEdge } from './graph';
import type { Bounds, Layout, Pos } from './layout';
import type { Traffic } from './traffic';
import { cmp } from './util';

export const BASE_COST = 1;
export const REUSE_COST = 0.5;
export const GRID_MARGIN = 4;
/** traffic >= 1 → mud, >= 4 → gravel, >= 10 → cobblestone; below 1 → footprints. */
export const SURFACE_THRESHOLDS = [1, 4, 10] as const;

export type Surface = 0 | 1 | 2 | 3;
export interface RoadTile { pos: Pos; traffic: number; surface: Surface; dashed: boolean; rumor: boolean }
export interface Roads { paths: Map<string, Pos[]>; tiles: RoadTile[]; warnings: string[] }

const key = (x: number, y: number) => `${x},${y}`;
const DIRECTIONS: Pos[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function surfaceFor(traffic: number): Surface {
  let surface: Surface = 0;
  SURFACE_THRESHOLDS.forEach((threshold, i) => {
    if (traffic >= threshold) surface = (i + 1) as Surface;
  });
  return surface;
}

interface OpenEntry { x: number; y: number; f: number; seq: number }

class MinHeap {
  private items: OpenEntry[] = [];
  get size() { return this.items.length; }
  private less(a: OpenEntry, b: OpenEntry) { return a.f < b.f || (a.f === b.f && a.seq < b.seq); }
  push(item: OpenEntry) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop(): OpenEntry | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** A* on a 4-connected grid; tiles already on a road are cheaper so routes merge. */
export function findPath(start: Pos, goal: Pos, opts: { blocked: Set<string>; roads: Set<string>; bounds: Bounds }): Pos[] | null {
  const { blocked, roads, bounds } = opts;
  const goalKey = key(goal[0], goal[1]);
  const h = (x: number, y: number) => (Math.abs(x - goal[0]) + Math.abs(y - goal[1])) * REUSE_COST;
  const g = new Map<string, number>([[key(start[0], start[1]), 0]]);
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  const open = new MinHeap();
  let seq = 0;
  open.push({ x: start[0], y: start[1], f: h(start[0], start[1]), seq: seq++ });

  while (open.size > 0) {
    const current = open.pop()!;
    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    if (ck === goalKey) {
      const path: Pos[] = [];
      for (let k: string | undefined = ck; k !== undefined; k = cameFrom.get(k)) {
        const [x, y] = k.split(',').map(Number);
        path.push([x, y]);
      }
      return path.reverse();
    }
    closed.add(ck);
    for (const [dx, dy] of DIRECTIONS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      if (closed.has(nk) || (nk !== goalKey && blocked.has(nk))) continue;
      const cost = g.get(ck)! + (roads.has(nk) ? REUSE_COST : BASE_COST);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        cameFrom.set(nk, ck);
        open.push({ x: nx, y: ny, f: cost + h(nx, ny), seq: seq++ });
      }
    }
  }
  return null;
}

export function straightPath(start: Pos, goal: Pos): Pos[] {
  const path: Pos[] = [[start[0], start[1]]];
  let [x, y] = start;
  while (x !== goal[0]) {
    x += Math.sign(goal[0] - x);
    path.push([x, y]);
  }
  while (y !== goal[1]) {
    y += Math.sign(goal[1] - y);
    path.push([x, y]);
  }
  return path;
}

export function routeRoads(graph: Graph, layout: Layout, traffic: Traffic, rumorTraffic: Traffic): Roads {
  const harborOf = new Map<string, Pos>(graph.data.customers.map((c) => [c.id, layout.harbors.get(c.sectors[0])!]));
  const posOf = (id: string): Pos => layout.nodes.get(id) ?? harborOf.get(id)!;
  const blocked = new Set([...layout.nodes.values(), ...layout.harbors.values()].map((p) => key(p[0], p[1])));
  const bounds: Bounds = {
    minX: layout.bounds.minX - GRID_MARGIN,
    minY: layout.bounds.minY - GRID_MARGIN,
    maxX: layout.bounds.maxX + GRID_MARGIN,
    maxY: layout.bounds.maxY + GRID_MARGIN,
  };
  const t = (e: GraphEdge) => traffic.edge.get(e.id) ?? 0;
  const rt = (e: GraphEdge) => rumorTraffic.edge.get(e.id) ?? 0;
  const solid = graph.edges.filter((e) => e.confidence !== 'inferred').sort((a, b) => t(b) - t(a) || cmp(a.id, b.id));
  const rumors = graph.edges.filter((e) => e.confidence === 'inferred').sort((a, b) => rt(b) - rt(a) || cmp(a.id, b.id));

  const roads = new Set<string>();
  const paths = new Map<string, Pos[]>();
  const warnings: string[] = [];
  for (const e of [...solid, ...rumors]) {
    const start = posOf(e.from);
    const goal = posOf(e.to);
    let path = findPath(start, goal, { blocked, roads, bounds });
    if (!path) {
      warnings.push(`edge ${e.id}: no free route, drawing a straight path`);
      path = straightPath(start, goal);
    }
    paths.set(e.id, path);
    for (const [x, y] of path) roads.add(key(x, y));
  }

  const acc = new Map<string, { pos: Pos; traffic: number; verified: boolean; solid: boolean }>();
  for (const e of graph.edges) {
    for (const [x, y] of paths.get(e.id)!) {
      const k = key(x, y);
      if (blocked.has(k)) continue;
      const tile = acc.get(k) ?? { pos: [x, y] as Pos, traffic: 0, verified: false, solid: false };
      tile.traffic += t(e);
      if (e.confidence !== 'inferred') tile.solid = true;
      if (e.confidence === 'verified') tile.verified = true;
      acc.set(k, tile);
    }
  }
  const tiles = [...acc.values()]
    .sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1])
    .map((a) => ({ pos: a.pos, traffic: a.traffic, surface: surfaceFor(a.traffic), dashed: a.solid && !a.verified, rumor: !a.solid }));

  return { paths, tiles, warnings };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/pipeline/roads.test.ts && npm run typecheck`
Expected: all PASS. If the "dashed / rumor" test finds that both edge-specific tile lists are empty (all tiles shared), the assertion `reportedTiles.length + rumorTiles.length > 0` fails — investigate the layout rather than weakening the test; with the default 3-column districts the `app->idx` route crosses the `sdks` district on tiles no other edge uses.

- [ ] **Step 5: Commit**

```bash
git add pipeline/roads.ts tests/pipeline/roads.test.ts
git commit -m "feat(pipeline): A* road routing that merges routes, with surface tiers"
```

---

### Task 9: World emission, pipeline run, CLI, seed data

**Files:**
- Create: `pipeline/emit.ts`, `pipeline/run.ts`, `pipeline/cli.ts`
- Create: `data/districts.yaml`, `data/sectors.yaml`, `data/nodes/.gitkeep`, `data/customers/.gitkeep`, `data/LICENSE`
- Modify: `docs/superpowers/specs/2026-10-20-cardano-island-design.md` (§3.5 world shape)
- Test: `tests/pipeline/run.test.ts`, `tests/pipeline/cli.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `emit.ts`: `WorldNode`, `WorldCustomer`, `WorldEdge`, `WorldDistrict`, `WorldSector`, `World` types; `buildWorld(input: { graph: Graph; traffic: Traffic; rumorTraffic: Traffic; flags: Map<string, NodeFlags>; layout: Layout; roads: Roads; generatedAt: string }): World`; `serializeWorld(world: World): string`.
  - `run.ts`: `interface PipelineResult { world: World | null; lockText: string | null; errors: string[]; warnings: string[] }`; `runPipeline(dataDir: string, lockText: string | null, generatedAt: string): PipelineResult`.
  - `cli.ts`: `tsx pipeline/cli.ts [--data <dir>] [--out <file>] [--check]`; exit 1 on errors; writes `<out>` and `<data>/layout.lock.json` unless `--check`.

- [ ] **Step 1: Write the failing pipeline tests**

Create `tests/pipeline/run.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeWorld } from '../../pipeline/emit';
import { runPipeline } from '../../pipeline/run';

const AT = '2026-10-20T00:00:00.000Z';

describe('runPipeline on the mini fixture', () => {
  const result = runPipeline('fixtures/mini', null, AT);
  const world = result.world!;
  const nodeById = new Map(world.nodes.map((n) => [n.id, n] as const));

  it('succeeds without errors or warnings', () => {
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('computes traffic with stage weights and confidence rules', () => {
    expect(Object.fromEntries(world.nodes.map((n) => [n.id, n.traffic]))).toEqual({
      'anvil-lib': 1.5,
      'hearth-node': 1.5,
      'lonely-tool': 0,
      'mill-indexer': 1,
      'seal-notary': 0.5,
      'swap-town': 1,
    });
    expect(nodeById.get('mill-indexer')!.trafficWithRumors).toBe(1.5);
  });

  it('flags stranded nodes and hidden highways', () => {
    expect(world.nodes.filter((n) => n.stranded).map((n) => n.id)).toEqual(['lonely-tool']);
    expect(world.nodes.filter((n) => n.hiddenHighway).map((n) => n.id)).toEqual(['anvil-lib', 'hearth-node']);
  });

  it('emits customers with harbor, slot and weight, without uses', () => {
    expect(world.customers.map((c) => [c.id, c.harbor, c.slot, c.weight])).toEqual([
      ['guild-of-scribes', 'proof-verification', 0, 0.5],
      ['harbor-traders', 'defi', 0, 1],
      ['old-pilot', 'defi', 1, 0],
    ]);
    expect('uses' in world.customers[0]).toBe(false);
    expect('uses' in world.nodes[0]).toBe(false);
  });

  it('emits regions, harbors, edges with paths and tiles', () => {
    expect(world.version).toBe(1);
    expect(world.generatedAt).toBe(AT);
    expect(world.districts.map((d) => d.id)).toEqual(['core', 'indexers', 'sdks', 'products']);
    expect(world.districts[0].region.x0).toBe(16);
    expect(world.sectors.map((s) => s.harbor.pos.length)).toEqual([2, 2]);
    expect(world.edges).toHaveLength(11);
    for (const e of world.edges) expect(e.path.length).toBeGreaterThan(1);
    expect(world.tiles.length).toBeGreaterThan(0);
  });

  it('is byte-identical across runs and stable when fed its own lock', () => {
    const again = runPipeline('fixtures/mini', null, AT);
    expect(serializeWorld(again.world!)).toBe(serializeWorld(world));
    expect(again.lockText).toBe(result.lockText);
    const locked = runPipeline('fixtures/mini', result.lockText, AT);
    expect(serializeWorld(locked.world!)).toBe(serializeWorld(world));
    expect(locked.lockText).toBe(result.lockText);
  });
});

describe('runPipeline failure and edge cases', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'island-run-'));

  it('produces an empty but valid world for a fresh dataset', () => {
    const d = dir();
    writeFileSync(join(d, 'districts.yaml'), '[]\n');
    writeFileSync(join(d, 'sectors.yaml'), '[]\n');
    const r = runPipeline(d, null, AT);
    expect(r.errors).toEqual([]);
    expect(r.world).toMatchObject({ nodes: [], customers: [], edges: [], tiles: [], districts: [], sectors: [] });
    expect(r.lockText).toBe('{\n  "version": 1,\n  "districts": {},\n  "nodes": {}\n}\n');
  });

  it('returns load errors without a world', () => {
    const r = runPipeline(dir(), null, AT);
    expect(r.world).toBeNull();
    expect(r.errors).toEqual(['districts.yaml: file not found', 'sectors.yaml: file not found']);
  });

  it('reports a malformed lock file as an error', () => {
    const r = runPipeline('fixtures/mini', '{ broken', AT);
    expect(r.world).toBeNull();
    expect(r.errors[0]).toMatch(/^layout\.lock\.json: invalid JSON/);
  });

  it('warns about dependency cycles but still builds', () => {
    const d = dir();
    writeFileSync(join(d, 'districts.yaml'), '- { id: core, name: Core, description: d, building: relay-tower, order: 0, color: "#111111" }\n');
    writeFileSync(join(d, 'sectors.yaml'), '[]\n');
    const ev = 'evidence: [{ url: "https://example.org/e", kind: docs, retrieved: 2026-10-20 }]';
    const mk = (id: string, target: string) =>
      `id: ${id}\nname: ${id}\ndistrict: core\ndescription: d\nstatus: active\nlastVerified: 2026-10-20\nuses:\n  - { target: ${target}, relation: library, confidence: verified, ${ev} }\n`;
    mkdirSync(join(d, 'nodes'));
    writeFileSync(join(d, 'nodes', 'a.yaml'), mk('a', 'b'));
    writeFileSync(join(d, 'nodes', 'b.yaml'), mk('b', 'a'));
    const r = runPipeline(d, null, AT);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['nodes/a.yaml: dependency cycle a -> b -> a (allowed, but check it is intended)']);
    expect(r.world!.nodes).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: FAIL — cannot resolve `../../pipeline/emit`.

- [ ] **Step 3: Implement `pipeline/emit.ts`**

```ts
import type { NodeFlags, Tier } from './flags';
import type { Graph } from './graph';
import type { Bounds, Layout, Pos, Region } from './layout';
import type { RoadTile, Roads } from './roads';
import type { Confidence, Customer, District, Evidence, Node, Relation, Sector } from './schema';
import { STAGE_WEIGHT, type Traffic } from './traffic';
import { cmp } from './util';

export interface WorldNode extends Omit<Node, 'uses'> {
  pos: Pos;
  traffic: number;
  trafficWithRumors: number;
  tier: Tier;
  stranded: boolean;
  hiddenHighway: boolean;
  dependents: number;
}
export interface WorldCustomer extends Omit<Customer, 'uses'> {
  harbor: string;
  slot: number;
  weight: number;
}
export interface WorldEdge {
  id: string;
  from: string;
  to: string;
  relation?: Relation;
  confidence: Confidence;
  evidence: Evidence[];
  traffic: number;
  trafficWithRumors: number;
  path: Pos[];
}
export interface WorldDistrict extends District { region: Region }
export interface WorldSector extends Sector { harbor: { pos: Pos } }
export interface World {
  version: 1;
  generatedAt: string;
  bounds: Bounds;
  districts: WorldDistrict[];
  sectors: WorldSector[];
  nodes: WorldNode[];
  customers: WorldCustomer[];
  edges: WorldEdge[];
  tiles: RoadTile[];
}

export function buildWorld(input: {
  graph: Graph;
  traffic: Traffic;
  rumorTraffic: Traffic;
  flags: Map<string, NodeFlags>;
  layout: Layout;
  roads: Roads;
  generatedAt: string;
}): World {
  const { graph, traffic, rumorTraffic, flags, layout, roads, generatedAt } = input;

  const districts = [...graph.data.districts]
    .sort((a, b) => a.order - b.order || cmp(a.id, b.id))
    .map((d) => ({ ...d, region: layout.districts.get(d.id)! }));
  const sectors = graph.data.sectors.map((s) => ({ ...s, harbor: { pos: layout.harbors.get(s.id)! } }));

  const nodes = [...graph.data.nodes]
    .sort((a, b) => cmp(a.id, b.id))
    .map(({ uses: _uses, ...n }) => ({
      ...n,
      pos: layout.nodes.get(n.id)!,
      traffic: traffic.node.get(n.id) ?? 0,
      trafficWithRumors: rumorTraffic.node.get(n.id) ?? 0,
      ...flags.get(n.id)!,
    }));

  const slots = new Map<string, number>();
  const customers = [...graph.data.customers]
    .sort((a, b) => cmp(a.id, b.id))
    .map(({ uses: _uses, ...c }) => {
      const harbor = c.sectors[0];
      const slot = slots.get(harbor) ?? 0;
      slots.set(harbor, slot + 1);
      return { ...c, harbor, slot, weight: STAGE_WEIGHT[c.stage] };
    });

  const edges = graph.edges.map((e) => ({
    ...e,
    traffic: traffic.edge.get(e.id) ?? 0,
    trafficWithRumors: rumorTraffic.edge.get(e.id) ?? 0,
    path: roads.paths.get(e.id)!,
  }));

  return { version: 1, generatedAt, bounds: layout.bounds, districts, sectors, nodes, customers, edges, tiles: roads.tiles };
}

export function serializeWorld(world: World): string {
  return `${JSON.stringify(world, null, 2)}\n`;
}
```

- [ ] **Step 4: Implement `pipeline/run.ts`**

```ts
import { buildWorld, type World } from './emit';
import { computeFlags } from './flags';
import { buildGraph, findCycles } from './graph';
import { computeLayout, emptyLock, parseLock, serializeLock, type LayoutLock } from './layout';
import { loadDataDir, nodeFile } from './load';
import { routeRoads } from './roads';
import { computeTraffic } from './traffic';
import { validateReferences } from './validate';

export interface PipelineResult {
  world: World | null;
  lockText: string | null;
  errors: string[];
  warnings: string[];
}

export function runPipeline(dataDir: string, lockText: string | null, generatedAt: string): PipelineResult {
  const failed = (errors: string[], warnings: string[] = []): PipelineResult => ({ world: null, lockText: null, errors, warnings });

  const { data, errors } = loadDataDir(dataDir);
  if (errors.length) return failed(errors);
  const refs = validateReferences(data);
  const warnings = [...refs.warnings];
  if (refs.errors.length) return failed(refs.errors, warnings);

  let lock: LayoutLock;
  try {
    lock = lockText === null ? emptyLock() : parseLock(lockText);
  } catch (e) {
    return failed([`layout.lock.json: ${(e as Error).message}`], warnings);
  }

  const graph = buildGraph(data);
  for (const cycle of findCycles(graph))
    warnings.push(`${nodeFile(cycle[0])}: dependency cycle ${[...cycle, cycle[0]].join(' -> ')} (allowed, but check it is intended)`);

  const traffic = computeTraffic(graph, { includeInferred: false });
  const rumorTraffic = computeTraffic(graph, { includeInferred: true });
  const flags = computeFlags(graph, traffic);
  const layout = computeLayout(graph, lock);
  const roads = routeRoads(graph, layout, traffic, rumorTraffic);
  warnings.push(...roads.warnings);

  const world = buildWorld({ graph, traffic, rumorTraffic, flags, layout, roads, generatedAt });
  return { world, lockText: serializeLock(layout.lock), errors: [], warnings };
}
```

- [ ] **Step 5: Run pipeline tests**

Run: `npx vitest run tests/pipeline/run.test.ts && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Write the failing CLI test**

Create `tests/pipeline/cli.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const cli = (...args: string[]) => spawnSync(TSX, ['pipeline/cli.ts', ...args], { encoding: 'utf8' });

function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'island-cli-'));
  cpSync('fixtures/mini', dir, { recursive: true });
  return dir;
}

describe('cli', () => {
  it('writes world.json and the lock file', () => {
    const data = copyFixture();
    const out = join(data, 'out', 'world.json');
    const r = cli('--data', data, '--out', out);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('6 buildings, 3 ships, 11 roads · 1 stranded · 2 hidden highways');
    expect(JSON.parse(readFileSync(out, 'utf8')).version).toBe(1);
    expect(readFileSync(join(data, 'layout.lock.json'), 'utf8')).toContain('"hearth-node"');
  }, 30_000);

  it('--check validates without writing anything', () => {
    const data = copyFixture();
    const out = join(data, 'world.json');
    const r = cli('--data', data, '--out', out, '--check');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('(check only, nothing written)');
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(data, 'layout.lock.json'))).toBe(false);
  }, 30_000);

  it('exits 1 and prints file-scoped errors', () => {
    const data = copyFixture();
    const file = join(data, 'nodes', 'swap-town.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('target: anvil-lib', 'target: missing-lib'));
    const r = cli('--data', data, '--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nodes/swap-town.yaml: uses[0].target "missing-lib" not found');
    expect(r.stderr).toContain('1 error(s) — nothing was written.');
  }, 30_000);
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run tests/pipeline/cli.test.ts`
Expected: FAIL — non-zero exit / file not found for `pipeline/cli.ts`.

- [ ] **Step 8: Implement `pipeline/cli.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { serializeWorld } from './emit';
import { runPipeline } from './run';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    out: { type: 'string', default: 'public/world.json' },
    check: { type: 'boolean', default: false },
  },
});
const dataDir = values.data!;
const outFile = values.out!;
const lockPath = join(dataDir, 'layout.lock.json');

const lockText = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null;
const result = runPipeline(dataDir, lockText, new Date().toISOString());

for (const w of result.warnings) console.warn(`warning  ${w}`);
if (result.errors.length > 0 || !result.world) {
  for (const e of result.errors) console.error(`error    ${e}`);
  console.error(`\n${result.errors.length} error(s) — nothing was written.`);
  process.exit(1);
}

const world = result.world;
if (!values.check) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serializeWorld(world));
  writeFileSync(lockPath, result.lockText!);
}
const stranded = world.nodes.filter((n) => n.stranded).length;
const highways = world.nodes.filter((n) => n.hiddenHighway).length;
console.log(
  `${world.nodes.length} buildings, ${world.customers.length} ships, ${world.edges.length} roads · ${stranded} stranded · ${highways} hidden highways` +
    (values.check ? ' (check only, nothing written)' : ''),
);
```

- [ ] **Step 9: Run CLI tests**

Run: `npx vitest run tests/pipeline/cli.test.ts`
Expected: all PASS.

- [ ] **Step 10: Seed the real dataset skeleton**

`data/districts.yaml`:

```yaml
- id: core
  name: Node & Network
  description: Block-producing nodes, networking and the ledger itself.
  building: relay-tower
  order: 0
  color: "#8d7b68"
- id: indexers
  name: Chain Indexers & Followers
  description: Tools that follow the chain and store or stream its data.
  building: watermill
  order: 1
  color: "#5b8fb9"
- id: api-providers
  name: API Providers
  description: Hosted or self-hosted APIs that expose chain data and submission.
  building: market-hall
  order: 2
  color: "#b9855b"
- id: onchain-languages
  name: On-chain Languages
  description: Languages and compilers for Plutus validators.
  building: forge
  order: 3
  color: "#a64b2a"
- id: sdks
  name: Off-chain SDKs & Libraries
  description: Libraries for building, signing and submitting transactions.
  building: workshop
  order: 4
  color: "#c08b5c"
- id: oracles
  name: Oracles
  description: Services that bring off-chain data on-chain.
  building: lighthouse
  order: 5
  color: "#e0c068"
- id: wallets
  name: Wallets
  description: Wallets and wallet infrastructure that hold users' keys.
  building: vault
  order: 6
  color: "#7d6b91"
- id: dev-tooling
  name: Developer Tooling
  description: Testing frameworks, emulators, devnets and debugging tools.
  building: tool-shed
  order: 7
  color: "#6f8f72"
- id: products
  name: Products & dApps
  description: Products that end customers use directly.
  building: town
  order: 8
  color: "#9bbb59"
  columns: 6
- id: bridges
  name: Bridges & Interop
  description: Bridges and interoperability protocols to other chains.
  building: bridge
  order: 9
  color: "#4f7c8a"
```

`data/sectors.yaml`:

```yaml
- id: defi
  name: DeFi
  description: Trading, lending, stablecoins and yield.
  inclusion: The customer moves, lends, borrows or holds value through financial protocols.
  coast: east
- id: payments
  name: Payments & Remittance
  description: Paying for goods and services and sending money across borders.
  inclusion: The customer uses Cardano to pay or get paid.
  coast: east
- id: rwa
  name: Real-World Assets
  description: Tokenized real-world assets such as commodities, real estate or securities.
  inclusion: The customer issues or holds a token that represents an off-chain asset.
  coast: east
- id: proof-verification
  name: Proof & Verification
  description: Notarisation, document certification and credential checks.
  inclusion: The customer proves that a document, file or claim existed or is authentic.
  coast: north
- id: supply-chain
  name: Supply Chain & Product Passports
  description: Traceability of goods from origin to consumer.
  inclusion: The customer records the origin or journey of physical products.
  coast: north
- id: identity
  name: Identity
  description: Decentralised identifiers, KERI and verifiable credentials for people and organisations.
  inclusion: The customer issues, holds or verifies identities.
  coast: north
- id: governance
  name: Governance & Treasury
  description: On-chain governance, DAOs and treasury management.
  inclusion: The customer votes, delegates or manages a shared treasury on-chain.
  coast: south
- id: nfts-gaming-media
  name: NFTs, Gaming & Media
  description: Collectibles, games, music and creator economies.
  inclusion: The customer creates, trades or plays with digital collectibles or media.
  coast: south
- id: enterprise-government
  name: Enterprise & Government
  description: Enterprise systems and public-sector deployments not covered by a more specific sector.
  inclusion: The customer is a company or public body whose use case fits no more specific sector.
  coast: south
```

Create `data/nodes/.gitkeep` and `data/customers/.gitkeep` (empty files).

`data/LICENSE`:

```
The data in this directory is licensed under the Creative Commons Attribution 4.0
International License (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/

You may share and adapt it for any purpose, provided you give appropriate credit to
"Cardano Island contributors", link to the license, and indicate if changes were made.
```

- [ ] **Step 11: Build the real (empty) world**

Run: `npm run build:world`
Expected: exit 0, prints `0 buildings, 0 ships, 0 roads · 0 stranded · 0 hidden highways`; creates `public/world.json` (git-ignored) and `data/layout.lock.json` with the 10 districts (`products` with `"columns": 6`).

- [ ] **Step 12: Write the spec refinements back into spec §3.5**

In `docs/superpowers/specs/2026-10-20-cardano-island-design.md`, replace the §3.5 code block with:

````markdown
```ts
{
  version: 1,
  generatedAt: string,
  bounds: { minX, minY, maxX, maxY },
  districts: (District & { region: { x0, x1, y0, y1 } })[],
  sectors: (Sector & { harbor: { pos:[x,y] } })[],
  nodes: (Omit<Node,'uses'> & { pos:[x,y], traffic, trafficWithRumors, tier, stranded, hiddenHighway, dependents })[],
  customers: (Omit<Customer,'uses'> & { harbor: sectorId, slot, weight })[],
  edges: { id, from, to, relation?, confidence, evidence, traffic, trafficWithRumors, path:[x,y][] }[],
  tiles: { pos:[x,y], traffic, surface:0|1|2|3, dashed, rumor }[]
}
```

Harbor positions are recomputed on every build from the island bounds; node positions and district columns are locked in `layout.lock.json`. Districts added later are appended east of existing ones. `rumor` tiles are crossed only by `inferred` edges.
````

- [ ] **Step 13: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: every test file PASS, no type errors.

- [ ] **Step 14: Commit**

```bash
git add pipeline/emit.ts pipeline/run.ts pipeline/cli.ts tests/pipeline/run.test.ts tests/pipeline/cli.test.ts data docs/superpowers/specs/2026-10-20-cardano-island-design.md
git commit -m "feat(pipeline): world.json emission, pipeline runner, CLI and seed districts/sectors"
```

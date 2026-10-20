# Cardano Island — Design Spec

**Date:** 2026-10-20
**Status:** Draft for review
**Audience of the product:** Public ecosystem showcase (builders, community, funders)

## 1. Purpose

An explorable, Settlers-style isometric 3D map of the Cardano technology landscape. Tools and products are buildings on an island; "uses" relationships are paths that wear into roads as more end users depend on them; end customers are ships in coastal harbors grouped by sector.

The map must answer two questions at a glance:

1. **Stranded buildings** — which projects have no route to any end user?
2. **Hidden highways** — which dependencies carry a lot of (transitive) end-user traffic while being directly named by few projects?

Because it is public, every connection must be backed by a checkable source, and the data must be easy for outsiders to correct via pull request.

### Success criteria

- A curated core of ~80–150 nodes and customers, every edge carrying at least one source URL with retrieval date.
- Stranded and hidden-highway findings are visible via lenses and reproducible from the data.
- A contributor can add a project or a customer by adding one YAML file, and CI tells them precisely what is wrong if it is invalid.
- Adding entries never reshuffles the existing map.
- Works on desktop and mobile; has a non-WebGL list view.

### Non-goals (v1)

- Real usage metrics (tx volume, downloads) as path weight.
- Full ecosystem census / bulk auto-import.
- Hand-crafted art assets (procedural geometry first; swappable later).
- Game mechanics beyond exploration (quests, timeline playback).

## 2. Data model

All source data lives as YAML in git. One file per node or customer.

```
data/
  districts.yaml       # inland zones
  sectors.yaml         # harbors (end-customer buckets)
  nodes/<id>.yaml      # buildings
  customers/<id>.yaml  # ships
  layout.lock.json     # stable positions (generated, committed)
```

### 2.1 Districts (`districts.yaml`)

Each district: `id`, `name`, `description`, `building` (archetype id), `order` (west→east depth, used by layout), `color`.

Initial districts:

| id | Name | Building archetype |
|---|---|---|
| `core` | Node & Network | mountain slopes / relay towers |
| `indexers` | Chain Indexers & Followers | watermill (on the chain river) |
| `api-providers` | API Providers | market hall |
| `onchain-languages` | On-chain Languages | forge |
| `sdks` | Off-chain SDKs & Libraries | workshop |
| `oracles` | Oracles | lighthouse |
| `wallets` | Wallets | vault house |
| `dev-tooling` | Developer Tooling (testing, emulators, devnets) | tool shed |
| `products` | Products & dApps | town building (styled by primary sector) |
| `bridges` | Bridges & Interop | bridge toward a neighbouring island |

### 2.2 Sectors (`sectors.yaml`)

Each sector: `id`, `name`, `description`, `inclusion` (one-line rule for what belongs here), `coast` (`east` | `north` | `south`).

Initial hypothesis (to be validated by bottom-up clustering in Milestone 2): DeFi, Payments & Remittance, Proof & Verification (notary, documents, credentials), Supply Chain & Product Passports, Identity, Governance & Treasury, Real-World Assets & Tokenization, NFTs/Gaming/Media, Enterprise & Government. Sectors may be merged, split or renamed based on evidence; each final sector must have an `inclusion` rule.

### 2.3 Nodes (`nodes/<id>.yaml`)

```yaml
id: yaci-store                 # slug, unique across nodes and customers, equals filename
name: Yaci Store
district: indexers
description: Modular Java indexer for Cardano.
maintainer: bloxbean           # free text org/person
links:
  website: https://...
  repo: https://github.com/bloxbean/yaci-store
  docs: https://...
packages:                      # optional, used by the manifest scanner
  - ecosystem: maven           # npm | maven | cargo | hackage | go | pypi | nuget
    name: com.bloxbean.cardano:yaci-store
status: active                 # active | maintenance | deprecated
primarySector: null            # only for products; styles the building
uses:
  - target: cardano-client-lib
    relation: library          # library | service | language | infrastructure
    confidence: verified       # verified | reported | inferred
    evidence:
      - url: https://github.com/bloxbean/yaci-store/blob/main/build.gradle
        kind: manifest         # manifest | plutus-json | docs | announcement | case-study | talk | article
        retrieved: 2026-10-20
        note: optional quote or context
lastVerified: 2026-10-20
```

Edges are declared **inline in the consumer's file** ("I use X").

### 2.4 Customers (`customers/<id>.yaml`)

```yaml
id: moneta-usdm-holders
name: USDM holders
type: segment                  # organization | government | dao | segment
sectors: [defi, payments]
stage: production              # announced | pilot | production | ended
description: ...
metric:                        # optional; recommended for segments
  label: USDM supply
  value: "..."
  source: https://...
  retrieved: 2026-10-20
uses:
  - target: usdm
    confidence: verified
    evidence: [ { url: ..., kind: case-study, retrieved: 2026-10-20 } ]
lastVerified: 2026-10-20
```

Customer `uses` entries have no `relation` field (it is implicitly "uses product").

`segment` represents real but anonymous user groups (e.g. retail DEX traders) so that sectors with anonymous users are not empty. A segment should carry a sourced `metric`.

### 2.5 Validation rules (enforced in CI)

- Schema conforms (zod); `id` equals filename; ids unique across nodes and customers.
- Every `district`, `sectors[]`, and `uses[].target` resolves.
- Customers may only `use` nodes; nodes may only `use` nodes.
- Every edge has ≥1 evidence entry with `url` and `retrieved`.
- `inferred` edges are allowed in data but excluded from default rendering.
- Dependency cycles are allowed and reported as warnings.

## 3. Computed model

Produced by the pipeline into `world.json`.

### 3.1 Traffic

Stage weights: `production` = 1, `pilot` = 0.5, `announced` = 0.25, `ended` = 0.

For each customer *c*: compute the set of edges reachable by walking `uses` from *c* through all nodes (visited set handles cycles). Each edge in that set receives *c*'s weight **once**, regardless of how many routes reach it. Edge traffic = sum over customers. Node traffic = sum of weights of distinct customers whose closure reaches the node.

Only `verified` and `reported` edges participate in default traffic; a second traffic value including `inferred` edges is computed for the "show rumors" toggle.

### 3.2 Flags

- **Stranded:** node traffic = 0 counting only non-`ended` customers.
- **Hidden highway:** node traffic is in the top 15% of nodes AND its number of direct dependents is ≤ 3. (Thresholds are constants in `flags.ts`, tuned once real data exists.)
- **Size tier** (1–4: hut, house, hall, keep): quartiles of node traffic among non-stranded nodes; stranded nodes are tier 1.

### 3.3 Layout

- Tile grid. District regions are laid out west→east by `order`; the Cardano mountain occupies the west; harbors occupy coasts per sector `coast`.
- New nodes claim the free plot in their district closest to the centroid of their neighbours; existing positions are read from `layout.lock.json` and never moved. If a district has no free plot, its region grows.
- The lockfile is regenerated by the pipeline and committed.

### 3.4 Road routing

- A* over the tile grid, per edge, buildings as obstacles.
- Tiles already used by earlier routes cost less, so routes merge into shared roads. Edges are routed in descending traffic order for determinism; ties broken by edge id.
- Tile traffic = sum of traffic of edges crossing the tile. Surface tier: footprints → mud → gravel → cobblestone, by fixed thresholds on tile traffic.
- A tile renders dashed when every edge crossing it is `reported` (none `verified`).

### 3.5 `world.json` shape

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

## 4. Gathering sources

### 4.1 Projects/products

developers.cardano.org (Builder Tools, Showcase); GitHub orgs (IntersectMBO, input-output-hk, cardano-foundation, bloxbean, aiken-lang, txpipe, MeshJS, blockfrost, Anastasia Labs, Harmonic Labs, OpShin, Helios, Scalus, and others discovered); DefiLlama Cardano chain; Cardano Cube; Essential Cardano; Project Catalyst funded proposals.

### 4.2 Dependency evidence (strongest first)

1. Package manifests (`package.json`, `build.gradle`/`pom.xml`, `Cargo.toml`, `*.cabal`, `go.mod`, `pyproject.toml`).
2. `plutus.json` preamble `compiler` field → `language` edges to on-chain languages.
3. deps.dev / GitHub dependency graph for reverse lookups.
4. Docs and announcements for service dependencies (e.g. "uses Blockfrost/Ogmios").

### 4.3 End customers

Cardano Foundation, IOG and Emurgo case studies; Cardano Summit talks; press releases; products' own customer pages; DefiLlama for segment metrics. Every customer has a `stage`; ended pilots are kept as wrecks.

### 4.4 Sector discovery

Collect stories untagged → tag each with the problem it solves in plain words → cluster tags → compare with the hypothesis in 2.2 → write final `sectors.yaml` with `inclusion` rules.

### 4.5 Process

Initial dataset: parallel research agents (one per district, one per sector) draft YAML with evidence; spot-check by Claude; review by the project owner before publishing. Ongoing: manifest scanner and community PRs.

### 4.6 Manifest scanner (`scripts/scan-manifests.ts`)

For each node with `links.repo`, fetch known manifest files, match dependency coordinates against all nodes' `packages`, and output proposed `uses` edges (`confidence: verified`, `kind: manifest`) not yet present. Run weekly in CI; opens a PR with the proposals.

## 5. The map (app)

### 5.1 Stack

Vite + TypeScript + Three.js. Lightweight DOM overlay for UI (side panel, search, lenses, list view). Loads `world.json` at startup.

### 5.2 Scene

- Orthographic camera at isometric angle. Pan (drag/touch), zoom (wheel/pinch), rotate in 90° snaps (Q/E and on-screen buttons).
- Low-poly island terrain with animated water.
- West: Cardano mountain with a floating, slowly rotating Cardano logo built from rings of spheres; `core` district on its slopes.
- The chain river flows from the mountain; block "rafts" drift downstream; `indexers` sit as watermills on its banks.
- Districts have tinted ground and a signpost.
- Bridges extend from the `bridges` district toward fog-shrouded neighbouring islands.

### 5.3 Buildings

One procedural generator per archetype (section 2.1), parameterised by size tier 1–4. Status `deprecated` → overgrown ruin variant. Stranded → no road, small "?" flag. Generators are isolated modules with a common interface `(tier, options) => THREE.Object3D` so hand-made assets can replace them later.

### 5.4 Roads and settlers

Road meshes built from `tiles` (surface tier → material; dashed for reported). Settlers: instanced low-poly figures walking edge paths from harbors inward, count proportional to traffic. Toggleable; disabled when `prefers-reduced-motion`.

### 5.5 Harbors and ships

One harbor per sector on its coast. Ships per customer: production → galleon, pilot → rowboat, announced → ship on the horizon, ended → wreck.

### 5.6 Interaction

- Hover: tooltip. Click building/ship/road: side panel with description, links, uses / used-by lists with evidence links, traffic, flags.
- Search with fly-to. Deep links (`#node=<id>`, `#customer=<id>`).
- Lenses: *Stranded* (desaturate all but stranded), *Hidden highways* (glow), *Follow a ship* (highlight a customer's full closure).
- Filters: district, sector, confidence; "show rumors" toggle for inferred edges.
- List view: accessible table of nodes/customers/edges with the same data; used automatically if WebGL is unavailable.

## 6. Repository layout

```
data/        districts.yaml, sectors.yaml, nodes/, customers/, layout.lock.json
pipeline/    schema.ts, load.ts, graph.ts, traffic.ts, flags.ts, layout.ts, roads.ts, emit.ts, cli.ts
app/         scene/, terrain/, buildings/, roads/, settlers/, harbors/, ui/, main.ts
scripts/     scan-manifests.ts, check-links.ts
fixtures/    small hand-made worlds for tests and renderer development
docs/        CONTRIBUTING.md, superpowers/specs/, superpowers/plans/
```

Licensing: code MIT, data (`data/`) CC-BY-4.0.

## 7. CI / automation

- **PR:** validate data; run pipeline; post a comment summarising the change in game terms (buildings/roads added, tier changes, new stranded nodes).
- **Weekly:** link checker over all evidence URLs (report broken links as an issue); manifest scanner (opens PR).
- **Main:** build and deploy to GitHub Pages.

## 8. Error handling

- Pipeline fails with precise messages: `<file>: <path> <problem>` (e.g. `nodes/foo.yaml: uses[1].target "bar" not found`).
- Cycles → warning, not failure. Full district → region grows.
- App: `world.json` fetch failure → friendly "the fog hasn't lifted" screen with retry. No WebGL → list view.

## 9. Testing

- **Pipeline (vitest, fixture worlds):** schema errors and messages; distinct-customer-per-edge counting; stage weights; cycles; stranded and hidden-highway detection; layout stability (adding a node does not move others); routing determinism (same input → identical `world.json`).
- **App:** Playwright smoke test on a fixture world (loads, click building opens panel, lens toggles, list view renders); screenshot snapshot per building generator and tier.

## 10. Milestones

Each milestone gets its own implementation plan.

1. **Data model + pipeline** against fixture worlds.
2. **Gathering:** curated core dataset (~80–150 entries) via research agents; sector clustering; owner review.
3. **Map renderer** against fixture worlds (can run in parallel with 2).
4. **Integration:** real data, lenses, list view, CI/deploy, polish.

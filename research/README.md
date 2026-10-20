# Research staging area

Research agents write draft YAML here, one folder per agent (`research/<agent>/nodes`, `research/<agent>/customers`).
Drafts are reconciled into `data/` after review. Nothing in this folder is published.

## File format

Exactly the format of the design spec §2.3 / §2.4 (`docs/superpowers/specs/2026-10-20-cardano-island-design.md`).

Node (`nodes/<id>.yaml`, filename == id):

```yaml
id: yaci-store
name: Yaci Store
district: indexers          # one of the district ids below
description: One or two plain sentences.
maintainer: BloxBean        # optional
links:                      # optional keys: website, repo, docs (http(s) only)
  repo: https://github.com/bloxbean/yaci-store
packages:                   # optional; ecosystem: npm|maven|cargo|hackage|go|pypi|nuget
  - ecosystem: maven
    name: com.bloxbean.cardano:yaci-store-starter
status: active              # active | maintenance | deprecated
primarySector: null         # ONLY for district "products": one sector id
uses:
  - target: cardano-client-lib      # a node id (registry below or one you created)
    relation: library               # library | service | language | infrastructure
    confidence: verified            # verified | reported | inferred
    evidence:
      - url: https://github.com/bloxbean/yaci-store/blob/main/build.gradle
        kind: manifest              # manifest | plutus-json | docs | announcement | case-study | talk | article
        retrieved: 2026-10-20
        note: optional short quote
lastVerified: 2026-10-20
```

Customer (`customers/<id>.yaml`):

```yaml
id: georgian-wine-agency
name: National Wine Agency of Georgia
type: government            # organization | government | dao | segment
sectors: [supply-chain]     # first entry = harbor it docks in
stage: production           # announced | pilot | production | ended
description: What they do with it, in one or two sentences.
metric:                     # optional; strongly recommended for type: segment
  label: Bottles tracked
  value: "…"
  source: https://…
  retrieved: 2026-10-20
uses:                       # NO relation field for customers
  - target: some-product-node-id
    confidence: verified
    evidence:
      - url: https://…
        kind: case-study
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

Unknown keys are rejected. Every edge needs ≥ 1 evidence entry. A customer needs ≥ 1 `uses`.

## Confidence rules

- `verified`: primary source — the consumer's own manifest/lockfile, `plutus.json`, the consumer's or provider's official docs/announcement naming the other party, an official case study.
- `reported`: credible third-party source (news article, conference talk by someone else, ecosystem report).
- `inferred`: plausible but not evidenced explicitly (e.g. forum claim). Use sparingly.
- Never invent URLs. Only cite URLs you actually opened (or that search results clearly show) and that support the claim.

## Districts

core · indexers · api-providers · onchain-languages · sdks · oracles · wallets · dev-tooling · products · bridges

## Sectors (harbors) — working hypothesis

defi · payments · rwa · proof-verification · supply-chain · identity · governance · nfts-gaming-media · enterprise-government

## Canonical id registry (use these ids when linking; owner agent creates the file)

| id | name | district | owner |
|---|---|---|---|
| cardano-node | Cardano Node | core | infra |
| cardano-ledger | Cardano Ledger | core | infra |
| ouroboros-network | Ouroboros Network | core | infra |
| amaru | Amaru | core | infra |
| mithril | Mithril | core | infra |
| hydra | Hydra Head | core | infra |
| cardano-db-sync | cardano-db-sync | indexers | infra |
| kupo | Kupo | indexers | infra |
| oura | Oura | indexers | infra |
| yaci-store | Yaci Store | indexers | infra |
| carp | Carp | indexers | infra |
| dolos | Dolos | indexers | infra |
| ogmios | Ogmios | api-providers | infra |
| blockfrost | Blockfrost | api-providers | infra |
| koios | Koios | api-providers | infra |
| maestro | Maestro | api-providers | infra |
| demeter | Demeter.run | api-providers | infra |
| cardano-graphql | Cardano GraphQL | api-providers | infra |
| cardano-rosetta | Cardano Rosetta | api-providers | infra |
| plinth | Plinth (PlutusTx) | onchain-languages | langs |
| aiken | Aiken | onchain-languages | langs |
| plutarch | Plutarch | onchain-languages | langs |
| opshin | OpShin | onchain-languages | langs |
| helios | Helios | onchain-languages | langs |
| scalus | Scalus | onchain-languages | langs |
| plu-ts | plu-ts | onchain-languages | langs |
| marlowe | Marlowe | onchain-languages | langs |
| cardano-serialization-lib | Cardano Serialization Lib | sdks | langs |
| cardano-multiplatform-lib | Cardano Multiplatform Lib | sdks | langs |
| cardano-client-lib | Cardano Client Lib | sdks | langs |
| mesh | Mesh SDK | sdks | langs |
| lucid-evolution | Lucid Evolution | sdks | langs |
| lucid | Lucid | sdks | langs |
| blaze | Blaze | sdks | langs |
| pycardano | PyCardano | sdks | langs |
| pallas | Pallas | sdks | langs |
| cardano-js-sdk | Cardano JS SDK | sdks | langs |
| cardano-transaction-lib | Cardano Transaction Lib (CTL) | sdks | langs |
| atlas | Atlas | sdks | langs |
| apollo | Apollo (Go) | sdks | langs |
| cardanosharp | CardanoSharp | sdks | langs |
| charli3 | Charli3 | oracles | edge |
| orcfax | Orcfax | oracles | edge |
| cardano-wallet | cardano-wallet (backend) | wallets | edge |
| lace | Lace | wallets | edge |
| eternl | Eternl | wallets | edge |
| yoroi | Yoroi | wallets | edge |
| vespr | VESPR | wallets | edge |
| typhon | Typhon | wallets | edge |
| nufi | NuFi | wallets | edge |
| begin | Begin | wallets | edge |
| yaci-devkit | Yaci DevKit | dev-tooling | edge |
| cardano-cli | cardano-cli | dev-tooling | edge |

Products (district `products`) are created by the sector agents. Product ids are lowercase slugs of the product name (e.g. `minswap`, `usdm`, `uverify`). If you need to link to a node that is neither in this registry nor yours to create, write it to `research/<agent>/missing.md` (name, suggested id, district, URL) instead of creating the file, and still write the edge in your YAML using the suggested id.

# Contributing to Cardano Island

Cardano Island is a map of who builds on whom in the Cardano ecosystem. Every building is a project, every road is a "uses" relationship, and every ship is a real customer. The map is only as good as its sources, so every relationship needs a link that someone else can check.

You don't need to write code to contribute. Most changes are one YAML file.

## Add or fix a project (a building)

1. Create `data/nodes/<id>.yaml`. The file name must equal the `id`, written as a lowercase slug such as `yaci-store`.
2. Pick a `district` from `data/districts.yaml`.
3. List what the project uses. Each `uses` entry needs at least one `evidence` link.

```yaml
id: yaci-store
name: Yaci Store
district: indexers
description: Modular Java indexer for Cardano.
maintainer: BloxBean
links:
  repo: https://github.com/bloxbean/yaci-store
packages:
  - ecosystem: maven            # npm | maven | cargo | hackage | go | pypi | nuget
    name: com.bloxbean.cardano:yaci-store-spring-boot-starter
status: active                  # active | maintenance | deprecated
uses:
  - target: cardano-client-lib  # the id of another project
    relation: library           # library | service | language | infrastructure
    confidence: verified        # verified | reported | inferred
    evidence:
      - url: https://github.com/bloxbean/yaci-store/blob/main/components/core/build.gradle
        kind: manifest          # manifest | plutus-json | docs | announcement | case-study | talk | article
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

Products used directly by end customers go in the `products` district and set `primarySector` to one of the harbors in `data/sectors.yaml`.

Filling in `packages` lets the weekly manifest scan find new roads to your project automatically.

## Add a customer (a ship)

Create `data/customers/<id>.yaml`. A customer is either a named organization or government, or an anonymous user `segment` (for example "Minswap traders") backed by a sourced `metric`.

```yaml
id: georgian-wine-agency
name: National Wine Agency of Georgia
type: government                # organization | government | dao | segment
sectors: [supply-chain]         # the first one is the harbor it docks in
stage: production               # announced | pilot | production | ended
description: Records wine certification on Cardano so buyers can check a bottle's origin.
uses:
  - target: originatenavio
    confidence: verified
    evidence:
      - url: https://www.cardanofoundation.org/case-studies/bolnisi
        kind: case-study
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

Be honest about `stage`. Ended pilots stay on the map as wrecks; that history is useful too.

## Evidence rules

- **verified**: a primary source. This is the project's own manifest or lockfile, a `plutus.json`, official docs or announcements naming the other party, or an official case study.
- **reported**: a credible third party, such as a news article or someone else's conference talk. These roads are drawn dashed.
- **inferred**: plausible but not stated anywhere. These roads stay hidden unless a visitor turns on "Show rumors".
- Test-only and development dependencies don't count as "uses".
- Only `http://` and `https://` links are accepted.

## Check your change

```bash
npm ci
npm run check:data     # validates everything and points at the exact file and field
npm run build:world    # updates data/layout.lock.json and public/world.json
npm run dev            # look at the island at http://localhost:5173
```

Commit `data/layout.lock.json` together with your change. It keeps every existing building on its plot, so adding a project never reshuffles the map.

**Merge conflicts in `layout.lock.json`:** keep the entries from both sides, then run `npm run build:world` again. If two buildings claimed the same plot, one of them moves automatically. Don't delete the lock file, because that rebuilds the whole map from scratch.

Each pull request gets a comment describing how it changes the island: buildings and roads added, buildings that grow, newly stranded buildings.

## What the map computes

- **Traffic:** every customer walks from its harbor through everything it depends on, down to the Cardano mountain. A production customer counts 1, a pilot 0.5, an announcement 0.25 and an ended customer 0. A road's surface wears from footprints to mud, gravel and finally cobblestone as traffic grows.
- **Stranded:** no route from any active customer reaches the building.
- **Hidden highway:** among the busiest 15% of buildings, yet named directly by three or fewer projects.

## Licenses

Code is MIT licensed. The data in `data/` is CC BY 4.0: reuse it with credit to "Cardano Island contributors".

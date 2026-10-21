# Contributing to Lovelace Land

Lovelace Land maps who builds on whom in the Cardano ecosystem:
- every **building** is a project;
- every **road** is a "uses" relationship;
- every **ship** is a real customer.

Roads wear down with real usage, and the timeline at the bottom replays the ecosystem since 2021.

The map is only as good as its sources. Every road and every ship links to evidence that anyone can check. Most contributions are one small YAML file, and you don't need to write code.

| I want to… | Do this | Code needed? |
|---|---|---|
| Point out something wrong | [Report wrong data](#report-wrong-or-missing-data) | No |
| Point out something missing | [Report missing data](#report-wrong-or-missing-data) | No |
| Add or fix a project | [Add a project](#add-a-project-a-building) | A YAML file |
| Show that one project uses another | [Add a road](#add-a-road-a-dependency) | A few YAML lines |
| Add a company or user group | [Add a customer](#add-a-customer-a-ship) | A YAML file |
| Feed the timeline with on-chain activity | [Add on-chain data](#add-on-chain-activity-for-the-timeline) | A few YAML lines |
| Add a new kind of data source | [For developers](#for-developers-a-new-kind-of-data-source) | TypeScript |

---

## Report wrong or missing data

Open an issue with one of the forms. You can stop there; a maintainer turns it into a change.

- **[Wrong data](../../issues/new?template=wrong-data.yml)**: a road that doesn't exist, a wrong status, an outdated customer, a broken source link.
- **[Missing data](../../issues/new?template=missing-data.yml)**: a project, customer or dependency that isn't on the island.

What helps most:

1. **What exactly is wrong or missing.** Name the building or ship as it appears on the map. You can also paste the page link after clicking it, for example `#node=yaci-store`.
2. **A public source.** For example a repository file, documentation, an announcement, a case study or a talk. "We use it internally" can't go on the map until it's public somewhere; any public mention is enough.
3. **If you maintain the project, say so.** Maintainers' corrections are handled first.

### How corrections are decided

- **A source beats an opinion.** If a road has a source and someone disputes it, we look for newer evidence. Until then the road stays, but its confidence may drop from `verified` to `reported`.
- **A dead source isn't automatically a false claim.** When a source disappears (the weekly link check reports these), we look for a replacement. If none exists, the road is downgraded or removed, and the description says why. For example, d'ABIS keeps its roads as `reported` since its repository went private.
- **Ended projects stay on the map** as ruins, wrecks or grass. That history is useful. Use `status: deprecated` or `stage: ended` rather than deleting them.
- **Project maintainers can ask to change how their project is described.** They can't ask to hide sourced facts.

---

## Add a project (a building)

Create `data/nodes/<id>.yaml`. The file name must equal the `id`, written as a lowercase slug such as `yaci-store`.

```yaml
id: yaci-store
name: Yaci Store
district: indexers
description: Modular Java indexer for Cardano.
maintainer: BloxBean
links:
  website: https://store.yaci.xyz/
  repo: https://github.com/bloxbean/yaci-store     # a single repository, not an org page
packages:                                         # what it publishes; lets the scanner find its users
  - ecosystem: maven                              # npm | maven | cargo | hackage | go | pypi | nuget
    name: com.bloxbean.cardano:yaci-store-spring-boot-starter
status: active                                    # active | maintenance | deprecated
uses: []                                          # see "Add a road"
lastVerified: 2026-10-20
```

### Districts

Choose the district that matches what the project *is*:

| District | For |
|---|---|
| `core` | nodes, ledger, consensus, networking, Mithril, Hydra |
| `indexers` | chain followers and indexers (db-sync, Kupo, Oura, Yaci Store, Dolos) |
| `api-providers` | hosted or self-hosted APIs (Blockfrost, Koios, Ogmios, Rosetta) |
| `onchain-languages` | smart contract languages and compilers (Aiken, Plinth, Plutarch, OpShin) |
| `sdks` | off-chain libraries (Mesh, Lucid Evolution, Cardano Client Lib, PyCardano, Pallas) |
| `oracles` | price and data oracles |
| `wallets` | wallets and wallet backends |
| `dev-tooling` | testing, devnets, debuggers, CLIs |
| `products` | anything end customers use directly. Also set `primarySector` to one harbor from `data/sectors.yaml`. |
| `bridges` | bridges and interoperability |

### Tips

- Link `links.repo` to one repository (`github.com/org/repo`), not an organization. The timeline reads its commit history to judge whether a project is maintained.
- Write the `description` for someone outside the ecosystem: say what it does in one or two plain sentences.

---

## Add a road (a dependency)

Roads live in the consumer's file, under `uses`, meaning "this project uses that one". Every road needs at least one source.

```yaml
uses:
  - target: cardano-client-lib        # the id of another building
    relation: library                 # library | service | language | infrastructure
    confidence: verified              # verified | reported | inferred
    evidence:
      - url: https://github.com/bloxbean/yaci-store/blob/main/components/core/build.gradle
        kind: manifest                # manifest | plutus-json | docs | announcement | case-study | talk | article
        retrieved: 2026-10-20         # when you checked it
        note: implementation 'com.bloxbean.cardano:cardano-client-lib'   # optional quote
```

**Relation:**
- `library`: code dependency.
- `service`: calls an API.
- `language`: contracts are written in it.
- `infrastructure`: runs on it.

**Confidence:**
- `verified`: a primary source. This is the project's own manifest or lockfile, a `plutus.json` (its `compiler` field names the contract language), official docs or announcements naming the other project, or an official case study. Drawn as a solid road.
- `reported`: a credible third party, such as news, someone else's talk or an ecosystem report. Drawn as a dashed road.
- `inferred`: plausible but not stated anywhere, for example GitHub activity that points to a company without naming it. Hidden unless a visitor turns on "Show rumors".

**What doesn't count as a road:**
- test-only or development dependencies;
- optional plugins that are off by default;
- a project merely mentioning another one.

Many roads don't need to be written by hand. Fill in `packages` on the target project, and the weekly manifest scan proposes roads from every repository on the island whose `package.json`, `Cargo.toml`, `build.gradle`, `pom.xml`, `go.mod` or `pyproject.toml` depends on it. Run it yourself with `npm run scan:manifests`.

---

## Add a customer (a ship)

Customers are why the map exists. They are the end users that every road ultimately serves. Create `data/customers/<id>.yaml`:

```yaml
id: georgian-wine-agency
name: National Wine Agency of Georgia
type: government                    # organization | government | dao | segment
sectors: [supply-chain]             # the first one is the harbor it docks in
stage: production                   # announced | pilot | production | ended
description: Records wine certification on Cardano so buyers can check a bottle's origin.
uses:                               # products it uses; no "relation" for customers
  - target: originatenavio
    confidence: verified
    evidence:
      - url: https://www.cardanofoundation.org/case-studies/bolnisi
        kind: case-study
        retrieved: 2026-10-20
lastVerified: 2026-10-20
```

- **Named or anonymous.** Use `organization`, `government` or `dao` for a named user with a public source. Use `segment` for an anonymous group, such as "Minswap traders". Give a segment a sourced `metric` (for example monthly users or TVL with its source) so its size is visible.
- **Be honest about `stage`.** Pilots dock as rowboats, announcements as ghost ships, and ended customers become wrecks.
- **Harbors.** Pick one from `data/sectors.yaml`, where each sector has an `inclusion` rule. If none fits, say so in an issue. New harbors are added when several real customers need one. That's how "Exchanges & Custody" was created.

---

## Add on-chain activity for the timeline

The timeline replays the ecosystem month by month from September 2021:
- ships sail in when a customer starts using a product, fade into ghosts at their berth when their transactions stop, and come back when they resume;
- buildings burn after 4 inactive months, become ruins after 6 and turn back to grass after 12;
- busy roads wear into cobblestone.

To count activity, the island needs to know which on-chain identifiers belong to whom.

### On a product or customer

```yaml
onchain:
  scripts:                          # Plutus or native script hashes (56 hex characters)
    - e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309
  metadataLabels: [1447]            # transaction metadata labels, for notary and supply-chain products
  addresses: [addr1q…]              # a documented issuer or treasury address
  source: https://github.com/minswap/minswap-dex-v2/blob/main/deployed/mainnet/script.json
  note: DEX v2 order, pool and factory validators
```

**Where to find identifiers:**
- **Script hashes:** the `hash` of each validator in the project's `plutus.json`, official deployment files, documented contract addresses, or public registries such as the StricaHQ and CRFA contract registries.
- **From a script address** (`addr1w…` or `addr1z…`): use its payment credential.
- **Metadata labels:** the project's docs or source code.
- **Addresses:** only ones the owner documents publicly.

**Only list identifiers that belong to that entity.** Shared contracts or generic labels (for example label 674 for messages) would credit other people's activity to it.

### Without on-chain data

Give the announced period of use instead:

```yaml
active:
  from: 2024-03        # first month of real use (go-live, not the press release about a future plan)
  until: 2025-01       # only if it ended
  confirmed: 2026-02   # customers only: the latest month a public source shows it is still in use
```

An announcement is not proof of use forever. Without `until`, a customer's announced use counts for **24 months after `confirmed`** (or after `from` if nothing has confirmed it since). After that, the ship fades into a ghost, just as an on-chain ship does when its transactions stop.

To keep a ship docked, find a newer dated source that shows the customer still uses the product, for example:
- a dated support page or changelog;
- a news article;
- a new release, for a wallet's user group.

Add it as evidence on the matching `uses` entry, with a note quoting the date. Then set `confirmed` to that month. A source that only repeats the original announcement doesn't count.

### Collecting the numbers

`npm run collect:activity` gathers both kinds of activity into `data/activity/`. A weekly job does the same, so you don't have to.
- **Transactions:** from the Yaci Store analytics service at `https://yaci-playground.cf-app.org/mcp`.
- **Commits:** monthly commit counts for every linked GitHub repository. It uses `GITHUB_TOKEN`, or the token of a logged-in `gh` CLI.

Useful options:
- `--only <id>` collects one entity.
- `--kind tx|commits` collects one kind of data.

---

## For developers: a new kind of data source

Activity is stored as one JSON file per entity and month series:

```json
{ "id": "minswap", "source": "…", "collected": "2026-10-20", "months": { "2024-01": 81234, "2024-02": 79012 } }
```

- Transaction series go in `data/activity/tx/` and commit series in `data/activity/commits/`.
- The pipeline only reads these files and never touches the network, so builds stay reproducible.

To add a new source, for example DefiLlama TVL or package download counts:

1. Put pure query builders and response parsers in `scripts/lib/activity-sources.ts`, with unit tests in `tests/scripts/`.
2. Wire the network calls into `scripts/collect-activity.ts`. Use the existing `withRetry`, and make sure a failure is reported without stopping the other entities.
3. If the new data needs its own folder, add it to `pipeline/activity.ts`, and extend the timeline in `pipeline/timeline.ts`. That's where it becomes usage, flow and state.
4. Run `npm test`. The timeline's state machine has tests for every threshold.

---

## Check your change

```bash
npm ci
npm run check:data     # validates everything and names the exact file and field
npm run build:world    # writes public/world.json and data/layout.lock.json
npm run dev            # look at it on http://localhost:5173
```

Every pull request:
- runs these checks and the tests;
- gets a comment describing how it changes the island, for example "+1 building: Foo", "Bar grows from hut to house" or "Newly stranded: Baz".

### The layout lock

`data/layout.lock.json` keeps every building on its plot, so adding a project never reshuffles the map.
- **Commit it with your change if you can.** If you edited on github.com and couldn't run the build, the check only warns; after merging, a bot places your building and commits the lock.
- **Merge conflict in the lock:** keep the entries from both sides and run `npm run build:world` again. Buildings that collide are re-placed automatically. Don't delete the lock, because that rebuilds the whole map.

---

## What the map computes

- **Traffic:** each customer's flow, `log10(1 + monthly transactions)`, walks from its harbor through everything it depends on, down to the Cardano mountain. Without on-chain data, announced periods count as a small fixed flow.
- **Stranded:** no route from any active customer reaches the building.
- **Hidden highway:** among the busiest 15% of buildings, yet named directly by three or fewer projects.
- **At risk:** still depended on through others, but with no commits for 6 months and no transactions of its own.
- **Ships:** a ship leaves after 3 months without transactions.

---

## For maintainers: one-time repository setup

- **Pages:** Settings → Pages → Source: "GitHub Actions" (used by `deploy.yml`).
- **Bot pull requests:** Settings → Actions → General → allow GitHub Actions to create and approve pull requests (used by the weekly jobs).
- **Optional `BOT_TOKEN` secret:** a fine-grained token with contents and pull-request write access. With it, bot pull requests run the normal checks. Pull requests opened with the default token skip workflows.
- **Branch protection on `main`** must let the lock bot push (`lock.yml`), or give that workflow the same `BOT_TOKEN`.

## Licenses

Code is MIT licensed. The data in `data/` is CC BY 4.0: reuse it with credit to "Lovelace Land contributors".

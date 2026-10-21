# The data behind Lovelace Land

Everything on the map comes from this folder. There is no hidden database and no private input: every building, road and ship is a plain file here, and every claim in those files points to a public source you can open yourself.

This page explains where the data comes from, how it is checked and kept up to date, and what it cannot tell you. To add or correct something, see [CONTRIBUTING.md](../CONTRIBUTING.md).

*Figures on this page are from the snapshot of 20 October 2026.*

## What is in this folder

| Path | What it holds | On the map |
|---|---|---|
| [`nodes/`](nodes/) | One YAML file per project (161) | Buildings |
| [`customers/`](customers/) | One YAML file per customer or user group (72) | Ships |
| `uses:` inside those files | Who uses whom (479 relationships), each with its sources | Roads |
| [`districts.yaml`](districts.yaml) | The kinds of project (node, indexers, SDKs, wallets, …) | Districts |
| [`sectors.yaml`](sectors.yaml) | The kinds of customer, each with a rule for what belongs there | Harbors |
| [`activity/tx/`](activity/tx/) | Monthly on-chain transaction counts (52 series) | Ships docking, road wear, the timeline |
| [`activity/commits/`](activity/commits/) | Monthly commit counts per repository (118 series) | Buildings burning, ruins, "at risk" |
| [`layout.lock.json`](layout.lock.json) | Where each building stands | Keeps the map stable between updates |

`public/world.json`, the file the map loads, is generated from this folder by `npm run build:world`. It is never edited by hand.

## Where the facts come from

### Projects and roads

A road from A to B means "A uses B". Every road lists the evidence for it: a URL, what kind of source it is, the date it was retrieved, and a short quote or note. The 479 roads rest on 551 evidence links:

| Kind of evidence | Links | Typical example |
|---|---|---|
| `manifest` | 268 | A `package.json`, `pom.xml`, `Cargo.toml` or `aiken.toml` in the project's public repository that names the dependency |
| `docs` | 197 | The project's own documentation, configuration examples or API references |
| `announcement` | 34 | A press release or official blog post |
| `article` | 25 | News coverage |
| `case-study` | 15 | A case study by the project or its customer |
| `plutus-json` | 11 | The compiled contract blueprint of an on-chain project |
| `talk` | 1 | A recorded conference talk |

About three quarters of all evidence links point to GitHub, mostly to dependency manifests. Wherever possible, a road is backed by code rather than by marketing.

Each road also carries a **confidence level**:

| Level | Meaning | Roads | On the map |
|---|---|---|---|
| `verified` | A primary source shows the dependency, such as a manifest or the project's own docs | 454 | Solid road |
| `reported` | Only third-party sources say so, such as news coverage | 19 | Dashed road |
| `inferred` | Plausible but unconfirmed | 6 | Hidden unless you turn on "Show rumors" |

### Customers (ships)

Customers are organisations and user groups that use a product in real life. Their sources are case studies, official announcements, app store listings, release notes and news coverage.

- **Size:** some ships show a sourced metric, such as trading volume or downloads. DeFi volumes come from [DefiLlama](https://defillama.com)'s public API and wallet user counts from app store listings. Every metric links to where it came from.
- **When they were active:** ideally from their own on-chain transactions (see below). Customers without on-chain data instead have an announced period (`active.from`, `active.until`). Announced use without an end date counts for 24 months after the latest public source that confirms it (`active.confirmed`), so one press release cannot keep a ship docked forever.

### On-chain transactions

Monthly transaction counts come from the [Yaci Store](https://github.com/bloxbean/yaci-store) analytics service at `https://yaci-playground.cf-app.org/mcp`, which indexes Cardano mainnet.

1. **Identifiers.** A project or customer lists the script hashes, metadata labels or addresses that belong to it, together with where they were published. Most come from public registries: the [StricaHQ contracts registry](https://github.com/StricaHQ/cardano-contracts-registry), the [CRFA off-chain data registry](https://github.com/mezuny/crfa-offchain-data-registry) and the [Eternl registry](https://github.com/Tastenkunst/eternl-cardano-registry). The rest come from the projects' own deployment files and documentation.
2. **Counting.** For each month, the collector counts the distinct transactions that run one of those scripts or send funds to it, carry one of those metadata labels or touch one of those addresses. Sending funds to a script without running it is how DEX orders, deposits and notary records are placed, so both count; this matches how the [cardano.org leaderboard](https://cardano.org/apps/leaderboard/) counts. The exact SQL query is saved in each file in `activity/tx/`, so every number can be reproduced.
3. **Using the counts.** A ship docks in months with transactions. Road wear and traffic use `log10(1 + transactions)`, so a few very busy products cannot drown out everyone else. Traffic flows from each customer through everything it depends on, all the way to the chain.

In total, the snapshot covers more than 26 million transactions from September 2021 (when smart contracts arrived) to October 2026.

### Commit activity

Monthly commit counts on the default branch of each project's public repository come from the GitHub GraphQL API. They decide whether an unused building is still maintained: buildings burn, fall into ruin and return to grass only when there are neither commits nor traffic.

## How it is kept up to date

A [weekly job](../.github/workflows/weekly.yml) runs every Monday:

- **Checks every source link.** Broken links are collected in an open "Broken source links" issue.
- **Scans project manifests.** It reads the root manifests (npm, Maven, Gradle, Cargo, Go, PyPI) of every linked repository. Where a project depends on a package another project publishes, it opens a pull request proposing the new road.
- **Collects activity.** It refreshes transaction and commit counts and opens a pull request with the changes.

Nothing is merged automatically: every proposed change is reviewed like any other contribution.

## What the data cannot tell you

- **The map is curated, not complete.** It covers a selected core of the ecosystem: about 160 projects and 70 customers. A missing project says nothing about its importance; please [report it](../CONTRIBUTING.md).
- **Absence of a road is not proof of absence.** Closed-source products often use libraries that no public source names.
- **Some activity is invisible to the counter.** Minting with native-script policies (for example many NFT collections) and activity under shared contracts or generic metadata labels are not attributed, because they cannot be tied to a single owner.
- **Off-chain customers depend on announcements.** Their activity windows are only as good as the public sources behind them, which is why they fade unless someone confirms them again.
- **Counts measure transactions, not value or users.** One busy bot can produce more transactions than thousands of people.

## Reusing the data

The data in this folder is licensed under [CC BY 4.0](LICENSE). Please credit "Lovelace Land contributors". The code that turns it into the map is MIT licensed.

Found something wrong or missing? Use the **Report data** button on the map, or follow [CONTRIBUTING.md](../CONTRIBUTING.md).

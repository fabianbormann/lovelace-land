# infra agent report (2026-10-20)

32 nodes, 96 `uses` edges (95 verified, 1 inferred, 0 reported). Districts: core 10, indexers 10, api-providers 12.

Key findings:
1. Pallas is the shared Rust layer: dolos, oura, scrolls, amaru, acropolis, mithril, blockfrost-platform and Maestro's indexer depend on it.
2. Mithril is now a library too: mithril-client is used by Amaru, Acropolis, Dolos and Oura (optional); cardano-rosetta-java uses Mithril snapshots.
3. The API layer is shifting from db-sync to Dolos (Blockfrost Platform, Demeter services); Blockfrost backend, Koios, cardano-graphql, Maestro and legacy cardano-rosetta still sit on db-sync.
4. Ogmios is the de facto node API: Kupo, Koios, Yaci Store, Maestro, Demeter, NOWNodes, GetBlock use it. cardano-node is the most-used target (13 edges).
5. Maestro appears to have left Cardano (site/docs Bitcoin-only, Cardano SDKs archived 2026, indexer open-sourced) — marked deprecated (inference).

Judgement calls / not fully verified:
- Maestro deprecated: inferred, no official shutdown notice found.
- carp and scrolls deprecated, cf-ledger-sync maintenance: based on inactivity only.
- cardano-rosetta deprecated: no commits since 2023-01-27; CF maintains cardano-rosetta-java.
- cardano-graphql: current manifests show no Ogmios, so no edge.
- nownodes -> blockfrost is inferred.
- GetBlock Rosetta implementation unknown — no edge.
- demeter -> kupo not written (Demeter's Kupo is "powered by Dolos").
- dolos -> cardano-node not written (syncs over N2N from relays).
- oura -> utxorpc, oura -> mithril, scrolls -> utxorpc, yaci-store -> ogmios are optional features.
- Haskell packages are on CHaP, not Hackage, so no packages entries.
- `plutus-core` id used for plutus-ledger-api/plutus-core dependencies (see missing.md).

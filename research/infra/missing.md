# Missing nodes referenced by `infra` edges

These ids are used as edge targets in `research/infra/nodes/*.yaml`. They are not in the canonical registry and are outside the infra districts, so no file was created.

| Suggested id | Name | Suggested district | URL | Referenced by |
|---|---|---|---|---|
| plutus-core | Plutus Core (plutus-core / plutus-ledger-api) | onchain-languages | https://github.com/IntersectMBO/plutus | cardano-ledger, cardano-api, cardano-db-sync |
| gouroboros | gOuroboros (Go Ouroboros protocol library) | sdks | https://github.com/blinklabs-io/gouroboros | dingo, adder |
| plutigo | plutigo (Untyped Plutus Core VM in Go) | onchain-languages (or sdks) | https://github.com/blinklabs-io/plutigo | dingo, adder |
| yaci | Yaci (Java Ouroboros mini-protocol library) | sdks | https://github.com/bloxbean/yaci | yaci-store, cf-ledger-sync, cardano-rosetta-java |
| chrysalis | Chrysalis (.NET Cardano toolkit) | sdks | https://github.com/SAIB-Inc/Chrysalis | argus |

Notes for the reconciler:
- `plutus-core`: the ledger, cardano-api and db-sync depend on `plutus-ledger-api` / `plutus-core` from the IntersectMBO/plutus repo, meaning the Plutus Core evaluator, not the Plinth (PlutusTx) surface language. If you prefer not to add a separate node, these edges could be retargeted to `plinth`, which lives in the same repo, but that is less precise.
- `gouroboros` and `yaci` fill the same role as `pallas` (sdks): they are Ouroboros networking libraries for Go and Java.

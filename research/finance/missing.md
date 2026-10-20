# Missing nodes (finance agent)

Nodes referenced as edge targets that are neither in the canonical registry nor products owned by this agent.

| name | suggested id | district | URL | referenced by |
|---|---|---|---|---|
| Pyth Network (Pyth Pro / Lazer on Cardano) | `pyth` | oracles | https://www.pyth.network | liqwid, indigo |
| Evolution SDK (Intersect, `@evolution-sdk/evolution`) | `evolution-sdk` | sdks | https://github.com/IntersectMBO/evolution-sdk | danogo, x402-cardano |
| Acropolis (IOG modular Rust node and indexer framework) | `acropolis` | core | https://github.com/input-output-hk/acropolis | sundaeswap (scooper v2) |

Notes:
- Pyth: Cardano-wide Pyth integration approved under the Pentad "critical integrations" program (Dec 2025); Pyth Pro reported live on Cardano in 2026. Liqwid's and Indigo's own repositories show on-chain Pyth price-feed support.
- Evolution SDK: a pure-TypeScript (no WASM) Cardano SDK. The x402 Cardano package README calls it "Intersect's Evolution SDK".
- Acropolis: SundaeSwap's scooper v2 (it powers SundaeSwap V4) depends on its `custom_indexer`, `block_unpacker`, `genesis_bootstrapper` and `mithril_snapshot_fetcher` modules.

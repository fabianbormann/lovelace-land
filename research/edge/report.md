# edge agent report (2026-10-20)

24 nodes, 51 edges (50 verified, 1 reported). Oracles: charli3, orcfax, pyth. Wallets: cardano-wallet (maintenance), lace, nami (deprecated), daedalus, yoroi, eternl, vespr, typhon, nufi, begin. Dev tooling: yaci-devkit, cardano-cli, cardano-testnet, gastronomy, cardano-signer, cardano-hw-cli, sorbet. Bridges: wanchain-bridge, rosen-bridge, milkomeda (deprecated), partner-chains (deprecated).

Findings:
1. Pyth Pro is live on Cardano (Aiken verifier; JS SDK built on Evolution SDK) — Evolution SDK is an important missing node.
2. Wanchain bridge exploited 2026-07-20 (~515M NIGHT drained, TreasuryCheck validator bug); post-exploit status unconfirmed — left active.
3. Wound down: Milkomeda (shutdown 2025), partner-chains repo archived (moved to midnight-node), cardano-wallet maintenance-only since 2025-04-01, Nami archived → Lace "Nami Mode".
4. LayerZero on Cardano claimed by IOG Labs but not in LayerZero's deployment metadata — no node.
5. Eternl and VESPR run their own Koios instances (Koios FAQ).

Uncertain: Wanchain status; Pyth launch date (May vs June 2026); ChainPort, Cardinal, BIFROST, Chainlink not created; typhon -> typhonjs not evidenced; Milkomeda tweet read via forum embed; "active" status weakest for gastronomy and typhon.

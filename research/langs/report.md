# langs agent report (2026-10-20)

33 nodes (9 on-chain languages incl. new pebble; 24 SDKs incl. new evolution-sdk, whisky, translucent, cardano-data-lite, gouroboros, chrysalis, cardano-c, hydra-sdk, cardanokit, cardano-dart-sdk), 95 edges, all verified from manifests/provider source. Deprecated: lucid, translucent. Maintenance: plu-ts, atlas, cardanosharp.

Findings:
1. cardano-js-sdk is now a core library for Blaze (@blaze-cardano/core) and Mesh (@meshsdk/core-cst), not just Lace.
2. Aiken's Rust `uplc` crate is the shared script evaluator (Lucid, Lucid Evolution, Whisky, Evolution SDK); it sits on Pallas, the deepest Rust layer.
3. cardano-serialization-lib is no longer the default base: direct users here are Whisky, Hydra SDK, CardanoKit. CTL moved to cardano-data-lite; Lucid moved to Pallas + uplc; Lucid Evolution vendors a CML fork.
4. Scalus is cross-ecosystem: Mesh core-cst and Evolution SDK use the scalus npm package; Scalus depends on cardano-client-lib.
5. Blockfrost and Kupo+Ogmios ("Kupmios") are the standard provider pair; Hydra is a first-class provider in Mesh, Blaze, Helios, Atlas, Hydra SDK. @harmoniclabs/uplc and plutus-data (plu-ts building blocks) are used by Mesh, Lucid Evolution, Hydra SDK, Pebble.

Modelling choices: @harmoniclabs/* mapped to plu-ts; uplc crate mapped to aiken; plutus-core/plutus-tx/plutus-ledger-api mapped to plinth. Left out: CCL -> aiken (test-only), Mesh -> CSL direct (via whisky), Lucid Evolution -> Maestro (no provider in current source). Evolution SDK maintainer given as IntersectMBO from repo location (transfer from no-witness-labs).

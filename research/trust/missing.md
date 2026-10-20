# Missing nodes (trust agent)

These nodes are used as edge targets in `research/trust/nodes/*.yaml`. They are not in the canonical registry and are not products, so this agent did not create files for them.

| Suggested id | Name | District | URL | Used by | Note |
|---|---|---|---|---|---|
| `yaci` | Yaci (core mini-protocol library) | sdks | https://github.com/bloxbean/yaci | originatenavio, d-abis | `com.bloxbean.cardano:yaci-core` and `yaci-helper`. This is the Java Ouroboros mini-protocol client that Yaci Store is built on. It is a separate artifact from `yaci-store`. |
| `cardano-connect-with-wallet` | Cardano Connect with Wallet | sdks | https://github.com/cardano-foundation/cardano-connect-with-wallet | uverify | Cardano Foundation's React hooks/components and framework-independent core for CIP-30 wallet connection (`@cardano-foundation/cardano-connect-with-wallet`). |
| `cardano-peer-connect` | cardano-peer-connect (CIP-45) | sdks | https://github.com/fabianbormann/cardano-peer-connect | veridian | WebRTC-based dApp to mobile wallet connector that implements CIP-45. |
| `keripy` | KERIpy | sdks | https://github.com/WebOfTrust/keripy | veridian | Reference KERI implementation in Python (`keri` on PyPI). It is not Cardano-specific, but it is the core library of the KERI identity stack that Veridian and its Cardano backer use. Drop the edge if the map should only show Cardano-specific libraries. |
| `signify-ts` | Signify-TS | sdks | https://github.com/WebOfTrust/signify-ts | veridian | TypeScript "signing at the edge" client for KERIA/KERI. It is not Cardano-specific (same caveat as `keripy`). |

## Not created, but worth considering

- `neoprism`: NeoPRISM, the Rust PRISM node and VDR indexer (https://github.com/hyperledger-identus/neoprism). This agent folded it into `hyperledger-identus`. If the map wants Identus's Cardano plumbing shown separately, it could be an `indexers` node.
- `cardano-backer`: Veridian's KERI witness that anchors key events on Cardano (https://github.com/veridian-id/cardano-backer). This agent folded it into `veridian`.
- `yano`: Bloxbean's Java Cardano data node and devnet (https://github.com/bloxbean/yano). UVerify uses it, but only in test scope (`yano-testkit-ccl`, `yano-tx-services` with `<scope>test</scope>`), so no edge was written.

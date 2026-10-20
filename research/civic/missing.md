# Missing nodes (civic)

Nodes that the civic products link to but that are neither in the canonical registry nor products owned by civic. The edges already use the suggested ids.

| name | suggested id | district | URL | used by |
|---|---|---|---|---|
| Evolution SDK (`@evolution-sdk/evolution`) | evolution-sdk | sdks | https://github.com/IntersectMBO/evolution-sdk | dreptalk |
| Tx3 (transaction template language + `tx3-sdk`) | tx3 | dev-tooling | https://github.com/tx3-lang/tx3 | asteria |
| elm-cardano | elm-cardano | sdks | https://github.com/elm-cardano/elm-cardano | cardano-governance-voting-tool |
| Cardano Connect with Wallet (CF React/CIP-30 wallet connector) | cardano-connect-with-wallet | sdks | https://github.com/cardano-foundation/cardano-connect-with-wallet | cardano-ballot |

Notes:
- Evolution SDK is not the same as `lucid-evolution`: it is a separate TypeScript SDK published under `@evolution-sdk/*` and hosted in the IntersectMBO GitHub org.
- Cardano Ballot also uses `org.cardanofoundation:hydra-java-client`. I modelled that as an edge to the registry node `hydra` instead of a separate client-library node.
- NEWM reaches Ogmios through its own Kotlin client `kogmios` (https://github.com/projectNEWM/kogmios). I modelled that as an edge to `ogmios`. Add `kogmios` (sdks) only if the map should show language-specific Ogmios clients.

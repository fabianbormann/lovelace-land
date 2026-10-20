# Missing nodes (agent: langs)

Nodes referenced by `uses` edges in `research/langs/nodes/` that are neither in the canonical registry nor in the langs districts.

| name | suggested id | district | URL | referenced by |
|---|---|---|---|---|
| cardano-api | cardano-api | core | https://github.com/IntersectMBO/cardano-api | atlas (`atlas-cardano.cabal`: `cardano-api ^>=10.13.1`) |

Candidates seen during research but not created (no edge depends on them). The owning agent may add them:

| name | suggested id | district | URL | note |
|---|---|---|---|---|
| TyphonJS | typhonjs | sdks | https://github.com/StricaHQ/typhonjs | Pure JS Cardano wallet library behind the Typhon wallet; npm `@stricahq/typhonjs` 4.0.0 |
| plutigo | plutigo | dev-tooling (or sdks) | https://github.com/blinklabs-io/plutigo | Go UPLC/CEK machine; required by Apollo v2 and gouroboros `go.mod` |
| UTxO RPC | utxorpc | api-providers | https://github.com/utxorpc | Mesh (`@utxorpc/sdk`) and Apollo (`utxorpc/go-sdk`) ship UTxO RPC providers; no registry node to point at |

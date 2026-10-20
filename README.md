# Cardano Island

A Settlers-style isometric map of the Cardano technology landscape: tools are buildings,
"uses" relationships are roads that grow with end-user traffic, end customers are ships in harbors.

- Design: `docs/superpowers/specs/2026-10-20-cardano-island-design.md`
- Data: `data/` (CC-BY-4.0) — one YAML file per project or customer
- Build the world: `npm run build:world` → `public/world.json`
- Validate only: `npm run check:data`
- Tests: `npm test`

Code is MIT licensed; data in `data/` is CC-BY-4.0.

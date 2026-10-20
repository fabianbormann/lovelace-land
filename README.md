# Cardano Settlers

**Live map:** https://fabianbormann.github.io/cardano-settlers/

A Settlers-style isometric map of the Cardano technology landscape: tools are buildings,
"uses" relationships are roads that grow with end-user traffic, end customers are ships in harbors.

- Design: `docs/superpowers/specs/2026-10-20-cardano-settlers-design.md`
- Data: `data/` (CC-BY-4.0) — one YAML file per project or customer
- Build the world: `npm run build:world` → `public/world.json`
- Validate only: `npm run check:data`
- Tests: `npm test` (unit) and `npm run e2e` (browser)
- Run the map locally: `npm run build:world && npm run dev`
- Time axis data: `npm run collect:activity` (Yaci Store MCP + GitHub)
- Weekly upkeep: `npm run check:links`, `npm run scan:manifests`
- How to add projects and customers: `CONTRIBUTING.md`

Code is MIT licensed; data in `data/` is CC-BY-4.0.

# finance agent report (2026-10-20)

26 products (defi 15, payments 7, rwa 4), 60 product edges, 24 customers (8 named orgs, 16 segments), 25 customer edges. Missing: pyth, evolution-sdk, acropolis (all created by other agents). TVL/volume/supply from DefiLlama API.

Findings:
1. USDM -> Cardano Client Lib could NOT be verified: Moneta has no public code (github.com/Moneta-Global has 0 repos); no source names Java/bloxbean/CCL. Verified instead: USDM contracts are Aiken (Sundae Labs audit, v1.0.24) and a Charli3 proof-of-reserve oracle caps minting. Confirmed CCL user in finance: FluidTokens Aquarium (CCL + Yaci Store + Blockfrost).
2. Aiken dominates DeFi validators (13 of 26); Plutarch at WingRiders v2, Splash, Liqwid (inferred); Plinth in 2022-era code (Djed, VyFi, Indigo v1).
3. No dominant off-chain SDK (Lucid Evolution, Blaze, Mesh, CML, CSL, Lucid, Evolution SDK, Apollo, CCL all used). Blockfrost most common provider.
4. USDM is the payments hub (Flip, Masumi, x402, Palmyra route to it). Supply discrepancy: Moneta PoR $9.61M vs DefiLlama $13.44M.
5. USDCx (~$44M, Circle) is the largest stablecoin on Cardano; no tech evidence -> no edges.
6. Oracles shifting to Pyth (Liqwid, Indigo).
7. RWA thin and new: RealFi (launched 2026-10-01), CIP-113 (2026-10-07), Empowa (Mozambique), Palmyra (dated). No live tokenized T-bill or gold.
8. Weak/ending: Cardano Card shuts down 2026-10-31; USDA integrations issuer-reported; Optim TVL ~$0.06M; World Mobile USDM acceptance stated only by Moneta.
9. Composability: FluidTokens loans v4 imports Minswap DEX v2; SundaeSwap V4 scooper runs on Acropolis; PRAGMA swaps ADA to USDM via SundaeSwap.

Sector fit: no story fits none. Boundaries: PRAGMA (payments/defi/governance), Palmyra tea (rwa/supply-chain). Stablecoins split: CDP/algorithmic as DeFi building blocks; fiat-backed for payments. AI-agent payments (Masumi, x402) fit payments, no named customers yet.

Caveats: Liqwid -> plutarch inferred; Indigo -> aiken reported; Veridian, Sri Lanka tea, Liqwid -> charli3 reported. Excluded for lack of evidence/TVL: Genius Yield, MuesliSwap, Lenfi, CSWAP, Levvy.

# Build log — token radar v1 (model comps-3)

Built in one agent session after the competition opened (2026-11-14T10:00:00Z), against the sealed
kit snapshot (758 protocols, as of 2026-11-14). `METHODOLOGY.md` is the model write-up; this log is
the engineering record: what was decided, what was measured, and what the entry was validated against.

## Layout

- `main.ts` — the entrypoint: parse args, load the snapshot, build, self-check the board against the
  gate's shape, write board.json + data.js, copy dashboard/ and screenshots/, write dossier.json last
  through the vendored library with the scorer's own caps.
- `lib/model.ts` — the comps model (fit, pricing, holdout, snapshot parsing, candidacy rule).
- `lib/board.ts` — board assembly, the dashboard dataset, the gate-shape self-check (`boardIssue`).
- `lib/farm.ts` — the farm-plan generator (chain cost table, category mechanics, netted totals).
- `dashboard/` — index.html + app.css + app.js, 26,512 bytes of source in total.
- `screenshots/` — three PNG renders of the program's own output (see below).
- `vendor/makefun-board.ts` — the kit's library, copied byte-for-byte (sha256
  9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e, matching the kit starter's copy).
- `input/snapshot.json` — the sealed snapshot, copied byte-for-byte (sha256
  42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393).

## Design decisions

1. **Comps, not names.** 110 comparables (recorded cap ≥ $1M, positive TVL) fit a log-cap regression
   on log TVL with category offsets (shrunk medians, categories with ≥5 comps), a growth slope and an
   age slope, by three-pass backfitting. First fit (unregularised) produced a growth slope of −4.97 —
   one snapshot week's weather priced as climate — and put wrapped/bridged products (a wrapped bitcoin
   at rank 3) at the top of the board. Both were fixed by method, not by lists:
2. **Regularisation the holdout supports.** Growth winsorised to [−30%, +60%]; soft slopes capped
   (|growth| ≤ 1.5, |age| ≤ 1.0) and shrunk ×0.7; category shrink n/(n+6); and a geometric blend of the
   curve price (65%) with the price at the category's observed median cap/TVL (35%). Variants were
   compared on the deterministic holdout (blend 0.25 / shrink 0.85 / no blend): all within noise of
   each other, the shipped configuration best on median error. Shipped fit: slope 0.380, growth −1.05,
   age −0.29, σ 1.63, global median ratio 0.321, zero rows clamped.
3. **Candidacy = the watchlist's own rule at every size.** Pre-token, minus the product categories
   (Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX), exchange-named
   protocols, versioned names, and wrapped/staked/staking name words. 342 pre-token → 198 ranked rows;
   watchlist coverage 40/40 by construction (worst watchlist rank 75).
4. **Holdout honesty.** FNV-1a slug-parity split (51 train / 59 test), scored through the full
   production pipeline including the blend: median |log error| 1.162, 37.3% within 2×, 49.2% within 3×.
   The dashboard prints these beside the model; the production fit refits on all 110 comps.
5. **Farm plans net out.** Position by TVL tier, gas from the primary chain's table row, the two
   working actions from the category's mechanics (~24 branches), duration from tokenless age, and a
   closing step with upfront + weekly + all-in cash, hands-on minutes and cash drag. Step lengths
   measured across all 198 plans: 168–369 trimmed characters (gate: 20–600), 6 steps per row.
6. **Dashboard budget.** 26,512 bytes of source against the dossier's 65,536-byte text cap, so the
   dossier shows every dashboard file whole. The page renders entirely from `window.RADAR` (data.js,
   written at the output root): model strip, sortable/filterable board, per-protocol detail with the
   full price decomposition and the plan, the fitted category table, and the top-24 tokenised comps
   shown apart at market values.

## Screenshots

Rendered from the program's own output tree (the exact board.json/data.js/dashboard the program
wrote), served locally and captured with a headless Chrome shell at 1440×900:
`1-board.png` (the board, `#/`), `2-detail.png` (rank 1's detail, `#/p/bittensor-dtao`),
`3-filtered.png` (watchlist-only × Risk Curators, 12 rows). PNG, 242,205 / 182,184 / 234,966 bytes —
each under the 512 KiB cap, long side 1440, short side 900. All three were eyeballed against the data
before being committed: strip figures, ranks, the derivation chain (base ×1.934 ×1.071 ×0.306 = curve
$176.6M, blended with the $542.8M median price → $261.7M) and the filtered count all agree.

## Validation (local, this machine, Node v24; the grader runs Node 22 — erasable-syntax TS only)

- **Determinism:** two full runs into separate output trees, `diff -r` — byte-identical, dossier
  included. Runtime ~0.5 s per run (limit 120 s).
- **Gate shape, checked mechanically on the output:** 198 rows (100–4,000); watchlist 40/40; ranks
  exactly 1..N; implied values non-increasing, positive safe integers ≤ 1e14, not all equal; farm
  steps 6 per row, 20–600 trimmed chars; board.json 419,791 bytes ≤ 8 MiB; dashboard 3 files,
  26,512 bytes ≤ 400 files / 4 MiB; screenshots 3 images, each ≤ 512 KiB; dossier.json 907,174 bytes
  ≤ 1.5 MiB.
- **dossier_matches:** the dossier was rebuilt from a copy of the finished output tree (dossier.json
  removed) with the scorer's caps, using the vendored library — byte-identical to the dossier the
  program wrote.
- **Program self-check:** `boardIssue` re-verifies coverage, ranks, monotonicity, value range and
  step shape on every run and refuses (exit 1) rather than write a board the gate would refuse.
- The kit's RULES.txt states there is no local grade for this competition (program/v1: the scorer
  stays on the server); `makefun check` (intake checks) is run separately at submission time with the
  transcript bundle.

## Known limits

- The model's pricing error is wide (σ 1.63, holdout median miss ×3.2): the board is a ranking with
  honest bands, not a prediction table. The blend and the caps trade a little median accuracy for far
  fewer absurd prices.
- 272 protocols record a token but no cap; they are excluded from both fit and board as already
  tokenised. If some are in fact pre-token, the radar misses them — DefiLlama's record is the only
  evidence the snapshot offers.
- Chain gas figures are a small hand-kept table (the program has no network); unknown chains fall
  back to a stated default row.

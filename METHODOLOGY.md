# Methodology — how this radar prices a token that does not exist yet

The snapshot (DefiLlama, as of 2026-11-14) records 758 protocols. For 144 of them it records a market
cap; for 342 it records no token at all — no market cap, no CoinGecko id, no symbol. The 144 are the
comparables. Every implied value on the board is derived from them, by a model fitted on their own
figures in `lib/model.ts`. No protocol is priced from its name, its reputation, or a list anyone wrote.

## The comparables

A protocol enters the fit if it records a market cap of at least $1,000,000 and a positive TVL: 110 of
the 144 qualify. Below $1M a recorded cap is a stub quote (a bridged placeholder, a dead listing), not
a market price, and it would teach the model the stub's price. A further 272 protocols record a token
(a CoinGecko id or a symbol) but no cap; they are already tokenised and are set aside, neither fitted
nor ranked.

## The fit

The model is a regression of log market cap on four features, fitted by deterministic backfitting
(ordinary least squares stages, three passes, fixed order, no randomness):

1. **Size.** A least-squares line of log cap on log TVL.
2. **Category.** Each category with at least 5 comps earns an offset: the median of its residuals,
   shrunk by n/(n+6) toward zero, so a thin category borrows the pooled relationship instead of
   inventing its own.
3. **Growth.** A slope on winsorised seven-day TVL growth (clipped to [−30%, +60%] before it is used —
   a small protocol can print any number in a week, and the raw figure would price the print).
4. **Age.** A slope on log tokenless age (days since DefiLlama first tracked the protocol; a protocol
   with no recorded date is fitted at the comps' median age).

After the passes, the two soft slopes (growth, age) are regularised: capped in magnitude (growth at
1.5, age at 1.0) and shrunk by 0.7. One mean correction then folds every stage's centring into the
intercept, so the equation the dashboard states reproduces the fit exactly. The residual standard
deviation σ is computed on the final fit; each row's band is its implied value × e^±σ.

The fitted production values (all 110 comps): TVL slope 0.380, growth coefficient −1.05, age
coefficient −0.29, σ = 1.63 in log terms. The negative growth slope is what the snapshot's comps say —
in this snapshot the protocols whose TVL jumped in the last week trade at lower caps for their size
than the ones that did not — and the cap and the shrink keep it a nudge, not a verdict: across the
whole winsorised range it moves a price by at most about ×0.5 to ×1.5. The negative age slope says
the same kind of thing about age: at equal TVL, the comps that listed recently carry a premium the
long-tracked ones do not.

## The price of one protocol

For a pre-token protocol p:

- curve = exp(intercept + slope · ln TVL_p) × e^(category offset) × e^(growth coef · growth_p) × e^(age coef · ln(1 + age_p))
- median price = (its category's observed median cap/TVL among the comps — the comps' overall median,
  0.321, for categories too thin to have one) × TVL_p
- **implied = curve^0.65 × median price^0.35** (a geometric blend), with the resulting multiple
  (implied / TVL) kept inside [0.004, 12], the range the comps themselves trade in, and the value
  itself inside [$10,000, $10^14].

The blend is the regularisation the holdout supports: the pure curve prices the tails bravely and
wrong (a $30M protocol at a 4× multiple), while the category median knows nothing about the
individual protocol. Weighting the curve at 65% keeps each protocol's own size, growth and age in
charge of its price, and pulls the extremes toward what its category actually trades at. Every row of
board.json carries the whole decomposition (base, the three multiples, the curve price, the median
price and the anchor ratio), and the dashboard's detail view shows the same working for the row you
are reading.

## The holdout — what the numbers are worth

The fit is validated out of sample on a deterministic split: FNV-1a hash of each comp's slug, even
hashes train (51 comps), odd hashes test (59). The test is scored through the full production pipeline,
blend included. Result: median absolute log error 1.162 (a typical miss of about ×3.2), 37.3% of test
caps priced within 2×, 49.2% within 3×. That is the honest state of pricing an unlaunched token from
TVL: the model ranks far better than it prices, which is why the board is a ranking with wide bands,
not a table of predictions. The dashboard states these figures beside the model, and the production
fit is then refit on all 110 comps.

## Who is ranked

The board ranks the 342 pre-token protocols that pass the snapshot's own watchlist rule applied at
every size, not only above the $50M floor: not a CEX, not a bridge, liquid-staking, liquid-restaking
or restaked-BTC product (in DefiLlama's taxonomy those categories are wrappers over an asset that
already trades — a wrapped bitcoin is not a launch), not a protocol whose name begins with an
exchange's name, not a versioned pool (a name ending in V2, v3, 3.0 — a pool of a parent that already
launched), and not a product whose name carries the whole word wrapped, staked or staking. 198 rows
pass. All 40 watchlist slugs are among them by construction (the watchlist was built by the same rule
above the floor), so coverage is 40/40 and the remaining 158 rows are the early set below the floor
that a radar exists to surface. The rule reads the record's own category and name fields; it names
categories and shapes, never protocols.

## The farm plans

Each row's plan (`lib/farm.ts`) is generated from its own record, in six steps:

- **Position** sized by the protocol's TVL tier ($200 at the small end to $2,500 at $5B+ TVL): a farm
  sized to the protocol, not a flat ticket.
- **Chain costs** from its primary chain (chains[0]): a per-transaction gas figure for that chain, so
  an Ethereum plan and a Solana plan differ by two orders of magnitude in cash cost, as they do in life.
- **The two working actions** are its category's own mechanics — supply and borrow-and-repay for a
  lender, liquidity and fee-compounding for a DEX, vault-and-mint for a CDP, deposit-and-hold for a
  basis vault, onboarding and a coupon period for RWA, and so on through the categories the snapshot
  uses, with a plain deposit-and-grow fallback.
- **Duration** from its tokenless age: younger protocols get longer plans (16 weeks under six months,
  down to 8 weeks past two years).
- **The last step nets the plan out**: upfront cost (three transactions), weekly running cost, the
  all-in cash total, the hands-on minutes, and the cash drag as a percentage of the position — the
  position itself stays withdrawable throughout, so the drag is the plan's true price.

Every step names the protocol, its chain and its amounts, and ends with its cost and its time; the
detail view totals the same figures from the same summary the board row carries.

## Determinism

The program reads no clock and no randomness: ages are counted against the snapshot's own as_of date,
every iteration order is sorted, and two runs on the same snapshot write byte-identical outputs
(board.json, data.js, the dashboard and screenshot copies, and dossier.json, which is built last from
the finished output tree by the vendored library, exactly as the scorer rebuilds it).

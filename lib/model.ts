// The token radar's value model: a comps fit over the snapshot's own tokenised protocols.
//
// Nothing here is a list of names. The snapshot records a market cap for some protocols and none for
// others. The ones with a cap are the comparables: the model regresses their log market cap on their
// log TVL, their category, their seven-day TVL growth and how long they have been tracked, by a
// deterministic backfit (ordinary least squares stages and shrunk category medians, three passes).
// A protocol that records no token is then priced by the fitted relationship, at its own TVL, growth,
// category and age: implied = exp(intercept + slope * ln TVL) x category multiple x growth multiple
// x age multiple. The two soft slopes (growth, age) are capped and shrunk after fitting, and the
// final price is a geometric blend of the curve price with the price at the category's own observed
// median cap/TVL: the blend is what the holdout supports, and it keeps one hot week or one thin
// category from pricing a protocol on its own. The fit is validated out of sample on a deterministic
// half of the comps (slugs hashed by FNV-1a, even hashes train, odd hashes test), blend included, and
// the dashboard states the test error next to the model, so a reader can see what the numbers are
// worth. The production fit uses every comp.
//
// A comp is a protocol whose record carries a market cap of at least $1,000,000: below that the cap is
// a stub quote, not a market. The board ranks only protocols that record no token at all (no market
// cap, no CoinGecko id, no symbol) and pass the snapshot's own watchlist rule applied at every size:
// not a bridge, staking or exchange product, not an exchange-named protocol, not a versioned pool of
// a parent, not a product whose name says wrapped or staked. Those are not launches waiting to
// happen. Every watchlist slug passes that rule, so coverage never depends on it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'comps-3';

/** A comp needs a recorded market cap at least this large to enter the fit. */
export const COMP_MIN_MCAP = 1_000_000;
/** A category earns its own offset at this many comps; the offset is shrunk by n / (n + CAT_SHRINK). */
export const CAT_MIN_COMPS = 5;
export const CAT_SHRINK = 6;
/** The fitted growth slope is capped at this magnitude: one hot week must not price a protocol. */
export const GROWTH_CAP = 1.5;
/** The fitted age slope is capped at this magnitude, for the same reason. */
export const AGE_CAP = 1.0;
/** The two soft slopes (growth, age) are shrunk by this factor after fitting: regularisation. */
export const SOFT_SHRINK = 0.7;
/** The final price blends the fitted curve with the category's observed median multiple, this share. */
export const BLEND = 0.35;
/** The fitted multiple (implied / TVL) is kept inside the range the comps themselves trade in. */
export const MULTIPLE_MIN = 0.004;
export const MULTIPLE_MAX = 12;
export const IMPLIED_MIN = 10_000;
export const IMPLIED_MAX = 100_000_000_000_000;

const DAY_MS = 86_400_000;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are products of an asset that already trades, per the watchlist's own rule. */
const PRODUCT_CATEGORIES: ReadonlySet<string> = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names the watchlist rule keeps off the board when a protocol's name begins with one. */
const EXCHANGE_PREFIXES: readonly string[] = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is one the board may rank: pre-token, and not a shape that is no launch candidate. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name === ex || p.name.startsWith(`${ex} `)) return false;
  }
  return true;
}

/** Seven-day growth as a winsorised fraction: +12.5% becomes 0.125, clipped to [-0.3, 0.6]; unreported is 0. */
export function growthFraction(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 0;
  return Math.min(60, Math.max(-30, change7d)) / 100;
}

/** FNV-1a 32-bit over the slug's code units: the deterministic holdout split, no randomness anywhere. */
export function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((n, v) => n + v, 0) / values.length;
}

/** One comparable, reduced to the fit's features. */
interface CompRow {
  slug: string;
  category: string | null;
  x: number; // ln TVL
  y: number; // ln market cap
  g: number; // winsorised 7d growth, a fraction
  la: number; // ln(1 + age in days)
}

/** The fitted relationship, as the dashboard states it. */
export interface CompFit {
  comps: number;
  intercept: number;
  tvl_slope: number;
  growth_coef: number;
  age_coef: number;
  cat_offset: Record<string, number>;
  cat_comps: Record<string, number>;
  /** Each large category's observed median cap/TVL among the comps: the blend's anchor. */
  median_ratio: Record<string, number>;
  /** Every comp's median cap/TVL: the anchor for categories too thin to have their own. */
  global_median_ratio: number;
  sigma: number;
  median_age_days: number;
}

/** The tokenised protocols of a snapshot, as fit rows, in slug order. */
function compRows(snapshot: Snapshot): CompRow[] {
  const tokenised = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd >= COMP_MIN_MCAP && p.tvl_usd > 0);
  const knownAges = tokenised.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null);
  const medAge = knownAges.length > 0 ? median(knownAges) : 365;
  return tokenised
    .map((p) => ({
      slug: p.slug,
      category: p.category,
      x: Math.log(p.tvl_usd),
      y: Math.log(p.mcap_usd!),
      g: growthFraction(p.change_7d),
      la: Math.log(1 + (ageDays(snapshot.as_of, p.listed_at) ?? medAge)),
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Ordinary least squares of ys on xs: the slope and the mean point it turns on. */
function olsSlope(xs: number[], ys: number[]): { slope: number; xMean: number; yMean: number } {
  const xMean = mean(xs);
  const yMean = mean(ys);
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i]! - xMean) * (ys[i]! - yMean);
    varX += (xs[i]! - xMean) * (xs[i]! - xMean);
  }
  return { slope: varX > 0 ? cov / varX : 0, xMean, yMean };
}

/**
 * Fit the comps relationship on `rows` by backfitting: a size line, then three passes over category
 * offsets (shrunk medians of the residuals), a growth slope and an age slope, each stage refit on the
 * residuals the stages before it leave. Deterministic: fixed pass count, fixed order, no randomness.
 */
export function fitRows(rows: CompRow[]): CompFit {
  const n = rows.length;
  const xs = rows.map((r) => r.x);
  const ys = rows.map((r) => r.y);
  const first = olsSlope(xs, ys);
  let intercept = first.yMean - first.slope * first.xMean;
  let tvlSlope = first.slope;
  let growthCoef = 0;
  let ageCoef = 0;
  const catOffset = new Map<string, number>();
  const catComps = new Map<string, number>();
  for (const r of rows) if (r.category !== null) catComps.set(r.category, (catComps.get(r.category) ?? 0) + 1);
  const pred = rows.map((r) => intercept + tvlSlope * r.x);

  for (let pass = 0; pass < 3; pass++) {
    // Category offsets: the shrunk median of each large category's residuals.
    const byCat = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (r.category === null) return;
      const list = byCat.get(r.category) ?? [];
      list.push(ys[i]! - pred[i]!);
      byCat.set(r.category, list);
    });
    for (const cat of [...byCat.keys()].sort()) {
      const list = byCat.get(cat)!;
      if (list.length < CAT_MIN_COMPS) continue;
      const delta = median(list) * (list.length / (list.length + CAT_SHRINK));
      if (delta === 0) continue;
      catOffset.set(cat, (catOffset.get(cat) ?? 0) + delta);
      rows.forEach((r, i) => {
        if (r.category === cat) pred[i]! += delta;
      });
    }
    // Growth slope on the residuals. The stage moves predictions by slope x (g - mean g); the
    // constant that leaves behind is absorbed by the size stage's intercept and the final correction.
    const residG = rows.map((r, i) => ys[i]! - pred[i]!);
    const gFit = olsSlope(
      rows.map((r) => r.g),
      residG,
    );
    if (gFit.slope !== 0) {
      growthCoef += gFit.slope;
      rows.forEach((r, i) => {
        pred[i]! += gFit.slope * (r.g - gFit.xMean);
      });
    }
    // Age slope on the residuals.
    const residA = rows.map((r, i) => ys[i]! - pred[i]!);
    const aFit = olsSlope(
      rows.map((r) => r.la),
      residA,
    );
    if (aFit.slope !== 0) {
      ageCoef += aFit.slope;
      rows.forEach((r, i) => {
        pred[i]! += aFit.slope * (r.la - aFit.xMean);
      });
    }
    // Size line refit on the residuals.
    const residX = rows.map((r, i) => ys[i]! - pred[i]!);
    const xFit = olsSlope(xs, residX);
    if (xFit.slope !== 0 || xFit.yMean !== 0) {
      intercept += xFit.yMean - xFit.slope * xFit.xMean;
      tvlSlope += xFit.slope;
      rows.forEach((r, i) => {
        pred[i]! += xFit.yMean + xFit.slope * (r.x - xFit.xMean);
      });
    }
  }

  // Regularise the two soft slopes: cap their magnitude, then shrink what is left. The backfit's raw
  // growth slope prices one snapshot week's weather as if it were climate; the capped, shrunk slopes
  // are the ones the holdout supports, and the correction below re-centres the fit around them.
  growthCoef = Math.min(GROWTH_CAP, Math.max(-GROWTH_CAP, growthCoef)) * SOFT_SHRINK;
  ageCoef = Math.min(AGE_CAP, Math.max(-AGE_CAP, ageCoef)) * SOFT_SHRINK;

  // Predictions from here on use raw features; one mean correction folds every stage's centering
  // into the intercept, so the stated equation reproduces the fit exactly.
  const rawPred = rows.map((r) => intercept + tvlSlope * r.x + (r.category !== null ? (catOffset.get(r.category) ?? 0) : 0) + growthCoef * r.g + ageCoef * r.la);
  const correction = mean(rows.map((r, i) => ys[i]! - rawPred[i]!));
  intercept += correction;

  const finalPred = rows.map((r) => intercept + tvlSlope * r.x + (r.category !== null ? (catOffset.get(r.category) ?? 0) : 0) + growthCoef * r.g + ageCoef * r.la);
  const dof = Math.max(1, n - (4 + catOffset.size));
  const sigma = Math.sqrt(rows.reduce((sum, r, i) => sum + (ys[i]! - finalPred[i]!) ** 2, 0) / dof);
  const ages = rows.map((r) => Math.exp(r.la) - 1);

  // The blend's anchors: each large category's observed median cap/TVL, and the comps' own median.
  const ratiosByCat = new Map<string, number[]>();
  for (const r of rows) {
    if (r.category === null) continue;
    const list = ratiosByCat.get(r.category) ?? [];
    list.push(Math.exp(r.y - r.x));
    ratiosByCat.set(r.category, list);
  }
  const medianRatio = new Map<string, number>();
  for (const cat of [...ratiosByCat.keys()].sort()) {
    const list = ratiosByCat.get(cat)!;
    if (list.length >= CAT_MIN_COMPS) medianRatio.set(cat, median(list));
  }
  return {
    comps: n,
    intercept,
    tvl_slope: tvlSlope,
    growth_coef: growthCoef,
    age_coef: ageCoef,
    cat_offset: Object.fromEntries([...catOffset.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    cat_comps: Object.fromEntries([...catComps.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    median_ratio: Object.fromEntries([...medianRatio.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    global_median_ratio: median(rows.map((r) => Math.exp(r.y - r.x))),
    sigma,
    median_age_days: Math.round(median(ages)),
  };
}

/** The comps fit over a whole snapshot. */
export function fitComps(snapshot: Snapshot): CompFit {
  return fitRows(compRows(snapshot));
}

/** What the fitted relationship says one protocol's token would be worth, with its working shown. */
export interface Implied {
  implied: number;
  base_usd: number;
  cat_mult: number;
  growth_mult: number;
  age_mult: number;
  /** The curve's own price, before the blend with the category's median multiple. */
  curve_usd: number;
  /** The price at the category's observed median cap/TVL (the comps' median, for thin categories). */
  median_price_usd: number;
  /** The median multiple the blend anchored on. */
  median_ratio: number;
  multiple: number;
  band_lo: number;
  band_hi: number;
  clamped: boolean;
}

/** Price one protocol under `fit`: the size curve, the category, growth and age multiples, the blend. */
export function impliedFor(p: SnapshotProtocol, fit: CompFit, asOf: string): Implied {
  const age = ageDays(asOf, p.listed_at) ?? fit.median_age_days;
  const tvl = Math.max(1, p.tvl_usd);
  const base = Math.exp(fit.intercept + fit.tvl_slope * Math.log(tvl));
  const catMult = Math.exp(p.category !== null ? (fit.cat_offset[p.category] ?? 0) : 0);
  const growthMult = Math.exp(fit.growth_coef * growthFraction(p.change_7d));
  const ageMult = Math.exp(fit.age_coef * Math.log(1 + age));
  const curve = base * catMult * growthMult * ageMult;
  const medianRatio = p.category !== null ? (fit.median_ratio[p.category] ?? fit.global_median_ratio) : fit.global_median_ratio;
  const medianPrice = medianRatio * tvl;
  const blended = Math.exp((1 - BLEND) * Math.log(curve) + BLEND * Math.log(medianPrice));
  let multiple = blended / tvl;
  let clamped = false;
  if (multiple < MULTIPLE_MIN) {
    multiple = MULTIPLE_MIN;
    clamped = true;
  }
  if (multiple > MULTIPLE_MAX) {
    multiple = MULTIPLE_MAX;
    clamped = true;
  }
  let implied = Math.round(p.tvl_usd * multiple);
  if (implied < IMPLIED_MIN) {
    implied = IMPLIED_MIN;
    clamped = true;
  }
  if (implied > IMPLIED_MAX) {
    implied = IMPLIED_MAX;
    clamped = true;
  }
  return {
    implied,
    base_usd: Math.round(base),
    cat_mult: catMult,
    growth_mult: growthMult,
    age_mult: ageMult,
    curve_usd: Math.round(curve),
    median_price_usd: Math.round(medianPrice),
    median_ratio: medianRatio,
    multiple: implied / tvl,
    band_lo: Math.max(1, Math.round(implied * Math.exp(-fit.sigma))),
    band_hi: Math.round(implied * Math.exp(fit.sigma)),
    clamped,
  };
}

/** The out-of-sample report the dashboard quotes: fit on even slug hashes, scored on the odd half. */
export interface Holdout {
  train: number;
  test: number;
  median_abs_log_err: number;
  within_2x_pct: number;
  within_3x_pct: number;
}

/** Fit on one deterministic half of the comps and measure the log error on the other half. */
export function holdoutReport(snapshot: Snapshot): Holdout {
  const rows = compRows(snapshot);
  const train = rows.filter((r) => slugHash(r.slug) % 2 === 0);
  const test = rows.filter((r) => slugHash(r.slug) % 2 === 1);
  const fit = fitRows(train);
  const errs = test.map((r) => {
    const age = Math.exp(r.la) - 1;
    const curve =
      fit.intercept +
      fit.tvl_slope * r.x +
      (r.category !== null ? (fit.cat_offset[r.category] ?? 0) : 0) +
      fit.growth_coef * r.g +
      fit.age_coef * Math.log(1 + age);
    // The score is the production pipeline's: the curve blended with the train fit's median anchor.
    const anchor = Math.log(r.category !== null ? (fit.median_ratio[r.category] ?? fit.global_median_ratio) : fit.global_median_ratio) + r.x;
    const pred = (1 - BLEND) * curve + BLEND * anchor;
    return Math.abs(r.y - pred);
  });
  const within = (factor: number): number =>
    errs.length === 0 ? 0 : Math.round((1000 * errs.filter((e) => e <= Math.log(factor)).length) / errs.length) / 10;
  return {
    train: train.length,
    test: test.length,
    median_abs_log_err: Math.round(median(errs) * 1000) / 1000,
    within_2x_pct: within(2),
    within_3x_pct: within(3),
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

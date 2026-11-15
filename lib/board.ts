// Board assembly: fit the comps model, price every launch candidate, rank, and shape the outputs.
//
// The board is every protocol that records no token and passes the candidacy rule (see model.ts),
// priced by the fitted comps relationship and ranked by implied value, rank 1 highest. The watchlist
// is a floor: all 40 of its slugs are candidates by construction, so coverage is total, and the rest
// of the board is the early set the radar exists for — pre-token protocols below the $50M floor. The
// tokenised protocols are never ranked: they are the comps the model is fitted on, and the dashboard
// shows the largest of them apart, at the market's own values.

import { buildPlan, type PlanSummary } from './farm.ts';
import {
  ageDays,
  fitComps,
  holdoutReport,
  impliedFor,
  isPreToken,
  isRankable,
  BLEND,
  CAT_MIN_COMPS,
  MODEL_VERSION,
  type CompFit,
  type Holdout,
  type Snapshot,
  type SnapshotProtocol,
} from './model.ts';

/** One row of board.json: the gate's fields, then the model's working as extra keys. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  multiple: number;
  band_lo_usd: number;
  band_hi_usd: number;
  model: { base_usd: number; cat_mult: number; growth_mult: number; age_mult: number; curve_usd: number; median_price_usd: number; median_ratio: number };
  plan: PlanSummary;
}

/** The dashboard's view of one row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  band_lo_usd: number;
  band_hi_usd: number;
  base_usd: number;
  cat_mult: number;
  growth_mult: number;
  age_mult: number;
  curve_usd: number;
  median_price_usd: number;
  median_ratio: number;
  farm_steps: string[];
  plan: PlanSummary;
}

/** A tokenised protocol at the market's own value: a comp, shown apart from the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** One category's fitted row, as the methodology panel states it. */
export interface CategoryFit {
  category: string;
  comps: number;
  median_ratio: number;
  offset: number;
}

/** Everything the dashboard renders: the meta line, the model, the board and the live comps. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  counts: {
    protocols: number;
    tokenised_cap: number;
    tokenised_recorded: number;
    pre_token: number;
    board: number;
    watchlist: number;
  };
  fit: {
    comps: number;
    tvl_slope: number;
    growth_coef: number;
    age_coef: number;
    sigma: number;
    median_age_days: number;
    blend: number;
    global_median_ratio: number;
  };
  holdout: Holdout;
  categories: CategoryFit[];
  clamped_rows: number;
  rows: RadarRow[];
  live: LiveRow[];
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** Score, rank and dress every candidate; returns the board and everything the dashboard needs. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit: CompFit = fitComps(snapshot);
  const holdout = holdoutReport(snapshot);
  const watch = new Set(snapshot.watchlist);

  const candidates = snapshot.protocols.filter(isRankable);
  let clampedRows = 0;
  const scored = candidates.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const imp = impliedFor(p, fit, snapshot.as_of);
    if (imp.clamped) clampedRows++;
    const plan = buildPlan(p, age);
    return { p, age, imp, plan };
  });
  scored.sort((a, b) => b.imp.implied - a.imp.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    implied_value_usd: s.imp.implied,
    farm_steps: s.plan.steps,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    multiple: round4(s.imp.multiple),
    band_lo_usd: s.imp.band_lo,
    band_hi_usd: s.imp.band_hi,
    model: {
      base_usd: s.imp.base_usd,
      cat_mult: round4(s.imp.cat_mult),
      growth_mult: round4(s.imp.growth_mult),
      age_mult: round4(s.imp.age_mult),
      curve_usd: s.imp.curve_usd,
      median_price_usd: s.imp.median_price_usd,
      median_ratio: round3(s.imp.median_ratio),
    },
    plan: s.plan.summary,
  }));

  const rows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    age_days: r.age_days,
    watchlist: r.watchlist,
    implied_value_usd: r.implied_value_usd,
    multiple: r.multiple,
    band_lo_usd: r.band_lo_usd,
    band_hi_usd: r.band_hi_usd,
    base_usd: r.model.base_usd,
    cat_mult: r.model.cat_mult,
    growth_mult: r.model.growth_mult,
    age_mult: r.model.age_mult,
    curve_usd: r.model.curve_usd,
    median_price_usd: r.model.median_price_usd,
    median_ratio: r.model.median_ratio,
    farm_steps: r.farm_steps,
    plan: r.plan,
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: round3(p.mcap_usd! / Math.max(1, p.tvl_usd)),
    }));

  // The category table the methodology states: observed median cap/TVL beside the fitted offset.
  const ratiosByCat = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd < 1_000_000 || p.category === null) continue;
    const list = ratiosByCat.get(p.category) ?? [];
    list.push(p.mcap_usd / Math.max(1, p.tvl_usd));
    ratiosByCat.set(p.category, list);
  }
  const categories: CategoryFit[] = [...ratiosByCat.entries()]
    .filter(([cat, list]) => list.length >= CAT_MIN_COMPS && fit.cat_offset[cat] !== undefined)
    .map(([cat, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      return { category: cat, comps: list.length, median_ratio: round3(med), offset: round4(fit.cat_offset[cat]!) };
    })
    .sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1));

  const tokenisedCap = snapshot.protocols.filter((p) => p.mcap_usd !== null).length;
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    counts: {
      protocols: snapshot.protocols.length,
      tokenised_cap: tokenisedCap,
      tokenised_recorded: snapshot.protocols.length - tokenisedCap - preToken,
      pre_token: preToken,
      board: board.length,
      watchlist: snapshot.watchlist.length,
    },
    fit: {
      comps: fit.comps,
      tvl_slope: round4(fit.tvl_slope),
      growth_coef: round4(fit.growth_coef),
      age_coef: round4(fit.age_coef),
      sigma: round4(fit.sigma),
      median_age_days: fit.median_age_days,
      blend: BLEND,
      global_median_ratio: round3(fit.global_median_ratio),
    },
    holdout,
    categories,
    clamped_rows: clampedRows,
    rows,
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears twice on the board';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} trimmed characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

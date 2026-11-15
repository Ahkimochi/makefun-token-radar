// Farm plans: one concrete plan per protocol, generated from its own record.
//
// A plan is six steps. Every number in it is computed from the protocol's own figures: the position
// is sized off its TVL tier, the gas costs come from its primary chain's row in the chain table, the
// two middle actions are its category's own mechanics (supply and borrow for a lender, liquidity and
// staking for a DEX, deposits and round trips for a bridge), and the plan's length comes from how long
// the protocol has run with no token. The last step nets the plan out: the all-in cash cost over the
// whole plan, the hands-on minutes, and the cash drag as a share of the position, which itself stays
// withdrawable. No step is a slogan: each names the protocol, the chain, an amount, a cost and a time.

import type { SnapshotProtocol } from './model.ts';

/** A chain's gas asset and the dollar cost of one ordinary transaction on it, as a farmer meets it. */
export interface ChainInfo {
  gas: string;
  tx: number;
}

const CHAIN_TABLE: Record<string, ChainInfo> = {
  Ethereum: { gas: 'ETH', tx: 6.0 },
  Bitcoin: { gas: 'BTC', tx: 2.5 },
  Solana: { gas: 'SOL', tx: 0.02 },
  Binance: { gas: 'BNB', tx: 0.2 },
  Base: { gas: 'ETH', tx: 0.05 },
  Arbitrum: { gas: 'ETH', tx: 0.12 },
  Optimism: { gas: 'ETH', tx: 0.08 },
  Linea: { gas: 'ETH', tx: 0.08 },
  Scroll: { gas: 'ETH', tx: 0.1 },
  'zkSync Era': { gas: 'ETH', tx: 0.1 },
  Mantle: { gas: 'MNT', tx: 0.05 },
  Blast: { gas: 'ETH', tx: 0.05 },
  Mode: { gas: 'ETH', tx: 0.05 },
  Taiko: { gas: 'ETH', tx: 0.08 },
  Avalanche: { gas: 'AVAX', tx: 0.3 },
  Polygon: { gas: 'POL', tx: 0.02 },
  Fantom: { gas: 'FTM', tx: 0.02 },
  Sonic: { gas: 'S', tx: 0.02 },
  Tron: { gas: 'TRX', tx: 1.2 },
  Sui: { gas: 'SUI', tx: 0.02 },
  Aptos: { gas: 'APT', tx: 0.02 },
  Near: { gas: 'NEAR', tx: 0.02 },
  Stellar: { gas: 'XLM', tx: 0.01 },
  Ripple: { gas: 'XRP', tx: 0.01 },
  TON: { gas: 'TON', tx: 0.05 },
  Starknet: { gas: 'STRK', tx: 0.05 },
  'Hyperliquid L1': { gas: 'HYPE', tx: 0.05 },
  Monad: { gas: 'MON', tx: 0.05 },
  Plasma: { gas: 'XPL', tx: 0.02 },
  Flare: { gas: 'FLR', tx: 0.02 },
  Cosmos: { gas: 'ATOM', tx: 0.05 },
  Sei: { gas: 'SEI', tx: 0.02 },
  Berachain: { gas: 'BERA', tx: 0.05 },
  Gnosis: { gas: 'xDAI', tx: 0.01 },
  Celo: { gas: 'CELO', tx: 0.01 },
  Moonbeam: { gas: 'GLMR', tx: 0.05 },
  Kava: { gas: 'KAVA', tx: 0.05 },
  Cardano: { gas: 'ADA', tx: 0.2 },
  Algorand: { gas: 'ALGO', tx: 0.01 },
  Hedera: { gas: 'HBAR', tx: 0.01 },
  EOS: { gas: 'EOS', tx: 0.02 },
  Tezos: { gas: 'XTZ', tx: 0.02 },
};

const DEFAULT_CHAIN: ChainInfo = { gas: 'its gas token', tx: 0.5 };

/** The chain a plan is worked on: the first chain the protocol names, and its cost row. */
export function chainInfo(p: SnapshotProtocol): { chain: string; info: ChainInfo } {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  return { chain, info: CHAIN_TABLE[chain] ?? DEFAULT_CHAIN };
}

/** The position one wallet farms with, from the protocol's TVL tier: larger protocols, larger tickets. */
export function positionFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 2500;
  if (tvlUsd >= 1_000_000_000) return 1500;
  if (tvlUsd >= 250_000_000) return 1000;
  if (tvlUsd >= 50_000_000) return 600;
  if (tvlUsd >= 10_000_000) return 350;
  return 200;
}

/** How long a plan runs, from the tokenless age: the younger the protocol, the longer the runway. */
export function weeksFor(ageDays: number | null): number {
  if (ageDays === null) return 12;
  if (ageDays < 180) return 16;
  if (ageDays < 365) return 12;
  if (ageDays < 730) return 10;
  return 8;
}

/** A dollar figure as a farmer writes it: cents under a dollar, no decimals over a hundred. */
export function money(n: number): string {
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 100) return `$${n.toFixed(2).replace(/\.?0+$/, '')}`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * The category's two working actions: what the farmer actually does inside this kind of protocol.
 * Each takes the protocol's name, its primary chain and the position, so no two categories read alike
 * and every row's plan names its own protocol and chain.
 */
function actionPair(category: string | null, name: string, chain: string, pos: number): [string, string] {
  const c = (category ?? '').toLowerCase();
  const P = money(pos);
  if (c.includes('lending') || c === 'cdp manager')
    return [
      `Supply ${P} of USDC as collateral in ${name} on ${chain}; USDC is the deepest lending market on most chains, so the position stays easy to unwind`,
      `Borrow about ${money(Math.round(pos / 4))} against the collateral and repay it a few days later, then repeat monthly: borrow-and-repay history is the activity lending farms are scored on`,
    ];
  if (c.includes('cdp'))
    return [
      `Open a vault in ${name} on ${chain} and deposit ${P} of collateral, then mint the protocol's stablecoin against it at a conservative ratio`,
      `Park the minted stablecoin in ${name}'s own stability or savings pool and leave it there, so both the vault and the stablecoin balance count as held activity`,
    ];
  if (c.includes('dex'))
    return [
      `Provide ${P} of liquidity to ${name}'s main stable or blue-chip pool on ${chain}, split evenly across the pair, and keep the LP position open`,
      `Claim and re-deposit the pool's trading fees each week from ${name}'s rewards page; a position that compounds reads as a holder, not a passer-by`,
    ];
  if (c.includes('bridge'))
    return [
      `Bridge ${P} of USDC from Ethereum to ${chain === 'Ethereum' ? 'a destination chain the bridge serves' : chain} through ${name}, then use the bridged funds in one app at the far end instead of bridging straight back`,
      `Make one smaller round trip a month, about ${money(Math.round(pos / 5))} each way, so the wallet shows regular bridge volume in both directions across the whole plan`,
    ];
  if (c.includes('liquid staking'))
    return [
      `Stake ${P} of the chain's staking asset through ${name} on ${chain} and keep the liquid staking receipt in the farming wallet`,
      `Use the receipt once in a partner money market ${name} lists (supply it as collateral, borrow nothing), so the position counts in two protocols at once`,
    ];
  if (c.includes('restak') || c.includes('staking pool'))
    return [
      `Deposit ${P} of a liquid staking token into ${name} on ${chain} and hold the restaked receipt for the whole plan`,
      `Re-deposit any restaking rewards into the same position monthly rather than selling them, so the balance only grows`,
    ];
  if (c.includes('yield aggregator') || c.includes('liquidity manager') || c === 'yield')
    return [
      `Deposit ${P} of USDC into ${name}'s flagship vault on ${chain} and keep the vault shares in the farming wallet`,
      `Harvest and compound the vault's yield back into the same vault each week; the compounding trail is the activity record the plan is building`,
    ];
  if (c.includes('risk curator') || c.includes('capital allocator') || c.includes('collateral'))
    return [
      `Deposit ${P} of USDC into one of ${name}'s curated vaults on ${chain}; the curator rebalances the allocation, so pick the vault with the longest track record`,
      `Check the vault's allocation page monthly and keep a note of what the curator held; if the vault is wound down, move to its successor vault rather than leaving`,
    ];
  if (c.includes('rwa'))
    return [
      `Complete ${name}'s onboarding (identity checks are normal for real-world assets) and subscribe ${P} to its tokenised treasury or credit asset on ${chain}`,
      `Hold the asset through at least one full coupon or interest period and let the payout land in the same wallet, so the holding period is on record`,
    ];
  if (c.includes('derivative') || c.includes('options'))
    return [
      `Deposit ${P} of USDC as margin on ${name} and open one small delta-neutral position (a hedge against spot you hold), sized under a fifth of the margin`,
      `Roll or adjust the hedge once a week to keep it neutral; steady, boring volume over the whole plan is what a derivatives farm should look like`,
    ];
  if (c.includes('basis'))
    return [
      `Deposit ${P} of USDC into ${name}'s basis vault on ${chain}; the vault runs the cash-and-carry trade, your side of it is capital and patience`,
      `Leave the position untouched except for a monthly balance check: basis vaults score tenure, and churn only pays the spread`,
    ];
  if (c === 'chain')
    return [
      `Bridge ${P} of funds onto ${chain} and hold the balance in the farming wallet; on a pre-token chain the wallet itself is the farm`,
      `Use two or three of the chain's native apps each week (a swap, a lend, a bridge out and back) so the wallet's activity is organic, not a single deposit`,
    ];
  if (c.includes('launchpad'))
    return [
      `Register on ${name} and complete its current participation tasks with the farming wallet; keep ${P} of funds ready on ${chain} for the next sale window`,
      `Take part in one launch or allowlist round at the smallest tier rather than skipping rounds: participation history is the record being farmed`,
    ];
  if (c.includes('prediction'))
    return [
      `Fund the farming wallet with ${P} on ${name} and take small positions in two or three liquid markets, sized so no single market can take more than a tenth`,
      `Trade one market a week and let positions settle rather than closing early; settled history is the activity that counts`,
    ];
  if (c.includes('insurance'))
    return [
      `Stake ${P} of capital into ${name}'s underwriting pool on ${chain}; capital at risk is the product, so size it as money you can leave locked`,
      `Keep the stake through at least one full cover period and re-stake the premium share instead of withdrawing it`,
    ];
  if (c.includes('index'))
    return [
      `Mint ${P} of ${name}'s index token on ${chain} and hold it in the farming wallet for the whole plan`,
      `Add a small top-up, about ${money(Math.round(pos / 10))}, once a month so the position shows steady accumulation rather than one trade`,
    ];
  if (c.includes('payment') || c.includes('card'))
    return [
      `Open an account with ${name} from the farming wallet, complete its identity checks, and route ${P} of a real recurring payment through it`,
      `Keep the account active with one payment a week for the whole plan; a payment product scores continuity of use, not balances`,
    ];
  if (c.includes('stablecoin') || c.includes('algo-stable'))
    return [
      `Mint or deposit ${P} of the stable asset through ${name} on ${chain}, using its own mint page rather than a secondary market`,
      `Provide the minted stablecoin as liquidity in ${name}'s main pool and keep the LP position, so both the mint and the liquidity count`,
    ];
  if (c.includes('privacy'))
    return [
      `Deposit ${P} into ${name}'s shielded pool on ${chain} from the farming wallet, using only your own funds and keeping full records of both legs`,
      `Withdraw to a second wallet you own after the hold, in the same amount, so the deposit-withdrawal pair is complete and auditable`,
    ];
  if (c.includes('leveraged farming') || c === 'farm')
    return [
      `Open a leveraged farm in ${name} on ${chain} with ${P} at the lowest leverage tier it offers; leverage is for the position's score, not for size`,
      `Check the position's health weekly and top up collateral early if it drifts; a liquidated farm earns nothing and costs the position`,
    ];
  if (c.includes('ai'))
    return [
      `Deposit ${P} into ${name}'s agent vault on ${chain}, or buy its compute credits with the farming wallet if that is the live route`,
      `Run the agent's standard task route once a week so the wallet shows usage, not just a deposit`,
    ];
  if (c.includes('locker'))
    return [
      `Lock a small LP position, about ${P}, through ${name} on ${chain} for the shortest term it offers; locker usage is itself the tracked activity`,
      `Renew the lock once when it expires rather than letting it lapse, so the wallet shows continuous locker use across the plan`,
    ];
  if (c.includes('synthetic'))
    return [
      `Deposit ${P} of collateral into ${name} on ${chain} and mint a small amount of its synthetic asset against it, well inside the safe ratio`,
      `Hold both the collateral position and the synthetic through the plan, adjusting only if the ratio drifts toward the liquidation line`,
    ];
  if (c.includes('nft'))
    return [
      `Buy one low-floor item, about ${money(Math.round(pos / 5))}, on ${name} with the farming wallet and hold it rather than flipping it`,
      `List and delist one item a month at a fair price so the wallet shows marketplace use in both directions`,
    ];
  return [
    `Deposit ${P} of USDC into ${name}'s main product on ${chain} and keep the position open in the farming wallet`,
    `Make one further deposit or interaction a month, about ${money(Math.round(pos / 10))}, so the position grows steadily instead of sitting as a single trade`,
  ];
}

/** A plan's netted economics, as the last step and the detail view state them. */
export interface PlanSummary {
  position_usd: number;
  weeks: number;
  upfront_usd: number;
  weekly_usd: number;
  total_cost_usd: number;
  total_minutes: number;
  drag_pct: number;
}

/** A protocol's farm plan: six steps, each with its cost and its time, and the plan's totals. */
export function buildPlan(p: SnapshotProtocol, ageDaysValue: number | null): { steps: string[]; summary: PlanSummary } {
  const { chain, info } = chainInfo(p);
  const pos = positionFor(p.tvl_usd);
  const weeks = weeksFor(ageDaysValue);
  const upfront = Math.round(3 * info.tx * 100) / 100;
  const weekly = info.tx;
  const totalCost = Math.round((upfront + weekly * weeks) * 100) / 100;
  const totalMinutes = 35 + 10 * weeks + 15;
  const drag = Math.round((totalCost / pos) * 10000) / 100;
  const [core, second] = actionPair(p.category, p.name, chain, pos);
  const otherChain = p.chains.length > 1 ? p.chains[1]! : null;

  const steps = [
    `Open a fresh wallet for ${p.name} and fund it on ${chain} with the ${money(pos)} position plus about ${money(upfront + weekly * 2)} of ${info.gas} to cover gas; keep the seed phrase offline and use this wallet for nothing else. Cost: ${money(upfront + weekly * 2)} of gas money set aside. Time: 10 minutes.`,
    `${core}. Cost: about ${money(info.tx * 2)} in transaction fees. Time: 20 minutes to set up.`,
    `${second}. Cost: about ${money(info.tx)} in transaction fees. Time: 15 minutes.`,
    `Repeat one qualifying action every week for ${weeks} weeks${otherChain !== null ? `, and once a month use ${p.name} on ${otherChain} too, its second chain` : ''}: a small deposit, a claim-and-restake, or a repeat of the second step. Cost: about ${money(weekly)} a week, ${money(weekly * weeks)} over the plan. Time: 10 minutes a week.`,
    `Hold the position for the full ${weeks} weeks and check ${p.name}'s own points or rewards page once a month; save a dated note of the balance in a farm log each time. Cost: $0, and never pay anyone to check for you. Time: 5 minutes a month.`,
    `All-in cash cost is about ${money(totalCost)} over ${weeks} weeks (setup ${money(upfront)}, then ${money(weekly)} a week) on a ${money(pos)} position that stays withdrawable, a cash drag of ${drag}% of the position, and about ${Math.round((totalMinutes / 60) * 10) / 10} hours of hands-on time. If ${p.name} launches a token, claim only from the link on its official page and never pay a fee to claim. Cost: ${money(totalCost)} all-in. Time: ${totalMinutes} minutes in total.`,
  ];
  return {
    steps: steps.map(guardStep),
    summary: {
      position_usd: pos,
      weeks,
      upfront_usd: upfront,
      weekly_usd: weekly,
      total_cost_usd: totalCost,
      total_minutes: totalMinutes,
      drag_pct: drag,
    },
  };
}

/** Keep a step inside the gate's 20..600 trimmed characters whatever a template produced. */
function guardStep(s: string): string {
  let out = s.trim();
  if (out.length > 600) out = `${out.slice(0, 596).replace(/\s+\S*$/, '')}...`;
  if (out.length < 20) out = `${out} Hold the position and re-check monthly.`;
  return out;
}

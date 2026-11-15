/* Token Radar — the board, the filters and the detail view. Plain DOM, no framework, no network:
   the dataset arrives as window.RADAR from the data.js the program writes beside this page. */
'use strict';

const R = window.RADAR;
const ROWS = R.rows;
const BY_SLUG = new Map(ROWS.map((r) => [r.slug, r]));
const view = document.getElementById('view');

/* ---------- formatting ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function fmtUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
const fmtFull = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
function fmtPct(n) {
  if (n === null || n === undefined) return '<span class="zero">—</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
}
function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  if (days >= 730) return `${(days / 365.25).toFixed(1)} yrs`;
  if (days >= 60) return `${Math.round(days / 30.4)} mo`;
  return `${days} d`;
}
const fmtMult = (n) => `${n.toFixed(2)}×`;
const mult1 = (n) => `${n >= 1 ? '+' : ''}${((n - 1) * 100).toFixed(0)}%`;

/* ---------- static fills: the meta line, the model strip, the method, the comps ---------- */
document.getElementById('metaLine').innerHTML =
  `snapshot <b>${esc(R.as_of)}</b> · <b>${R.counts.protocols}</b> protocols · <b>${R.counts.board}</b> ranked · model <b>${esc(R.model_version)}</b>`;
document.getElementById('srcLine').textContent = R.source;

const f = R.fit;
const herr = Math.exp(R.holdout.median_abs_log_err);
document.getElementById('modelStrip').innerHTML = [
  ['Comps fitted', `${f.comps} <small>tokenised protocols</small>`],
  ['TVL slope', `${f.tvl_slope.toFixed(2)} <small>log-log</small>`],
  ['Growth coef', `<span class="${f.growth_coef >= 0 ? 'up' : 'dn'}">${f.growth_coef.toFixed(2)}</span> <small>per +100% TVL in 7d</small>`],
  ['Age coef', `<span class="${f.age_coef >= 0 ? 'up' : 'dn'}">${f.age_coef.toFixed(2)}</span> <small>per log year-tokenless</small>`],
  ['Holdout miss', `×${herr.toFixed(2)} <small>median, out of sample</small>`],
  ['Within 2×', `${R.holdout.within_2x_pct}% <small>of ${R.holdout.test} held-out caps</small>`],
  ['Watchlist', `${R.counts.watchlist}/${R.counts.watchlist} <small>covered</small>`],
  ['Residual band', `×${Math.exp(f.sigma).toFixed(2)} <small>e^σ either way</small>`],
]
  .map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`)
  .join('');

const slot = (name, text) => document.querySelectorAll(`[data-m="${name}"]`).forEach((el) => (el.textContent = text));
slot('capn', String(R.counts.tokenised_cap));
slot('alln', String(R.counts.protocols));
slot('comps', String(f.comps));
slot('slope', f.tvl_slope.toFixed(3));
slot('gcoef', f.growth_coef.toFixed(3));
slot('acoef', f.age_coef.toFixed(3));
slot('sigma', f.sigma.toFixed(2));
slot('herr', R.holdout.median_abs_log_err.toFixed(2));
slot('h2x', `${R.holdout.within_2x_pct}%`);
slot('boardn', String(R.counts.board));
slot('wln', String(R.counts.watchlist));
slot('recn', String(R.counts.tokenised_recorded));

document.getElementById('catTable').innerHTML =
  R.categories.length === 0
    ? ''
    : `<table class="mini"><thead><tr><th>Category</th><th class="n">Comps</th><th class="n">Observed median cap / TVL</th><th class="n">Fitted offset (log)</th></tr></thead><tbody>${R.categories
        .map((c) => `<tr><td>${esc(c.category)}</td><td class="n">${c.comps}</td><td class="n">${c.median_ratio.toFixed(3)}</td><td class="n">${c.offset >= 0 ? '+' : ''}${c.offset.toFixed(3)}</td></tr>`)
        .join('')}</tbody></table>`;

document.getElementById('liveTable').innerHTML =
  `<table class="mini"><thead><tr><th>Protocol</th><th>Symbol</th><th>Category</th><th class="n">Market cap</th><th class="n">TVL</th><th class="n">Cap / TVL</th></tr></thead><tbody>${R.live
    .map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.symbol ?? '—')}</td><td>${esc(l.category ?? '—')}</td><td class="n">${fmtUSD(l.mcap_usd)}</td><td class="n">${fmtUSD(l.tvl_usd)}</td><td class="n">${l.ratio.toFixed(3)}</td></tr>`)
    .join('')}</tbody></table>`;

/* ---------- routing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h.startsWith('/p/')) return { view: 'detail', slug: decodeURIComponent(h.slice(3)) };
  const q = new URLSearchParams(h.startsWith('/?') ? h.slice(2) : '');
  return {
    view: 'board',
    q: q.get('q') ?? '',
    cat: q.get('cat') ?? '',
    chain: q.get('chain') ?? '',
    wl: q.get('wl') === '1',
    min: Number(q.get('min') ?? 0),
    sort: q.get('sort') ?? 'rank',
    dir: q.get('dir') === 'desc' ? 'desc' : 'asc',
  };
}
function boardHash(s) {
  const q = new URLSearchParams();
  if (s.q) q.set('q', s.q);
  if (s.cat) q.set('cat', s.cat);
  if (s.chain) q.set('chain', s.chain);
  if (s.wl) q.set('wl', '1');
  if (s.min) q.set('min', String(s.min));
  if (s.sort !== 'rank') q.set('sort', s.sort);
  if (s.dir !== 'asc') q.set('dir', s.dir);
  const str = q.toString();
  return str ? `#/?${str}` : '#/';
}

/* ---------- the board ---------- */
const SORTS = {
  rank: (r) => r.rank,
  name: (r) => r.name.toLowerCase(),
  tvl: (r) => r.tvl_usd,
  chg: (r) => r.change_7d ?? -1e9,
  age: (r) => r.age_days ?? -1,
  mult: (r) => r.multiple,
  implied: (r) => r.implied_value_usd,
  cost: (r) => r.plan.total_cost_usd,
};
function filtered(s) {
  const q = s.q.trim().toLowerCase();
  return ROWS.filter((r) => {
    if (s.wl && !r.watchlist) return false;
    if (s.cat && r.category !== s.cat) return false;
    if (s.chain && !r.chains.includes(s.chain)) return false;
    if (s.min && r.tvl_usd < s.min) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.category ?? '').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => {
    const ka = SORTS[s.sort](a);
    const kb = SORTS[s.sort](b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return (s.dir === 'desc' ? -cmp : cmp) || a.rank - b.rank;
  });
}
function options(values, current, allLabel) {
  return `<option value="">${allLabel}</option>` + values.map((v) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
}
function renderBoard(s) {
  const cats = [...new Set(ROWS.map((r) => r.category).filter(Boolean))].sort();
  const chainCounts = new Map();
  for (const r of ROWS) for (const c of r.chains) chainCounts.set(c, (chainCounts.get(c) ?? 0) + 1);
  const chains = [...chainCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 40).map(([c]) => c);
  const rows = filtered(s);
  const th = (key, label, cls = '') => {
    const sorted = s.sort === key;
    const arrow = sorted ? (s.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="${cls} ${sorted ? 'sorted' : ''}" data-sort="${key}">${label}${arrow}</th>`;
  };
  view.innerHTML = `
  <div class="controls">
    <input type="search" id="cq" placeholder="Search name, slug, category…" value="${esc(s.q)}">
    <select id="ccat">${options(cats, s.cat, 'All categories')}</select>
    <select id="cchain">${options(chains, s.chain, 'All chains')}</select>
    <select id="cmin">
      <option value="0" ${s.min === 0 ? 'selected' : ''}>Any TVL</option>
      <option value="50000000" ${s.min === 5e7 ? 'selected' : ''}>TVL ≥ $50M (watchlist size)</option>
      <option value="10000000" ${s.min === 1e7 ? 'selected' : ''}>TVL ≥ $10M</option>
      <option value="5000000" ${s.min === 5e6 ? 'selected' : ''}>TVL ≥ $5M</option>
    </select>
    <label class="chk"><input type="checkbox" id="cwl" ${s.wl ? 'checked' : ''}> Watchlist only</label>
    <span class="count">${rows.length} of ${ROWS.length} protocols</span>
  </div>
  <div class="boardwrap"><table class="board"><thead><tr>
    ${th('rank', '#')}${th('name', 'Protocol')}<th>Chains</th>${th('tvl', 'TVL', 'num')}${th('chg', '7d', 'num')}
    ${th('age', 'Tokenless age', 'num')}${th('mult', 'Multiple', 'num')}${th('implied', 'Implied value', 'num')}${th('cost', 'Plan cost', 'num')}
  </tr></thead><tbody>
  ${rows
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}">
      <td class="rank">${r.rank}</td>
      <td class="name"><span class="nm">${esc(r.name)}</span>${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}<span class="cat">${esc(r.category ?? 'Uncategorised')}</span></td>
      <td class="chains">${esc(r.chains.slice(0, 2).join(', '))}${r.chains.length > 2 ? ` +${r.chains.length - 2}` : ''}</td>
      <td class="num">${fmtUSD(r.tvl_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtAge(r.age_days)}</td>
      <td class="num">${fmtMult(r.multiple)}</td>
      <td class="num imp">${fmtUSD(r.implied_value_usd)}<span class="band">${fmtUSD(r.band_lo_usd)} – ${fmtUSD(r.band_hi_usd)}</span></td>
      <td class="num">${fmtUSD(r.plan.total_cost_usd)}<span class="band">${r.plan.weeks} wks</span></td>
    </tr>`,
    )
    .join('')}
  </tbody></table></div>
  ${rows.length === 0 ? '<p class="empty">No protocol matches those filters. Loosen one and the radar fills again.</p>' : ''}`;

  const go = (patch) => {
    location.hash = boardHash({ ...s, ...patch });
  };
  document.getElementById('cq').addEventListener('input', (e) => go({ q: e.target.value }));
  document.getElementById('ccat').addEventListener('change', (e) => go({ cat: e.target.value }));
  document.getElementById('cchain').addEventListener('change', (e) => go({ chain: e.target.value }));
  document.getElementById('cmin').addEventListener('change', (e) => go({ min: Number(e.target.value) }));
  document.getElementById('cwl').addEventListener('change', (e) => go({ wl: e.target.checked }));
  view.querySelectorAll('th[data-sort]').forEach((el) =>
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-sort');
      go({ sort: key, dir: s.sort === key && s.dir === 'asc' ? 'desc' : 'asc' });
    }),
  );
  view.querySelectorAll('tr[data-slug]').forEach((el) => el.addEventListener('click', () => (location.hash = `#/p/${el.getAttribute('data-slug')}`)));
  const search = document.getElementById('cq');
  if (document.activeElement === search || s.q) {
    /* keep the caret in the search box across re-renders while typing */
    if (s.q) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
}

/* ---------- the detail view ---------- */
function renderDetail(slug) {
  const r = BY_SLUG.get(slug);
  if (!r) {
    renderBoard(parseHash());
    return;
  }
  const stat = (k, v) => `<div class="st"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  view.innerHTML = `
  <div class="detail">
    <a class="back" href="#/">← the board</a>
    <h2>${esc(r.name)}${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}</h2>
    <p class="sub">${esc(r.category ?? 'Uncategorised')} · rank <b>#${r.rank}</b> of ${ROWS.length} · records no token (DefiLlama's record, as of ${esc(R.as_of)}) · tracked since ${esc(r.listed_at ?? 'an unrecorded date')}</p>
    <div class="statgrid">
      ${stat('Implied value', `${fmtFull(r.implied_value_usd)}`)}
      ${stat('Model band', `<small>${fmtUSD(r.band_lo_usd)} – ${fmtUSD(r.band_hi_usd)}</small>`)}
      ${stat('TVL', fmtFull(r.tvl_usd))}
      ${stat('Implied multiple', fmtMult(r.multiple))}
      ${stat('TVL change, 7d', r.change_7d === null ? '—' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`)}
      ${stat('Tokenless age', `${fmtAge(r.age_days)}<small> ${r.age_days === null ? '' : `(${r.age_days} days)`}</small>`)}
      ${stat('Chains', `<small>${esc(r.chains.join(', ') || '—')}</small>`)}
      ${stat('Plan length', `${r.plan.weeks} <small>weeks</small>`)}
    </div>
    <div class="panel"><h3>How this value is derived</h3>
      <table class="derive">
        <tr><td>Size curve at ${esc(r.name)}'s TVL — exp(a + b·ln TVL) from ${f.comps} tokenised comps</td><td class="v">${fmtFull(r.base_usd)}</td></tr>
        <tr><td>× category multiple (${esc(r.category ?? 'pooled categories')})</td><td class="v">×${r.cat_mult.toFixed(3)}</td></tr>
        <tr><td>× growth multiple (7d TVL ${r.change_7d === null ? 'unreported' : `${r.change_7d > 0 ? '+' : ''}${r.change_7d.toFixed(1)}%`}, winsorised)</td><td class="v">×${r.growth_mult.toFixed(3)}</td></tr>
        <tr><td>× age multiple (${fmtAge(r.age_days)} with no token)</td><td class="v">×${r.age_mult.toFixed(3)}</td></tr>
        <tr><td>= the fitted curve's price</td><td class="v">${fmtFull(r.curve_usd)}</td></tr>
        <tr><td>Blended ${Math.round((1 - f.blend) * 100)}% curve / ${Math.round(f.blend * 100)}% the price at the category's observed median multiple (${r.median_ratio.toFixed(3)} × TVL = ${fmtUSD(r.median_price_usd)})</td><td class="v">${fmtFull(r.implied_value_usd)}</td></tr>
        <tr class="total"><td>Implied launch value (band ${fmtUSD(r.band_lo_usd)} – ${fmtUSD(r.band_hi_usd)} at the fit's residual σ)</td><td class="v">${fmtFull(r.implied_value_usd)}</td></tr>
      </table>
    </div>
    <div class="panel"><h3>The farm plan</h3>
      <ol class="plan">${r.farm_steps.map((s2) => `<li>${esc(s2)}</li>`).join('')}</ol>
      <div class="totals">
        <span>Position <b>${fmtFull(r.plan.position_usd)}</b></span>
        <span>Cash cost <b>${fmtFull(r.plan.total_cost_usd)}</b> all-in</span>
        <span>Upfront <b>${fmtFull(r.plan.upfront_usd)}</b></span>
        <span>Running <b>${fmtFull(r.plan.weekly_usd)}/wk</b></span>
        <span>Hands-on <b>${r.plan.total_minutes} min</b></span>
        <span>Cash drag <b>${r.plan.drag_pct}%</b> of position</span>
      </div>
    </div>
  </div>`;
  window.scrollTo(0, 0);
}

/* ---------- go ---------- */
function render() {
  const s = parseHash();
  if (s.view === 'detail') renderDetail(s.slug);
  else renderBoard(s);
}
window.addEventListener('hashchange', render);
render();

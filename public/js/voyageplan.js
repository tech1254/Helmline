// The voyage planner, in the Set sail panel: for every port you can sail to, what the passage
// costs, what your hold would fetch there, the contracts due there, and the best cargo to load
// here for it, from the prices you have seen. Prices fall as you sell and rise as you buy, by
// each market's depth, and perishable cargo rots on the way: the estimates allow for both.
// Behind a switch (S.sailView): 'list' is the plain list of ports as before.

import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import * as Ships from './ships.js';
import { S, market } from './state.js';
import { passage } from './pricebook.js';
import { ageText } from './util.js';

const KEEP_MARGIN = 1.03; // load a unit only if it should fetch at least this much more than it costs

// What `units` of a good fetch at a market last seen selling at `price`, each sale lowering it.
function saleOf(price, k, units) {
  let t = 0;
  for (let i = 0; i < units; i++) t += Math.max(1, price * Math.exp(-k * i));
  return Math.round(t);
}

// The rot on a passage, as a share of the cargo kept.
const kept = (g, st, run) => (g.spoil ? Math.exp(-g.spoil * st.spoil * (run.days + 0.6 * (run.hot || 0))) : 1);

export function plans() {
  const st = Ships.flagStats(S);
  const here = S.ship.docked;
  const from = { lon: S.ship.lon, lat: S.ship.lat };
  const freeHold = st.hold - GOODS.reduce((n, g) => n + (S.cargo[g.id] || 0), 0);
  const out = [];
  for (const p of PORTS) {
    if (!S.discovered[p.id] || p.id === here || p.beyond) continue;
    const run = passage(from, p, S.day);
    if (!run || run.days <= 0) continue;
    const wages = Math.round(run.days * st.upkeep);
    const seen = S.seen[p.id];
    const plan = { p, days: run.days, wages, seen: seen ? seen.day : null, hold: null, contracts: [], load: null };
    // contracts due there; cargo held for any contract is not for sale anywhere
    const reserved = {};
    for (const c of S.contracts?.active || []) {
      if (c.kind !== 'deliver') continue;
      const have = S.cargo[c.good] || 0;
      reserved[c.good] = Math.min(have, (reserved[c.good] || 0) + c.qty);
      if (c.to === p.id) plan.contracts.push({ title: c.title, reward: c.reward, ready: have >= c.qty, short: Math.max(0, c.qty - have), late: c.deadline != null && S.day + run.days > c.deadline });
    }
    // the hold, sold there (less what goes to contracts)
    if (seen) {
      let sale = 0, paid = 0, units = 0;
      for (const g of GOODS) {
        const n = (S.cargo[g.id] || 0) - (reserved[g.id] || 0);
        if (n <= 0) continue;
        const left = Math.floor(n * kept(g, st, run));
        sale += saleOf(seen.prices[g.id].sell, market.k(p.id, g.id), left);
        paid += Math.round((S.paid[g.id] || 0) * (n / (S.cargo[g.id] || 1)));
        units += n;
      }
      if (units) plan.hold = { units, sale, paid };
      // the best cargo to load here for it
      if (here && !market.closed(here) && freeHold > 0) {
        const budget = Math.max(0, S.purse - wages);
        let best = null;
        for (const g of GOODS) {
          if (!market.sells(here, g.id)) continue;
          const kb = market.k(here, g.id), ks = market.k(p.id, g.id), keep = kept(g, st, run);
          const b0 = market.buyPrice(here, g.id), s0 = seen.prices[g.id].sell;
          let n = 0, cost = 0, sale2 = 0;
          while (n < freeHold) {
            const pb = b0 * Math.exp(0.5 * kb * n), ps = s0 * Math.exp(-ks * n) * keep;
            if (ps < pb * KEEP_MARGIN || cost + pb > budget) break;
            n++; cost += pb; sale2 += ps;
          }
          const profit = Math.round(sale2 - cost);
          if (n > 0 && profit > 0 && (!best || profit > best.profit)) best = { g, units: n, cost: Math.round(cost), profit };
        }
        plan.load = best;
      }
    }
    const holdGain = plan.hold ? plan.hold.sale - plan.hold.paid : 0;
    const rewards = plan.contracts.filter((c) => c.ready && !c.late).reduce((t, c) => t + c.reward, 0);
    plan.net = holdGain + rewards + (plan.load?.profit || 0) - wages;
    out.push(plan);
  }
  return out;
}

export function renderPlanner(sortBy = 'value') {
  const list = plans().sort((a, b) => (sortBy === 'near' ? a.days - b.days : b.net - a.net || a.days - b.days));
  const docked = !!S.ship.docked;
  const rows = list.map((x) => {
    const d = Math.max(1, Math.round(x.days));
    const bits = [];
    if (!x.seen && x.seen !== 0) bits.push('<p class="muted">No prices seen there yet: you will learn them when you arrive.</p>');
    if (x.hold) bits.push(`<p>Your hold (${x.hold.units}) should fetch about <b>${x.hold.sale.toLocaleString()} cz</b> there <span class="muted">(paid ${x.hold.paid.toLocaleString()})</span>.</p>`);
    for (const c of x.contracts) bits.push(`<p class="plan-contract">Contract: ${c.title}, ${c.reward.toLocaleString()} cz · ${c.late ? '<span class="warn">too late by this passage</span>' : c.ready ? 'ready in your hold' : `needs ${c.short} more`}</p>`);
    if (x.load) bits.push(`<p>Load here: <b>${x.load.units} ${x.load.g.unit} of ${x.load.g.name.toLowerCase()}</b> for about ${x.load.cost.toLocaleString()} cz, worth about <b>+${x.load.profit.toLocaleString()}</b> there.</p>`);
    else if (docked && x.seen != null) bits.push('<p class="muted">Nothing here pays to carry there.</p>');
    const stale = x.seen != null && S.day - x.seen > 60 ? ` · <span class="warn">prices seen ${ageText(x.seen)}</span>` : x.seen != null ? ` · prices seen ${ageText(x.seen)}` : '';
    return `<li class="plan">
        <div class="plan-head"><b>${x.p.name}</b><span class="net ${x.net >= 0 ? 'up' : 'down'}">${x.net >= 0 ? '+' : ''}${x.net.toLocaleString()} cz</span></div>
        <p class="meta">about ${d} ${d === 1 ? 'day' : 'days'} · ${x.wages} cz wages${stale}</p>
        ${bits.join('')}
        <div class="row">${x.load ? `<button data-buy="${x.load.g.id}" data-n="${x.load.units}">Load ${x.load.units} ${x.load.g.unit}</button>` : ''}<button class="primary" data-sailto="${x.p.id}">Sail to ${x.p.name}</button></div>
      </li>`;
  }).join('');
  return `<div class="row plan-sort" style="justify-content:flex-start"><span class="fine">Order by</span>
      <div class="seg" role="radiogroup" aria-label="Order by"><button role="radio" aria-checked="${sortBy !== 'near'}" class="${sortBy !== 'near' ? 'on' : ''}" data-plan-sort="value">Best value</button><button role="radio" aria-checked="${sortBy === 'near'}" class="${sortBy === 'near' ? 'on' : ''}" data-plan-sort="near">Nearest</button></div></div>
    <ul class="plans">${rows || '<li class="muted">No other ports charted yet.</li>'}</ul>
    <p class="foot">Estimates from the prices you have seen and today's winds, after wages and spoilage. Prices fall as you sell and rise as you buy; old prices may have moved.</p>`;
}

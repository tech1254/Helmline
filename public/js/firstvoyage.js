// The first voyage: a short guided run for a new player, shown at the top of the market. Buy a
// cargo here, sail to a nearby port where it sells for more, sell it, and see what it made. The
// run is chosen once, from the prices the player knows (the hearsay at the start), and kept in
// S.first so it does not change under them. It ends when they sell there, go somewhere else, or
// skip it.

import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import { S, market } from './state.js';
import * as Ships from './ships.js';
import { estimateVoyage, planCourse } from './voyage.js';
import { held } from './util.js';

const SKIP = ['gold', 'spices', 'ivory']; // not for a first cargo of a few hundred cruzados
const MAX_QTY = 10;
const port = (id) => PORTS.find((p) => p.id === id);
const good = (id) => GOODS.find((g) => g.id === id);

// The browser tests see it only when they ask (it adds buttons to the market).
export const firstOn = () => !(navigator.webdriver && !window.helmlineFirst);

function daysTo(pid) {
  const p = port(pid);
  const plan = planCourse(p.lon, p.lat, p.id, false);
  return plan ? estimateVoyage(plan.route).days : null;
}

// The best small run from here to a port whose prices the player has heard.
export function pickRun(from) {
  const st = Ships.flagStats(S);
  let best = null;
  for (const to of Object.keys(S.seen || {})) {
    if (to === from || !S.discovered[to] || !S.seen[to]?.prices) continue;
    const days = daysTo(to);
    if (!days || days > 9) continue; // a short first run: not up through Biscay to Bruges
    const wages = Math.round(days * st.upkeep);
    for (const g of GOODS) {
      if (SKIP.includes(g.id) || !market.sells(from, g.id)) continue;
      const buy = market.buyPrice(from, g.id), sell = S.seen[to].prices[g.id]?.sell;
      if (!sell || sell <= buy) continue;
      const qty = Math.min(MAX_QTY, st.hold - held(), Math.floor((S.purse - wages - 40) / (buy * 1.1)));
      if (qty < 3) continue;
      // selling pushes the price down, and wine sours on the way: a rough haircut
      const gain = qty * (sell * (g.spoil > 0.004 ? 0.85 : 0.9) - buy) - wages;
      const score = gain / Math.max(3, days);
      if (gain > 0 && (!best || score > best.score)) best = { from, to, good: g.id, qty, buy, sell, days: Math.max(1, Math.round(days)), score };
    }
  }
  return best && { from: best.from, to: best.to, good: best.good, qty: best.qty, buy: best.buy, sell: best.sell, days: best.days };
}

// Begins the guide for a new game, in its first port, once.
export function ensureFirst() {
  if (!firstOn() || S.first || S.voyages > 0 || S.day > 60 || !S.ship.docked) return S.first;
  const run = pickRun(S.ship.docked);
  S.first = run ? { ...run, purse0: Math.round(S.purse), done: false } : { done: true };
  return S.first;
}

export function firstActive() {
  const f = S.first;
  return !!(f && !f.done && firstOn());
}

// Where the player is in it: 'buy' | 'sail' | 'sea' | 'sell' | 'done' | null (over).
export function firstStep() {
  if (!firstActive()) return null;
  const f = S.first, sh = S.ship;
  if (!sh.docked) return 'sea';
  if (sh.docked === f.from && S.voyages === 0) return held() > 0 ? 'sail' : 'buy';
  if (sh.docked === f.to) return held() > 0 ? 'sell' : 'done';
  f.done = true; // somewhere else: the player has found their own way
  return null;
}

export function endFirst() { if (S.first) S.first.done = true; }

// The line for the captain's note at sea.
export function firstAtSea() {
  const f = S.first, g = good(f.good);
  return `On your way to ${port(f.to).name} with ${g.name.toLowerCase()}. Tap Speed to make time pass faster.`;
}

// The box at the top of the market.
export function firstBox() {
  const step = firstStep();
  if (!step || step === 'sea') return '';
  const f = S.first, g = good(f.good), from = port(f.from).name, to = port(f.to).name;
  const have = S.cargo[f.good] || 0;
  const li = (state, html) => `<li class="${state}">${html}</li>`;
  const at = { buy: 0, sail: 1, sell: 2, done: 3 }[step];
  const st = (i) => (i < at ? 'did' : i === at ? 'now' : 'next');
  if (step === 'done') {
    const made = Math.round(S.purse) - f.purse0;
    return `<section class="first done" aria-label="Your first voyage">
      <h3>Your first voyage is done</h3>
      <p>You ${made >= 0 ? `made <b>${made.toLocaleString()} cz</b>` : `lost <b>${(-made).toLocaleString()} cz</b>`}, after the crew's wages. That is the whole trade: buy where a good is cheap, carry it, sell where it is dear.</p>
      <p class="fine">The Price book keeps every price you see, and its harbourmaster suggests runs from them. Prices fall as you sell, so a few smaller cargoes often beat one big one.</p>
      <div class="row"><button class="primary" data-first-end>Carry on</button><button data-prices>Open the Price book</button></div>
    </section>`;
  }
  return `<section class="first" aria-label="Your first voyage">
    <div class="first-head"><h3>Your first voyage</h3><button class="link" data-first-end>Skip</button></div>
    <ol>
      ${li(st(0), `<span>Buy ${f.qty} ${g.unit} of ${g.name.toLowerCase()} here, about ${f.buy} cz each.</span>${step === 'buy' ? `<button class="primary" data-buy="${f.good}" data-n="${f.qty}" ${f.buy > S.purse ? 'disabled' : ''}>Buy ${f.qty} ${g.unit}</button>` : ''}`)}
      ${li(st(1), `<span>Sail to ${to}, about ${f.days} ${f.days === 1 ? 'day' : 'days'}. It sold there for about ${f.sell} cz, last you heard.</span>${step === 'sail' ? `<button class="primary" data-sailto="${f.to}">Set sail for ${to}</button>` : ''}`)}
      ${li(st(2), `<span>Sell it at ${to}.</span>${step === 'sell' ? (have ? `<button class="primary" data-sell="${f.good}" data-n="all">Sell all ${have} ${g.unit}</button>` : '<span class="fine">Tap All beside each good you carry.</span>') : ''}`)}
    </ol>
    ${step === 'buy' ? `<p class="fine">Or buy what you like from the table below. ${from} is where you start; ${to} is a short, easy run.</p>` : ''}
  </section>`;
}

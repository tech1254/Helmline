// Rival merchants. Where trade pays, others follow: Castilian interlopers, Genoese and Florentine
// houses settling in Lisbon, the traders who took Fernão Gomes's lease of the Guinea trade, and
// at last every captain who hears of a profit. Rivals buy where goods are cheap and sell where
// they are dear, so the gap a trader lives on narrows: a good costs more where it is made and
// fetches less where it is wanted.
//
// Rivalry, 0 to 1 for each good in each port, follows two things:
//  - history: rivals reach each part of the coast in their time (REGIONS), and
//  - your own trade: a good you and your captains move through a port in quantity draws them in.
// It follows them slowly (over a couple of years), and eases slowly where trade stops.

import { yearOf } from './ships.js';
import { GOODS } from './economy.js';

export const REGIONS = {
  home: { ports: ['lisbon', 'porto', 'lagos', 'cadiz', 'ceuta', 'safi', 'funchal', 'lanzarote'], from: 1455, full: 1490,
    news: 'Genoese and Florentine merchants crowd the Lisbon quays, and Castilian ships trade along the Moroccan coast and in the Canaries. Prices on the home routes are narrowing.' },
  guinea: { ports: ['arguin', 'gambia', 'cantor', 'serraleoa', 'cestos', 'mina'], from: 1468, full: 1505,
    news: 'The Guinea trade is no longer a secret: Fernão Gomes\'s men, Castilian interlopers and every captain in Lagos are buying on the African coast. Its prices are narrowing.' },
  south: { ports: ['mpinda', 'saotome', 'saobras', 'portoseguro'], from: 1505, full: 1540,
    news: 'São Tomé\'s planters and the brazilwood contractors have ships of their own now, and the Kongo trade is crowded. Prices in the far south are narrowing.' },
  indies: { ports: ['calicut'], from: 1510, full: 1550,
    news: 'The crown\'s India fleets and the private traders who sail with them crowd the Malabar coast: pepper costs more in Calicut every year.' },
};
// history: how much of rivalry history brings in full; premium: at full rivalry a good costs this
// much more where it is sold; cut: and fetches this much less where it is wanted; volRef: units
// a year of one good through one port, by you, that draw rivals in full.
export const TUNING = { history: 0.35, premium: 0.2, cut: 0.18, volRef: 400 }; // tuned 27 Oct 2026 (tests/sim/personas.mjs)
const SETTLE_DAYS = 2 * 365;

const regionOf = (pid) => Object.entries(REGIONS).find(([, r]) => r.ports.includes(pid))?.[0];
const ramp = (year, from, full) => Math.max(0, Math.min(1, (year - from) / (full - from)));

export function ensureRivals(S) {
  if (!S.rivals) S.rivals = { r: {}, vol: {}, told: {} };
  return S.rivals;
}

// Days pass: rivalry follows history and your trade. `market.volg` holds the units of each good
// traded in each port since the last call (economy.js); it is emptied here. Returns news.
export function tick(S, days, market) {
  const R = ensureRivals(S);
  const year = yearOf(S.day);
  const settle = 1 - Math.exp(-days / SETTLE_DAYS);
  const fade = Math.exp(-days / 365);
  const msgs = [];
  for (const [rid, reg] of Object.entries(REGIONS)) {
    const h = ramp(year, reg.from, reg.full);
    if (h >= 0.3 && !R.told[rid]) { R.told[rid] = true; msgs.push({ html: `<b>News:</b> ${reg.news}`, kind: 'port', log: reg.news }); }
    for (const pid of reg.ports) {
      const r = (R.r[pid] = R.r[pid] || {});
      const v = (R.vol[pid] = R.vol[pid] || {});
      for (const g of GOODS) {
        v[g.id] = (v[g.id] || 0) * fade + (market?.volg?.[pid]?.[g.id] || 0);
        const target = TUNING.history * h + (1 - TUNING.history) * Math.min(1, v[g.id] / TUNING.volRef);
        r[g.id] = (r[g.id] || 0) + (target - (r[g.id] || 0)) * settle;
      }
    }
  }
  if (market) market.volg = {};
  return msgs;
}

// Price multipliers for the market: rival[port][good].
export function factors(S, market) {
  const R = ensureRivals(S);
  const out = {};
  for (const [pid, goods] of Object.entries(R.r)) {
    out[pid] = {};
    for (const [g, r] of Object.entries(goods)) out[pid][g] = market.sells(pid, g) ? 1 + TUNING.premium * r : 1 - TUNING.cut * r;
  }
  return out;
}

// How crowded a port is, for the port panel: the rivalry over the goods it sells or wants most.
export function level(S, pid) {
  const r = ensureRivals(S).r[pid];
  if (!r) return 0;
  const xs = Object.values(r);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function levelText(x) {
  return x >= 0.6 ? 'crowded with rival merchants' : x >= 0.35 ? 'busy with rival traders' : x >= 0.15 ? 'a few rival traders' : '';
}

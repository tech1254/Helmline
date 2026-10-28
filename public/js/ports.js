// Ports that grow: each port has a population that rises or falls with its history, with the
// trade that passes through it, and with plague and closures. A bigger port has a deeper market
// (each unit traded moves the price less), and some build quays that let deeper ships come in.
// Also here: the depth at each berth through the seasons, and whether a ship must work her
// cargo with boats. Pure rules with no browser, so the simulators can use them too.

import { PORTS, HARBOURS, RIVERS, anchorage } from './world.js';
import { START_DATE } from './config.js';
import { draftOf, boatRate, yearOf } from './ships.js';

// People in 1451 (rough, from what is known of the period) and yearly growth before trade.
export const START = {
  lisbon: { size: 60000, grow: 0.01 },
  porto: { size: 12000, grow: 0.01 },
  lagos: { size: 6000, grow: 0.008 },
  cadiz: { size: 15000, grow: 0.01 },
  ceuta: { size: 4000, grow: -0.004 }, // a garrison town, cut off from its hinterland
  safi: { size: 5000, grow: 0.006 },
  funchal: { size: 3000, grow: 0.04 }, // Madeira's sugar boom
  lanzarote: { size: 1000, grow: 0.005 },
  arguin: { size: 300, grow: 0.02 },
  gambia: { size: 2000, grow: 0.006 },
  serraleoa: { size: 1500, grow: 0.006 },
  cestos: { size: 800, grow: 0.006 },
  mina: { size: 1500, grow: 0.01 },
  cantor: { size: 3000, grow: 0.005 },
  mpinda: { size: 2500, grow: 0.006 },
  saotome: { size: 300, grow: 0.05 }, // a sugar colony, from almost nothing
  saobras: { size: 150, grow: 0.002 }, // a watering place
  portoseguro: { size: 400, grow: 0.02 },
  calicut: { size: 60000, grow: 0.005 },
};
const GROWTH_UNTIL = { funchal: 1490, saotome: 1530 }; // the boom slows after this year (to the ordinary 1%)

// Turning points from history. size: a factor; depth: metres added at the berth.
export const HISTORY = [
  { year: 1455, port: 'arguin', size: 1.5, text: 'The fort on Arguin island is rebuilt in stone, and a factory with it. More traders come down to the coast.' },
  { year: 1466, port: 'funchal', size: 1.2, text: 'Madeira\'s sugar mills multiply. Funchal is filling with merchants from Genoa and Flanders.' },
  { year: 1482, port: 'mina', size: 2, depth: 1.6, text: 'São Jorge da Mina: a castle and a pier rise on the Gold Coast. Ships can now come alongside.' },
  { year: 1482, port: 'lagos', size: 0.9, text: 'The Casa da Guiné moves from Lagos to Lisbon. The African trade follows it.' },
  { year: 1482, port: 'lisbon', size: 1.1, text: 'The Casa da Guiné opens in Lisbon. The African trade now comes up the Tagus.' },
  // The road to the Indies. Entries with `opens` make a port known: history charts it for you.
  // (Append only: saves remember these by their place in the list.)
  { year: 1483, port: 'mpinda', opens: true, text: 'Diogo Cão has set up a stone pillar at the mouth of the great Zaire river, and the Manikongo welcomes Portuguese traders at Mpinda.' },
  { year: 1486, port: 'saotome', opens: true, text: 'Settlers and sugar cane go out to São Tomé, on the line. A new Portuguese port in the Gulf of Guinea.' },
  { year: 1488, port: 'saobras', opens: true, text: 'Bartolomeu Dias is home. He has rounded the southern cape of Africa, the Cape of Good Hope, the King calls it, and watered at São Brás beyond it. The westerlies far to the south carry a ship round.' },
  { year: 1492, port: 'lisbon', text: 'Word from Castile: a Genoese, Columbus, sailing for Queen Isabella, claims to have reached the Indies by sailing west.' },
  { year: 1494, port: 'lisbon', text: 'The Treaty of Tordesillas divides the unknown world between Portugal and Castile, 370 leagues west of the Cape Verde islands.' },
  { year: 1499, port: 'calicut', opens: true, text: 'Vasco da Gama is home from India! His ships reached Calicut and came back with pepper and cinnamon. The way to the Indies lies round the Cape: the chart\'s edge beyond São Brás.' },
  { year: 1500, port: 'portoseguro', opens: true, text: 'Cabral\'s India fleet, swinging wide into the ocean, has found a great land in the west: the Land of the Holy Cross. Its brazilwood makes a fine red dye.' },
  { year: 1503, port: 'lisbon', size: 1.1, text: 'The Casa da Índia opens in Lisbon to handle the spice trade. Merchants from all Europe crowd the Tagus.' },
  { year: 1510, port: 'calicut', text: 'Afonso de Albuquerque has taken Goa. Portuguese power on the Malabar coast grows.' },
  { year: 1511, port: 'calicut', size: 1.1, text: 'Albuquerque takes Malacca: the clove and nutmeg trade of the Spice Islands now runs through Portuguese hands.' },
];
// Harbour works a port builds once it is big enough: quays and moles that deepen the berth.
export const WORKS = {
  lagos: { at: 10000, depth: 1, text: 'Lagos builds new quays. Deeper ships can now come alongside.' },
  funchal: { at: 15000, depth: 1, text: 'Funchal builds a mole off the beach. Deeper ships can now lie in shelter.' },
  safi: { at: 9000, depth: 1, text: 'Safi builds a jetty out through the surf.' },
  porto: { at: 25000, depth: 0.8, text: 'Porto deepens the channel over the Douro bar.' },
};

export const TIERS = [[40000, 'great port'], [8000, 'city'], [1500, 'town'], [0, 'village']];
export const tierOf = (size) => TIERS.find(([n]) => size >= n)[1];

// Tuning (see tests/sim/economy_sim.mjs --depth-exp, --trade-max):
//   depthExp: how strongly a port's size deepens its market: depth factor = (size in 1451 / size now)^depthExp
//   tradePerPoint: units a year through a port that add one point (1%) to its yearly growth
//   tradeMax: the most trade can add to a port's yearly growth
export const TUNING = { depthExp: 0.3, tradePerPoint: 1000, tradeMax: 0.02, depthMin: 0.35 }; // first settings, 27 Oct 2026: to be tuned

export function ensurePorts(S) {
  if (S.ports && S.ports.lisbon) {
    for (const p of PORTS) if (!S.ports[p.id]) S.ports[p.id] = fresh(p.id, S.day);
    return S.ports;
  }
  // A new game, or a save from before ports grew: start them in 1451 and let the years pass.
  S.ports = Object.fromEntries(PORTS.map((p) => [p.id, fresh(p.id, 0)]));
  S.portHistory = [];
  if (S.day > 0) grow(S, S.day, null, 0);
  return S.ports;
}

function fresh(id, day) {
  const st = START[id] || { size: 1000, grow: 0.005 };
  return { size: st.size, born: st.size, trade: 0, depthAdd: 0, mark: { day, size: st.size }, trend: 0 };
}

// The yearly growth rate of a port now.
function rateOf(S, id, year, market) {
  const st = START[id] || { grow: 0.005 };
  let r = GROWTH_UNTIL[id] && year >= GROWTH_UNTIL[id] ? 0.01 : st.grow;
  r += Math.min(TUNING.tradeMax, 0.01 * (S.ports[id].trade || 0) / TUNING.tradePerPoint);
  if (market?.closed?.(id)) r -= 0.12; // plague or blockade empties a town
  return r;
}

// Let `days` pass from `from` (default S.day - days): growth, trade, history and works.
// Returns messages for news of history and harbour works.
export function grow(S, days, market, from = S.day - days) {
  const msgs = [];
  if (!S.ports) return msgs;
  const year = yearOf(from + days);
  for (const p of PORTS) {
    const P = S.ports[p.id];
    if (!P) continue;
    const vol = market?.vol?.[p.id] || 0;
    P.trade = (P.trade || 0) * Math.exp(-days / 365) + vol;
    P.size *= Math.exp(rateOf(S, p.id, year, market) * days / 365);
    // trend over roughly the last year
    if (from + days - P.mark.day >= 365) {
      P.trend = Math.log(P.size / P.mark.size) / ((from + days - P.mark.day) / 365);
      P.mark = { day: from + days, size: P.size };
    }
    const w = WORKS[p.id];
    if (w && !P.works && P.size >= w.at) {
      P.works = true;
      P.depthAdd = (P.depthAdd || 0) + w.depth;
      msgs.push({ html: `<b>News:</b> ${w.text}`, kind: 'discover', port: p.id, log: w.text });
    }
  }
  if (market?.vol) market.vol = {};
  S.portHistory = S.portHistory || [];
  for (const [i, h] of HISTORY.entries()) {
    if (S.portHistory.includes(i) || year < h.year) continue;
    S.portHistory.push(i);
    const P = S.ports[h.port];
    if (!P) continue;
    if (h.size) P.size *= h.size;
    if (h.depth) P.depthAdd = (P.depthAdd || 0) + h.depth;
    if (h.opens && S.discovered && !S.discovered[h.port]) S.discovered[h.port] = true; // charted by the crown's pilots
    msgs.push({ html: `<b>News:</b> ${h.text}`, kind: 'discover', port: h.port, log: h.text, opens: h.opens ? h.port : null });
  }
  return msgs;
}

// How much each unit traded moves the price, against 1451: a bigger port, a deeper market.
export function depthScale(S, id) {
  const P = S.ports?.[id];
  if (!P) return 1;
  return Math.max(TUNING.depthMin, Math.min(2, Math.pow(P.born / P.size, TUNING.depthExp)));
}

// ---- Depth at the berth, and ships' boats ---------------------------------------------

// The river bars rise in the rains (peak in September) and fall in the dry season (March).
export function seasonAdd(day) {
  const d = new Date(START_DATE.getTime() + Math.floor(day) * 86400000);
  const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  return 0.55 * Math.cos(2 * Math.PI * (doy - 258) / 365) + 0.25;
}

export function depthOf(S, id, day = S.day) {
  const h = HARBOURS[id] || { depth: 5 };
  const d = h.depth + (S.ports?.[id]?.depthAdd || 0) + (h.seasonal ? seasonAdd(day) : 0);
  return Math.round(d * 10) / 10;
}

export function seasonText(id, day) {
  if (!HARBOURS[id]?.seasonal) return '';
  const a = seasonAdd(day);
  return a > 0.45 ? 'The rains are in: the water is high.' : a < -0.1 ? 'The dry season: the water is low.' : '';
}

// Whether a ship of this hull, with her hold this full, must anchor off and use her boats.
export function needsBoats(S, id, hullId, load) {
  return draftOf(hullId, load) > depthOf(S, id);
}

// A river port: whether she can get up the river with her hold this full.
export function canGoUpriver(S, id, hullId, load) {
  const r = Object.values(RIVERS).find((x) => x.port === id);
  if (!r) return true;
  return draftOf(hullId, load) <= depthOf(S, id);
}

export const BOAT_FEE = 0.5; // cz a unit to the local boatmen
// Days her boats take to move `units` at this port, and the boatmen's fee.
export function boatWork(id, hullId, units, deep = false) {
  const nm = anchorage(id, deep).nm;
  const rate = boatRate(hullId, nm);
  return { days: units / rate, fee: Math.round(units * BOAT_FEE * (nm > 15 ? 2 : 1)), rate, nm };
}

export function portLine(S, id) {
  const P = S.ports?.[id];
  if (!P) return '';
  const n = P.size >= 10000 ? Math.round(P.size / 1000) * 1000 : P.size >= 1000 ? Math.round(P.size / 100) * 100 : Math.round(P.size / 10) * 10;
  const t = P.trend > 0.015 ? 'growing' : P.trend < -0.01 ? 'shrinking' : 'steady';
  return { tier: tierOf(P.size), people: n, trend: t };
}

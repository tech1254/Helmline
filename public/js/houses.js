// Rival houses (the design doc, phase 2): named merchant houses that trade the same ports as you,
// grow with their trade, and hold a share of each port's business. Every port's trade is split
// between its local merchants, the houses that work it, and you; your share grows with what you
// buy and sell there. Where the houses hold sway, prices narrow (competition.js). They are gentle
// while you are small and sharpen as you grow. A house that loses its trade sells its ships and
// can be ruined; a weakened house can be bought out, and its share of every port becomes yours.
// The Houses of the Sea ledger ranks them all. Pure rules: no browser modules.

import { PORTS, distNm } from './world.js';
import { yearOf } from './ships.js';
import { worth as yourWorth } from './ambitions.js';

export const HOUSES = [
  { id: 'salvago', name: 'Salvago', of: 'Genoa', home: 'genoa', colour: '#2f5d8a', from: 1451, wealth: 9000, ships: 3,
    ports: ['genoa', 'valencia', 'cadiz', 'lisbon', 'safi', 'funchal', 'bruges', 'antwerp'],
    style: 'Genoese bankers, lenders to every crown: they buy up markets and back your rivals.' },
  { id: 'santangel', nation: 'portugal', name: 'Santángel', of: 'Valencia', home: 'valencia', colour: '#a2402a', from: 1451, wealth: 6000, ships: 3,
    ports: ['valencia', 'seville', 'sanlucar', 'cadiz', 'lanzarote', 'gomera', 'safi', 'algiers', 'genoa'],
    style: 'Merchants and bankers of Valencia with friends at the courts of Aragon and Castile.' },
  { id: 'gomes', nation: 'castile', name: 'Gomes', of: 'Lisbon', home: 'lisbon', colour: '#3f6b3a', from: 1451, wealth: 5000, ships: 3,
    ports: ['lisbon', 'lagos', 'porto', 'funchal', 'ceuta', 'arguin', 'gambia', 'bruges'],
    style: 'Lisbon merchants with friends at court, hungry for the Guinea trade.' },
  { id: 'marchionni', name: 'Marchionni', of: 'Florence', home: 'lisbon', colour: '#6d4a85', from: 1470, wealth: 15000, ships: 4,
    ports: ['lisbon', 'funchal', 'mina', 'saotome', 'antwerp', 'genoa', 'calicut'],
    style: 'A rich and careful Florentine house in Lisbon, after sugar, gold and the spice trade.' },
  { id: 'thorne', name: 'Thorne', of: 'Bristol', home: 'bristol', colour: '#8a6a2e', from: 1520, wealth: 12000, ships: 5,
    ports: ['bristol', 'galway', 'lisbon', 'sanlucar', 'stjohns', 'santodomingo'],
    style: 'Bristol merchants grown rich on the New Found Land fisheries, with an eye on the Indies.' },
  { id: 'schetz', name: 'Schetz', of: 'Antwerp', home: 'antwerp', colour: '#2f6a6a', from: 1520, wealth: 20000, ships: 5,
    ports: ['antwerp', 'bruges', 'lisbon', 'genoa', 'funchal'],
    style: 'Antwerp financiers of copper and spice, the richest house in the north.' },
];

const TUNE = {
  local: 4, // the weight of a port's own merchants
  perShip: 2.2, // a house's weight, spread over its ports (more at home)
  youPer: 300, // cz traded in a port (fading monthly) for each point of your weight
  fade: 0.82, // what is left of your trade weight after a month
  shipCost: 2200, // what a house pays for a ship
  maxShips: 14,
  pressure: 0.55, // how much a house's share narrows prices, at full aggression
};
const MONTH = 30;
const portById = (id) => PORTS.find((p) => p.id === id);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export const defOf = (id) => HOUSES.find((h) => h.id === id);
export const playable = (S) => HOUSES.filter((h) => !h.nation || h.nation === (S.nation || 'portugal'));

export function ensureHouses(S) {
  if (!S.houses) S.houses = { h: {}, you: {}, held: {}, last: S.day, told: {}, vessels: {} };
  const H = S.houses;
  const y = yearOf(S.day);
  for (const d of playable(S)) {
    if (!H.h[d.id] && y >= d.from) H.h[d.id] = { wealth: d.wealth, ships: d.ships, since: S.day, status: 'trading' };
  }
  return H;
}
export const active = (S) => Object.entries(ensureHouses(S).h).filter(([, h]) => h.status === 'trading').map(([id]) => id);

// How hard the houses push: gently while you are small, harder as your house grows.
export function aggression(S) {
  return Math.max(0.35, Math.min(1, 0.35 + yourWorth(S) / 25000));
}

// Each party's weight in a port: { local, you, <house id>: weight }.
function weights(S, pid) {
  const H = ensureHouses(S);
  const w = { local: TUNE.local, you: (H.you[pid] || 0) / TUNE.youPer + (H.held[pid] || 0) };
  for (const id of active(S)) {
    const d = defOf(id), h = H.h[id];
    if (!d.ports.includes(pid)) continue;
    const spread = TUNE.perShip * h.ships / d.ports.length;
    w[id] = spread * (pid === d.home ? 2.5 : 1) * aggression(S);
  }
  return w;
}

// The shares of a port's trade, summing to 1: { local, you, <house id> }.
export function shares(S, pid) {
  const w = weights(S, pid);
  const t = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t]));
}

// Who leads a port's trade among the houses and you (not its local merchants), if anyone does.
export function leader(S, pid, min = 0.25) {
  const sh = shares(S, pid);
  let best = null;
  for (const [k, v] of Object.entries(sh)) if (k !== 'local' && v >= min && (!best || v > sh[best])) best = k;
  return best;
}

// How much the houses narrow prices in a port, 0..1 (competition.js folds it in).
export function pressure(S, pid) {
  const sh = shares(S, pid);
  let p = 0;
  for (const [k, v] of Object.entries(sh)) if (k !== 'local' && k !== 'you') p += v;
  return Math.min(0.8, p * TUNE.pressure);
}

// Your trade in a port (any purchase or sale, yours or your captains'), in cruzados.
export function noteTrade(S, pid, amount) {
  if (!pid || !amount) return;
  const H = ensureHouses(S);
  H.you[pid] = (H.you[pid] || 0) + Math.abs(amount);
}

// A house's worth: its money and its ships.
export const houseWorth = (h) => Math.max(0, h.wealth) + h.ships * TUNE.shipCost * 0.7;

// Days pass: houses earn, buy or sell ships, rise and fall; your weight fades. Returns news.
export function tick(S) {
  const H = ensureHouses(S);
  const msgs = [];
  const y = yearOf(S.day);
  for (const d of playable(S)) {
    if (H.h[d.id] && !H.told[d.id]) {
      H.told[d.id] = true;
      if (H.h[d.id].since > 0) msgs.push({ html: `<b>News:</b> the house of <b>${d.name}</b> of ${d.of} opens for business. ${d.style}`, kind: 'port', log: `The ${d.name} of ${d.of} open their house.` });
    }
  }
  while (S.day - H.last >= MONTH) {
    H.last += MONTH;
    for (const pid of Object.keys(H.you)) { H.you[pid] *= TUNE.fade; if (H.you[pid] < 1) delete H.you[pid]; }
    const a = aggression(S);
    const yr = yearOf(S.day);
    for (const id of active(S)) {
      const d = defOf(id), h = H.h[id];
      // A house moves towards the size its trade can carry: more as the century's trade grows
      // and as it pushes harder, less where you have taken its ports from it.
      let share = 0;
      for (const pid of d.ports) share += shares(S, pid)[id] || 0;
      share /= d.ports.length;
      const hold = Math.max(0.15, Math.min(1.5, share / 0.12));
      const target = d.wealth * (1 + Math.max(0, yr - d.from) * 0.05) * (0.6 + 0.8 * a) * hold;
      const w = houseWorth(h);
      const next = w + (target - w) * 0.06 + (Math.random() - 0.5) * 0.02 * w;
      const ships = Math.max(1, Math.min(TUNE.maxShips, Math.round(next / 3000)));
      if (ships < h.ships) msgs.push({ html: `The house of <b>${d.name}</b> sells a ship: its trade is falling away.`, kind: '', log: `The ${d.name} sell a ship.` });
      h.ships = ships;
      h.wealth = next - ships * TUNE.shipCost * 0.7;
      if (next < d.wealth * 0.25) {
        h.status = 'ruined'; h.ended = S.day;
        msgs.push({ html: `<b>News:</b> the house of <b>${d.name}</b> of ${d.of} is ruined. Its factors close their doors.`, kind: 'discover', log: `The ${d.name} are ruined.` });
      }
    }
  }
  if (y && !H.year) H.year = y;
  return msgs;
}

// The Houses of the Sea: everyone ranked by worth, with the ports each leads.
export function ledger(S) {
  const H = ensureHouses(S);
  const portsLed = {};
  for (const p of PORTS) {
    if (!S.discovered?.[p.id] || p.beyond) continue;
    const l = leader(S, p.id);
    if (l) portsLed[l] = (portsLed[l] || 0) + 1;
  }
  const rows = [{ id: 'you', name: S.story?.house ? `${S.story.house} (you)` : 'Your house', worth: yourWorth(S), ships: 1 + (S.fleet?.ships?.length || 0), led: portsLed.you || 0, status: 'trading' }];
  for (const [id, h] of Object.entries(H.h)) {
    const d = defOf(id);
    rows.push({ id, name: `${d.name} of ${d.of}`, worth: h.status === 'trading' ? houseWorth(h) : 0, ships: h.status === 'trading' ? h.ships : 0, led: portsLed[id] || 0, status: h.status, colour: d.colour });
  }
  return rows.sort((a, b) => (b.status === 'trading') - (a.status === 'trading') || b.worth - a.worth);
}

// Buying out a house: possible once your house is worth twice as much; the price is its worth
// and a tenth more. Its share of every port becomes yours.
export function buyOutPrice(S, id) {
  const h = ensureHouses(S).h[id];
  if (!h || h.status !== 'trading') return null;
  const price = Math.round(houseWorth(h) * 1.1 / 100) * 100;
  const ok = yourWorth(S) >= 2 * houseWorth(h);
  return { price, ok, why: ok ? (S.purse < price ? `you need ${fmt(price)} cz in your purse` : '') : 'your house must be worth twice theirs' };
}

export function buyOut(S, id) {
  const q = buyOutPrice(S, id);
  if (!q || !q.ok || S.purse < q.price) return null;
  const H = ensureHouses(S), d = defOf(id), h = H.h[id];
  for (const pid of d.ports) H.held[pid] = (H.held[pid] || 0) + (weights(S, pid)[id] || 0);
  S.purse -= q.price;
  h.status = 'bought'; h.ended = S.day;
  if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 10;
  return { price: q.price, html: `You buy out the house of <b>${d.name}</b> of ${d.of} for <b>${fmt(q.price)} cz</b>. Its factors and its custom in ${d.ports.map((p) => portById(p).name).join(', ')} are yours now.`, log: `Bought out the ${d.name} for ${q.price} cz.` };
}

// ---- Their ships on the chart --------------------------------------------------------------
// A few of each house's ships sail between its ports, so the rivals can be seen at work. Each
// vessel keeps its current passage: from, to, the day it left and how many days it takes.
export function vessels(S) {
  const H = ensureHouses(S);
  const out = [];
  for (const id of active(S)) {
    const d = defOf(id), h = H.h[id];
    const n = Math.min(3, h.ships);
    const list = (H.vessels[id] = (H.vessels[id] || []).slice(0, n));
    for (let i = 0; i < n; i++) {
      let v = list[i];
      const open = d.ports.filter((p) => portById(p) && !portById(p).beyond && (!portById(p).from || portById(p).from <= yearOf(S.day)) && !portById(p).river);
      if (!v || S.day >= v.start + v.days) {
        const from = v ? v.to : open[(i * 3) % open.length];
        const choices = open.filter((p) => p !== from);
        const seed = Math.floor(S.day) + i * 7 + id.length * 13;
        const to = choices[seed % choices.length];
        const a = portById(from), b = portById(to);
        const days = Math.max(3, distNm(a.lon, a.lat, b.lon, b.lat) * 1.25 / 95);
        v = list[i] = { from, to, start: v ? v.start + v.days + 2 : S.day - (i * 4) % Math.max(3, days), days, hull: h.ships > 6 && i === 0 ? 'carrack' : 'nau' };
      }
      out.push({ house: id, colour: d.colour, name: d.name, ...v, t: Math.max(0, Math.min(1, (S.day - v.start) / v.days)) });
    }
  }
  return out;
}

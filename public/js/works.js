// Port works (the design doc, phase 3): what a house builds in the ports it trades with. Money
// goes in (building and upkeep) and, from a trading post, comes back out; every building raises
// your share of the port's trade against the rival houses (houses.js), and each does work of its
// own. Building takes weeks; upkeep is paid monthly, and a building whose upkeep goes unpaid
// stands neglected and does nothing until it is paid again. The trading post is the feitoria
// (investments.js), which now also earns. Pure rules: no browser modules.

import { PORTS, distNm } from './world.js';
import { home } from './nations.js';
import * as Wear from './wear.js';
import * as Investments from './investments.js';

const size = (S, pid) => S.ports?.[pid]?.size || 1000;
const round = (n) => Math.round(n / 100) * 100;
const portById = (id) => PORTS.find((p) => p.id === id);
const MONTH = 30;

// cost(S, pid); upkeep a month; days to build; standing needed; weight in the port's trade.
export const BUILDINGS = {
  quay: { id: 'quay', name: 'Quay', cost: (S, pid) => round(1500 + size(S, pid) * 0.04), upkeep: 15, days: 45, standing: 0, weight: 0.6,
    does: 'Your ships berth alongside here whatever their draught, and their cargo is worked twice as fast.' },
  warehouse: { id: 'warehouse', name: 'Warehouse', cost: (S, pid) => round(1200 + size(S, pid) * 0.03), upkeep: 12, days: 30, standing: 0, weight: 0.8, store: 200,
    does: 'Store up to 200 units of cargo here, and sell when the price is right.' },
  post: { id: 'post', name: 'Trading post (feitoria)', cost: (S, pid) => Investments.feitoriaCost(S, pid), upkeep: 0 /* the factor's daily wage is its upkeep (investments.js) */, days: 0, standing: Investments.FEITORIA_STANDING, weight: 1.5,
    does: `A factor of your own: prices ${Math.round(Investments.FEITORIA_EDGE * 100)}% better here, an extra contract, and a share of the trade he does between your visits.` },
  fort: { id: 'fort', name: 'Fort', cost: (S, pid) => round(5000 + size(S, pid) * 0.08), upkeep: 45, days: 120, standing: 40, weight: 1.2,
    does: 'Corsairs give the waters within 300 miles a wide berth, and the rival houses hold half the sway here.' },
  yard: { id: 'yard', name: 'Shipyard', cost: (S, pid) => round(3500 + size(S, pid) * 0.05), upkeep: 30, days: 90, standing: 30, weight: 1,
    does: 'Repairs and refits here, as at home.' },
  church: { id: 'church', name: 'Church and hospital', cost: (S, pid) => round(2500 + size(S, pid) * 0.03), upkeep: 20, days: 90, standing: 0, weight: 0.5,
    does: 'Your sick are tended and the town remembers your name: standing and renown when it is done.' },
  // Only at your own haven, the hidden cove (law.js): the pirate path's port works.
  stockade: { id: 'stockade', name: 'Stockade and careening beach', cost: () => 3000, upkeep: 20, days: 60, standing: 0, weight: 0, only: 'cove',
    does: 'Your own haven: prizes fetch four-fifths of their worth here instead of half, your crew spend their shares ashore and come back content, and you can careen and refit.' },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);
// What can be built in a port: at the hidden cove only a stockade, a quay and a warehouse.
const COVE_WORKS = ['stockade', 'quay', 'warehouse'];
export const buildingsAt = (pid) => BUILDING_IDS.filter((id) => (pid === 'cove' ? COVE_WORKS.includes(id) : !BUILDINGS[id].only));
export const FORT_REACH_NM = 300;

export function ensureWorks(S) {
  if (!S.works) S.works = { at: {}, last: S.day, told: {} };
  const W = S.works;
  // the feitorias founded before there were port works are trading posts
  for (const pid of Object.keys(Investments.ensureInvest(S).feitorias)) {
    W.at[pid] = W.at[pid] || {};
    if (!W.at[pid].post) W.at[pid].post = { since: S.invest.feitorias[pid].since, ready: S.invest.feitorias[pid].since };
  }
  return W;
}

const atPort = (S, pid) => ensureWorks(S).at[pid] || {};
// A building that is finished and kept up.
export const has = (S, pid, id) => { const b = atPort(S, pid)[id]; return !!(b && S.day >= b.ready && !b.neglected); };
export const building = (S, pid, id) => atPort(S, pid)[id] || null;
export function list(S) {
  const out = [];
  for (const [pid, bs] of Object.entries(ensureWorks(S).at)) for (const [id, b] of Object.entries(bs)) out.push({ pid, id, ...b, done: S.day >= b.ready });
  return out;
}

// Whether a building can be put up here, and if not, why not.
export function canBuild(S, pid, id) {
  const B = BUILDINGS[id], p = portById(pid);
  if (!B || !p || !buildingsAt(pid).includes(id)) return { ok: false, why: 'unknown' };
  if (atPort(S, pid)[id]) return { ok: false, why: S.day < atPort(S, pid)[id].ready ? 'Being built.' : 'Already yours.' };
  if (p.beyond) return { ok: false, why: 'Too far from home to build.' };
  if (id === 'post' && pid === home(S)) return { ok: false, why: 'Home: your own house does a factor\'s work here.' };
  if (id === 'yard' && Wear.YARDS.includes(pid)) return { ok: false, why: 'There is a shipyard here already.' };
  if ((S.contracts?.standing ?? 0) < B.standing) return { ok: false, why: `The crown licenses this only to captains of standing ${B.standing} or more.` };
  const cost = B.cost(S, pid);
  if (S.purse < cost) return { ok: false, why: `It would cost ${cost.toLocaleString()} cz.`, cost };
  return { ok: true, cost };
}

// Put it up: pays now; ready after its days. Returns the cost, or null.
export function build(S, pid, id) {
  const c = canBuild(S, pid, id);
  if (!c.ok) return null;
  if (id === 'post') { // the feitoria, as before
    if (!Investments.found(S, pid)) return null;
  } else {
    S.purse -= c.cost;
  }
  const W = ensureWorks(S);
  W.at[pid] = W.at[pid] || {};
  W.at[pid][id] = { since: S.day, ready: S.day + BUILDINGS[id].days, cost: c.cost };
  if (id === 'warehouse') W.at[pid][id].store = {};
  return c.cost;
}

// Your weight in a port's trade from what you have built there (houses.js adds it to yours).
export function weight(S, pid) {
  let w = 0;
  for (const id of BUILDING_IDS) if (has(S, pid, id)) w += BUILDINGS[id].weight;
  return w;
}

// How much a fort cuts the rival houses' sway in a port (1 = none).
export const houseDamp = (S, pid) => (has(S, pid, 'fort') ? 0.5 : 1);

// How much your forts cut the chance of corsairs here (1 = not at all).
export function corsairDamp(S, lon, lat) {
  for (const { pid, id } of list(S)) {
    if (id !== 'fort' || !has(S, pid, 'fort')) continue;
    const p = portById(pid);
    if (distNm(lon, lat, p.lon, p.lat) < FORT_REACH_NM) return 0.35;
  }
  return 1;
}

// A shipyard: the crown's yards and your own.
export const isYard = (S, pid) => Wear.YARDS.includes(pid) || (S ? has(S, pid, 'yard') || has(S, pid, 'stockade') : false);

// Your ships berth alongside here whatever their draught; cargo moves twice as fast.
export const quay = (S, pid) => has(S, pid, 'quay');

// ---- The warehouse ----------------------------------------------------------------------------
export function stored(S, pid) {
  const b = building(S, pid, 'warehouse');
  return b && S.day >= b.ready ? b.store : null;
}
export const storedUnits = (S, pid) => Object.values(stored(S, pid) || {}).reduce((t, v) => t + (v.n || 0), 0);
export const room = (S, pid) => (stored(S, pid) ? BUILDINGS.warehouse.store - storedUnits(S, pid) : 0);

// Move n of a good from the hold into the warehouse, with what it cost.
export function storeGoods(S, pid, good, n) {
  const st = stored(S, pid);
  if (!st) return 0;
  n = Math.min(n, S.cargo[good] || 0, room(S, pid));
  if (n <= 0) return 0;
  const paid = (S.paid?.[good] || 0) * n / S.cargo[good];
  S.cargo[good] -= n;
  S.paid[good] = (S.paid[good] || 0) - paid;
  const s = (st[good] = st[good] || { n: 0, paid: 0 });
  s.n += n; s.paid += paid;
  return n;
}

// Take n of a good out of the warehouse into the hold (room in the hold is checked by the caller).
export function takeGoods(S, pid, good, n) {
  const st = stored(S, pid);
  const s = st?.[good];
  if (!s) return 0;
  n = Math.min(n, s.n);
  if (n <= 0) return 0;
  const paid = s.paid * n / s.n;
  s.n -= n; s.paid -= paid;
  if (s.n <= 0) delete st[good];
  S.cargo[good] = (S.cargo[good] || 0) + n;
  S.paid = S.paid || {};
  S.paid[good] = (S.paid[good] || 0) + paid;
  return n;
}

// ---- Upkeep and the trading posts' earnings, monthly -----------------------------------------
// Returns { msgs, upkeep, income } for the accounts.
export function tick(S, away = false) {
  const W = ensureWorks(S);
  const msgs = [];
  let upkeep = 0, income = 0;
  for (const b of list(S)) {
    if (b.done && !W.told[`${b.pid}:${b.id}`]) {
      W.told[`${b.pid}:${b.id}`] = true;
      if (b.ready > b.since) msgs.push({ html: `Your <b>${BUILDINGS[b.id].name.toLowerCase()}</b> at ${portById(b.pid).name} is finished.`, kind: 'discover', log: `${BUILDINGS[b.id].name} finished at ${portById(b.pid).name}.`, finished: b });
    }
  }
  while (S.day - W.last >= MONTH) {
    W.last += MONTH;
    const lapsed = {}, revived = {};
    for (const b of list(S)) {
      if (!b.done) continue;
      const rec = W.at[b.pid][b.id];
      const due = BUILDINGS[b.id].upkeep;
      if (!due) { /* nothing to pay */ } else if (S.purse >= due || away) { // away, the house covers it (sim.js catchUp)
        S.purse -= due; upkeep += due;
        if (rec.neglected) { rec.neglected = false; (revived[b.pid] = revived[b.pid] || []).push(BUILDINGS[b.id].name.toLowerCase()); }
      } else if (!rec.neglected) {
        rec.neglected = true;
        (lapsed[b.pid] = lapsed[b.pid] || []).push(BUILDINGS[b.id].name.toLowerCase());
      }
      if (b.id === 'post' && !rec.neglected) {
        const earn = Math.round(15 + size(S, b.pid) / 1000 * 3);
        S.purse += earn; income += earn;
      }
    }
    const and = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0];
    for (const [pid, xs] of Object.entries(lapsed)) msgs.push({ html: `There is no money to keep up your ${and(xs.map((x) => `<b>${x}</b>`))} at ${portById(pid).name}: ${xs.length > 1 ? 'they stand' : 'it stands'} neglected and ${xs.length > 1 ? 'do' : 'does'} nothing until paid for.`, kind: 'danger', log: `Port works at ${portById(pid).name} neglected: ${and(xs)}.` });
    for (const [pid, xs] of Object.entries(revived)) msgs.push({ html: `Your ${and(xs)} at ${portById(pid).name} ${xs.length > 1 ? 'are' : 'is'} kept up again.`, kind: '', log: '' });
  }
  return { msgs, upkeep, income };
}

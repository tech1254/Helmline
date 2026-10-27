import * as Accounts from './accounts.js';
import * as Ships from './ships.js';
// Contracts: jobs from the crown and the merchant houses that give each voyage a goal.
// Two kinds for now:
//  - discover: chart and anchor at a port no one in Lisbon trades with yet, then report home.
//  - deliver:  bring N units of a good to the port that posted the offer, before a deadline.

import { GOODS } from './economy.js';
import { PORTS, distNm, findPath } from './world.js';

// Standing tiers and what each one earns the captain.
export const TIERS = [
  { min: 40, title: 'Trusted by the crown', payMult: 1.25, priceEdge: 0.06, maxActive: 4, offers: 4, shipyard: true, maxShips: 4 },
  { min: 20, title: 'Respected', payMult: 1.15, priceEdge: 0.04, maxActive: 3, offers: 3, shipyard: true, maxShips: 2 },
  { min: 5, title: 'Known on the quays', payMult: 1.05, priceEdge: 0, maxActive: 3, offers: 3, shipyard: true, maxShips: 1 },
  { min: -9, title: 'Unknown', payMult: 1, priceEdge: 0, maxActive: 3, offers: 2, shipyard: false, maxShips: 0 },
  { min: -Infinity, title: 'Unreliable', payMult: 0.9, priceEdge: 0, maxActive: 2, offers: 1, shipyard: false, maxShips: 0 },
];

export function perks(S) {
  const n = ensureContracts(S).standing;
  return TIERS.find((t) => n >= t.min);
}

export function nextTier(S) {
  const n = ensureContracts(S).standing;
  const higher = TIERS.filter((t) => t.min > n && Number.isFinite(t.min));
  return higher.length ? higher[higher.length - 1] : null;
}

export function maxActive(S) {
  return perks(S).maxActive;
}

export const MAX_ACTIVE = 3; // base limit; see maxActive() for the captain's current one
export const UNLOCK_PURSE = 500; // contracts open up once the captain has proven himself
const PREMIUM = 1.2; // contracts pay this much over the port's usual price
const FAIL_PENALTY = 5; // standing lost for a missed deadline or an abandoned contract

export const PATRONS = {
  lisbon: 'The merchants of Lisbon',
  lagos: 'The Casa de Lagos',
  funchal: 'The planters of Madeira',
  lanzarote: 'The governor of Lanzarote',
  arguin: 'The factor at Arguin',
  gambia: 'The Mandinka traders',
  serraleoa: 'The Temne chiefs',
  cestos: 'The headmen of the Grain Coast',
  mina: 'The Akan gold traders',
};

const portName = (id) => PORTS.find((p) => p.id === id).name;
const good = (id) => GOODS.find((g) => g.id === id);

export function ensureContracts(S) {
  if (!S.contracts) S.contracts = { unlocked: false, active: [], offers: {}, done: 0, failed: 0, standing: 0, nextId: 1 };
  return S.contracts;
}

// The first time the purse reaches UNLOCK_PURSE, contracts open and Prince Henry offers the first.
// Returns a message to show, or null.
export function maybeUnlock(S) {
  const C = ensureContracts(S);
  if (C.unlocked || S.purse < UNLOCK_PURSE) return null;
  C.unlocked = true;
  if (PORTS.some((p) => !S.discovered[p.id])) {
    C.active.push(discoveryContract(S));
    return { html: 'Word of your trading reaches Prince Henry. He has a contract for you: <b>find a new trading partner</b> beyond the known coast.', kind: 'discover', log: 'Prince Henry offered a contract: find a new trading partner.' };
  }
  return { html: 'Word of your trading has spread. Merchant houses now offer you <b>contracts</b> in port.', kind: 'discover', log: 'Contracts opened up.' };
}

export function standingTitle(n) {
  return TIERS.find((t) => n >= t.min).title;
}

// The opening contract: Prince Henry wants a new trading partner beyond the known coast.
export function discoveryContract(S) {
  const C = ensureContracts(S);
  return {
    id: C.nextId++,
    kind: 'discover',
    title: 'Find a new trading partner',
    patron: 'Prince Henry',
    text: 'Sail beyond the known coast and drop anchor at a port no Portuguese merchant trades with yet. Then report back to Lisbon.',
    known: PORTS.filter((p) => S.discovered[p.id]).map((p) => p.id),
    stage: 'find',
    reward: 400,
    standing: 10,
    accepted: S.day,
    deadline: null,
  };
}

// ---- Generating offers ---------------------------------------------------------------
// Every offer is checked to be completable: the goods are on sale at a charted port that is
// open, the destination genuinely wants them (its price clearly beats the source's), the
// cargo fits the hold and the captain's purse, and the deadline allows for a real passage.
const DEMAND_RATIO = 1.25; // destination price must beat the source's by this much
const NM_PER_DAY = 60; // a cautious pace, allowing for contrary winds
const REFRESH_DAYS = 15; // the whole board is reposted this often
const REFILL_DAYS = 7; // a taken offer is replaced after about a week

function routeNm(a, b) {
  const path = findPath(a.lon, a.lat, b.lon, b.lat);
  if (!path) return null;
  let nm = 0, lon = a.lon, lat = a.lat;
  for (const [x, y] of path) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
  return nm;
}

// All the deliveries that would make sense to post at `portId` right now.
function candidates(S, market, portId) {
  const C = ensureContracts(S);
  const here = PORTS.find((p) => p.id === portId);
  const known = PORTS.filter((p) => S.discovered[p.id] && !market.closed(p.id));
  const taken = new Set([...C.active, ...(C.offers[portId]?.list || [])].map((c) => `${c.good}>${c.to}`));
  const out = [];
  for (const g of GOODS) {
    // Wanted here: bring it in from the nearest charted source that sells it.
    if (!market.sells(portId, g.id) && !taken.has(`${g.id}>${portId}`)) {
      const sources = known.filter((p) => p.id !== portId && market.sells(p.id, g.id) &&
        market.sellPrice(portId, g.id) >= DEMAND_RATIO * market.buyPrice(p.id, g.id));
      const src = sources.sort((a, b) => distNm(a.lon, a.lat, here.lon, here.lat) - distNm(b.lon, b.lat, here.lon, here.lat))[0];
      if (src) out.push({ g, src, dest: here, kind: 'bring' });
    }
    // Made here: carry it out to a charted port that wants it.
    if (market.sells(portId, g.id)) {
      const dests = known.filter((p) => p.id !== portId && !taken.has(`${g.id}>${p.id}`) &&
        market.sellPrice(p.id, g.id) >= DEMAND_RATIO * market.buyPrice(portId, g.id));
      const dest = dests.sort((a, b) => market.sellPrice(b.id, g.id) - market.sellPrice(a.id, g.id))[0];
      if (dest) out.push({ g, src: here, dest, kind: 'carry' });
    }
  }
  return out;
}

function makeOffer(S, market, portId, cand) {
  const C = ensureContracts(S);
  const perk = perks(S);
  const { g, src, dest, kind } = cand;
  const here = PORTS.find((p) => p.id === portId);
  // Passage: here -> source (if elsewhere) -> destination.
  const nm1 = src.id === portId ? 0 : routeNm(here, src);
  const nm2 = routeNm(src, dest);
  if (nm1 == null || nm2 == null) return null;
  const unit = market.buyPrice(src.id, g.id);
  const budget = Math.max(120, Math.min(S.purse * 0.8, 3000));
  const most = Math.min(S.ship?.hull ? Ships.flagStats(S).hold : 40, Math.floor(budget / unit));
  const want = g.id === 'gold' ? 3 + Math.floor(Math.random() * 6) : 10 + 5 * Math.floor(Math.random() * 5);
  const qty = Math.min(want, most);
  if (qty < (g.id === 'gold' ? 2 : 5)) return null;
  const days = Math.round(((nm1 + nm2) / NM_PER_DAY) * 1.25 + 15 + Math.random() * 10);
  const cost = qty * unit;
  const reward = Math.round(Math.max(qty * market.basePrice(dest.id, g.id) * PREMIUM, cost * 1.35) * perk.payMult);
  return {
    id: C.nextId++,
    kind: 'deliver',
    good: g.id,
    qty,
    to: dest.id,
    source: src.id,
    patron: kind === 'carry' ? PATRONS[portId] : PATRONS[dest.id],
    title: kind === 'carry'
      ? `Carry ${qty} ${g.unit} of ${g.name.toLowerCase()} to ${dest.name}`
      : `Deliver ${qty} ${g.unit} of ${g.name.toLowerCase()} to ${here.name}`,
    reward,
    standing: 3,
    offeredDays: days,
  };
}

function fillOffers(S, market, portId, n) {
  const list = [];
  const pool = candidates(S, market, portId);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const cand of pool) {
    if (list.length >= n) break;
    if (list.some((o) => o.good === cand.g.id && o.to === cand.dest.id)) continue;
    const o = makeOffer(S, market, portId, cand);
    if (o) list.push(o);
  }
  return list;
}

export function offersAt(S, market, portId) {
  const C = ensureContracts(S);
  if (!C.unlocked) return [];
  const want = perks(S).offers;
  let o = C.offers[portId];
  if (!o || !o.refill || S.day - o.day > REFRESH_DAYS) {
    o = C.offers[portId] = { day: S.day, list: [], refill: [] };
    o.list = fillOffers(S, market, portId, want);
  }
  // Replace taken offers once their week is up.
  const due = o.refill.filter((d) => S.day >= d);
  if (due.length && o.list.length < want) {
    o.refill = o.refill.filter((d) => S.day < d);
    o.list.push(...fillOffers(S, market, portId, Math.min(due.length, want - o.list.length)));
  }
  return o.list;
}

export function nextOfferDay(S, portId) {
  const o = ensureContracts(S).offers[portId];
  if (!o) return null;
  const days = [...(o.refill || []), o.day + REFRESH_DAYS].filter((d) => d > S.day);
  return days.length ? Math.min(...days) : null;
}

export function accept(S, offerId, portId) {
  const C = ensureContracts(S);
  if (C.active.length >= maxActive(S)) return null;
  const list = C.offers[portId]?.list || [];
  const i = list.findIndex((o) => o.id === offerId);
  if (i < 0) return null;
  const [o] = list.splice(i, 1);
  const board = C.offers[portId];
  if (board) (board.refill = board.refill || []).push(S.day + REFILL_DAYS);
  const c = { ...o, accepted: S.day, deadline: S.day + o.offeredDays };
  C.active.push(c);
  return c;
}

export function canDeliver(S, c) {
  return c.kind === 'deliver' && S.ship.docked === c.to && S.cargo[c.good] >= c.qty;
}

// Complete or fail contracts. Returns messages for the game to show.
export function onDock(S, portId) {
  const C = ensureContracts(S);
  const msgs = [];
  for (const c of [...C.active]) {
    if (c.kind === 'discover') {
      if (c.stage === 'find' && !c.known.includes(portId)) {
        c.stage = 'report';
        c.found = portId;
        msgs.push({ html: `<b>${portName(portId)}</b> is a new trading partner! Report back to Lisbon for Prince Henry's reward.`, kind: 'discover' });
      } else if (c.stage === 'report' && portId === 'lisbon') {
        msgs.push(complete(S, c, `Prince Henry rewards you for opening trade with ${portName(c.found)}`));
      }
    } else if (c.kind === 'deliver' && portId === c.to) {
      if (S.cargo[c.good] >= c.qty) msgs.push({ html: `You can deliver the ${good(c.good).name.toLowerCase()} for your contract here. Open <b>Contracts</b>.`, kind: 'port' });
    }
  }
  return msgs;
}

export function deliver(S, c) {
  const have = S.cargo[c.good];
  const avg = have ? S.paid[c.good] / have : 0;
  S.cargo[c.good] -= c.qty;
  S.paid[c.good] = S.cargo[c.good] ? Math.max(0, S.paid[c.good] - avg * c.qty) : 0;
  return complete(S, c, `${c.patron} take delivery of ${c.qty} ${good(c.good).unit}`);
}

function complete(S, c, what) {
  const C = ensureContracts(S);
  C.active = C.active.filter((x) => x.id !== c.id);
  C.done++;
  C.standing += c.standing;
  S.purse += c.reward;
  Accounts.record(S, { kind: 'contract', amount: c.reward, text: `${c.title} (${c.patron})` });
  return { html: `${what}: <b>+${c.reward.toLocaleString()} cz</b>.`, kind: 'discover', log: `Contract done: ${c.title} (+${c.reward} cz).` };
}

export function abandon(S, c) {
  const C = ensureContracts(S);
  C.active = C.active.filter((x) => x.id !== c.id);
  C.failed++;
  C.standing -= FAIL_PENALTY;
}

// Called as time passes. Returns messages for contracts that ran out of time.
export function checkDeadlines(S) {
  const C = ensureContracts(S);
  const msgs = [];
  for (const c of [...C.active]) {
    if (c.deadline != null && S.day > c.deadline) {
      abandon(S, c);
      msgs.push({ html: `Contract lapsed: <b>${c.title}</b>. Your standing suffers.`, kind: '', log: `Missed the deadline: ${c.title}.` });
    }
  }
  return msgs;
}

// Ports the active contracts point at, for markers on the chart.
export function targets(S) {
  const C = ensureContracts(S);
  const t = new Set();
  for (const c of C.active) {
    if (c.kind === 'deliver') t.add(c.to);
    if (c.kind === 'discover' && c.stage === 'report') t.add('lisbon');
  }
  return t;
}

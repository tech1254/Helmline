// Contracts: jobs from the crown and the merchant houses that give each voyage a goal.
// Two kinds for now:
//  - discover: chart and anchor at a port no one in Lisbon trades with yet, then report home.
//  - deliver:  bring N units of a good to the port that posted the offer, before a deadline.

import { GOODS } from './economy.js';
import { PORTS, distNm } from './world.js';

// Standing tiers and what each one earns the captain.
export const TIERS = [
  { min: 40, title: 'Trusted by the crown', payMult: 1.25, priceEdge: 0.06, maxActive: 4, offers: 3, shipyard: true },
  { min: 20, title: 'Respected', payMult: 1.15, priceEdge: 0.04, maxActive: 3, offers: 3, shipyard: true },
  { min: 5, title: 'Known on the quays', payMult: 1.05, priceEdge: 0, maxActive: 3, offers: 2, shipyard: true },
  { min: -9, title: 'Unknown', payMult: 1, priceEdge: 0, maxActive: 3, offers: 2, shipyard: false },
  { min: -Infinity, title: 'Unreliable', payMult: 0.9, priceEdge: 0, maxActive: 2, offers: 1, shipyard: false },
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
const OFFER_REFRESH_DAYS = 30;
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

// Offers posted at a port: goods it does not produce, from a source the captain has charted.
function makeOffers(S, market, portId) {
  const C = ensureContracts(S);
  const known = PORTS.filter((p) => S.discovered[p.id]);
  const here = PORTS.find((p) => p.id === portId);
  const options = [];
  for (const g of GOODS) {
    if (market.sells(portId, g.id)) continue;
    const sources = known.filter((p) => p.id !== portId && market.sells(p.id, g.id));
    if (!sources.length) continue;
    const src = sources.reduce((a, b) => (distNm(a.lon, a.lat, here.lon, here.lat) < distNm(b.lon, b.lat, here.lon, here.lat) ? a : b));
    options.push({ g, src });
  }
  // Shuffle, then take a few.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const perk = perks(S);
  return options.slice(0, perk.offers).map(({ g, src }) => {
    const qty = g.id === 'gold' ? 3 + Math.floor(Math.random() * 5) : 10 + 5 * Math.floor(Math.random() * 5);
    const nm = distNm(here.lon, here.lat, src.lon, src.lat) * 2;
    const days = Math.round(nm / 75 + 20 + Math.random() * 15);
    return {
      id: C.nextId++,
      kind: 'deliver',
      good: g.id,
      qty,
      to: portId,
      source: src.id,
      patron: PATRONS[portId],
      title: `Deliver ${qty} ${g.unit} of ${g.name.toLowerCase()} to ${here.name}`,
      reward: Math.round(qty * market.basePrice(portId, g.id) * PREMIUM * perk.payMult),
      standing: 3,
      offeredDays: days,
    };
  });
}

export function offersAt(S, market, portId) {
  const C = ensureContracts(S);
  if (!C.unlocked) return [];
  const o = C.offers[portId];
  if (!o || S.day - o.day > OFFER_REFRESH_DAYS) C.offers[portId] = { day: S.day, list: makeOffers(S, market, portId) };
  return C.offers[portId].list;
}

export function accept(S, offerId, portId) {
  const C = ensureContracts(S);
  if (C.active.length >= maxActive(S)) return null;
  const list = C.offers[portId]?.list || [];
  const i = list.findIndex((o) => o.id === offerId);
  if (i < 0) return null;
  const [o] = list.splice(i, 1);
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

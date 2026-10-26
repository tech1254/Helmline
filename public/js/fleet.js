// The fleet: extra caravels run by hired captains on a trade route between two ports.
// They sail the same winds and trade in the same markets as the player, so their
// buying and selling moves real prices. Money comes from, and goes to, the player's purse.

import { PORTS, findPath, windAt, sailFactor, angleDiff, bearing, distNm, D2R } from './world.js';
import { GOODS } from './economy.js';

export const SHIP_COST = 1500;
export const MAX_SHIPS = 1; // extra ships beyond the player's own, for now
const HOLD = 40;
const KNOTS = 5;
export const SHIP_UPKEEP = 2; // cz a day, on top of the captain's wage
const RESERVE = 150; // a captain never spends the last of the purse
const MARGIN = 0.8; // he pays at most 80% of what he expects to sell for
// Loyalty: a captain left alone too long starts to stray.
export const LOYALTY_SKIM = 50; // below this he keeps part of each sale
export const LOYALTY_DESERT = 20; // below this he goes ashore and stops sailing
const SKIM_SHARE = 0.15;
const LOYALTY_REGAIN_PER_DAY = 0.3; // while the owner is playing
// With nothing worth loading, a captain waits in port on half pay for prices to recover,
// rechecking daily, before giving up and sailing empty.
const MAX_WAIT_DAYS = 12;
export const IDLE_PAY = 0.5;
const CANDIDATE_DAYS = 30;

const SHIP_NAMES = ['Santa Clara', 'São Jorge', 'Bom Jesus', 'Espírito Santo', 'Santa Maria', 'São Gabriel'];
const FIRST = ['Diogo', 'Gil', 'Nuno', 'Álvaro', 'Pêro', 'João', 'Fernão', 'Estêvão', 'Gonçalo', 'Afonso', 'Martim', 'Lopo'];
const LAST = ['Eanes', 'Tristão', 'Dias', 'Gomes', 'da Costa', 'Lourenço', 'Pires', 'Teixeira', 'Velho', 'de Freitas', 'Cerveira', 'Vaz'];

const port = (id) => PORTS.find((p) => p.id === id);
const good = (id) => GOODS.find((g) => g.id === id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function ensureFleet(S) {
  if (!S.fleet) S.fleet = { ships: [], candidates: null, nextId: 1 };
  return S.fleet;
}

// Captains looking for a ship in Lisbon this month.
export function candidates(S) {
  const F = ensureFleet(S);
  if (!F.candidates || S.day - F.candidates.day > CANDIDATE_DAYS) {
    const list = [];
    for (let i = 0; i < 3; i++) {
      const nav = 1 + Math.floor(Math.random() * 5);
      const trade = 1 + Math.floor(Math.random() * 5);
      list.push({ id: F.nextId++, name: `${pick(FIRST)} ${pick(LAST)}`, nav, trade, wage: 1 + Math.round((nav + trade) / 3), loyalty: 100 });
    }
    F.candidates = { day: S.day, list };
  }
  return F.candidates.list;
}

export function canBuy(S) {
  return ensureFleet(S).ships.length < MAX_SHIPS;
}

export function buyShip(S, captainId) {
  const F = ensureFleet(S);
  const cap = (F.candidates?.list || []).find((c) => c.id === captainId);
  if (!cap || S.purse < SHIP_COST || !canBuy(S)) return null;
  F.candidates.list = F.candidates.list.filter((c) => c !== cap);
  const used = new Set(F.ships.map((s) => s.name));
  const name = SHIP_NAMES.find((n) => !used.has(n)) || `Caravel ${F.nextId}`;
  const ship = { id: F.nextId++, name, captain: cap, at: 'lisbon', status: 'idle', route: null, leg: null, cargo: null, profit: 0, trips: 0, last: null };
  F.ships.push(ship);
  S.purse -= SHIP_COST;
  return ship;
}

// Time away wears down a captain's loyalty: nothing for a night's sleep or a working day,
// then steadily.
export const STRAY_AFTER_HOURS = 16;
export function strayWhileAway(S, hoursAway) {
  const F = ensureFleet(S);
  const out = [];
  if (hoursAway <= STRAY_AFTER_HOURS) return out;
  const loss = Math.min(40, (hoursAway - STRAY_AFTER_HOURS) * 5);
  for (const ship of F.ships) {
    const before = ship.captain.loyalty ?? 100;
    ship.captain.loyalty = Math.max(0, before - loss);
    out.push({ name: ship.name, captain: ship.captain.name, before: Math.round(before), after: Math.round(ship.captain.loyalty) });
  }
  return out;
}

export function loyaltyText(l) {
  const n = Math.round(l ?? 100);
  if (n >= 80) return `loyal (${n})`;
  if (n >= LOYALTY_SKIM) return `restless (${n})`;
  if (n >= LOYALTY_DESERT) return `straying (${n}): keeps part of each sale`;
  return `disloyal (${n}): about to go ashore`;
}

export function dailyCost(ship) {
  return SHIP_UPKEEP + ship.captain.wage;
}

// Estimate a passage for a hired captain: today's winds, adjusted for his navigation.
function planLeg(S, ship, fromId, toId) {
  const a = port(fromId), b = port(toId);
  const route = findPath(a.lon, a.lat, b.lon, b.lat);
  if (!route) return null;
  const path = [[a.lon, a.lat], ...route];
  let day = S.day, total = 0;
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    let [lon, lat] = path[i - 1];
    const [tl, ta] = path[i];
    for (let guard = 0; guard < 20000; guard++) {
      const rem = distNm(lon, lat, tl, ta);
      if (rem < 0.5) break;
      const br = bearing(lon, lat, tl, ta);
      const w = windAt(lon, lat, day);
      const perDay = KNOTS * 24 * sailFactor(angleDiff(br, w.from)) * (0.45 + 0.55 * w.strength);
      const step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(br * D2R)) / 60;
      lon += (step * Math.sin(br * D2R)) / (60 * Math.cos(lat * D2R));
      day += step / perDay;
    }
    total += distNm(path[i - 1][0], path[i - 1][1], tl, ta);
    cum.push(total);
  }
  const navFactor = 1.12 - 0.04 * ship.captain.nav; // a good navigator is quicker
  return { from: fromId, to: toId, start: S.day, days: Math.max(1, (day - S.day) * navFactor), path, cum, total };
}

export function setRoute(S, market, ship, route) {
  ship.route = route;
  // Orders given in person, in the same port, steady a wavering captain.
  if (S.ship.docked && S.ship.docked === ship.at) ship.captain.loyalty = Math.max(ship.captain.loyalty ?? 100, 60);
  if (ship.status === 'ashore' && S.ship.docked === ship.at) ship.status = 'idle';
  const msgs = [];
  if (route && (ship.status === 'idle' || ship.status === 'waiting' || ship.status === 'loading')) { ship.waitSince = null; msgs.push(...arrive(S, market, ship, true)); }
  return msgs;
}

// The ship is in port (`ship.at`): sell, buy, and head off on the next leg.
function arrive(S, market, ship, fresh = false) {
  const msgs = [];
  const here = ship.at;
  const r = ship.route;
  if (market.closed(here)) {
    if (ship.status !== 'waiting') msgs.push({ html: `<b>${ship.name}</b> is held outside ${port(here).name}: the port is closed.`, kind: '' });
    ship.status = 'waiting';
    return msgs;
  }
  const parts = [];
  if (ship.cargo) {
    const g = good(ship.cargo.good);
    const { income } = market.sell(here, ship.cargo.good, ship.cargo.qty);
    const gross = Math.round(income * (1 + 0.02 * ship.captain.trade)); // a good trader haggles
    const skim = (ship.captain.loyalty ?? 100) < LOYALTY_SKIM ? Math.round(gross * SKIM_SHARE) : 0;
    const paid = gross - skim;
    const profit = paid - ship.cargo.paid;
    S.purse += paid;
    if (skim) parts.push(`Captain ${ship.captain.name} kept ${skim} cz for himself`);
    ship.profit += profit;
    ship.trips++;
    ship.last = { day: S.day, at: here, good: g.id, qty: ship.cargo.qty, income: paid, profit };
    parts.push(`sold ${ship.cargo.qty} ${g.unit} of ${g.name.toLowerCase()} for ${paid.toLocaleString()} cz (${profit >= 0 ? '+' : ''}${profit.toLocaleString()})`);
    ship.cargo = null;
  }
  if (r && (ship.captain.loyalty ?? 100) < LOYALTY_DESERT) {
    ship.route = null;
    ship.status = 'ashore';
    msgs.push({ html: `<b>${ship.name}</b>: Captain ${ship.captain.name} has gone ashore in ${port(here).name} and will not sail until you come and give him orders.`, kind: '', log: `Captain ${ship.captain.name} went ashore in ${port(here).name}.` });
    return msgs;
  }
  if (!r) {
    ship.status = ship.status === 'ashore' ? 'ashore' : 'idle';
    if (parts.length) msgs.push({ html: `<b>${ship.name}</b> at ${port(here).name}: ${parts.join('. ')}. Awaiting orders.`, kind: 'port', log: `${ship.name} ${parts.join('; ')} at ${port(here).name}.` });
    return msgs;
  }
  msgs.push(...loadAndSail(S, market, ship, parts, fresh));
  return msgs;
}

// What the captain may load on this leg: 'best' (his choice), a good's id, or 'none'.
// Routes saved before 'best' existed used null for "nothing".
function legChoice(r, here) {
  const c = here === r.a ? r.goodA : here === r.b ? r.goodB : 'none';
  return c == null ? 'none' : c;
}

// Price a cargo without buying it: units bought one at a time while each should still sell at
// a profit at the next port, allowing for the price there falling as he sells.
function quoteLoad(S, market, here, next, g) {
  const target = market.sellPrice(next, g) * (1 - 0.006 * HOLD / 2);
  const saved = market.press[here][g];
  let qty = 0, cost = 0, profit = 0;
  while (qty < HOLD) {
    const price = market.buyPrice(here, g);
    if (price > target * MARGIN || S.purse - cost - price < RESERVE) break;
    market.press[here][g] -= 0.5; // as a real purchase would
    qty++;
    cost += price;
    profit += target - price;
  }
  market.press[here][g] = saved;
  return { qty, cost, profit };
}

function bestCargo(S, market, here, next, choice) {
  const options = choice === 'best'
    ? GOODS.filter((g) => market.sells(here, g.id)).map((g) => g.id)
    : choice !== 'none' && market.sells(here, choice) ? [choice] : [];
  let best = null;
  for (const g of options) {
    const q = quoteLoad(S, market, here, next, g);
    if (q.qty && (!best || q.profit > best.profit)) best = { good: g, ...q };
  }
  return best;
}

// Load the best cargo going and sail; or, if nothing pays, wait in port a while on half pay.
function loadAndSail(S, market, ship, parts = [], fresh = false) {
  const msgs = [];
  const here = ship.at, r = ship.route;
  const next = here === r.a ? r.b : r.a;
  const choice = legChoice(r, here);
  const pick = choice === 'none' ? null : bestCargo(S, market, here, next, choice);
  if (pick) {
    const { bought, cost } = market.buy(here, pick.good, pick.qty, pick.cost, HOLD);
    if (bought) {
      S.purse -= cost;
      ship.cargo = { good: pick.good, qty: bought, paid: cost, loaded: S.day };
      parts.push(`loaded ${bought} ${good(pick.good).unit} of ${good(pick.good).name.toLowerCase()} for ${cost.toLocaleString()} cz`);
    }
  } else if (choice !== 'none') {
    if (ship.waitSince == null) ship.waitSince = S.day;
    if (S.day - ship.waitSince < MAX_WAIT_DAYS) {
      const first = ship.status !== 'loading';
      ship.status = 'loading';
      ship.nextCheck = S.day + 1;
      if (first) {
        const what = choice === 'best' ? 'nothing here pays for the run' : `${good(choice).name.toLowerCase()} is too dear to turn a profit`;
        parts.push(`${what}, so he waits on half pay for prices to recover`);
        msgs.push({ html: `<b>${ship.name}</b> at ${port(here).name}: ${parts.join('. ')}.`, kind: 'port', log: `${ship.name}: ${parts.join('; ')} at ${port(here).name}.` });
      }
      return msgs;
    }
    parts.push(S.purse - RESERVE < 20 ? 'could not afford a cargo, so sailed empty' : `waited ${Math.round(S.day - ship.waitSince)} days for better prices, then sailed empty`);
  }
  ship.waitSince = null;
  const leg = planLeg(S, ship, here, next);
  if (!leg) { ship.status = 'idle'; return msgs; }
  ship.leg = leg;
  ship.status = 'sailing';
  if (parts.length || fresh) {
    const what = parts.length ? parts.join('. ') : 'sailing empty';
    msgs.push({ html: `<b>${ship.name}</b> at ${port(here).name}: ${what}. Bound for ${port(next).name}, about ${Math.round(leg.days)} days.`, kind: 'port', log: `${ship.name}: ${what} at ${port(here).name}.` });
  }
  return msgs;
}

// Spoilage aboard a hired ship, worked out on arrival from the time at sea.
function spoilOnArrival(ship, days, lat) {
  if (!ship.cargo) return null;
  const g = good(ship.cargo.good);
  if (!g.spoil) return null;
  const heat = lat < 26 ? 1.6 : 1;
  const lost = Math.min(ship.cargo.qty, Math.floor(ship.cargo.qty * (1 - Math.exp(-g.spoil * heat * days)) + Math.random()));
  if (lost <= 0) return null;
  ship.cargo.qty -= lost;
  if (!ship.cargo.qty) ship.cargo = null;
  return { lost, g };
}

export function tick(S, market, days, ownerPresent = true) {
  const F = ensureFleet(S);
  const msgs = [];
  for (const ship of F.ships) {
    const pay = dailyCost(ship) * (ship.status === 'sailing' ? 1 : IDLE_PAY) * days;
    S.purse -= pay;
    F.wagesPaid = (F.wagesPaid || 0) + pay;
    if (ship.captain.loyalty == null) ship.captain.loyalty = 100;
    if (ownerPresent) ship.captain.loyalty = Math.min(100, ship.captain.loyalty + LOYALTY_REGAIN_PER_DAY * days);
    if (ship.status === 'sailing' && ship.leg && S.day >= ship.leg.start + ship.leg.days) {
      const leg = ship.leg;
      ship.at = leg.to;
      ship.leg = null;
      const lost = spoilOnArrival(ship, leg.days, (port(leg.from).lat + port(leg.to).lat) / 2);
      if (lost) msgs.push({ html: `<b>${ship.name}</b>: ${lost.lost} ${lost.lost === 1 ? lost.g.one : lost.g.unit} of ${lost.g.name.toLowerCase()} ${lost.g.rot} on the passage.`, kind: '' });
      msgs.push(...arrive(S, market, ship));
    } else if (ship.status === 'waiting' && !market.closed(ship.at)) {
      msgs.push(...arrive(S, market, ship));
    } else if (ship.status === 'loading' && ship.route && S.day >= (ship.nextCheck ?? 0)) {
      msgs.push(...loadAndSail(S, market, ship));
    }
  }
  return msgs;
}

// Where a ship is on the chart right now, and which way it is heading.
export function position(S, ship) {
  if (ship.status === 'sailing' && ship.leg) {
    const { path, cum, total, start, days } = ship.leg;
    const d = Math.min(1, Math.max(0, (S.day - start) / days)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    return { lon: x0 + (x1 - x0) * t, lat: y0 + (y1 - y0) * t, heading: bearing(x0, y0, x1, y1), atSea: true };
  }
  const p = port(ship.at);
  return { lon: p.lon - 0.18, lat: p.lat - 0.12, heading: 200, atSea: false };
}

export function statusText(S, ship) {
  const r = ship.route;
  if (ship.status === 'sailing' && ship.leg) {
    const left = Math.max(0, Math.ceil(ship.leg.start + ship.leg.days - S.day));
    const load = ship.cargo ? `${ship.cargo.qty} ${good(ship.cargo.good).unit} of ${good(ship.cargo.good).name.toLowerCase()}` : 'an empty hold';
    return `Bound for ${port(ship.leg.to).name} with ${load}, about ${left} ${left === 1 ? 'day' : 'days'} out.`;
  }
  if (ship.status === 'waiting') return `Waiting outside ${port(ship.at).name} for the port to reopen.`;
  if (ship.status === 'loading') return `Waiting in ${port(ship.at).name} for prices to recover, on half pay (${Math.max(0, Math.round(S.day - (ship.waitSince ?? S.day)))} of up to ${MAX_WAIT_DAYS} days).`;
  if (ship.status === 'ashore') return `Ashore in ${port(ship.at).name}: Captain ${ship.captain.name} will not sail until you give him orders there in person.`;
  return r ? `In ${port(ship.at).name}.` : `Idle in ${port(ship.at).name}, awaiting a route.`;
}

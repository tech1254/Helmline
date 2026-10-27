// The fleet: extra ships (any hull from the shipyard) run by hired captains on trade routes of two or more stops.
// They sail the same winds and trade in the same markets as the player, so their
// buying and selling moves real prices. Money comes from, and goes to, the player's purse.

import { PORTS, findPath, windAt, sailFactor, angleDiff, bearing, distNm, D2R } from './world.js';
import { GOODS } from './economy.js';
import * as Accounts from './accounts.js';
import * as Ships from './ships.js';
import * as Wear from './wear.js';

export const SHIP_COST = Ships.HULLS.caravel.price;
// Upkeep is the hull's hiredUpkeep (a caravel 1 cz a day, tuned 26 Oct 2026 with tests/sim), on top of the captain's wage.
export const SHIP_UPKEEP = Ships.HULLS.caravel.hiredUpkeep;
const hullStats = (ship) => Ships.stats({ hull: ship.hull || 'caravel' });
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
const REPORT_DAYS = 60; // a captain's rounds are summed up about every two months

const SHIP_NAMES = ['Santa Clara', 'São Jorge', 'Bom Jesus', 'Espírito Santo', 'Santa Maria', 'São Gabriel'];
const FIRST = ['Diogo', 'Gil', 'Nuno', 'Álvaro', 'Pêro', 'João', 'Fernão', 'Estêvão', 'Gonçalo', 'Afonso', 'Martim', 'Lopo'];
const LAST = ['Eanes', 'Tristão', 'Dias', 'Gomes', 'da Costa', 'Lourenço', 'Pires', 'Teixeira', 'Velho', 'de Freitas', 'Cerveira', 'Vaz'];

const port = (id) => PORTS.find((p) => p.id === id);
const good = (id) => GOODS.find((g) => g.id === id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function ensureFleet(S) {
  if (!S.fleet) S.fleet = { ships: [], candidates: null, nextId: 1 };
  for (const ship of S.fleet.ships) upgradeShip(ship);
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

// How many hired ships the captain may command is set by his standing (see contracts.js).
export function canBuy(S, maxShips) {
  return ensureFleet(S).ships.length < maxShips;
}

export function buyShip(S, captainId, maxShips, hullId = 'caravel') {
  const F = ensureFleet(S);
  const cap = (F.candidates?.list || []).find((c) => c.id === captainId);
  const h = Ships.HULLS[hullId];
  if (!h || !cap || S.purse < h.price || !canBuy(S, maxShips)) return null;
  F.candidates.list = F.candidates.list.filter((c) => c !== cap);
  const used = new Set(F.ships.map((s) => s.name));
  const name = SHIP_NAMES.find((n) => !used.has(n) && n !== S.ship.name) || `${h.name} ${F.nextId}`;
  const ship = { id: F.nextId++, name, hull: hullId, captain: cap, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null };
  F.ships.push(ship);
  S.purse -= h.price;
  Accounts.record(S, { kind: 'ships', amount: -h.price, text: `Bought the ${h.name.toLowerCase()} ${name} and hired Captain ${cap.name}` });
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
  return hullStats(ship).hiredUpkeep + ship.captain.wage;
}

// Estimate a passage for a hired captain: today's winds, adjusted for his navigation.
function planLeg(S, ship, fromId, toId) {
  const a = port(fromId), b = port(toId);
  // A better navigator plans for the winds; a poor one keeps to the shortest course.
  const route = findPath(a.lon, a.lat, b.lon, b.lat, (ship.captain.nav - 1) / 4, !!Ships.HULLS[ship.hull || 'caravel']?.coastal);
  if (!route) return null;
  const path = [[a.lon, a.lat], ...route];
  let day = S.day, total = 0;
  const cum = [0];
  const st = hullStats(ship);
  for (let i = 1; i < path.length; i++) {
    let [lon, lat] = path[i - 1];
    const [tl, ta] = path[i];
    for (let guard = 0; guard < 20000; guard++) {
      const rem = distNm(lon, lat, tl, ta);
      if (rem < 0.5) break;
      const br = bearing(lon, lat, tl, ta);
      const w = windAt(lon, lat, day);
      const off = angleDiff(br, w.from);
      const perDay = Ships.knotsAt(st, off, sailFactor(off) * (0.45 + 0.55 * w.strength)) * 24;
      const step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(br * D2R)) / 60;
      lon += (step * Math.sin(br * D2R)) / (60 * Math.cos(lat * D2R));
      day += step / perDay;
    }
    total += distNm(path[i - 1][0], path[i - 1][1], tl, ta);
    cum.push(total);
  }
  const navFactor = 1.12 - 0.04 * ship.captain.nav; // a good navigator is quicker
  const worn = 0.6 + 0.4 * (ship.hullPct ?? 100) / 100; // and a worn hull slower, as for the flagship
  return { from: fromId, to: toId, start: S.day, days: Math.max(1, (day - S.day) * navFactor / worn), path, cum, total };
}

// ---- Routes ---------------------------------------------------------------------------
// A route is a loop of stops. At each stop the captain carries out its orders in turn, then
// sails for the next stop, and from the last back to the first:
//   { act: 'sell', good: 'all' | <good id> }
//   { act: 'buy',  good: 'best' | <good id>, pct: 25 | 50 | 75 | 100 }  (share of the whole hold)
// 'best' lets the captain pick whatever pays most at the stop where it will next be sold.
export const MAX_STOPS = 6;
export const MAX_ORDERS = 4;
export const holdSize = (ship) => hullStats(ship).hold;

export function simpleRoute(a, b) {
  const orders = () => [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'best', pct: 100 }];
  return { stops: [{ port: a, orders: orders() }, { port: b, orders: orders() }], next: 0 };
}

// Routes saved before multi-stop routes existed: two ports and one cargo choice each.
function normalizeRoute(r) {
  if (!r || r.stops) return r;
  const buy = (g) => (g == null || g === 'none' ? [] : [{ act: 'buy', good: g, pct: 100 }]);
  return {
    stops: [
      { port: r.a, orders: [{ act: 'sell', good: 'all' }, ...buy(r.goodA)] },
      { port: r.b, orders: [{ act: 'sell', good: 'all' }, ...buy(r.goodB)] },
    ],
    next: 0,
  };
}

// The hold can carry several goods: { good: { qty, paid } }.
function holdOf(ship) {
  if (!ship.hold) {
    ship.hold = {};
    if (ship.cargo) ship.hold[ship.cargo.good] = { qty: ship.cargo.qty, paid: ship.cargo.paid };
    ship.cargo = null;
  }
  return ship.hold;
}
export const holdUsed = (ship) => Object.values(holdOf(ship)).reduce((n, x) => n + x.qty, 0);
export const holdPaid = (ship) => Object.values(holdOf(ship)).reduce((n, x) => n + x.paid, 0);
export function holdText(ship) {
  const items = Object.entries(holdOf(ship)).filter(([, x]) => x.qty > 0)
    .map(([g, x]) => `${x.qty} ${x.qty === 1 ? good(g).one : good(g).unit} of ${good(g).name.toLowerCase()}`);
  if (!items.length) return 'an empty hold';
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// What a ship has made since she last left the first stop of her route.
function roundOf(ship) {
  if (!ship.round) ship.round = { since: null, net: 0, visits: 0 };
  return ship.round;
}

export function upgradeShip(ship) {
  holdOf(ship);
  if (!ship.hull || !Ships.HULLS[ship.hull]) ship.hull = 'caravel';
  ship.route = normalizeRoute(ship.route);
}

export function setRoute(S, market, ship, route) {
  upgradeShip(ship);
  route = normalizeRoute(JSON.parse(JSON.stringify(route)));
  const here = route.stops.findIndex((st) => st.port === ship.at);
  route.next = here >= 0 ? here : 0;
  ship.route = route;
  // Orders given in person, in the same port, steady a wavering captain.
  if (S.ship.docked && S.ship.docked === ship.at) ship.captain.loyalty = Math.max(ship.captain.loyalty ?? 100, 60);
  if (ship.status === 'ashore' && S.ship.docked === ship.at) ship.status = 'idle';
  const msgs = [];
  if (['idle', 'waiting', 'loading'].includes(ship.status)) {
    ship.waitSince = null;
    msgs.push(...(here >= 0 ? visit(S, market, ship, true) : sailOn(S, ship, [], true)));
  }
  return msgs;
}

// The first stop after `from` (going round the loop) where this good would be sold.
function saleStop(route, from, g) {
  const n = route.stops.length;
  for (let k = 1; k <= n; k++) {
    const st = route.stops[(from + k) % n];
    if (st.orders.some((o) => o.act === 'sell' && (o.good === 'all' || o.good === g))) return st.port;
  }
  return null;
}

// Price a cargo without buying it: units bought one at a time while each should still sell
// at a profit where it is next sold. Every unit sold there lowers the price for the next by
// that market's depth, so the captain reckons each unit against the price it will really
// fetch. `margin` is the most he pays as a share of that: below 1 to cover wages and rot.
function quoteLoad(S, market, here, salePort, g, maxUnits, margin = MARGIN) {
  const top = market.sellPrice(salePort, g);
  const k = market.k(salePort, g);
  const saved = market.press[here][g];
  let qty = 0, cost = 0, profit = 0;
  while (qty < maxUnits) {
    const price = market.buyPrice(here, g);
    const fetch = top * Math.exp(-k * qty);
    if (price > fetch * margin || S.purse - cost - price < RESERVE) break;
    market.press[here][g] -= 0.5; // as a real purchase would
    qty++;
    cost += price;
    profit += fetch - price;
  }
  market.press[here][g] = saved;
  return { qty, cost, profit };
}

function addToHold(ship, g, qty, cost) {
  const h = holdOf(ship);
  h[g] = h[g] || { qty: 0, paid: 0 };
  h[g].qty += qty;
  h[g].paid += cost;
}

// Arrive at the current stop: sell as ordered, then buy and sail on.
function visit(S, market, ship, fresh = false) {
  const msgs = [];
  const here = ship.at;
  const r = ship.route;
  // The captain notes the prices as he finds them, for the owner's price book.
  ship.seen = ship.seen || {};
  ship.seen[here] = { day: S.day, prices: market.observe(here) };
  if (market.closed(here)) {
    if (ship.status !== 'waiting') msgs.push({ html: `<b>${ship.name}</b> is held outside ${port(here).name}: the port is closed.`, kind: 'alert', level: 'alert' });
    ship.status = 'waiting';
    return msgs;
  }
  const parts = [];
  const stop = r ? r.stops[r.next] : null;
  // Sell. With no route, the captain sells everything and waits for orders.
  const sellOrders = stop ? stop.orders.filter((o) => o.act === 'sell') : [{ act: 'sell', good: 'all' }];
  const h = holdOf(ship);
  const sold = [];
  let income = 0, profit = 0;
  for (const o of sellOrders) {
    for (const g of o.good === 'all' ? Object.keys(h) : [o.good]) {
      const lot = h[g];
      if (!lot || lot.qty <= 0) continue;
      const res = market.sell(here, g, lot.qty);
      const gross = Math.round(res.income * (1 + 0.02 * ship.captain.trade)); // a good trader haggles
      income += gross;
      Accounts.captain(S, ship, { kind: 'sale', good: g, qty: lot.qty, amount: gross });
      profit += gross - lot.paid;
      sold.push(`${lot.qty} ${lot.qty === 1 ? good(g).one : good(g).unit} of ${good(g).name.toLowerCase()}`);
      delete h[g];
    }
  }
  if (sold.length) {
    const skim = (ship.captain.loyalty ?? 100) < LOYALTY_SKIM ? Math.round(income * SKIM_SHARE) : 0;
    S.purse += income - skim;
    roundOf(ship).net += income - skim;
    profit -= skim;
    ship.profit += profit;
    ship.trips++;
    ship.last = { day: S.day, at: here, text: sold.join(', '), income: income - skim, profit };
    parts.push(`sold ${sold.join(', ')} for ${(income - skim).toLocaleString()} cz (${profit >= 0 ? '+' : ''}${profit.toLocaleString()})`);
    if (skim) {
      parts.push(`Captain ${ship.captain.name} kept ${skim} cz for himself`);
      Accounts.captain(S, ship, { kind: 'skim', amount: -skim, text: `Captain ${ship.captain.name} kept back part of the takings` });
    }
  }
  // Back at the first stop of her route: one round done. Every couple of months of rounds, say
  // what they made in all (sales less purchases and wages), rather than every load and sale.
  // A loss is an alert the first time, then plain news until she makes money again.
  if (r && r.next === 0) {
    const R = roundOf(ship);
    if (R.since != null && R.visits >= r.stops.length) {
      R.rounds = (R.rounds || 0) + 1;
      R.visits = 0;
      const days = Math.round(S.day - R.since);
      if (days >= REPORT_DAYS) {
        const net = Math.round(R.net);
        const what = R.rounds === 1 ? `a round of her route in ${days} days` : `${R.rounds} rounds of her route in ${days} days`;
        if (net >= 0) {
          ship.lossWarned = false;
          msgs.push({ html: `<b>${ship.name}</b>: ${what}, <b>+${net.toLocaleString()} cz</b>.`, kind: 'port', log: `${ship.name}: ${what}, +${net} cz.` });
        } else {
          msgs.push({ html: `<b>${ship.name}</b>: ${what}, a <b>loss of ${(-net).toLocaleString()} cz</b>. Check her route and orders.`, kind: ship.lossWarned ? 'port' : 'alert', level: ship.lossWarned ? 'normal' : 'alert', log: `${ship.name}: ${what}, ${net} cz.` });
          ship.lossWarned = true;
        }
        ship.round = { since: S.day, net: 0, visits: 0, rounds: 0 };
      }
    } else if (R.since == null) ship.round = { since: S.day, net: 0, visits: 0, rounds: 0 };
  }
  if (r) roundOf(ship).visits++;
  const fix = repairIfNeeded(S, ship);
  if (fix) { msgs.push(fix); return msgs; }
  if (r && (ship.captain.loyalty ?? 100) < LOYALTY_DESERT) {
    ship.route = null;
    ship.status = 'ashore';
    msgs.push({ html: `<b>${ship.name}</b>: Captain ${ship.captain.name} has gone ashore in ${port(here).name} and will not sail until you come and give him orders.`, kind: 'alert', level: 'alert', log: `Captain ${ship.captain.name} went ashore in ${port(here).name}.` });
    return msgs;
  }
  if (!r) {
    ship.status = ship.status === 'ashore' ? 'ashore' : 'idle';
    if (parts.length) msgs.push({ html: `<b>${ship.name}</b> at ${port(here).name}: ${parts.join('. ')}. Awaiting orders.`, kind: 'port', log: `${ship.name} ${parts.join('; ')} at ${port(here).name}.` });
    return msgs;
  }
  msgs.push(...buyAndSail(S, market, ship, parts, fresh));
  return msgs;
}

// Carry out the stop's buy orders; if every 'best' order found nothing worth carrying and the
// hold is empty, wait a while on half pay for prices to recover. Then sail for the next stop.
function buyAndSail(S, market, ship, parts = [], fresh = false) {
  const msgs = [];
  const here = ship.at, r = ship.route;
  const stop = r.stops[r.next];
  const buys = stop.orders.filter((o) => o.act === 'buy');
  let boughtAny = false, bestFailed = false;
  for (const o of buys) {
    const cap = holdSize(ship);
    const free = cap - holdUsed(ship);
    const units = Math.min(free, Math.round(cap * (o.pct || 100) / 100));
    if (units <= 0) continue;
    let g = o.good, qty = 0, cost = 0;
    if (g === 'best') {
      let best = null;
      for (const cand of GOODS.filter((x) => market.sells(here, x.id)).map((x) => x.id)) {
        const salePort = saleStop(r, r.next, cand);
        if (!salePort || salePort === here) continue;
        const q = quoteLoad(S, market, here, salePort, cand, units);
        if (q.qty && (!best || q.profit > best.profit)) best = { good: cand, ...q };
      }
      if (!best) { bestFailed = true; continue; }
      g = best.good;
      ({ bought: qty, cost } = market.buy(here, g, best.qty, best.cost, free));
    } else if (market.sells(here, g)) {
      // A standing order: the captain buys what he is told, but not at a loss: he stops
      // when a unit would no longer fetch what it costs where it is next sold.
      const salePort = saleStop(r, r.next, g);
      const q = salePort && salePort !== here ? quoteLoad(S, market, here, salePort, g, units, 1) : { qty: units, cost: Infinity };
      if (q.qty) ({ bought: qty, cost } = market.buy(here, g, q.qty, Math.max(0, Math.floor(S.purse - RESERVE)), free));
      if (!qty) parts.push(S.purse - market.buyPrice(here, g) < RESERVE ? `could not afford ${good(g).name.toLowerCase()}` : `found ${good(g).name.toLowerCase()} too dear to carry without loss`);
    }
    if (qty) {
      S.purse -= cost;
      roundOf(ship).net -= cost;
      Accounts.captain(S, ship, { kind: 'purchase', good: g, qty, amount: -cost });
      addToHold(ship, g, qty, cost);
      boughtAny = true;
      parts.push(`loaded ${qty} ${good(g).unit} of ${good(g).name.toLowerCase()} for ${cost.toLocaleString()} cz`);
    }
  }
  if (bestFailed && !boughtAny && holdUsed(ship) === 0) {
    if (ship.waitSince == null) ship.waitSince = S.day;
    if (S.day - ship.waitSince < MAX_WAIT_DAYS) {
      const first = ship.status !== 'loading';
      ship.status = 'loading';
      ship.nextCheck = S.day + 1;
      if (first) {
        parts.push('nothing here pays for the run, so he waits on half pay for prices to recover');
        msgs.push({ html: `<b>${ship.name}</b> at ${port(here).name}: ${parts.join('. ')}.`, kind: 'port', level: 'routine', log: `${ship.name}: ${parts.join('; ')} at ${port(here).name}.` });
      }
      return msgs;
    }
    parts.push(`waited ${Math.round(S.day - ship.waitSince)} days for better prices, then sailed empty`);
  }
  ship.waitSince = null;
  r.next = (r.next + 1) % r.stops.length;
  msgs.push(...sailOn(S, ship, parts, fresh));
  return msgs;
}

function sailOn(S, ship, parts, fresh) {
  const msgs = [];
  const next = ship.route.stops[ship.route.next].port;
  const leg = planLeg(S, ship, ship.at, next);
  if (!leg) { ship.status = 'idle'; return msgs; }
  Accounts.bookCaptainWages(S, ship, 'in port');
  ship.leg = leg;
  ship.status = 'sailing';
  if (parts.length || fresh) {
    const what = parts.length ? parts.join('. ') : `sailing with ${holdText(ship)}`;
    msgs.push({ html: `<b>${ship.name}</b> at ${port(ship.at).name}: ${what}. Bound for ${port(next).name}, about ${Math.round(leg.days)} days.`, kind: 'port', level: fresh ? 'normal' : 'routine', log: `${ship.name}: ${what} at ${port(ship.at).name}.` });
  }
  return msgs;
}

// Spoilage aboard a hired ship, worked out on arrival from the time at sea.
function spoilOnArrival(ship, days, lat) {
  const heat = lat < 26 ? 1.6 : 1;
  const out = [];
  for (const [g, lot] of Object.entries(holdOf(ship))) {
    const gd = good(g);
    if (!gd.spoil || lot.qty <= 0) continue;
    const lost = Math.min(lot.qty, Math.floor(lot.qty * (1 - Math.exp(-gd.spoil * heat * days)) + Math.random()));
    if (lost <= 0) continue;
    lot.qty -= lost; // what was paid stays paid
    if (!lot.qty) delete holdOf(ship)[g];
    out.push(`${lost} ${lost === 1 ? gd.one : gd.unit} of ${gd.name.toLowerCase()} ${gd.rot}`);
  }
  return out;
}

export function tick(S, market, days, ownerPresent = true) {
  const F = ensureFleet(S);
  const msgs = [];
  for (const ship of F.ships) {
    upgradeShip(ship);
    const pay = dailyCost(ship) * (ship.status === 'sailing' ? 1 : IDLE_PAY) * days;
    S.purse -= pay;
    roundOf(ship).net -= pay;
    Accounts.accrueCaptainWages(ship, pay);
    F.wagesPaid = (F.wagesPaid || 0) + pay;
    if (ship.captain.loyalty == null) ship.captain.loyalty = 100;
    if (ownerPresent) ship.captain.loyalty = Math.min(100, ship.captain.loyalty + LOYALTY_REGAIN_PER_DAY * days);
    if (ship.status === 'sailing' && ship.leg && S.day >= ship.leg.start + ship.leg.days) {
      const leg = ship.leg;
      ship.at = leg.to;
      ship.leg = null;
      Accounts.bookCaptainWages(S, ship, `passage from ${port(leg.from).name}`);
      const lat = (port(leg.from).lat + port(leg.to).lat) / 2;
      const lost = spoilOnArrival(ship, leg.days, lat);
      if (lost.length) msgs.push({ html: `<b>${ship.name}</b>: ${lost.join(', ')} on the passage.`, kind: '', level: 'routine' });
      const w = wearOnPassage(S, ship, leg, lat);
      if (w) msgs.push(w);
      if (ship.sunk) continue;
      msgs.push(...visit(S, market, ship));
    } else if (ship.status === 'waiting' && !market.closed(ship.at)) {
      msgs.push(...visit(S, market, ship));
    } else if (ship.status === 'loading' && ship.route && S.day >= (ship.nextCheck ?? 0)) {
      msgs.push(...buyAndSail(S, market, ship));
    } else if (ship.status === 'repair' && S.day >= (ship.repairUntil ?? 0)) {
      ship.status = 'idle';
      msgs.push(...(ship.route ? buyAndSail(S, market, ship) : []));
    }
  }
  if (F.ships.some((x) => x.sunk)) F.ships = F.ships.filter((x) => !x.sunk);
  return msgs;
}

// Wear on a passage (wear.js): the hull loses condition, more in the tropics and in storms; a
// leaking hull spoils cargo; a hull in danger can founder with all she carries.
function wearOnPassage(S, ship, leg, lat) {
  const before = ship.hullPct ?? 100;
  const storm = Wear.storms(leg.days);
  ship.hullPct = Math.max(5, before - Wear.wearPerDay(lat) * leg.days - storm);
  const share = Wear.leakShare(ship.hullPct);
  if (share) for (const [g, lot] of Object.entries(holdOf(ship))) { lot.qty -= Math.round(lot.qty * share); if (lot.qty <= 0) delete holdOf(ship)[g]; }
  if (ship.hullPct < Wear.DANGER_BELOW && Math.random() < 0.1) {
    ship.sunk = true;
    return { html: `<b>${ship.name} is lost.</b> Her hull gave way on the passage to ${port(leg.to).name}; Captain ${ship.captain.name} and the crew got off in the boat, but the ship and her cargo are gone.`, kind: 'alert', level: 'alert', log: `${ship.name} foundered on the way to ${port(leg.to).name}.` };
  }
  if (storm) return { html: `<b>${ship.name}</b> came through a storm on the way to ${port(leg.to).name}: hull ${Math.round(ship.hullPct)}%.`, kind: '', level: 'routine' };
  return null;
}

// A captain puts his ship in for repairs on his own: at a shipyard on his route once she is
// worn, or on a beach anywhere if she is badly worn. Returns a message, or null.
function repairIfNeeded(S, ship) {
  const h = ship.hullPct ?? 100;
  const yard = Wear.YARDS.includes(ship.at);
  if (!(yard ? h < Wear.CAPTAIN_YARD_BELOW : h < Wear.CAPTAIN_BEACH_BELOW)) return null;
  const q = yard ? Wear.yardQuote(ship.hull, h) : Wear.beachQuote(ship.hull, h);
  if (!q.pts) return null;
  S.purse -= q.cost;
  roundOf(ship).net -= q.cost;
  Accounts.captain(S, ship, { kind: 'repairs', amount: -q.cost, text: yard ? `Repairs in the ${port(ship.at).name} yard` : `Careened on the beach at ${port(ship.at).name}` });
  ship.hullPct = q.to;
  ship.status = 'repair';
  ship.repairUntil = S.day + q.days;
  return { html: `<b>${ship.name}</b> ${yard ? `goes into the yard at ${port(ship.at).name}` : `is careened on the beach at ${port(ship.at).name}`} for ${q.days} days: ${q.cost.toLocaleString()} cz.`, kind: 'port', level: 'routine', log: `${ship.name}: repairs at ${port(ship.at).name}, ${q.days} days, ${q.cost} cz.` };
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
    return `Bound for ${port(ship.leg.to).name} with ${holdText(ship)}, about ${left} ${left === 1 ? 'day' : 'days'} out.`;
  }
  if (ship.status === 'waiting') return `Waiting outside ${port(ship.at).name} for the port to reopen.`;
  if (ship.status === 'repair') return `${Wear.YARDS.includes(ship.at) ? `In the yard at ${port(ship.at).name}` : `Careened on the beach at ${port(ship.at).name}`} for ${Math.max(1, Math.ceil((ship.repairUntil ?? S.day) - S.day))} more days.`;
  if (ship.status === 'loading') return `Waiting in ${port(ship.at).name} for prices to recover, on half pay (${Math.max(0, Math.round(S.day - (ship.waitSince ?? S.day)))} of up to ${MAX_WAIT_DAYS} days).`;
  if (ship.status === 'ashore') return `Ashore in ${port(ship.at).name}: Captain ${ship.captain.name} will not sail until you give him orders there in person.`;
  return r ? `In ${port(ship.at).name}.` : `Idle in ${port(ship.at).name}, awaiting a route.`;
}

// The owner is in a port on a captain's route: the captain's notes of prices go into the
// owner's price book wherever they are fresher than his own. Returns the ports updated.
export function sharePrices(S, portId, ships) {
  const updated = new Set();
  for (const ship of ships) {
    const onRoute = ship.at === portId || (ship.route?.stops || []).some((st) => st.port === portId);
    if (!onRoute || !ship.seen) continue;
    for (const [pid, rec] of Object.entries(ship.seen)) {
      if (!S.seen[pid] || S.seen[pid].day < rec.day) {
        S.seen[pid] = { day: rec.day, prices: rec.prices, by: ship.name };
        updated.add(pid);
      }
    }
  }
  return [...updated];
}

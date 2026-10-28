// NOTE: since the release of 27 Oct 2026 the game itself has B, C and D (thinner markets, dearer
// ships, wear and repairs in public/js/economy.js, ships.js, wear.js and fleet.js). So `--only none`
// now simulates the game as it is, and adding B, C or D on top applies them twice.
//
// A whole career, played headless: your flagship and two hired captains trading for a century
// (1 March 1451 to 1 March 1551), with the real market, events and fleet code. Used to judge
// proposed economy changes, alone and in every combination:
//
//   A  narrower price gaps: each good's price at each port pulled toward that good's average
//      across ports (the gap between cheapest and dearest roughly halves on a log scale)
//   B  thinner markets: every load moves the price 2.5 times as far
//   C  dearer ships: hulls and refits cost 30% more
//   D  wear and repairs: hulls wear at sea (faster in the tropics, storms now and then); a worn
//      hull is slower and leaks; shipyards repair it for money and days out of service;
//      beaching a ship to careen her is cheaper and only gets her back to 80%; a wreck below 25%
//      can founder with her cargo
//
//   node tests/sim/economy_sim.mjs --runs 6                 # all 16 combinations
//   node tests/sim/economy_sim.mjs --only AB --runs 6       # one combination
//   node tests/sim/economy_sim.mjs --years 30
//
// What the simulated owner does: starts with 300 cz in a caravel, as a new game does; hires a
// captain with a caravel when the purse can spare it, then a second; trades up his flagship to a
// barinel, then a nau (ordered from 1470, delivered 1480), and his captains to barinels, when the
// purse is comfortably more than the price. Not simulated: contracts, the crown's chart
// rewards, corsairs (they only attack the flagship in the game), and refits.
// Everyone sails a fixed loop, buying the best goods (captains sail as hired captains do; the
// flagship as a skilled captain with no wage). Results are averaged over runs.

import { Market } from '../../public/js/economy.js';
import * as Fleet from '../../public/js/fleet.js';
import * as Events from '../../public/js/events.js';
import * as Ships from '../../public/js/ships.js';
import { PORTS } from '../../public/js/world.js';
import * as Accounts from '../../public/js/accounts.js';
import * as Ports from '../../public/js/ports.js';

// --static-ports: ports as they were before 27 Oct 2026 (no growth; draft and boats still apply).
const STATIC_PORTS = process.argv.includes('--static-ports');
// --depth-exp 0.3, --trade-max 0.01: how much growing ports deepen their markets (ports.js TUNING)
for (const [flag, key] of [['--depth-exp', 'depthExp'], ['--trade-max', 'tradeMax'], ['--trade-per-point', 'tradePerPoint'], ['--depth-min', 'depthMin']]) {
  const i = process.argv.indexOf(flag);
  if (i > 0) Ports.TUNING[key] = Number(process.argv[i + 1]);
}
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const YEARS = Number(arg('years', 100));
const RUNS = Number(arg('runs', 6));
const ONLY = arg('only', null);
const START = arg('start', 'caravel'); // 'barca': start as a new game does now, in a coastal barca
const STEP = 0.5;
const A_STR = Number(arg('a', 0.5)); // A: how far each price moves toward the average (0 none, 1 all the way, on a log scale)
const B_STR = Number(arg('b', 2.5)); // B: how much further each load moves the price
const DAYS = Math.round(YEARS * 365.25);
const yearDay = (y) => Ships.dayOfYear(y);

const stop = (port, ...orders) => ({ port, orders });
const sell = { act: 'sell', good: 'all' };
const buy = (good, pct = 100) => ({ act: 'buy', good, pct });
const ROUTES = {
  flagship: [stop('lisbon', sell, buy('best')), stop('lanzarote', sell, buy('best', 50)), stop('arguin', sell, buy('best', 50)), stop('gambia', sell, buy('best'))],
  first: [stop('lisbon', sell, buy('cloth')), stop('gambia', sell, buy('pepper'))],
  second: [stop('lisbon', sell, buy('best')), stop('arguin', sell, buy('best', 50)), stop('lanzarote', buy('best', 50))],
  coastal: [stop('lisbon', sell, buy('best')), stop('safi', sell, buy('best')), stop('ceuta', sell, buy('best'))],
};
const YARDS = ['lisbon', 'lagos', 'funchal'];
const port = (id) => PORTS.find((p) => p.id === id);

// ---- The changes, as patches over the game's own code -------------------------------------

const orig = { mid: Market.prototype.mid, k: Market.prototype.k, prices: Object.fromEntries(Object.entries(Ships.HULLS).map(([k, h]) => [k, h.price])) };
function apply(cfg) {
  Market.prototype.mid = orig.mid;
  Market.prototype.k = orig.k;
  for (const [k, p] of Object.entries(orig.prices)) Ships.HULLS[k].price = p;
  if (cfg.includes('A')) {
    const gm = {};
    Market.prototype.mid = function (portId, good) {
      if (gm[good] == null) {
        const all = PORTS.map((p) => this.basePrice(p.id, good));
        gm[good] = Math.exp(all.reduce((t, v) => t + Math.log(v), 0) / all.length);
      }
      return orig.mid.call(this, portId, good) * Math.pow(gm[good] / this.basePrice(portId, good), A_STR);
    };
  }
  if (cfg.includes('B')) Market.prototype.k = function (p, g) { return orig.k.call(this, p, g) * B_STR; };
  if (cfg.includes('C')) for (const [k, p] of Object.entries(orig.prices)) Ships.HULLS[k].price = Math.round(p * 1.3 / 10) * 10;
}

// ---- Wear and repairs (D) -------------------------------------------------------------------

const WEAR = { temperate: 0.08, tropic: 0.2 }; // hull points a day at sea
const STORM = { perDay: 0.004, min: 5, max: 15 };
const YARD_COST = 0.003; // share of the hull's price per point repaired: a full overhaul from 50% costs 15%
const YARD_PTS_PER_DAY = 5, BEACH_PTS_PER_DAY = 3, BEACH_TO = 80;
function wearOnArrival(S, ship, leg, R) {
  const lat = (port(leg.from).lat + port(leg.to).lat) / 2;
  let w = leg.days * (lat < 26 ? WEAR.tropic : WEAR.temperate);
  for (let d = 0; d < leg.days; d++) if (Math.random() < STORM.perDay) w += STORM.min + Math.random() * (STORM.max - STORM.min);
  ship.hullPct = Math.max(5, (ship.hullPct ?? 100) - w);
  // a leaking hull spoils cargo: below 60%, up to a fifth of the hold
  if (ship.hullPct < 60) {
    for (const lot of Object.values(ship.hold || {})) lot.qty = Math.floor(lot.qty * (1 - (60 - ship.hullPct) / 200));
  }
  // a wreck can founder
  if (ship.hullPct < 25 && Math.random() < 0.1) {
    R.lost++;
    return 'sunk';
  }
  const price = Ships.HULLS[ship.hull].price;
  if (YARDS.includes(leg.to) && ship.hullPct < 70) {
    const pts = 100 - ship.hullPct, cost = Math.round(pts * YARD_COST * price);
    S.purse -= cost; R.repairs += cost; R.repairDays += pts / YARD_PTS_PER_DAY;
    ship.repairUntil = S.day + pts / YARD_PTS_PER_DAY; ship.hullPct = 100;
  } else if (!YARDS.includes(leg.to) && ship.hullPct < 45) {
    const pts = BEACH_TO - ship.hullPct, cost = Math.round(pts * YARD_COST * price * 0.4);
    S.purse -= cost; R.repairs += cost; R.repairDays += pts / BEACH_PTS_PER_DAY;
    ship.repairUntil = S.day + pts / BEACH_PTS_PER_DAY; ship.hullPct = BEACH_TO;
  }
  return null;
}

// ---- One career -------------------------------------------------------------------------------

function career(cfg) {
  apply(cfg);
  const wear = cfg.includes('D');
  const S = { day: 0, purse: 300, discovered: Object.fromEntries(PORTS.map((p) => [p.id, true])), ship: { docked: null }, contracts: { standing: 52 }, fleet: null };
  Fleet.ensureFleet(S);
  Events.ensureEvents(S);
  Accounts.ensureAccounts(S);
  if (!STATIC_PORTS) Ports.ensurePorts(S);
  const market = new Market();
  const R = { repairs: 0, repairDays: 0, lost: 0, shipsBought: 0, spentOnShips: 0, at: {}, events: [] };
  let nextId = 1;
  const add = (role, hull, captain) => {
    const ship = { id: nextId++, name: role, role, hull, captain: { id: nextId, name: role, ...captain, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null, hullPct: 100 };
    S.fleet.ships.push(ship);
    Fleet.setRoute(S, market, ship, { stops: ROUTES[role === 'flagship' && hull === 'barca' ? 'coastal' : role].map((s) => ({ port: s.port, orders: s.orders.map((o) => ({ ...o })) })), next: 0 });
    return ship;
  };
  // the flagship: a skilled captain (you) with no wage; she pays the hull's full upkeep
  const flagWage = (hull) => Ships.HULLS[hull].upkeep - Ships.HULLS[hull].hiredUpkeep;
  add('flagship', START, { nav: 5, trade: 5, wage: flagWage(START) });
  const pay = (amount, what) => { S.purse -= amount; R.spentOnShips += amount; R.shipsBought++; R.events.push(`${(1451 + S.day / 365.25).toFixed(1)} ${what} ${amount}`); };
  const role = (r) => S.fleet.ships.find((x) => x.role === r);
  let order = null; // the nau on the stocks
  const owner = () => {
    const P = (h) => Ships.HULLS[h].price;
    const year = Ships.yearOf(S.day);
    const tradeIn = (ship) => Math.round(P(ship.hull) / 2);
    // a barca owner's first goal: a caravel, and the open sea
    const f0 = role('flagship');
    if (f0 && f0.hull === 'barca') {
      if (S.purse > P('caravel') - tradeIn(f0) + 400 && !f0.leg) {
        pay(P('caravel') - tradeIn(f0), 'flagship to caravel'); f0.hull = 'caravel'; f0.captain.wage = flagWage('caravel'); f0.hullPct = 100;
        Fleet.setRoute(S, market, f0, { stops: ROUTES.flagship.map((st) => ({ port: st.port, orders: st.orders.map((o) => ({ ...o })) })), next: 0 });
      }
      return;
    }
    // hire captains
    for (const r of ['first', 'second']) {
      if (!role(r) && S.purse > P('caravel') * 2 + 300) { pay(P('caravel'), `${r} captain, caravel`); add(r, 'caravel', { nav: 4, trade: 4, wage: 4 }); }
    }
    const fl = role('flagship');
    // the nau: order a third down from her order year, the rest on delivery
    if (fl && fl.hull !== 'nau' && !order && year >= Ships.HULLS.nau.orderYear && S.purse > P('nau') * 0.75) { order = { paid: Math.round(P('nau') / 3) }; pay(order.paid, 'nau ordered'); }
    if (fl && order && year >= Ships.HULLS.nau.year && S.purse > P('nau') - order.paid - tradeIn(fl) + 500) { pay(P('nau') - order.paid - tradeIn(fl), 'nau delivered'); fl.hull = 'nau'; fl.captain.wage = flagWage('nau'); fl.hullPct = 100; order = null; }
    // barinels: the flagship first, then the captains
    for (const r of ['flagship', 'first', 'second']) {
      const s = role(r);
      if (s && s.hull === 'caravel' && S.purse > P('barinel') * 2.5 + 500) {
        pay(P('barinel') - tradeIn(s), `${r} to barinel`); s.hull = 'barinel'; s.hullPct = 100;
        if (r === 'flagship') s.captain.wage = flagWage('barinel');
      }
    }
  };
  const marks = [1462, 1470, 1480, 1500, 1525, 1551];
  for (let t = 0; t < DAYS; t += STEP) {
    S.day += STEP;
    market.tick(STEP);
    Events.tick(S, STEP);
    Events.applyToMarket(S, market);
    // ports grow (with history and trade), and a bigger port has a deeper market (ports.js)
    if (!STATIC_PORTS) {
      Ports.grow(S, STEP, market);
      market.scale = Object.fromEntries(PORTS.map((p) => [p.id, Ports.depthScale(S, p.id)]));
    }
    // ships in a shipyard sit out the work (their crews on half pay)
    const all = S.fleet.ships;
    const out = all.filter((x) => x.repairUntil && S.day < x.repairUntil);
    for (const x of out) S.purse -= Fleet.dailyCost(x) * Fleet.IDLE_PAY * STEP;
    S.fleet.ships = all.filter((x) => !out.includes(x));
    const legs = new Map(S.fleet.ships.map((x) => [x, x.leg]));
    Fleet.tick(S, market, STEP, true);
    S.fleet.ships = all;
    if (wear) {
      for (const [x, leg] of legs) {
        if (leg && x.leg !== leg) {
          if (wearOnArrival(S, x, leg, R) === 'sunk') {
            R.events.push(`${(1451 + S.day / 365.25).toFixed(1)} ${x.role} foundered`);
            S.fleet.ships = S.fleet.ships.filter((y) => y !== x);
            if (x.role === 'flagship') { // the owner buys a caravel and carries on
              const p = Ships.HULLS.caravel.price;
              S.purse -= p; R.spentOnShips += p; add('flagship', 'caravel', { nav: 5, trade: 5, wage: flagWage('caravel') });
            }
          }
        }
        // a worn hull is slower: stretch a new passage
        if (x.leg && x.leg !== leg && !x.leg.slowed) { x.leg.days /= 0.6 + 0.4 * (x.hullPct ?? 100) / 100; x.leg.slowed = true; }
      }
    }
    if (Math.abs(S.day % 30) < STEP) owner();
    if (R.broke == null && S.purse < -500) R.broke = 1451 + S.day / 365.25; // in debt: in the game the crown and the bankers would come calling
    const y = 1451 + S.day / 365.25;
    for (const m of marks) if (R.at[m] == null && y >= m + 2 / 12) R.at[m] = S.purse; // 1 March of that year
  }
  R.at[1551] = S.purse;
  const cargo = S.fleet.ships.reduce((t, x) => t + Object.values(x.hold || {}).reduce((u, l) => u + l.paid, 0), 0);
  R.final = S.purse;
  R.cargo = cargo;
  R.fleet = S.fleet.ships.map((x) => `${x.role} ${x.hull}`).join(', ');
  return R;
}

const COMBOS = ['', 'A', 'B', 'C', 'D', 'AB', 'AC', 'AD', 'BC', 'BD', 'CD', 'ABC', 'ABD', 'ACD', 'BCD', 'ABCD'];
const list = ONLY != null ? [ONLY === 'none' ? '' : ONLY] : COMBOS;
const out = [];
for (const cfg of list) {
  const runs = [];
  const t0 = Date.now();
  for (let r = 0; r < RUNS; r++) runs.push(career(cfg));
  const avg = (f) => runs.reduce((t, x) => t + f(x), 0) / runs.length;
  const sorted = runs.map((x) => x.final).sort((a, b) => a - b);
  const res = {
    cfg: cfg || 'none', a: A_STR, b: B_STR, runs: RUNS, seconds: Math.round((Date.now() - t0) / 1000),
    final: avg((x) => x.final), min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1],
    at: Object.fromEntries([1462, 1470, 1480, 1500, 1525].map((m) => [m, avg((x) => x.at[m] ?? 0)])),
    repairs: avg((x) => x.repairs), repairDays: avg((x) => x.repairDays), lost: avg((x) => x.lost), spentOnShips: avg((x) => x.spentOnShips),
    firstCaravel: avg((x) => Number((x.events.find((e) => e.includes('flagship to caravel')) || '1451').split(' ')[0])),
    firstBarinel: avg((x) => Number((x.events.find((e) => e.includes('flagship to barinel')) || '1551').split(' ')[0])),
    broke: runs.filter((x) => x.broke != null).length / runs.length,
    brokeYear: avg((x) => x.broke ?? 0) / Math.max(1e-9, runs.filter((x) => x.broke != null).length / runs.length),
    nau: runs.filter((x) => x.events.some((e) => e.includes('nau delivered'))).length / runs.length,
    hired: avg((x) => x.events.filter((e) => e.includes('captain, caravel')).length),
    sample: runs[0].events.slice(0, 12),
  };
  out.push(res);
  console.error(`${res.cfg.padEnd(5)} final ${Math.round(res.final).toLocaleString('en').padStart(12)} | 1462 ${Math.round(res.at[1462]).toLocaleString('en').padStart(9)} | 1480 ${Math.round(res.at[1480]).toLocaleString('en').padStart(10)} | repairs ${Math.round(res.repairs).toLocaleString('en')} | ${res.seconds}s`);
}
console.log(JSON.stringify(out));

// Does the India run pay? One hired ship, from 1500, on the Lisbon–Calicut run against the
// African runs, for each big hull: cash a year after wages, repairs, boatmen and losses, with ports
// growing and rival merchants as in the game.
//
//   node tests/sim/india_run.mjs                # 10 years from 1500, 24 runs each
//   node tests/sim/india_run.mjs --years 20 --runs 40 --from 1510

import { Market } from '../../public/js/economy.js';
import * as Fleet from '../../public/js/fleet.js';
import * as Events from '../../public/js/events.js';
import * as Ships from '../../public/js/ships.js';
import * as Accounts from '../../public/js/accounts.js';
import * as Ports from '../../public/js/ports.js';
import * as Competition from '../../public/js/competition.js';
import { PORTS } from '../../public/js/world.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const YEARS = arg('years', 10), RUNS = arg('runs', 24), FROM = arg('from', 1500);
const STEP = 0.5;
const stop = (port, ...orders) => ({ port, orders });
const sell = { act: 'sell', good: 'all' };
const buy = (good, pct = 100) => ({ act: 'buy', good, pct });
const ROUTES = {
  'Lisbon ⇄ Calicut (copper, gold out; spices home)': [stop('lisbon', sell, buy('copper', 60), buy('gold', 20)), stop('calicut', sell, buy('spices'))],
  'Lisbon → Lanzarote → Arguin → Gambia, best goods': [stop('lisbon', sell, buy('best')), stop('lanzarote', sell, buy('best', 50)), stop('arguin', sell, buy('best', 50)), stop('gambia', sell, buy('best'))],
  'Lisbon ⇄ Mina, best goods': [stop('lisbon', sell, buy('best')), stop('mina', sell, buy('best'))],
};

function run(hull, route) {
  const S = { day: Ships.dayOfYear(FROM) + 59, purse: 50000, discovered: Object.fromEntries(PORTS.map((p) => [p.id, true])), ship: { docked: null }, contracts: { standing: 60 }, fleet: null };
  Fleet.ensureFleet(S); Events.ensureEvents(S); Accounts.ensureAccounts(S); Ports.ensurePorts(S);
  const market = new Market();
  // rivals as they would stand by now
  for (let t = 0; t < 365 * (FROM - 1451); t += 30) { const d = S.day; S.day = Ships.dayOfYear(1451) + t; Competition.tick(S, 30, null); S.day = d; }
  const ship = { id: 1, name: 'Ship', hull, captain: { id: 1, name: 'C', nav: 4, trade: 4, wage: 4, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null, hullPct: 100, built: S.day, tropic: 0 };
  S.fleet.ships.push(ship);
  Fleet.setRoute(S, market, ship, { stops: route.map((s) => ({ port: s.port, orders: s.orders.map((o) => ({ ...o })) })), next: 0 });
  const p0 = S.purse;
  let lost = 0, rounds = 0;
  for (let t = 0; t < YEARS * 365; t += STEP) {
    S.day += STEP;
    market.tick(STEP); Events.tick(S, STEP); Events.applyToMarket(S, market);
    Ports.grow(S, STEP, market);
    market.scale = Object.fromEntries(PORTS.map((p) => [p.id, Ports.depthScale(S, p.id)]));
    Competition.tick(S, STEP, market); market.rival = Competition.factors(S, market);
    const at = ship.at;
    Fleet.tick(S, market, STEP, true);
    if (!S.fleet.ships.length) { // lost: buy her again, as an owner would
      lost++; S.purse -= Ships.HULLS[hull].price;
      Object.assign(ship, { at: 'lisbon', status: 'idle', leg: null, hold: {}, hullPct: 100, built: S.day, tropic: 0, strain: 0, rebuilt: 0, sunk: false });
      S.fleet.ships.push(ship);
      Fleet.setRoute(S, market, ship, { stops: route.map((s) => ({ port: s.port, orders: s.orders.map((o) => ({ ...o })) })), next: 0 });
    }
    if (ship.at === 'lisbon' && at !== 'lisbon') rounds++;
  }
  const cargo = Object.values(ship.hold).reduce((n, l) => n + l.paid, 0);
  return { perYear: (S.purse - p0 + cargo) / YEARS, lost, rounds };
}

console.log(`One hired ship (nav 4, trade 4), ${YEARS} years from ${FROM}, ${RUNS} runs: cash a year (counting cargo aboard at cost), ships lost, rounds`);
for (const [name, route] of Object.entries(ROUTES)) {
  console.log(`\n${name}`);
  for (const hull of ['barinel', 'nau', 'galeao', 'naudaindia']) {
    if (FROM < Ships.HULLS[hull].year) continue;
    const rs = Array.from({ length: RUNS }, () => run(hull, route));
    const avg = (f) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
    const sorted = rs.map((r) => r.perYear).sort((a, b) => a - b);
    console.log(`  ${Ships.HULLS[hull].name.padEnd(14)} ${Math.round(avg((r) => r.perYear)).toLocaleString('en').padStart(7)} cz/yr  (worst ${Math.round(sorted[0]).toLocaleString('en')}, best ${Math.round(sorted[sorted.length - 1]).toLocaleString('en')})  lost ${avg((r) => r.lost).toFixed(2)}  rounds ${avg((r) => r.rounds).toFixed(1)}`);
  }
}

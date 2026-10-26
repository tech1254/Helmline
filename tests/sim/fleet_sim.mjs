// Headless fleet simulator: runs the real fleet, market and events code in Node, with no
// browser, to see what hired captains earn over a stretch of days.
//
//   node tests/sim/fleet_sim.mjs                 # the standard scenarios, 40 runs each
//   node tests/sim/fleet_sim.mjs --days 200 --runs 100
//
// Each scenario is a set of ships with routes; the owner is away (as on a night away from
// the game), so nothing else trades. Results are averaged over many runs, since prices
// drift and events strike at random.

import { Market, GOODS } from '../../public/js/economy.js';
import * as Fleet from '../../public/js/fleet.js';
import * as Events from '../../public/js/events.js';
import { PORTS } from '../../public/js/world.js';
import * as Accounts from '../../public/js/accounts.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const DAYS = arg('days', 200);
const RUNS = arg('runs', 40);
const STEP = 0.25;

const stop = (port, ...orders) => ({ port, orders });
const sell = { act: 'sell', good: 'all' };
const buy = (good, pct = 100) => ({ act: 'buy', good, pct });

// Allan's fleet on 26 October 2026, plus a few common routes for comparison.
export const SCENARIOS = {
  'Allan: Lisbon cloth ⇄ Gambia pepper': [
    { nav: 5, trade: 3, wage: 4, route: [stop('lisbon', sell, buy('cloth')), stop('gambia', sell, buy('pepper'))] },
  ],
  'Allan: Lisbon → Arguin → Lanzarote, best goods': [
    { nav: 5, trade: 4, wage: 4, route: [stop('lisbon', sell, buy('best')), stop('arguin', sell, buy('best', 50)), stop('lanzarote', buy('best', 50))] },
  ],
  'Lisbon ⇄ Lanzarote, best goods': [
    { nav: 3, trade: 3, wage: 3, route: [stop('lisbon', sell, buy('best')), stop('lanzarote', sell, buy('best'))] },
  ],
  'Lisbon ⇄ Gambia, best goods': [
    { nav: 3, trade: 3, wage: 3, route: [stop('lisbon', sell, buy('best')), stop('gambia', sell, buy('best'))] },
  ],
};

function freshState(ships) {
  const S = {
    day: 0, purse: 20000, discovered: Object.fromEntries(PORTS.map((p) => [p.id, true])),
    ship: { docked: null }, contracts: { standing: 52 }, fleet: null,
  };
  Fleet.ensureFleet(S);
  ships.forEach((d, i) => {
    S.fleet.ships.push({
      id: i + 1, name: `Ship ${i + 1}`, captain: { id: i + 1, name: `Captain ${i + 1}`, nav: d.nav, trade: d.trade, wage: d.wage, loyalty: 100 },
      at: d.route[0].port, status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null,
    });
  });
  return S;
}

// Cargo still aboard, at what was paid for it.
function holdCost(ship) {
  return Object.values(ship.hold || {}).reduce((t, lot) => t + lot.paid, 0);
}

// Cash in and out per ship, from the captains' own accounts (as the Ledger sees them).
function cashOf(S, ship) {
  const A = Accounts.ensureAccounts(S);
  const entries = [...A.pending, ...A.entries].filter((e) => e.who === ship.id);
  const by = (k) => entries.filter((e) => e.kind === k).reduce((t, e) => t + e.amount, 0);
  const wages = -by('wages') + (ship.wagesDue || 0);
  return { sales: by('sale'), purchases: -by('purchase'), skim: -by('skim'), wages };
}

export function runScenario(ships, { days = DAYS, runs = RUNS } = {}) {
  const sum = ships.map(() => ({ sales: 0, purchases: 0, wages: 0, cash: 0, worth: 0 }));
  for (let r = 0; r < runs; r++) {
    const S = freshState(ships);
    const market = new Market();
    Events.ensureEvents(S);
    Accounts.ensureAccounts(S);
    // Settle in for a while first, so the run starts mid-voyage as a night away would.
    S.fleet.ships.forEach((ship, i) => {
      Fleet.setRoute(S, market, ship, { stops: ships[i].route.map((s) => ({ port: s.port, orders: s.orders.map((o) => ({ ...o })) })), next: 0 });
    });
    const step = (n) => {
      for (let t = 0; t < n; t += STEP) {
        S.day += STEP;
        market.tick(STEP);
        Events.tick(S, STEP);
        Events.applyToMarket(S, market);
        Fleet.tick(S, market, STEP, false);
      }
    };
    step(120);
    const before = S.fleet.ships.map((x) => ({ ...cashOf(S, x), hold: holdCost(x) }));
    step(days);
    S.fleet.ships.forEach((x, i) => {
      const a = cashOf(S, x), b = before[i];
      const sales = a.sales - b.sales, purchases = a.purchases - b.purchases, wages = a.wages - b.wages;
      const cash = sales - purchases - (a.skim - b.skim) - wages;
      sum[i].sales += sales; sum[i].purchases += purchases; sum[i].wages += wages;
      sum[i].cash += cash;
      sum[i].worth += cash + holdCost(x) - b.hold;
    });
  }
  return sum.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v / runs])));
}

export function report(title, extra = '') {
  console.log(`\n${title}${extra}`);
  for (const [name, ships] of Object.entries(SCENARIOS)) {
    const res = runScenario(ships);
    for (const r of res) {
      const f = (v) => Math.round(v).toLocaleString('en').padStart(7);
      console.log(`  ${name.padEnd(48)} cash ${f(r.cash)} | counting cargo aboard ${f(r.worth)} | sales ${f(r.sales)} | bought ${f(r.purchases)} | wages ${f(r.wages)}`);
    }
  }
}

// Try alternative numbers without editing the game: --k 0.6 scales every market's depth
// (lower = a load moves the price less), --wage -1 changes every captain's daily cost.
const K = arg('k', 1), WAGE = arg('wage', 0);
if (K !== 1) {
  const k0 = Market.prototype.k;
  Market.prototype.k = function (port, good) { return k0.call(this, port, good) * K; };
}
if (WAGE) for (const ships of Object.values(SCENARIOS)) for (const d of ships) d.wage += WAGE;

if (import.meta.url === `file://${process.argv[1]}`) {
  report(`${DAYS} days, ${RUNS} runs each`, `${K !== 1 ? `, market depth ×${K}` : ''}${WAGE ? `, wages ${WAGE > 0 ? '+' : ''}${WAGE}/day` : ''}`);
}

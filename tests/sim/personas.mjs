// Simulated players: whole careers (1451 to 1551) played headless by four kinds of captain, from
// the timid to the reckless, on the game's own market, fleet, port, contract and corsair code.
//
//   node tests/sim/personas.mjs                       # all four, 8 careers each, 100 years
//   node tests/sim/personas.mjs --runs 20 --years 50
//   node tests/sim/personas.mjs --only bold --runs 4 --log   # one persona, with a career log
//   node tests/sim/personas.mjs --json                # machine-readable results on stdout
//
// What each simulated player does, in the game's terms:
//  - Starts as a new game does: 300 cz, a barca, in Lisbon, knowing only the home waters.
//  - Trades his own ship on a loop (sailing as a skilled captain would), and hires captains for
//    other loops as his purse and standing allow (the fleet code sails them).
//  - Explores south once he can afford to risk it, which charts Arguin and the Gambia and earns
//    Prince Henry's reward for opening a new trading partner.
//  - Reads the contract board at every port he calls at and takes the offers that suit him,
//    detouring for them if he is willing to; buys the goods at the source, delivers them on time
//    (or misses the deadline and loses standing). Contract goods take room in his hold.
//  - Meets corsairs in their waters as the game rolls them, and answers run, fight or pay by
//    temperament. Damage, plunder, notoriety and caution all follow the game's rules.
//  - Trades up his ships when he can spare the money, choosing hulls by temperament: a mixed
//    fleet (shallow hulls for the shallow ports) or the biggest ship he can get, everywhere.
// Not simulated: the crown's chart rewards, refits, loyalty troubles (he is always "present"),
// and exploring beyond Serra Leoa.

import { readFileSync } from 'node:fs';
import { Market, GOODS, PORTUGUESE_PORTS } from '../../public/js/economy.js';
import * as Fleet from '../../public/js/fleet.js';
import * as Events from '../../public/js/events.js';
import * as Ships from '../../public/js/ships.js';
import * as Accounts from '../../public/js/accounts.js';
import * as Ports from '../../public/js/ports.js';
import * as Contracts from '../../public/js/contracts.js';
import * as Pirates from '../../public/js/pirates.js';
import * as Investments from '../../public/js/investments.js';
import { PORTS, HARBOURS, distNm, findPath, loadRoutes } from '../../public/js/world.js';

loadRoutes(JSON.parse(readFileSync(new URL('../../public/data/routes.json', import.meta.url))));

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);
const YEARS = Number(arg('years', 100));
const RUNS = Number(arg('runs', 8));
const ONLY = arg('only', null);
const STEP = 0.5;
// Seeded luck: career n of a persona always gets seed (--seed) + n, so two settings can be
// compared on the same winds of fortune.
const SEED = Number(arg('seed', 1));
function seedRandom(seed) {
  let x = seed >>> 0;
  Math.random = () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DAYS = Math.round(YEARS * 365.25);
const yearOf = (day) => 1451 + day / 365.25;

// Tuning knobs, for trying numbers without editing the game: --set ports.depthExp=0.4 and so on.
// Each takes the module's exported TUNING-style object and a key (see apply below).
const SETS = process.argv.flatMap((a, i) => (a === '--set' ? [process.argv[i + 1]] : []));
for (const s of SETS) {
  const [path, v] = s.split('=');
  const [mod, key] = path.split('.');
  const target = { ports: Ports.TUNING }[mod];
  if (!target || !(key in target)) throw new Error(`unknown setting ${path}`);
  target[key] = Number(v);
}

// ---- The players ---------------------------------------------------------------------------
// reserve:   share of the purse he will not spend on ships
// spendAt:   he buys a ship only when the purse is this many times its cost
// explore:   purse at which he sails south into the unknown
// contracts: most contracts he will hold at once; slack: how much spare time he wants before a
//            deadline (1.6 = 60% more than he expects to need); minGain: profit he wants from a
//            contract over what the hold would have made trading, as a share of its cost;
//            detour: most extra days he will sail out of his way for one
// corsair:   how he answers corsairs (see choose())
// hires:     most hired captains; mixed: fits hulls to harbours (false = the biggest, always)
// ladder:    hulls he is willing to sail, smallest to largest
export const PERSONAS = {
  cautious: { label: 'Cautious', spare: true, reserve: 0.5, spendAt: 3, explore: 1500, contracts: 1, slack: 1.6, minGain: 0.3, detour: 0,
    corsair: 'pay', hires: 1, mixed: true, ladder: ['barca', 'caravel', 'barinel'] },
  steady: { label: 'Steady', reserve: 0.25, spendAt: 2, explore: 800, contracts: 2, slack: 1.25, minGain: 0.15, detour: 12,
    corsair: 'sensible', hires: 2, mixed: true, ladder: ['barca', 'caravel', 'barinel', 'largecaravel', 'nau'] },
  bold: { label: 'Bold', reserve: 0.1, spendAt: 1.4, explore: 400, contracts: 3, slack: 1.05, minGain: 0.05, detour: 25,
    corsair: 'bold', hires: 3, mixed: true, ladder: ['barca', 'caravel', 'barinel', 'largecaravel', 'redonda', 'nau'] },
  reckless: { label: 'Reckless', reserve: 0, spendAt: 1.1, explore: 300, contracts: 9, slack: 0.85, minGain: 0, detour: 45,
    corsair: 'reckless', hires: 3, mixed: false, ladder: ['barca', 'caravel', 'barinel', 'largecaravel', 'redonda', 'nau'] },
};
// Controlled comparisons: the Steady player with one thing changed, so that any difference in
// the results comes from that one choice.
const steady = PERSONAS.steady;
Object.assign(PERSONAS, {
  runner: { ...steady, label: 'Always runs (else Steady)', corsair: 'run', spare: true },
  fighter: { ...steady, label: 'Always fights (else Steady)', corsair: 'fight' },
  armed: { ...steady, label: 'Armed fighter (else Steady)', corsair: 'fight',
    arms: [['defence', 'nets'], ['crew', 'crossbows'], ['guns', 'bercos'], ['crew', 'menatarms'], ['guns', 'bombards']] },
  payer: { ...steady, label: 'Always pays (else Steady)', corsair: 'pay', spare: true },
  merchant: { ...steady, label: 'No contracts (else Steady)', contracts: 0 },
  courier: { ...steady, label: 'Every contract he can (else Steady)', contracts: 9, minGain: 0, detour: 30 },
  bigships: { ...steady, label: 'Biggest ships (else Steady)', mixed: false },
  // After 1480: a rich owner who sends ships to India and puts money into feitorias and the
  // crown's India fleets.
  indies: { ...steady, label: 'The Indies: India runs and investments (else Steady)', hires: 3, indies: true, invest: true, feitorias: 3,
    ladder: [...steady.ladder, 'galeao', 'naudaindia'] },
});
export const GROUPS = { late: ['steady', 'indies'], styles: ['cautious', 'steady', 'bold', 'reckless'], corsairs: ['runner', 'fighter', 'armed', 'payer'], contracts: ['merchant', 'courier'], fleet: ['bigships'] };

// ---- Routes --------------------------------------------------------------------------------
const stop = (port, ...orders) => ({ port, orders });
const sell = { act: 'sell', good: 'all' };
const buy = (good, pct = 100) => ({ act: 'buy', good, pct });
const best = (port) => stop(port, sell, buy('best'));
const LOOPS = {
  home: [best('lisbon'), best('safi'), best('lanzarote')], // the known coast, in reach of a barca
  africa: [best('lisbon'), stop('lanzarote', sell, buy('best', 50)), stop('arguin', sell, buy('best', 50)), best('gambia')],
  deep: [best('lisbon'), stop('funchal', sell, buy('best', 50)), best('serraleoa')], // deep harbours, for a nau
  gambia: [stop('lisbon', sell, buy('cloth')), stop('gambia', sell, buy('pepper'))],
  arguin: [best('lisbon'), stop('arguin', sell, buy('best', 50)), stop('lanzarote', buy('best', 50))],
  cantor: [best('lisbon'), stop('gambia', sell, buy('best', 50)), best('cantor')], // upriver
  india: [stop('lisbon', sell, buy('copper', 50), buy('gold', 25)), stop('calicut', sell, buy('spices'))], // beyond the Cape
};
const CAPTAIN_LOOPS = ['gambia', 'arguin', 'cantor'];
const port = (id) => PORTS.find((p) => p.id === id);
const portsOf = (loop) => LOOPS[loop].map((s) => s.port);
// The shallowest water a loop's ships must lie in (dry season, before harbour works).
const shallowest = (loop) => Math.min(...portsOf(loop).map((id) => (HARBOURS[id]?.depth ?? 5) - (HARBOURS[id]?.seasonal ? 0.3 : 0)));

// ---- The flagship's hold ------------------------------------------------------------------
// Contract goods ride in the flagship's hold but are not hers to sell: they live in a separate
// lot, and the hold the fleet code sees is smaller by that much (a copy of her hull with less room).
const FLAG = '__flag';
function setFlagHull(fl) {
  const h = Ships.HULLS[fl.realHull];
  const used = Object.values(fl.cHold).reduce((t, l) => t + l.qty, 0);
  Ships.HULLS[FLAG] = { ...h, id: FLAG, hold: Math.max(0, h.hold - used) };
  fl.hull = FLAG;
}

// ---- One career ---------------------------------------------------------------------------
function career(persona) {
  const P = PERSONAS[persona];
  const S = {
    day: 0, purse: 300, discovered: Object.fromEntries(PORTS.map((p) => [p.id, !!p.known])),
    ship: { docked: 'lisbon', hull: 'barca', fit: { ...Ships.DEFAULT_FIT } }, cargo: {}, paid: {}, hull: 100, fleet: null,
  };
  Fleet.ensureFleet(S);
  Events.ensureEvents(S);
  Accounts.ensureAccounts(S);
  Contracts.ensureContracts(S);
  Pirates.ensurePirates(S);
  Ports.ensurePorts(S);
  const market = new Market();
  const R = {
    persona, at: {}, log: [], shipsBought: 0, spentOnShips: 0, lost: 0, broke: null,
    contracts: { taken: 0, done: 0, failed: 0, reward: 0, cost: 0, detours: 0 },
    corsairs: { met: 0, pay: 0, run: 0, fight: 0, won: 0, lost: 0, cash: 0, cargo: 0, plundered: 0 },
    byDecade: {}, attention: {}, series: [], riverWaitDays: 0, boatDays: 0, firstHire: null, explored: null, nau: null,
  };
  const note = (s) => R.log.push(`${yearOf(S.day).toFixed(1)} ${s}`);
  let nextId = 1;
  const price = (h) => Ships.HULLS[h].price;
  const standing = () => Contracts.ensureContracts(S).standing;
  const canSail = (h) => {
    const H = Ships.HULLS[h];
    return Ships.yearOf(S.day) >= (H.year || 0) && standing() >= (H.standing || 0) && P.ladder.includes(h);
  };
  // the owner's own wage bill: the hull's upkeep, plus fighting men he has signed on
  const flagWage = (h, fit) => Ships.stats({ hull: h, fit }).upkeep - Ships.HULLS[h].hiredUpkeep;
  const route = (loop) => ({ stops: LOOPS[loop].map((s) => ({ port: s.port, orders: s.orders.map((o) => ({ ...o })) })), next: 0 });

  const add = (role, hull, loop, captain) => {
    const ship = { id: nextId++, name: role, role, loop, hull, realHull: hull, cHold: {}, fit: { ...Ships.DEFAULT_FIT }, captain: { id: nextId, name: role, ...captain, loyalty: 100 },
      at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null, hullPct: 100 };
    S.fleet.ships.push(ship);
    if (role === 'flagship') setFlagHull(ship);
    Fleet.setRoute(S, market, ship, route(loop));
    return ship;
  };
  const fl = () => S.fleet.ships.find((x) => x.role === 'flagship');
  add('flagship', 'barca', 'home', { nav: 5, trade: 5, wage: flagWage('barca') });

  const spend = (cost, what) => {
    S.purse -= cost; R.spentOnShips += cost; R.shipsBought++;
    Accounts.record(S, { kind: 'ships', amount: -cost, text: what });
    note(`${what} (${cost} cz)`);
  };
  const affordable = (cost) => cost * P.spendAt <= S.purse * (1 - P.reserve) && S.purse - cost > 200;

  // The hull he wants for a loop: the biggest he will sail, or (mixed) the biggest that lies
  // alongside in every port of the loop when laden, so that no boats or rains are needed.
  const wantHull = (loop, coastalOk) => {
    const ok = P.ladder.filter((h) => canSail(h) && (coastalOk || !Ships.HULLS[h].coastal));
    // even the biggest-ship owner will not buy a ship that can never reach a port on the loop
    const reach = ok.filter((h) => portsOf(loop).every((id) => !HARBOURS[id]?.seasonal || !LOOPS[loop].length || id !== 'cantor' || Ships.HULLS[h].draft[0] <= HARBOURS[id].depth + 0.8));
    const fits = P.mixed && loop !== 'india' ? reach.filter((h) => Ships.HULLS[h].draft[1] <= shallowest(loop)) : reach;
    const pool = fits.length ? fits : ok;
    return pool.sort((a, b) => Ships.HULLS[b].hold - Ships.HULLS[a].hold)[0];
  };
  // The flagship's loop and hull: home waters until he has explored, then Africa; a mixed-fleet
  // owner who has charted Serra Leoa and can get a nau puts her on the deep-water loop, where she
  // lies alongside everywhere; the biggest-ship owner sails her to Africa all the same.
  const flagPlan = () => {
    if (!S.discovered.gambia) return { loop: 'home', hull: wantHull('home', false) };
    if (P.mixed && S.discovered.serraleoa && canSail('nau')) return { loop: 'deep', hull: 'nau' };
    return { loop: 'africa', hull: wantHull('africa', false) };
  };

  // ---- The owner's monthly decisions ----
  const owner = () => {
    const f = fl();
    if (!f) return;
    Contracts.maybeUnlock(S);
    const busy = Contracts.ensureContracts(S).active.some((c) => c.kind === 'deliver');
    // explore south once he can risk it (a barca can follow the coast)
    if (!S.discovered.gambia && f.loop === 'home' && S.purse >= P.explore && !f.leg && !busy) {
      f.loop = 'africa';
      Fleet.setRoute(S, market, f, route('africa'));
      note('sails south to explore');
    }
    // and on to Serra Leoa, for a captain with a deep ship in mind
    if (S.discovered.gambia && !S.discovered.serraleoa && P.mixed && P.ladder.includes('nau') && Ships.yearOf(S.day) >= 1466 && !f.leg && !busy && f.loop === 'africa') {
      f.loop = 'deep';
      Fleet.setRoute(S, market, f, route('deep'));
      note('sails for Serra Leoa');
    }
    // fit her out for fighting, one thing at a time, as the purse allows (in a shipyard port)
    if (P.arms && !f.leg && ['lisbon', 'lagos', 'funchal'].includes(f.at)) {
      for (const [g, c] of P.arms) {
        if (f.fit[g] === c || Ships.choicesFor(Ships.group(g), f.realHull).every((x) => x.id !== c)) continue;
        if (g === 'crew' && c === 'crossbows' && f.fit.crew === 'menatarms') continue;
        S.ship.hull = f.realHull; S.ship.fit = f.fit;
        const fit = { ...f.fit, [g]: c };
        const q = Ships.quoteFit(S, fit);
        if (q.error || q.ordered.length || !affordable(q.cost)) break;
        spend(q.cost, `fits ${Ships.choice(g, c).name.toLowerCase()}`);
        f.fit = fit;
        f.captain.wage = flagWage(f.realHull, fit);
        break;
      }
    }
    // a captain who wants a third ship looks up the Gambia river to Cantor once (a shallow ship can)
    if (S.discovered.gambia && !S.discovered.cantor && P.hires >= 3 && f.loop === 'africa' && Ships.HULLS[f.realHull].draft[1] <= 2.2 &&
        !f.route.stops.some((st) => st.port === 'cantor')) {
      const i = f.route.stops.findIndex((st) => st.port === 'gambia');
      f.route.stops.splice(i + 1, 0, { port: 'cantor', orders: [{ ...sell }, buy('best', 50)], temp: 'explore' });
      if (i + 1 <= f.route.next && f.leg) f.route.next++;
    }
    // trade up the flagship (trading in the old hull at half its price)
    const hireds = S.fleet.ships.filter((x) => x.role !== 'flagship');
    const plan0 = flagPlan();
    const upgrade = (ship, to) => {
      const cost = price(to) - Math.round(price(ship.realHull) / 2);
      if (Ships.HULLS[to].hold <= Ships.HULLS[ship.realHull].hold || !affordable(cost) || ship.leg) return false;
      spend(cost, `${ship.role}: ${Ships.HULLS[ship.realHull].name} to ${Ships.HULLS[to].name}`);
      ship.realHull = to; ship.hullPct = 100;
      if (ship.role === 'flagship') {
        ship.fit = Ships.normalFit(to, ship.fit);
        ship.captain.wage = flagWage(to, ship.fit);
        setFlagHull(ship);

      } else ship.hull = to;
      if (to === 'nau' && R.nau == null) R.nau = yearOf(S.day);
      return true;
    };
    if (plan0.hull && plan0.hull !== f.realHull) upgrade(f, plan0.hull);
    // change loops in port, with no contract goods aboard or promised
    const plan1 = flagPlan();
    if (plan1.loop !== f.loop && !f.leg && !busy && (plan1.loop !== 'deep' || f.realHull === 'nau')) {
      f.loop = plan1.loop; Fleet.setRoute(S, market, f, route(plan1.loop));
    }
    // hire captains, as many as he wants and his standing allows, for loops already charted
    const room = Math.min(P.hires + (P.indies && S.discovered.calicut ? 1 : 0), Contracts.perks(S).maxShips) - hireds.length;
    if (room > 0) {
      // the India man keeps a berth for the India run, which opens in 1499
      const loops = P.indies ? (S.discovered.calicut ? ['india', ...CAPTAIN_LOOPS] : CAPTAIN_LOOPS.slice(0, P.hires - 1)) : CAPTAIN_LOOPS;
      const loop = loops.find((l) => !hireds.some((x) => x.loop === l) && portsOf(l).every((id) => S.discovered[id]));
      if (loop) {
        const h = wantHull(loop, true);
        if (h && affordable(price(h))) {
          spend(price(h), `hires a captain with a ${Ships.HULLS[h].name} for the ${loop} run`);
          add(`captain ${hireds.length + 1}`, h, loop, { nav: 4, trade: 4, wage: 4 });
          if (R.firstHire == null) R.firstHire = yearOf(S.day);
        }
      }
    }
    for (const x of hireds) {
      const h = wantHull(x.loop, true);
      if (h && h !== x.realHull) upgrade(x, h);
    }
    // a rich man's investments: shares in the India fleet, and feitorias where his ships trade
    if (P.invest && f.at === 'lisbon' && Investments.fleetsOpen(S)) {
      const spare = S.purse * (1 - P.reserve) - 5000;
      const n = Math.floor(Math.min(spare * 0.25, Investments.SHARE * Investments.MAX_SHARES) / Investments.SHARE);
      if (n > 0 && Investments.buyShares(S, n)) note(`buys ${n} shares in the India fleet`);
    }
    if (P.invest && Object.keys(Investments.ensureInvest(S).feitorias).length < (P.feitorias || 0)) {
      // where his ships call most often
      const calls = {};
      for (const x of S.fleet.ships) for (const st of x.route?.stops || []) calls[st.port] = (calls[st.port] || 0) + 1;
      for (const pid of Object.keys(calls).sort((a, b) => calls[b] - calls[a])) {
        const c = Investments.canFound(S, pid);
        if (c.ok && affordable(c.cost * 3)) { Investments.found(S, pid); R.feitorias = (R.feitorias || 0) + 1; note(`founds a feitoria at ${pid} (${c.cost} cz)`); break; }
      }
    }
  };

  // ---- Contracts at the flagship's port of call ----
  const speed = (f) => Ships.stats({ hull: f.realHull }).knots * 24 * 0.55; // nm a day, all in
  const nmCache = new Map();
  const legNm = (a, b, f) => {
    const coastal = !!Ships.HULLS[f.realHull].coastal;
    const key = `${a}>${b}${coastal ? 'c' : ''}`;
    if (!nmCache.has(key)) {
      const A = port(a), B = port(b);
      const path = findPath(A.lon, A.lat, B.lon, B.lat, 1, coastal);
      let nm = 0, lon = A.lon, lat = A.lat;
      if (path) for (const [x, y] of path) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
      nmCache.set(key, path ? nm : Infinity);
    }
    return nmCache.get(key);
  };
  // Passage times he has learned from his own voyages (from>to, by hull), else a guess from the distance.
  const learned = new Map();
  const legDays = (a, b, f) => {
    if (a === b) return 0;
    const k = `${a}>${b}>${f.realHull}`;
    return learned.has(k) ? learned.get(k) : legNm(a, b, f) / speed(f);
  };
  const PORT_DAYS = 2; // in port, trading and taking on water
  // Days from `here` to pick up at `src` and deliver at `dst`, following the loop, and the extra
  // days if either port has to be added to it. Added ports go after any already added for other
  // contracts, so that earlier promises are not put at risk.
  const plan = (f, here, src, dst) => {
    const stops = f.route.stops;
    const n = stops.length, at = f.route.next; // she is arriving at stops[at] === here
    const seq = [{ port: here }];
    for (let k = 1; k <= 2 * n; k++) seq.push(stops[(at + k) % n]);
    const ports = seq.map((x) => x.port);
    const iS = src === here ? 0 : ports.indexOf(src);
    const iD = iS >= 0 ? ports.indexOf(dst, iS + 1) : -1;
    const along = (list, upto) => {
      let d = 0;
      for (let i = 1; i <= upto; i++) d += legDays(list[i - 1], list[i], f) + PORT_DAYS;
      return d;
    };
    if (iS >= 0 && iD > 0) return { days: along(ports, iD), detour: 0, insert: [], after: 0 };
    let after = 0; // insert after the last added stop in the next round
    for (let k = 1; k < n; k++) if (seq[k].temp) after = k;
    const add = [...(src === here || ports.slice(0, after + 1).includes(src) ? [] : [src]), dst];
    const list = [...ports.slice(0, after + 1), ...add, ...ports.slice(after + 1)];
    const iDst = after + add.length;
    const detour = along(list, iDst + 1) - along(ports, after + 1);
    return { days: along(list, iDst), detour, insert: add, after };
  };
  let flagRate = 0; // the flagship's trading profit a day, a running average
  let lastProfit = 0, lastDay = 0;

  const atPort = (f, here) => {
    S.discovered[here] = true;
    S.ship.docked = here;
    S.ship.hull = f.realHull; S.ship.fit = f.fit;
    // discovery and reporting home (Prince Henry's contract)
    for (const m of Contracts.onDock(S, here)) if (m.log) note(m.log);
    Pirates.collectBounty(S, here); // the crown's bounty for galleys taken, in a Portuguese port
    const C = Contracts.ensureContracts(S);
    // deliver what is aboard for this port
    for (const c of [...C.active]) {
      if (c.kind !== 'deliver' || c.to !== here || !f.cHold[c.id]) continue;
      const lot = f.cHold[c.id];
      S.cargo = { [c.good]: lot.qty }; S.paid = { [c.good]: lot.paid };
      Contracts.deliver(S, c);
      delete f.cHold[c.id];
      R.contracts.done++; R.contracts.reward += c.reward;
      if (process.env.DBG) note(`done #${c.id} in ${(S.day - c.accepted).toFixed(0)}d`);
    }
    // read the board
    // room left for contract goods: the hold less what is aboard or promised for other contracts
    const room = (except) => Ships.HULLS[f.realHull].hold - C.active.filter((c) => c.kind === 'deliver' && c.id !== except).reduce((t, c) => t + c.qty, 0);
    const offers = [...Contracts.offersAt(S, market, here)];
    for (const o of offers) {
      const active = C.active.filter((c) => c.kind === 'deliver').length;
      if (active >= Math.min(P.contracts, Contracts.maxActive(S))) break;
      if (o.qty > room() * 0.6) continue; // he keeps most of his hold for his own trade
      const cost = o.qty * market.buyPrice(o.source, o.good);
      if (cost * 1.3 > S.purse * (1 - P.reserve) - 100) continue; // prices rise as he buys
      const pl = plan(f, here, o.source, o.to);
      if (pl.detour > P.detour || !Number.isFinite(pl.days)) continue;
      if (pl.days * P.slack + 2 > o.offeredDays) continue;
      const hold = Ships.HULLS[f.realHull].hold;
      const opportunity = flagRate * (o.qty / hold) * pl.days + flagRate * pl.detour;
      if (o.reward - cost - opportunity < P.minGain * cost) continue;
      const c = Contracts.accept(S, o.id, here);
      if (!c) continue;
      R.contracts.taken++;
      if (process.env.DBG) note(`took #${c.id} at ${here}: ${c.source}>${c.to} plan ${pl.days.toFixed(0)}d +${pl.detour.toFixed(0)} detour, allowed ${o.offeredDays}d, loop ${f.route.stops.map((s) => s.port).join(',')}`);
      if (pl.insert.length) {
        // add the ports to the loop, right after this one, for as long as the contract needs them
        const r = f.route, i = (r.next + pl.after) % r.stops.length;
        r.stops.splice(i + 1, 0, ...pl.insert.map((id) => ({ port: id, orders: [{ ...sell }, buy('best', 50)], temp: true })));
        if (i + 1 <= r.next) r.next += pl.insert.length;
        R.contracts.detours++;
      }
    }
    // load contract goods bought here
    for (const c of C.active) {
      if (c.kind !== 'deliver' || c.source !== here || f.cHold[c.id]) continue;
      const res = market.buy(here, c.good, c.qty, Math.max(0, S.purse - 50), room(c.id));
      if (process.env.DBG && res.bought < c.qty) note(`#${c.id} could buy only ${res.bought}/${c.qty} ${c.good} at ${here}`);
      if (res.bought < c.qty) { // could not buy it all: sell back what he got, and try again next call
        if (res.bought) S.purse += market.sell(here, c.good, res.bought).income - res.cost;
        continue;
      }
      S.purse -= res.cost;
      Accounts.record(S, { kind: 'contractGoods', amount: -res.cost, good: c.good, qty: c.qty, text: `for a contract: ${c.title}` });
      f.cHold[c.id] = { good: c.good, qty: c.qty, paid: res.cost };
      R.contracts.cost += res.cost;
    }
    setFlagHull(f);
    S.ship.docked = null;
  };

  // Temporary stops are dropped once nothing still needs them.
  const tidyRoute = (f) => {
    const C = Contracts.ensureContracts(S);
    const r = f.route;
    if (!r) return;
    for (let i = r.stops.length - 1; i >= 0; i--) {
      const st = r.stops[i];
      const canStill = Ships.HULLS[f.realHull].draft[1] <= 2.2; // a ship traded up since may not get up the river
      if (!st.temp || (st.temp === 'explore' && !S.discovered[st.port] && canStill)) continue;
      const needed = C.active.some((c) => c.kind === 'deliver' && (c.to === st.port || (c.source === st.port && !f.cHold[c.id])));
      const stuck = i === r.next && f.status === 'river' && !canStill; // waiting for a river she can never go up
      if (!stuck && (needed || i === r.next)) continue;
      r.stops.splice(i, 1);
      if (i < r.next) r.next--;
      r.next %= r.stops.length;
      if (stuck) f.nextCheck = S.day; // and sails on at once
    }
  };

  // ---- Corsairs ----
  const choose = (enc, o, t) => {
    switch (P.corsair) {
      case 'pay': return t <= S.purse ? 'pay' : 'run'; // he cannot pay what he has not got
      case 'run': return 'run';
      case 'fight': return 'fight';
      case 'sensible': return o.run >= 0.6 ? 'run' : o.fight >= 0.6 ? 'fight' : t <= S.purse * 0.25 ? 'pay' : 'run';
      case 'bold': return o.fight >= 0.45 ? 'fight' : 'run';
      default: return o.fight >= 0.35 ? 'fight' : 'run'; // reckless: fights all but hopeless odds
    }
  };
  const corsairs = (f) => {
    if (f.status !== 'sailing' || !f.leg) return;
    const pos = Fleet.position(S, f);
    S.ship.hull = f.realHull; S.ship.fit = f.fit; S.hull = f.hullPct ?? 100;
    const enc = Pirates.roll(S, STEP, pos.lon, pos.lat);
    if (!enc) return;
    R.corsairs.met++;
    const dec = Math.floor(yearOf(S.day) / 10) * 10;
    R.byDecade[dec] = (R.byDecade[dec] || 0) + 1;
    const knots = Ships.stats({ hull: f.realHull }).knots * Pirates.hullFactor(S) * 0.75;
    const o = Pirates.odds(S, enc, knots), t = Pirates.tribute(S, enc);
    const choice = choose(enc, o, t);
    R.corsairs[choice]++;
    // the whole hold is at stake, contract goods too
    const lots = [...Object.entries(f.hold).map(([g, l]) => ({ g, l })), ...Object.values(f.cHold).map((l) => ({ g: l.good, l }))];
    S.cargo = {}; S.paid = {};
    for (const { g, l } of lots) { S.cargo[g] = (S.cargo[g] || 0) + l.qty; S.paid[g] = (S.paid[g] || 0) + l.paid; }
    const before = { ...S.cargo }, purse0 = S.purse, paid0 = lots.reduce((t2, x) => t2 + x.l.paid, 0);
    const P0 = { ...Pirates.ensurePirates(S) };
    const res = Pirates.resolve(S, enc, choice, knots);
    if (res.spoils) {
      const used = Object.values(S.cargo).reduce((t2, n) => t2 + n, 0);
      const pl = Pirates.plunder(S, enc, res.spoils, !P.spare, Ships.HULLS[f.realHull].hold - used);
      if (!P.spare) R.corsairs.plundered++;
    }
    const Pn = Pirates.ensurePirates(S);
    if (Pn.won > P0.won) R.corsairs.won++;
    if (Pn.lost > P0.lost) R.corsairs.lost++;
    for (const { g, l } of lots) {
      const keep = before[g] ? Math.min(1, S.cargo[g] / before[g]) : 1;
      l.qty = Math.round(l.qty * keep); l.paid *= keep;
    }
    // goods taken from a galley go into her own hold, at no cost
    for (const [g, n] of Object.entries(S.cargo)) {
      const extra = n - (before[g] || 0);
      if (extra > 0) { f.hold[g] = f.hold[g] || { qty: 0, paid: 0 }; f.hold[g].qty += extra; }
    }
    for (const [g, l] of Object.entries(f.hold)) if (l.qty <= 0) delete f.hold[g];
    R.corsairs.cash += S.purse - purse0;
    R.corsairs.cargo += paid0 - lots.reduce((t2, x) => t2 + x.l.paid, 0);
    f.hullPct = S.hull;
    if (R.log.length < 400) note(`corsairs off ${enc.where}${enc.big ? ' (a big galley)' : ''}: ${choice}, ${Math.round(S.purse - purse0)} cz, hull ${Math.round(S.hull)}%`);
  };

  // ---- The days go by ----
  const marks = [1455, 1462, 1470, 1480, 1500, 1525];
  let reveal = 0;
  for (let t = 0; t < DAYS; t += STEP) {
    S.day += STEP;
    market.tick(STEP);
    Events.tick(S, STEP);
    Events.applyToMarket(S, market);
    Ports.grow(S, STEP, market);
    market.scale = Object.fromEntries(PORTS.map((p) => [p.id, Ports.depthScale(S, p.id)]));
    const edge = Contracts.perks(S).priceEdge;
    market.edge = Object.fromEntries(PORTUGUESE_PORTS.map((p) => [p, edge]));
    for (const [pid, e] of Object.entries(Investments.edges(S))) market.edge[pid] = (market.edge[pid] || 0) + e;
    Investments.tick(S, STEP);
    const f = fl();
    if (f) {
      if (f.leg && f.leg !== f.lastLeg) { // a new passage: remember how long it takes
        f.lastLeg = f.leg;
        const k = `${f.leg.from}>${f.leg.to}>${f.realHull}`;
        learned.set(k, learned.has(k) ? 0.7 * learned.get(k) + 0.3 * f.leg.days : f.leg.days);
      }
      corsairs(f);
      // arriving this half-day: deal with the contract board before the fleet code trades
      if (f.status === 'sailing' && f.leg && S.day >= f.leg.start + f.leg.days) atPort(f, f.leg.to);
    }
    for (const x of S.fleet.ships) {
      if (x.status === 'river') { R.riverWaitDays += STEP; if (process.env.DBG && !x.dbgRiver) { x.dbgRiver = 1; console.error(yearOf(S.day).toFixed(1), `${x.role} ${x.realHull} waits for the river at ${x.at}, next ${x.route?.stops[x.route.next]?.port}, load ${Fleet.loadOf(x).toFixed(2)}`); } } else x.dbgRiver = 0;
      if (x.status === 'boats') R.boatDays += STEP;
    }
    // The fleet code keeps 150 cz back when a hired captain buys; the owner trading his own ship
    // can spend down to his last few coins, so his ship is ticked with that much more to hand.
    const all = S.fleet.ships;
    const hired = all.filter((x) => x !== f);
    let flagGone = false;
    if (f && all.includes(f)) {
      const OWN_RESERVE = 140;
      S.fleet.ships = [f]; S.purse += OWN_RESERVE;
      Fleet.tick(S, market, STEP, true);
      S.purse -= OWN_RESERVE;
      flagGone = !S.fleet.ships.includes(f);
    }
    S.fleet.ships = hired;
    Fleet.tick(S, market, STEP, true);
    for (const x of hired) if (!S.fleet.ships.includes(x)) { R.lost++; note(`${x.role} (${x.loop} run) lost at sea`); }
    S.fleet.ships = f && all.includes(f) && !flagGone ? [f, ...S.fleet.ships] : S.fleet.ships;
    if (f) {
      if (f.sunk || !S.fleet.ships.includes(f)) {
        R.lost++;
        note('the flagship is lost');
        for (const c of Contracts.ensureContracts(S).active.filter((c) => c.kind === 'deliver')) Contracts.abandon(S, c);
        const h = S.purse > price('caravel') + 200 && canSail('caravel') ? 'caravel' : 'barca';
        if (S.purse < price(h)) { if (R.broke == null) R.broke = yearOf(S.day); }
        S.purse -= price(h); R.spentOnShips += price(h);
        const loop = S.discovered.gambia && h !== 'barca' ? 'africa' : 'home';
        add('flagship', h, loop, { nav: 5, trade: 5, wage: flagWage(h) });
      } else {
        tidyRoute(f);
        if (S.day - lastDay >= 60) { flagRate = 0.7 * flagRate + 0.3 * Math.max(0, (f.profit - lastProfit) / (S.day - lastDay)); lastProfit = f.profit; lastDay = S.day; }
      }
    }
    // missed deadlines: the goods are his to sell after all
    const lapsed = Contracts.checkDeadlines(S);
    if (lapsed.length) {
      const C = Contracts.ensureContracts(S);
      const g = fl();
      for (const [id, lot] of Object.entries(g?.cHold || {})) {
        if (C.active.some((c) => c.id === Number(id))) continue;
        g.hold[lot.good] = g.hold[lot.good] || { qty: 0, paid: 0 };
        g.hold[lot.good].qty += lot.qty; g.hold[lot.good].paid += lot.paid;
        delete g.cHold[id];
      }
      if (g) setFlagHull(g);
      R.contracts.failed += lapsed.length;
      for (const m of lapsed) note(m.log);
    }
    if (Math.abs(S.day % 30) < STEP) owner();
    if (++reveal % 120 === 0) Accounts.reveal(S, 'lisbon', S.fleet.ships); // keep the books from piling up
    if (R.explored == null && S.discovered.gambia) R.explored = yearOf(S.day);
    if (R.broke == null && S.purse < -500) R.broke = yearOf(S.day);
    const y = yearOf(S.day);
    for (const m of marks) if (R.at[m] == null && y >= m + 2 / 12) R.at[m] = worth(S);
    // every five years (1 March): what he is worth, and what has come in and gone out so far
    const five = 1455 + 5 * (R.series.length);
    if (y >= five + 2 / 12 && five <= 1451 + YEARS) R.series.push(snapshot(S, five));
    const dec = Math.floor(y / 10) * 10;
    if (R.attention[dec] == null && y >= dec + 5) R.attention[dec] = Pirates.attention(S); // mid-decade
  }
  R.at[1451 + YEARS] = worth(S);
  Accounts.reveal(S, 'lisbon', S.fleet.ships);
  const A = Accounts.ensureAccounts(S);
  R.totals = { ...A.totals };
  for (const e of A.pending) R.totals[e.kind] = (R.totals[e.kind] || 0) + e.amount;
  R.final = S.purse;
  R.standing = standing();
  R.arms = fl() ? Object.entries(fl().fit).filter(([g, c]) => c !== Ships.DEFAULT_FIT[g]).map(([, c]) => c).join(', ') : '';
  R.fleet = S.fleet.ships.map((x) => `${x.role === 'flagship' ? 'you' : x.loop}: ${Ships.HULLS[x.realHull].name}`).join(', ');
  R.pirates = { ...Pirates.ensurePirates(S) };
  return R;
}

// A five-yearly snapshot: worth, and the running totals of the books by kind.
function snapshot(S, year) {
  const A = Accounts.ensureAccounts(S);
  const tot = { ...A.totals };
  for (const e of A.pending) tot[e.kind] = (tot[e.kind] || 0) + e.amount;
  return { year, worth: worth(S), purse: S.purse, ships: S.fleet.ships.length, tot };
}

// What he is worth: the purse, plus his ships at what a yard would give for them.
function worth(S) {
  return S.purse + S.fleet.ships.reduce((t, x) => t + Ships.HULLS[x.realHull || x.hull].price / 2, 0);
}

// ---- Running and reporting ----------------------------------------------------------------
export function runPersona(persona, runs = RUNS) {
  const list = [];
  for (let r = 0; r < runs; r++) { seedRandom(SEED * 7919 + r); list.push(career(persona)); }
  return list;
}

const avg = (xs) => xs.reduce((t, x) => t + x, 0) / Math.max(1, xs.length);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const cz = (v) => Math.round(v).toLocaleString('en');

export function summarise(list) {
  const end = 1451 + YEARS;
  const at = Object.fromEntries(Object.keys(list[0].at).map((m) => [m, med(list.map((r) => r.at[m] ?? 0))]));
  const tot = (k) => avg(list.map((r) => r.totals[k] || 0));
  const trade = tot('sale') + tot('purchase'); // contract goods are booked apart (contractGoods)
  const contracts = avg(list.map((r) => r.contracts.reward - r.contracts.cost));
  const crown = 400 * avg(list.map((r) => (r.log.some((l) => l.includes('Find a new trading partner')) ? 1 : 0)));
  const c = (k) => avg(list.map((r) => r.corsairs[k]));
  return {
    persona: list[0].persona, runs: list.length, end,
    worth: at, worstEnd: Math.min(...list.map((r) => r.at[end])), bestEnd: Math.max(...list.map((r) => r.at[end])),
    income: { trade, contracts, crown, wages: -tot('wages'), repairs: -tot('repairs'), boats: -tot('boats'), corsairs: c('cash'), corsairCargo: -c('cargo'), bounty: tot('bounty'), invest: tot('invest'), ships: avg(list.map((r) => r.spentOnShips)) },
    contracts: { taken: avg(list.map((r) => r.contracts.taken)), done: avg(list.map((r) => r.contracts.done)), failed: avg(list.map((r) => r.contracts.failed)), detours: avg(list.map((r) => r.contracts.detours)) },
    corsairs: { met: c('met'), pay: c('pay'), run: c('run'), fight: c('fight'), won: c('won'), lost: c('lost'), plundered: c('plundered'), notoriety: avg(list.map((r) => r.pirates.notoriety)), caution: avg(list.map((r) => r.pirates.caution)),
      byDecade: Object.fromEntries([...new Set(list.flatMap((r) => Object.keys(r.attention)))].sort().map((d) => [d, { met: avg(list.map((r) => r.byDecade[d] || 0)), attention: avg(list.map((r) => r.attention[d] ?? 0)) }])) },
    firstHire: med(list.map((r) => r.firstHire ?? end)), explored: med(list.map((r) => r.explored ?? end)), nau: list.filter((r) => r.nau).length / list.length,
    shipsLost: avg(list.map((r) => r.lost)), broke: list.filter((r) => r.broke != null).length / list.length,
    riverWaitDays: avg(list.map((r) => r.riverWaitDays)), boatDays: avg(list.map((r) => r.boatDays)),
    series: list[0].series.map((pt, i) => {
      const at = (r) => r.series[i] || r.series[r.series.length - 1];
      const prev = (r) => (i ? r.series[i - 1] : { tot: {} });
      const flow = (k) => avg(list.map((r) => ((at(r).tot[k] || 0) - (prev(r).tot[k] || 0)) / 5));
      return { year: pt.year, worth: med(list.map((r) => at(r).worth)), low: Math.min(...list.map((r) => at(r).worth)), high: Math.max(...list.map((r) => at(r).worth)),
        ships: avg(list.map((r) => at(r).ships)),
        perYear: { trade: flow('sale') + flow('purchase'), contracts: flow('contract') + flow('contractGoods'), wages: flow('wages'), repairs: flow('repairs'), ships: flow('ships'), invest: flow('invest'), other: flow('charts') + flow('corsairs') + flow('bounty') + flow('boats') } };
    }),
    standing: med(list.map((r) => r.standing)), fleet: list[0].fleet + (list[0].arms ? ` (fitted: ${list[0].arms})` : ''),
  };
}

export function printSummary(s) {
  const yrs = YEARS;
  const per = (v) => `${cz(v / yrs)}/yr`;
  console.log(`\n${PERSONAS[s.persona].label} (${s.runs} careers, ${1451}–${s.end})`);
  console.log(`  worth (median): ${Object.entries(s.worth).map(([y, v]) => `${y} ${cz(v)}`).join(' · ')}   [range at end ${cz(s.worstEnd)} to ${cz(s.bestEnd)}]`);
  console.log(`  milestones: explored the Gambia ${s.explored.toFixed(1)}, first captain ${s.firstHire.toFixed(1)}, sailed a nau ${Math.round(s.nau * 100)}% of careers, standing ${s.standing}`);
  const I = s.income;
  const gross = I.trade + I.contracts + I.crown;
  console.log(`  income: trade ${per(I.trade)} · contracts ${per(I.contracts)} (${Math.round(100 * I.contracts / gross)}%) · crown ${cz(I.crown)}`);
  console.log(`  spent:  ships ${per(I.ships)} · investments net ${per(I.invest)} (feitorias, fleet shares)`);
  console.log(`  costs:  wages ${per(I.wages)} · repairs ${per(I.repairs)} · boatmen ${per(I.boats)} · corsairs ${per(-I.corsairs)} cash, ${per(-I.corsairCargo)} cargo · bounty earned ${per(I.bounty)}`);
  const C = s.contracts;
  console.log(`  contracts: ${C.taken.toFixed(0)} taken, ${C.done.toFixed(0)} done, ${C.failed.toFixed(1)} missed, ${C.detours.toFixed(0)} detours`);
  const K = s.corsairs;
  console.log(`  corsairs: met ${K.met.toFixed(0)} (${(K.met / yrs).toFixed(1)}/yr) · paid ${K.pay.toFixed(0)}, ran ${K.run.toFixed(0)}, fought ${K.fight.toFixed(0)} · won ${K.won.toFixed(0)} (plundered ${K.plundered.toFixed(0)}), beaten ${K.lost.toFixed(0)} · notoriety ${K.notoriety.toFixed(0)}`);
  console.log(`  corsairs by decade (encounters · how strongly they are drawn to him): ${Object.entries(K.byDecade).map(([d, v]) => `${d}s ${v.met.toFixed(1)}·${v.attention.toFixed(2)}`).join('  ')}`);
  console.log(`  at sea: ships lost ${s.shipsLost.toFixed(1)}, ruined ${Math.round(s.broke * 100)}% · ${cz(s.boatDays)} ship-days with the boats, ${cz(s.riverWaitDays)} waiting for the river`);
  console.log(`  fleet at the end (one career): ${s.fleet}`);
}

// Each persona runs in its own process, side by side (--serial to run them one after another).
async function runAll(names) {
  if (flag('serial') || names.length === 1) {
    return names.map((name) => {
      const t0 = Date.now();
      const list = runPersona(name);
      const sm = summarise(list);
      sm.seconds = Math.round((Date.now() - t0) / 1000);
      // --log: the career log of the first career, or with --worst, of the poorest
      const pickLog = flag('worst') ? [...list].sort((a, b) => a.final - b.final)[0] : list[0];
      sm.log = flag('log') ? pickLog.log : null;
      return sm;
    });
  }
  const { execFile } = await import('node:child_process');
  const args = process.argv.slice(2).filter((a, i, all) => a !== '--only' && all[i - 1] !== '--only' && a !== '--json');
  return Promise.all(names.map((name) => new Promise((ok, fail) => {
    execFile(process.execPath, [process.argv[1], ...args, '--only', name, '--json'], { maxBuffer: 1 << 26 }, (err, out) => (err ? fail(err) : ok(JSON.parse(out)[0])));
  })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pick = ONLY ? ONLY.split(',').flatMap((n) => GROUPS[n] || [n]) : Object.keys(PERSONAS);
  const out = await runAll(pick);
  if (flag('json')) console.log(JSON.stringify(out));
  else for (const sm of out) {
    printSummary(sm);
    if (sm.log) console.log(sm.log.map((l) => `    ${l}`).join('\n'));
  }
}

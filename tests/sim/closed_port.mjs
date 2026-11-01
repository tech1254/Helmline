// A captain on a three-port route finds one closed: he notes when it reopens, sails on to the
// next open stop, runs the route without it, and calls there again once it is open.
import { Market } from '../../public/js/economy.js';
import * as Fleet from '../../public/js/fleet.js';
import * as Events from '../../public/js/events.js';
import * as Accounts from '../../public/js/accounts.js';
import * as Contracts from '../../public/js/contracts.js';
import * as Pirates from '../../public/js/pirates.js';
import * as Ports from '../../public/js/ports.js';
import * as Ships from '../../public/js/ships.js';
import { PORTS } from '../../public/js/world.js';

const S = { day: 0, purse: 5000, discovered: Object.fromEntries(PORTS.map((p) => [p.id, true])), ship: { docked: 'lisbon', hull: 'barca', fit: { ...Ships.DEFAULT_FIT } }, cargo: {}, paid: {}, hull: 100, fleet: null };
for (const f of [Fleet.ensureFleet, Events.ensureEvents, Accounts.ensureAccounts, Contracts.ensureContracts, Pirates.ensurePirates, Ports.ensurePorts]) f(S);
const market = new Market();
const ship = { id: 1, name: 'Santa Clara', hull: 'caravel', fit: { ...Ships.DEFAULT_FIT }, built: 0, tropic: 0, captain: { id: 2, name: 'Vaz', nav: 5, trade: 5, wage: 5, loyalty: 100 },
  at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null, hullPct: 100 };
S.fleet.ships.push(ship);
Fleet.setRoute(S, market, ship, { stops: Fleet.simplify(['lisbon', 'lagos', 'safi'].map((port) => ({ port, orders: [] }))), next: 0 });
ship.halted = null;
// Lagos shut for 60 days, by hand (as an event would)
const E = Events.ensureEvents(S);
const tid = Events.TEMPLATES.find((t) => (t.close || []).includes('lagos')).id;
E.active = [{ id: 99, tid, port: 'lagos', start: 0, end: 60, heard: true }]; E.past = [];
const shut = { close: ['ceuta'] };
const errs = [], calls = [];
let closedUntil = 60;
const closed = () => S.day < closedUntil;
market.closed = (p) => p === 'lagos' && closed();
const real = Events.closure;
let last = ship.at;
for (let d = 0; d < 200; d++) {
  S.day += 1;
  if (S.day >= closedUntil) E.active = [];
  const msgs = Fleet.tick(S, market, 1, false);
  for (const m of msgs) if (/closed/.test(m.html)) console.log(`day ${S.day}: ${m.html.replace(/<[^>]+>/g, '')}`);
  const was = last; last = ship.status === 'sailing' ? ship.leg.to : null;
  if (was && ship.status !== 'sailing' || (was && ship.leg && ship.leg.to !== was)) calls.push(`${S.day}:${was}`);
  if (!ship.route) { ship.halted = null; Fleet.setRoute(S, market, ship, { stops: Fleet.simplify(['lisbon', 'lagos', 'safi'].map((port) => ({ port, orders: [] }))), next: 0 }); }
  if (ship.status === 'waiting') errs.push(`day ${S.day}: waiting at ${ship.at}`);
  if (ship.status === 'sailing' && ship.leg?.to === 'ceuta' && closed() && ship.leg.start > 1 && !errs.includes('sailed for closed')) { /* allowed only if she sailed before the closure was known */ }
}
console.log('calls:', calls.join(' '));
console.log('status:', Fleet.statusText(S, ship));
const ceutaBefore = calls.filter((c) => c.endsWith('lagos') && +c.split(':')[0] < closedUntil).length;
const ceutaAfter = calls.filter((c) => c.endsWith('lagos') && +c.split(':')[0] >= closedUntil).length;
if (errs.length) console.log('ERROR: she waited', errs.slice(0, 3));
if (!calls.some((c) => c.endsWith('safi') && +c.split(':')[0] < closedUntil)) console.log('ERROR: she did not run the rest of the route while Lagos was closed');
if (!ceutaAfter) console.log('ERROR: she did not call at Lagos again after it reopened');
console.log('ERRORS', (errs.length ? 1 : 0) + (ceutaAfter ? 0 : 1));

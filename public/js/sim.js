// Time passing: sailing, wages, spoilage, events, the fleet, and time away.

import { D2R, PORTS, isLand, windAt, sailFactor, bearing, distNm, angleDiff, isRiverLeg, RIVER_KNOTS, shoalDepth, SHOALS, isBeyond } from './world.js';
import * as Ports from './ports.js';
import { GOODS, PORTUGUESE_PORTS } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Accounts from './accounts.js';
import * as Pirates from './pirates.js';
import * as Investments from './investments.js';
import * as House from './house.js';
import * as Ships from './ships.js';
import * as Wear from './wear.js';
import { DAYS_PER_SEC, OFFLINE_DAYS_PER_DOUBLING, OFFLINE_FULL_DAYS, OFFLINE_MAX_DAYS, OFFLINE_MIN_SECONDS, OFFLINE_RATE, SIGHT, STANDING_FADES_AFTER_HOURS } from './config.js';
import { S, market, ui } from './state.js';
import { save } from './save.js';
import { revealAt, chartFromHistory } from './fog.js';
import { dock, observe, replan } from './voyage.js';
import { startArrival } from './scene.js';
import { $, cz, fmtDate } from './util.js';
import { log } from './pricebook.js';
import { confirmDialog } from './dialog.js';
import { addNotice, toast } from './notices.js';

// ---- Simulation -------------------------------------------------------------

export function shipWind() {
  const w = windAt(S.ship.lon, S.ship.lat, S.day);
  const off = angleDiff(S.ship.heading, w.from);
  const f = sailFactor(off) * (0.45 + 0.55 * w.strength);
  return { w, off, f, knots: Ships.knotsAt(Ships.flagStats(S), off, f, Pirates.hullFactor(S)) };
}

// How full the flagship's hold is, 0 to 1 (her draft follows it).
export function loadOf() {
  const hold = Ships.flagStats(S).hold || 1;
  return Math.min(1, GOODS.reduce((n, g) => n + (S.cargo[g.id] || 0), 0) / hold);
}

// At anchor offshore, her boats ferry the cargo; the days pass in port while they work, at the
// game's speed, so you see it done.
function workBoats(dtSec) {
  const b = S.ship.boats;
  if (!b || b.moved >= b.total) return;
  let days = Math.min(dtSec * DAYS_PER_SEC * ui.speed, (b.total - b.moved) / b.rate);
  while (days > 1e-6) {
    const dd = Math.min(0.25, days);
    days -= dd;
    advanceTime(dd, false);
    b.moved = Math.min(b.total, b.moved + b.rate * dd);
  }
  if (b.moved >= b.total - 1e-6) {
    S.ship.boats = null;
    toast(`Her boats have finished: the cargo is worked at ${PORTS.find((p) => p.id === S.ship.docked).name}.`, 'port', true, 'routine');
    save();
  }
}

export function update(dtSec) {
  const sh = S.ship;
  if (ui.speed === 0 || ui.modal || ui.screen || ui.arrival) return;
  if (sh.docked) { workBoats(dtSec); return; }
  if (!sh.route.length) return;
  let days = dtSec * DAYS_PER_SEC * ui.speed;
  while (days > 0 && sh.route.length) {
    const dd = Math.min(0.05, days);
    days -= dd;
    const [tl, ta] = sh.route[0];
    const river = isRiverLeg(sh.route[0]);
    sh.heading = bearing(sh.lon, sh.lat, tl, ta);
    // up or down a river she is towed, kedged and swept along, whatever the wind
    const knots = river ? RIVER_KNOTS * Pirates.hullFactor(S) : shipWind().knots;
    const nm = knots * 24 * dd;
    const rem = distNm(sh.lon, sh.lat, tl, ta);
    advanceTime(dd, true);
    if (nm >= rem) {
      sh.lon = tl; sh.lat = ta;
      sh.route.shift();
    } else {
      const nlat = sh.lat + (nm * Math.cos(sh.heading * D2R)) / 60;
      const nlon = sh.lon + (nm * Math.sin(sh.heading * D2R)) / (60 * Math.cos(sh.lat * D2R));
      if (!river && isLand(nlon, nlat)) {
        // Shouldn't happen on a planned route; re-plan from here rather than run aground.
        const fix = sh.dest ? replan(sh.dest) : false;
        if (!fix) { sh.route = []; toast('Breakers ahead! The pilot heaves to. Set a new course.'); }
        continue;
      }
      sh.lon = nlon; sh.lat = nlat;
      // a deep ship that strays onto a shoal runs aground
      if (!river && Ships.isDeep(sh.hull) && shoalDepth(nlon, nlat) < Ships.draftOf(sh.hull, loadOf())) { aground(); break; }
    }
    revealAt(sh.lon, sh.lat, SIGHT);
    const last = S.trail[S.trail.length - 1];
    if (Math.hypot(last[0] - sh.lon, last[1] - sh.lat) > 0.12) {
      S.trail.push([+sh.lon.toFixed(3), +sh.lat.toFixed(3)]);
      if (S.trail.length > 4000) S.trail.splice(0, S.trail.length - 4000);
    }
    if (!sh.route.length) {
      if (sh.dest?.port) { try { if (!isBeyond(sh.dest.port)) startArrival(sh.dest.port); } catch (e) { console.error(e); } dock(sh.dest.port); }
      else { sh.dest = null; toast('Arrived at the mark. Awaiting orders.'); save(); }
      break;
    }
  }
}

// Aground on a shoal: the crew kedge her off over a few days, and the hull suffers.
function aground() {
  const sh = S.ship;
  const bank = SHOALS.find((x) => shoalDepth(sh.lon, sh.lat) <= x.depth) || { name: 'the shoals' };
  for (let i = 0; i < 12; i++) advanceTime(0.25, false);
  S.hull = Math.max(5, (S.hull ?? 100) - 10);
  // back the way she came, to the last deep water
  for (let back = 0; back < 40 && shoalDepth(sh.lon, sh.lat) < Ships.draftOf(sh.hull, loadOf()); back++) {
    sh.lon -= Math.sin(sh.heading * D2R) * 0.03 / Math.cos(sh.lat * D2R);
    sh.lat -= Math.cos(sh.heading * D2R) * 0.03;
  }
  sh.route = [];
  sh.dest = null;
  toast(`The <b>${sh.name}</b> runs aground on ${bank.name}. It takes three days to kedge her off, and her hull is at ${Math.round(S.hull)}%. A ship this deep must keep outside the banks.`, 'alert', true, 'alert');
  save();
}

// Show a batch of messages from the game's systems.
export function report(msgs) {
  for (const m of msgs) {
    if (m.log) log(m.log);
    if (ui.offlineBuffer) { ui.offlineBuffer.push(m); addNotice(m.html, m.kind, S.day, m.level); } else toast(m.html, m.kind, true, m.level);
  }
}

// ---- Time away ------------------------------------------------------------------

export function catchUp() {
  if (!S) return null;
  const seen = S.lastSeen;
  S.lastSeen = Date.now();
  if (!seen) return null;
  const awaySec = (Date.now() - seen) / 1000;
  if (awaySec < OFFLINE_MIN_SECONDS || !S.fleet?.ships.length || !S.ship.docked) return null;
  const want = awaySec * DAYS_PER_SEC * OFFLINE_RATE;
  const days = offlineDays(want);
  const before = { purse: S.purse, day: S.day, ships: Object.fromEntries(S.fleet.ships.map((x) => [x.id, { trips: x.trips, profit: x.profit, cargo: Fleet.holdPaid(x) }])) };
  // Long absences: captains stray (so they may skim or go ashore during it), and Lisbon's
  // merchants start to forget you.
  const hours = awaySec / 3600;
  const strayed = Fleet.strayWhileAway(S, hours);
  let standingLost = 0;
  if (hours > STANDING_FADES_AFTER_HOURS && S.contracts?.unlocked) {
    standingLost = Math.min(5, Math.floor((hours - STANDING_FADES_AFTER_HOURS) / 12) + 1);
    S.contracts.standing -= standingLost;
    log(`Away too long: standing fell by ${standingLost}.`);
  }
  const paidBefore = S.fleet.wagesPaid || 0; // your own crew is paid off in port; only captains draw pay
  // Contracts wait for the captain: time away never makes one lapse.
  let contractsHeld = 0;
  for (const c of S.contracts?.active || []) {
    if (c.deadline != null) { c.deadline += days; contractsHeld++; }
  }
  ui.offlineBuffer = [];
  let msgs;
  try {
    const steps = Math.max(1, Math.ceil(days * 4));
    for (let i = 0; i < steps; i++) advanceTime(days / steps, false, true);
    observe(S.ship.docked);
    report(Events.hearNews(S, S.ship.docked));
  } finally {
    msgs = ui.offlineBuffer;
    ui.offlineBuffer = null;
  }
  const ships = S.fleet.ships.map((x) => {
    const b = before.ships[x.id] || { trips: 0, profit: 0, cargo: 0 };
    return { name: x.name, trips: x.trips - b.trips, profit: x.profit - b.profit, cargoChange: Fleet.holdPaid(x) - b.cargo, status: Fleet.statusText(S, x) };
  });
  log(`Away ${awayText(awaySec)}: ${Math.round(days)} days passed; purse ${S.purse - before.purse >= 0 ? '+' : ''}${Math.round(S.purse - before.purse)} cz.`);
  save();
  const wages = (S.fleet.wagesPaid || 0) - paidBefore;
  const sales = ships.reduce((n, x) => n + x.profit, 0);
  const cargo = ships.reduce((n, x) => n + x.cargoChange, 0);
  return { awaySec, days, capped: days >= OFFLINE_MAX_DAYS, slowed: want > OFFLINE_FULL_DAYS, purse: S.purse - before.purse, sales, wages, cargo, ships, msgs, strayed, standingLost, contractsHeld };
}

// Days that pass for a given amount of offline time: full value at first, then tapering.
export function offlineDays(want) {
  if (want <= OFFLINE_FULL_DAYS) return want;
  return Math.min(OFFLINE_MAX_DAYS, OFFLINE_FULL_DAYS + OFFLINE_DAYS_PER_DOUBLING * Math.log2(want / OFFLINE_FULL_DAYS));
}

export function awayText(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}

export function showSummary(sum) {
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  const pick = sum.msgs.filter((m) => !/^<b>[^<]+<\/b> at /.test(m.html)).slice(-6); // fleet trades are summed up above
  confirmDialog({
    title: 'While you were away',
    body: `<dl class="facts">
        <dt>Away</dt><dd>${awayText(sum.awaySec)}</dd>
        <dt>Time passed</dt><dd>${Math.round(sum.days)} days, to ${fmtDate(S.day)}</dd>
        <dt>Profit on cargoes sold</dt><dd>${sum.sales >= 0 ? '+' : ''}${Math.round(sum.sales).toLocaleString()} cz</dd>
        <dt>Wages and upkeep</dt><dd>−${Math.round(sum.wages).toLocaleString()} cz</dd>
        ${Math.abs(sum.cargo) >= 1 ? `<dt>${sum.cargo > 0 ? 'Cargo loaded for the next run' : 'Cargo from before, now sold'}</dt><dd>${sum.cargo > 0 ? '−' : '+'}${Math.abs(Math.round(sum.cargo)).toLocaleString()} cz</dd>` : ''}
        <dt>Purse</dt><dd class="${sum.purse < 0 ? 'warn' : ''}">${sum.purse >= 0 ? '+' : ''}${Math.round(sum.purse).toLocaleString()} cz</dd>
      </dl>
      <p class="fine">${sum.capped ? `That is the most that passes in one absence (${OFFLINE_MAX_DAYS} days).` : sum.slowed ? 'After the first few weeks, longer absences add time more slowly.' : 'The world moves at a tenth of its usual pace while you are gone.'}</p>
      ${sum.contractsHeld ? `<p class="fine">Your ${sum.contractsHeld === 1 ? 'contract waited' : `${sum.contractsHeld} contracts waited`} for you: deadlines moved back by ${Math.round(sum.days)} days.</p>` : ''}
      ${sum.strayed.length ? `<p class="warn">Your captains missed you: ${sum.strayed.map((x) => `Captain ${x.captain} is now ${Fleet.loyaltyText(x.after)}`).join('; ')}.</p>` : ''}
      ${sum.standingLost ? `<p class="warn">The merchants of Lisbon are starting to forget you: standing −${sum.standingLost}.</p>` : ''}
      <ul class="help">${sum.ships.map((x) => `<li><b>${x.name}:</b> ${x.trips} ${x.trips === 1 ? 'cargo' : 'cargoes'} sold, ${x.profit >= 0 ? '+' : ''}${x.profit.toLocaleString()} cz. ${x.status}</li>`).join('')}
        ${pick.map((m) => `<li>${strip(m.html)}</li>`).join('')}</ul>`,
    ok: 'Carry on',
    cancel: false,
    kind: 'summary',
    onOk: () => {},
  });
}

// Everything that happens as days pass, at sea or waiting in port.
export function advanceTime(dd, atSea, away = false) {
  S.day += dd;
  if (atSea) { // the crew is paid for the voyage; in port they are paid off
    const upkeep = Ships.flagStats(S).upkeep;
    S.purse -= upkeep * dd;
    Accounts.accrueWages(S, upkeep * dd, S.ship.lastPort);
  }
  market.tick(dd);
  report(Events.tick(S, dd));
  const grown = Ports.grow(S, dd, market);
  for (const m of grown) if (m.opens) chartFromHistory(m.opens);
  report(grown);
  report(Investments.tick(S, dd));
  report(House.tick(S, dd));
  syncMarket();
  if (atSea) {
    spoil(dd);
    wearHull(dd);
    if (!ui.modal && !ui.pendingEncounter) {
      const enc = Pirates.roll(S, dd, S.ship.lon, S.ship.lat);
      if (enc) ui.pendingEncounter = enc;
    }
  }
  const wasAt = S.fleet.ships.map((x) => x.at);
  report(Fleet.tick(S, market, dd, !away));
  // A hired ship calling at the port where you lie brings its captain's full accounts.
  if (S.ship.docked) {
    const calling = S.fleet.ships.filter((x, i) => x.at === S.ship.docked && wasAt[i] !== x.at);
    if (calling.length) {
      Accounts.reveal(S, S.ship.docked, calling);
      Fleet.sharePrices(S, S.ship.docked, calling);
    }
  }
  report(Contracts.checkDeadlines(S));
  // Ships and refits on order at the Lisbon yard: word when they are ready.
  for (const o of Ships.ready(S)) {
    if (o.told) continue;
    o.told = true;
    const what = o.kind === 'hull' ? `Your ${Ships.HULLS[o.hull].name.toLowerCase()}${o.name ? ` <b>${String(o.name).replace(/[<>&"]/g, '')}</b>` : ''} is` : `The ${Ships.choice(o.group, o.choice).name.toLowerCase()} you ordered is`;
    report([{ html: `${what} ready at the Lisbon shipyard. Call there to take delivery.`, kind: 'discover', log: `${what.replace(/<[^>]+>/g, '')} ready in Lisbon.` }]);
  }
}

// The flagship's hull wears at sea, and storms batter her now and then (wear.js). Word once as
// she starts to leak and again when she is in danger; the factor in port tells you the rest.
function wearHull(dd) {
  if (S.hull == null) S.hull = 100;
  if (S.ship.lat < Wear.TROPIC_LAT) S.ship.tropic = (S.ship.tropic || 0) + dd; // shipworm waters: she ages faster
  if (S.hull < Wear.LEAKS_BELOW) S.ship.strain = (S.ship.strain || 0) + dd; // sailing her leaking wears her out
  const years = Ships.serviceYears(S.ship, S.day);
  const storm = Wear.storms(dd);
  S.hull = Math.max(5, S.hull - Wear.wearPerDay(S.ship.lat, S.ship.hull, years) * dd - storm);
  const aged = Wear.ageNotice(S.ship, S.ship.hull, years, `the <b>${S.ship.name}</b>`, true);
  if (aged) toast(aged, 'alert', true, 'alert');
  if (storm) toast(`A storm batters the <b>${S.ship.name}</b>: her hull is at ${Math.round(S.hull)}%.`, '');
  const warned = S.hullWarned || 0;
  if (S.hull < Wear.DANGER_BELOW && warned < 2) {
    S.hullWarned = 2;
    toast(`The <b>${S.ship.name}</b> is in danger: her hull is at ${Math.round(S.hull)}% and the pumps barely keep up. Make for a shipyard, or careen her on the nearest beach.`, 'alert', true, 'alert');
  } else if (S.hull < Wear.LEAKS_BELOW && warned < 1) {
    S.hullWarned = 1;
    toast(`The <b>${S.ship.name}</b> is leaking: hull ${Math.round(S.hull)}%. Cargo will spoil until she is repaired.`, 'alert', true, 'alert');
  }
}

// Events shape prices and close ports; standing earns better prices in Portuguese ports.
export function syncMarket() {
  Events.applyToMarket(S, market);
  market.scale = Object.fromEntries(PORTS.map((p) => [p.id, Ports.depthScale(S, p.id)]));
  const edge = Contracts.perks(S).priceEdge;
  market.edge = Object.fromEntries(PORTUGUESE_PORTS.map((p) => [p, edge]));
  for (const [pid, e] of Object.entries(Investments.edges(S))) market.edge[pid] = (market.edge[pid] || 0) + e; // your factors
}

// Perishable cargo slowly spoils at sea, faster in the tropics.
export let rotPending = {};
export let rotClock = 0;
export function spoil(dd) {
  const heat = (S.ship.lat < 26 ? 1.6 : 1) * Ships.flagStats(S).spoil;
  for (const g of GOODS) {
    const have = S.cargo[g.id];
    if (!have || !g.spoil) continue;
    S.rot[g.id] = (S.rot[g.id] || 0) + have * g.spoil * heat * dd;
    while (S.rot[g.id] >= 1 && S.cargo[g.id] > 0) {
      S.rot[g.id] -= 1;
      S.cargo[g.id] -= 1;
      rotPending[g.id] = (rotPending[g.id] || 0) + 1;
    }
    if (!S.cargo[g.id]) { S.rot[g.id] = 0; S.paid[g.id] = 0; }
  }
  rotClock += dd;
  if (rotClock >= 4) flushRot();
}

export function flushRot() {
  rotClock = 0;
  for (const [id, n] of Object.entries(rotPending)) {
    const g = GOODS.find((x) => x.id === id);
    toast(`${n} ${n === 1 ? g.one : g.unit} of ${g.name.toLowerCase()} ${n === 1 ? 'has' : 'have'} ${g.rot}.`);
    log(`${n} ${n === 1 ? g.one : g.unit} of ${g.name.toLowerCase()} spoiled at sea.`);
  }
  rotPending = {};
}

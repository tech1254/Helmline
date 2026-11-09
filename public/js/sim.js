// Time passing: sailing, wages, spoilage, events, the fleet, and time away.

import * as Works from './works.js';
import { findPath } from './world.js';
import * as Hunt from './hunt.js';
import * as Law from './law.js';
import * as War from './war.js';
import * as Race from './race.js';
import { D2R, PORTS, isLand, windAt, sailFactor, bearing, distNm, angleDiff, isRiverLeg, RIVER_KNOTS, shoalDepth, SHOALS, isBeyond, compassPoint } from './world.js';
import * as Ports from './ports.js';
import { GOODS, PORTUGUESE_PORTS } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Accounts from './accounts.js';
import * as Pirates from './pirates.js';
import * as Investments from './investments.js';
import * as House from './house.js';
import * as Taxes from './taxes.js';
import * as Competition from './competition.js';
import * as Houses from './houses.js';
import * as Ships from './ships.js';
import * as Wear from './wear.js';
import * as Lending from './lending.js';
import * as Sight from './navsight.js';
import * as Pilots from './pilots.js';
import { DAYS_PER_SEC, OFFLINE_DAYS_PER_DOUBLING, OFFLINE_FULL_DAYS, OFFLINE_MAX_DAYS, OFFLINE_MIN_SECONDS, OFFLINE_RATE, SIGHT, STANDING_FADES_AFTER_HOURS } from './config.js';
import { S, market, ui } from './state.js';
import { timeScale } from './cloud.js';
import { save } from './save.js';
import { revealAt, chartFromHistory } from './fog.js';
import { dock, observe, replan } from './voyage.js';
import { startArrival } from './scene.js';
import { $, cz, fmtDate } from './util.js';
import { log } from './pricebook.js';
import { confirmDialog } from './dialog.js';
import { addNotice, toast } from './notices.js';
import { plog } from './playlog.js';
import { home, homeName } from './nations.js';

// ---- Simulation -------------------------------------------------------------

export function shipWind() {
  const w = windAt(S.ship.lon, S.ship.lat, S.day);
  const off = angleDiff(S.ship.heading, w.from);
  const f = sailFactor(off) * (0.45 + 0.55 * w.strength);
  return { w, off, f, knots: Ships.knotsAt(Ships.flagStats(S), off, f, Pirates.hullFactor(S)) * Sight.boost(S) }; // a good sight: a truer course for a few days (navsight.js)
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
  let days = Math.min(dtSec * DAYS_PER_SEC * ui.speed * timeScale(), (b.total - b.moved) / b.rate);
  while (days > 1e-6) {
    const dd = Math.min(0.25, days);
    days -= dd;
    advanceTime(dd, false);
    b.moved = Math.min(b.total, b.moved + b.rate * dd);
  }
  if (b.moved >= b.total - 1e-6) {
    S.ship.boats = null;
    toast(b.quay ? `The cargo is worked at ${PORTS.find((p) => p.id === S.ship.docked).name}.` : `Her boats have finished: the cargo is worked at ${PORTS.find((p) => p.id === S.ship.docked).name}.`, 'port', true, 'routine');
    save();
  }
}

export function update(dtSec) {
  const sh = S.ship;
  if (ui.speed === 0 || ui.modal || ui.screen || ui.arrival) return;
  if (sh.docked) { workBoats(dtSec); return; }
  if (!sh.route.length && S.chase) steerChase(true);
  if (!sh.route.length) return;
  let days = dtSec * DAYS_PER_SEC * ui.speed * timeScale(); // timeScale: an account setting (cloud.js)
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
    if (S.chase) { steerChase(!sh.route.length); if (ui.pendingEncounter) break; }
    if (!sh.route.length) {
      if (S.chase) break; // the chase steers on
      if (sh.dest?.port) { try { if (!isBeyond(sh.dest.port)) startArrival(sh.dest.port); } catch (e) { console.error(e); } dock(sh.dest.port); }
      else { sh.dest = null; toast('Arrived at the mark. Awaiting orders.'); save(); }
      break;
    }
  }
}

// The chase (hunt.js): steer to cut her off, every half day or when the course runs out; on
// contact, fight her; if she makes port first, the chase is over.
function steerChase(now = false) {
  const sh = S.ship;
  const t = Hunt.tickChase(S);
  if (t?.lost) { toast(t.lost, ''); if (!sh.route.length) { sh.dest = null; setSpeed0(); } return; }
  if (t?.contact) { if (!ui.modal && !ui.pendingEncounter) ui.pendingEncounter = { kind: 'prey', v: t.contact }; return; }
  if (!now && S.day - S.chase.steered < 0.5) return;
  const v = Hunt.quarry(S);
  if (!v) return;
  S.chase.steered = S.day;
  const [lon, lat] = Hunt.intercept(S, v, Math.max(2, shipWind().knots));
  const path = findPath(sh.lon, sh.lat, lon, lat, 1, !!Ships.hullOf(sh).coastal, Ships.isDeep(sh.hull));
  if (path?.length) { sh.route = path; sh.dest = { lon, lat, port: null }; }
}
const setSpeed0 = () => { ui.lastSpeed = ui.speed || ui.lastSpeed; ui.speed = 0; };

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
  const before = { purse: S.purse, day: S.day, ships: Object.fromEntries(S.fleet.ships.map((x) => [x.id, { trips: x.trips, profit: x.profit, cargo: Fleet.holdPaid(x), paid: x.paidTotal || 0 }])) };
  // Time away is only good news (Nov 2026): captains do not stray, standing does not fade, no
  // ship is lost, loans and contracts wait, and the purse never comes back smaller than it was.
  const strayed = [];
  const standingLost = 0;
  if (S.lending?.loan?.due != null) S.lending.loan.due += days;
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
    Fleet.setAway(true);
    try { for (let i = 0; i < steps; i++) advanceTime(days / steps, false, true); } finally { Fleet.setAway(false); }
    observe(S.ship.docked);
    report(Events.hearNews(S, S.ship.docked));
  } finally {
    msgs = ui.offlineBuffer;
    ui.offlineBuffer = null;
  }
  const ships = S.fleet.ships.map((x) => {
    const b = before.ships[x.id] || { trips: 0, profit: 0, cargo: 0, paid: 0 };
    return { name: x.name, trips: x.trips - b.trips, profit: x.profit - b.profit, cargoChange: Fleet.holdPaid(x) - b.cargo, wages: Math.round((x.paidTotal || 0) - (b.paid || 0)), status: Fleet.statusText(S, x) };
  });
  // Wages and upkeep are covered by what the house earned: a run of bad luck never costs you.
  let covered = 0;
  if (S.purse < before.purse) { covered = before.purse - S.purse; S.purse = before.purse; Accounts.record(S, { kind: 'post', amount: covered, text: 'Your factors covered the costs while you were away' }); }
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
  plog('away', { days: Math.round(sum.days * 10) / 10, purse: Math.round(sum.purse), capped: !!sum.capped });
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
        <dt>Change in your purse</dt><dd class="${sum.purse < 0 ? 'warn' : ''}">${sum.purse >= 0 ? '+' : ''}${Math.round(sum.purse).toLocaleString()} cz</dd>
        ${Math.abs(sum.cargo) >= 1 ? `<dt>Counting the cargo aboard</dt><dd class="${sum.purse + sum.cargo < 0 ? 'warn' : ''}">${sum.purse + sum.cargo >= 0 ? '+' : ''}${Math.round(sum.purse + sum.cargo).toLocaleString()} cz</dd>` : ''}
        <dt>Your purse now</dt><dd class="${S.purse < 0 ? 'warn' : ''}">${Math.round(S.purse).toLocaleString()} cz</dd>
      </dl>
      <p class="fine">${sum.capped ? `That is the most that passes in one absence (${OFFLINE_MAX_DAYS} days).` : sum.slowed ? 'After the first few weeks, longer absences add time more slowly.' : 'The world moves at a tenth of its usual pace while you are gone.'}</p>
      ${sum.contractsHeld ? `<p class="fine">Your ${sum.contractsHeld === 1 ? 'contract waited' : `${sum.contractsHeld} contracts waited`} for you: deadlines moved back by ${Math.round(sum.days)} days.</p>` : ''}
      ${sum.strayed.length ? `<p class="warn">Your captains missed you: ${sum.strayed.map((x) => `Captain ${x.captain} is now ${Fleet.loyaltyText(x.after)}`).join('; ')}.</p>` : ''}
      ${sum.standingLost ? `<p class="warn">The merchants of ${homeName(S)} are starting to forget you: standing −${sum.standingLost}.</p>` : ''}
      <ul class="help">${sum.ships.map((x) => `<li><b>${x.name}:</b> ${x.trips} ${x.trips === 1 ? 'cargo' : 'cargoes'} sold, ${x.profit >= 0 ? '+' : ''}${x.profit.toLocaleString()} cz; wages ${x.wages ? `−${x.wages.toLocaleString()}` : '0'} cz. ${x.status}</li>`).join('')}
        ${pick.map((m) => `<li>${strip(m.html)}</li>`).join('')}</ul>`,
    ok: 'Carry on',
    cancel: false,
    kind: 'summary',
    onOk: () => {},
  });
}

// Wages owed to your crew: paid from the purse as soon as there is money in it, in port.
export function payCrew() {
  const pay = Math.min(Math.floor(S.purse), Math.ceil(S.crewOwed || 0));
  if (pay <= 0) return 0;
  S.purse -= pay;
  S.crewOwed = Math.max(0, S.crewOwed - pay);
  if (S.crewOwed < 0.5) { S.crewOwed = 0; toast(`Your crew's back wages are paid (${pay} cz).`, 'port'); }
  return pay;
}
// Making port owing a month's wages or more, the crew walks off: they will not sail on promises.
// The debt goes with them, but the quays hear of it, and a new crew takes days to sign on.
export const DESERT_DAYS = 30, RECRUIT_DAYS = 5;
export function crewAtPort() {
  if (!(S.crewOwed > 0)) return;
  payCrew();
  const upkeep = Ships.flagStats(S).upkeep;
  if (S.crewOwed >= DESERT_DAYS * upkeep) {
    const owed = Math.ceil(S.crewOwed);
    S.crewOwed = 0;
    S.ship.recruitUntil = S.day + RECRUIT_DAYS;
    if (S.contracts?.unlocked) S.contracts.standing = Math.max(0, (S.contracts.standing || 0) - 2);
    toast(`<b>Your crew has walked off</b>, owed ${owed} cz in wages. They will not sail on promises. A new crew will take ${RECRUIT_DAYS} days to sign on here, and the quays will talk.`, 'alert', true, 'alert');
  } else if (S.crewOwed > 0) {
    toast(`You owe your crew <b>${Math.ceil(S.crewOwed)} cz</b> in wages: it is paid from your first sales here. Owe them a month's wages and they will walk off.`, 'alert', true, 'alert');
  }
}

// Everything that happens as days pass, at sea or waiting in port.
export function advanceTime(dd, atSea, away = false) {
  S.day += dd;
  if (atSea) { // the crew is paid for the voyage; in port they are paid off
    const upkeep = Ships.flagStats(S).upkeep;
    // what the purse cannot pay is owed to the crew, to be paid when you next make port
    const pay = Math.min(Math.max(0, S.purse), upkeep * dd);
    S.purse -= pay;
    if (pay < upkeep * dd) S.crewOwed = (S.crewOwed || 0) + upkeep * dd - pay;
    Accounts.accrueWages(S, upkeep * dd, S.ship.lastPort);
  }
  if (S.ship.docked && S.crewOwed > 0 && S.purse > 0) payCrew();
  market.tick(dd);
  report(Events.tick(S, dd));
  const grown = Ports.grow(S, dd, market);
  for (const m of grown) if (m.opens) chartFromHistory(m.opens);
  report(grown);
  report(Investments.tick(S, dd));
  report(House.tick(S, dd));
  report(Taxes.tick(S, House.renown(S)));
  report(Competition.tick(S, dd, market));
  report(Houses.tick(S)); // the rival houses (houses.js)
  report(Race.tick(S)); // the explorers and the rival houses' voyages (race.js)
  const war = War.tick(S); // the wars between the crowns (war.js)
  for (const m of war) {
    if (m.reward) Accounts.record(S, { kind: 'war', amount: m.reward, text: 'The crown\'s thanks for service in the war' });
    if (m.grantPost) { // land granted for service: a trading post, without cost
      const I = Investments.ensureInvest(S);
      if (!I.feitorias[m.grantPost]) I.feitorias[m.grantPost] = { since: S.day, cost: 0, granted: true };
      Works.ensureWorks(S);
    }
  }
  report(war);
  for (const m of Law.tick(S, dd, atSea)) { if (m.mutiny) ui.mutiny = true; else report([m]); } // infamy fades; a pirate crew counts the dry days
  const works = Works.tick(S, away); // your port works: upkeep, the trading posts' earnings (works.js)
  if (works.upkeep) Accounts.record(S, { kind: 'works', amount: -works.upkeep, text: 'Upkeep of your port works' });
  if (works.income) Accounts.record(S, { kind: 'post', amount: works.income, text: 'Your factors\' trade' });
  for (const m of works.msgs) {
    if (m.finished?.id === 'church') { if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 8; House.ensureHouse(S).renown += 2; }
  }
  report(works.msgs.filter((m) => m.html));
  syncMarket();
  Pirates.tickGalleys(S, dd); // corsair galleys cruising their waters, to be hunted
  if (atSea) {
    spoil(dd);
    wearHull(dd);
    for (const g of Pirates.lookout(S, S.ship.lon, S.ship.lat)) {
      toast(`<b>${g.big ? 'A great corsair galley' : 'A corsair galley'}</b> in sight off ${g.zone}, bearing ${compassPoint(bearing(S.ship.lon, S.ship.lat, g.lon, g.lat))}, ${Math.round(distNm(S.ship.lon, S.ship.lat, g.lon, g.lat))} miles. Sail onto her to give chase, or keep clear.`, 'alert');
    }
    const hunt = !ui.modal && !ui.pendingEncounter ? Pirates.contact(S, S.ship.lon, S.ship.lat) : null;
    if (hunt) ui.pendingEncounter = hunt;
    if (!ui.modal && !ui.pendingEncounter) {
      const enc = Pirates.roll(S, dd, S.ship.lon, S.ship.lat);
      if (enc) ui.pendingEncounter = enc;
    }
    report(Race.searchAt(S, S.ship.lon, S.ship.lat)); // a legend's place on the chart (race.js)
    if (!ui.modal && !ui.pendingEncounter && !away) { // the crown's hunters, the enemy's warships (law.js)
      const enc = Law.hunters(S, dd, S.ship.lon, S.ship.lat);
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
  report(Lending.tick(S));
  // New gear and new hulls at the yards: word at the turn of each year that brings some.
  const yr = Ships.yearOf(S.day);
  if ((S.yardNews ?? 1451) < yr) {
    S.yardNews = yr;
    const fresh = Ships.newThisYear(yr, S);
    if (fresh.length) report([{ html: `New at the shipyards this year: ${fresh.map((x) => x.hull ? `the <b>${x.hull.name.toLowerCase()}</b>` : `<b>${Ships.lc(x.c.name)}</b> (${x.g.name.toLowerCase()})`).join(', ')}. ${fresh.some((x) => x.hull) ? `See the ${homeName(S)} yard.` : 'Any yard can fit it, to your ship or a captain\'s (Fleet).'}`, kind: 'discover', log: `New at the yards: ${fresh.map((x) => x.hull ? x.hull.name : x.c.name).join(', ')}.` }]);
  }
  report(Pilots.tick(S));
  // Ships and refits on order at the Lisbon yard: word when they are ready.
  for (const o of Ships.ready(S)) {
    if (o.told) continue;
    o.told = true;
    const what = o.kind === 'hull' ? `Your ${Ships.HULLS[o.hull].name.toLowerCase()}${o.name ? ` <b>${String(o.name).replace(/[<>&"]/g, '')}</b>` : ''} is` : `The ${Ships.choice(o.group, o.choice).name.toLowerCase()} you ordered is`;
    report([{ html: `${what} ready at the ${homeName(S)} shipyard. Call there to take delivery.`, kind: 'discover', log: `${what.replace(/<[^>]+>/g, '')} ready in ${homeName(S)}.` }]);
  }
}

// The flagship's hull wears at sea, and storms batter her now and then (wear.js). Word once as
// she starts to leak and again when she is in danger; the factor in port tells you the rest.
function wearHull(dd) {
  if (S.hull == null) S.hull = 100;
  const fx = Ships.flagStats(S);
  if (S.ship.lat < Wear.TROPIC_LAT) S.ship.tropic = (S.ship.tropic || 0) + dd * fx.tropicWear; // shipworm waters: she ages faster (less under lead)
  if (S.hull < Wear.LEAKS_BELOW) S.ship.strain = (S.ship.strain || 0) + dd; // sailing her leaking wears her out
  const years = Ships.serviceYears(S.ship, S.day);
  const gale = Wear.galeFactor(S.ship.lon, S.ship.lat, S.day);
  const storm = Wear.storms(dd, Math.random, gale) * fx.peril;
  S.hull = Math.max(5, S.hull - Wear.wearPerDay(S.ship.lat, S.ship.hull, years, fx.tropicWear) * dd - storm);
  const aged = Wear.ageNotice(S.ship, S.ship.hull, years, `the <b>${S.ship.name}</b>`, true);
  if (aged) toast(aged, 'alert', true, 'alert');
  if (storm) toast(`${gale > 2.5 ? 'A gale' : 'A storm'} batters the <b>${S.ship.name}</b>: her hull is at ${Math.round(S.hull)}%.`, '');
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
  for (const [pid, e] of Object.entries(Investments.edges(S))) market.edge[pid] = (market.edge[pid] || 0) + e;
  market.rival = Competition.factors(S, market); // rival merchants // your factors
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

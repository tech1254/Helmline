// Helmline: start-up, the intro, and the main loop. The game itself lives in the modules.

import { PORTS, findPath, loadRoutes, shoalDepth } from './world.js';
import * as Fleet from './fleet.js';
import * as Contracts from './contracts.js';
import * as Cloud from './cloud.js';
import * as Accounts from './accounts.js';
import { S, market, ui } from './state.js';
import { DAYS_PER_SEC } from './config.js';
import { storyTick } from './storyview.js';
import { load, newGame, save } from './save.js';
import { checkCloudOnStart, cloudSync, loadFromCloud, loadSlot, newVoyageSlot, remoteAhead, renderCloudButton } from './cloudsync.js';
import { centerOn, clampCam, resize, toScreen } from './view.js';
import { revealAt } from './fog.js';
import { render } from './render.js';
import { advanceTime, catchUp, showSummary, update } from './sim.js';
import { confirmVoyage, dock, noPassage, openEncounter, planCourse, setCourse, undock, unlockContracts } from './voyage.js';
import { $ } from './util.js';
import { renderHud, renderPanel, setSpeed, warmRoutes } from './panels.js';
import { initInput } from './input.js';
import { initActions } from './actions.js';
import { initDialog } from './dialog.js';
import { initNotices } from './notices.js';
import { initDock } from './dock.js';
import { initShipyard } from './shipyard.js';
import * as Ships from './ships.js';
import { startArrival } from './scene.js';

// ---- Intro & loop -----------------------------------------------------------
function startIntro(hasSave) {
  $('intro-continue').hidden = !hasSave;
  $('intro-new').textContent = hasSave ? 'New game' : 'Weigh anchor';
  $('intro').hidden = false;
}
$('intro-continue').addEventListener('click', () => beginPlay());
$('intro-cloud').addEventListener('click', () => {
  const r = remoteAhead;
  beginPlay();
  if (r) { if (Cloud.cloud.slot) loadSlot(Cloud.cloud.slot, true); else loadFromCloud(Cloud.cloud.code, true); }
});
$('intro-code').addEventListener('click', () => { beginPlay(); ui.panelMode = 'cloud'; renderPanel(); });
$('intro-new').addEventListener('click', () => {
  if ($('intro-continue').hidden === false && !confirm('Start over? Your saved voyage will be lost.')) return;
  newGame();
  beginPlay();
  newVoyageSlot(); // signed in: the new voyage gets its own save in the account
});

function beginPlay() {
  $('intro').hidden = true;
  ui.introDone = true;
  if (S.ship.docked) { ui.panelMode = 'port'; renderPanel(); }
  centerOn(S.ship.lon, S.ship.lat);
  setTimeout(unlockContracts, 600);
  if (startSummary) { ui.pendingSummary = startSummary; startSummary = null; }
}

let last = performance.now();
let saveClock = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (ui.introDone) update(dt);
  const free = !ui.modal && !ui.screen && !ui.arrival;
  if (ui.pendingSummary && free && ui.introDone) { const sm = ui.pendingSummary; ui.pendingSummary = null; showSummary(sm); }
  if (ui.pendingEncounter && free && ui.introDone) { const e = ui.pendingEncounter; ui.pendingEncounter = null; openEncounter(e); }
  if (free && ui.introDone && !ui.pendingSummary && !ui.pendingEncounter) storyTick(dt); // letters and chapter cards (storyview.js)
  saveClock += dt;
  if (saveClock > 5 && ui.introDone) { saveClock = 0; save(); }
  ui.cloudClock += dt;
  if (ui.cloudClock > 30 && ui.introDone) { ui.cloudClock = 0; cloudSync(); }
  if (!ui.screen) render(); // the chart is hidden behind the ship screens
  renderHud();
  requestAnimationFrame(frame);
}

// The sea routes between ports come ready-made; without them they are planned as needed.
try { loadRoutes(await (await fetch('data/routes.json')).json()); } catch (e) { /* plan them as needed */ }
initInput();
initActions();
initDialog();
initNotices();
initDock();
initShipyard();
window.addEventListener('resize', () => { resize(); clampCam(); });
window.addEventListener('beforeunload', () => ui.introDone && save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && ui.introDone) { save(); cloudSync(); }
  if (document.visibilityState === 'visible' && ui.introDone) {
    const sum = catchUp();
    if (sum) { ui.pendingSummary = sum; renderPanel(); }
  }
});

resize();
Cloud.loadMeta();
const hasSave = load();
if (!hasSave) newGame();
if (Cloud.cloud.code && hasSave) ui.lastPushed = null;
renderCloudButton();
checkCloudOnStart();
let startSummary = catchUp();
// Build the sea grid and the routes from here to each charted port while the intro is read.
setTimeout(() => {
  for (const p of PORTS) if (S.discovered[p.id] && p.id !== S.ship.docked) findPath(S.ship.lon, S.ship.lat, p.lon, p.lat, 1, !!Ships.hullOf(S.ship).coastal);
  warmRoutes();
}, 300);
centerOn(-13, 29, 0.85);
setSpeed(1);
startIntro(hasSave);
requestAnimationFrame(frame);

// The top bar wraps to more rows on narrower screens: panels and notes start below it.
{
  const hud = document.getElementById('hud');
  const fit = () => document.documentElement.style.setProperty('--hud-h', `${Math.ceil(hud.getBoundingClientRect().bottom)}px`);
  new ResizeObserver(fit).observe(hud); fit();
}

// Exposed for debugging in the console.
window.helmline = {
  get state() { return S; }, market: () => market, offers: (pid) => Contracts.offersAt(S, market, pid), setCourse, setSpeed, screenOf: (lon, lat) => toScreen(lon, lat),
  away: (minutes) => { S.lastSeen = Date.now() - minutes * 60000; const sum = catchUp(); if (sum) ui.pendingSummary = sum; return sum && { days: sum.days, purse: Math.round(sum.purse), capped: sum.capped }; },
  encounter: (big = false) => { ui.pendingEncounter = { where: 'the Barbary coast', big, strength: big ? 1.35 : 1 }; },
  route: (lon, lat) => findPath(S.ship.lon, S.ship.lat, lon, lat),
  plan: (lon, lat, port) => planCourse(lon, lat, port, false),
  why: () => noPassage(),
  ports: PORTS,
  shoal: (lon, lat) => shoalDepth(lon, lat),
  route77: () => Fleet.setRoute(S, market, S.fleet.ships.find((x) => x.id === 77), { stops: [{ port: 'lisbon', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'cloth', pct: 50 }] }, { port: 'arguin', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'gold', pct: 25 }] }], next: 0 }),
  dockAt: (id) => { if (S.ship.docked) undock(); dock(id); },
  accounts: () => ({ purse: S.purse, known: Accounts.known(S), unaccounted: Accounts.unaccounted(S), pending: S.accounts.pending.reduce((t, e) => t + e.amount, 0), due: S.fleet.ships.reduce((t, x) => t + (x.wagesDue || 0), 0), voyage: S.accounts.voyage?.wages || 0, entries: S.accounts.entries.length }),
  scene: (portId) => { window.helmlineScenes = true; if (S.called) delete S.called[portId]; return startArrival(portId); },
  yearDay: (year) => Ships.dayOfYear(year),
  arrival: () => ui.arrival && { port: ui.arrival.portId, photo: !!ui.arrival.usePhoto, ship: ui.arrival.photo?.id || null },
  look: (lon, lat, zoom = 0.5) => centerOn(lon, lat, zoom),
  reveal: (lon, lat) => revealAt(lon, lat, 1, true),
  sail: (id) => { const p = PORTS.find((x) => x.id === id); const plan = planCourse(p.lon, p.lat, id, false); if (plan) confirmVoyage(plan); return !!plan; },
  fleetRoute: (id, route) => Fleet.setRoute(S, market, S.fleet.ships.find((x) => x.id === id), route),
  fleetCandidates: () => Fleet.candidates(S),
  cloud: () => ({ cloud: { ...Cloud.cloud }, account: { ...Cloud.account } }),
  refreshAccount: () => Cloud.refreshAccount().then(() => renderPanel()),
  sync: () => cloudSync(true),
  save: () => save(),
  fleetStatus: (id) => Fleet.statusText(S, S.fleet.ships.find((x) => x.id === id)),
  // sail on for some days of game time, as the frame loop would (stops for dialogs and arrivals)
  sailFor: (days) => { const sp = ui.speed; ui.speed = 1; for (let d = 0; d < days && !ui.modal && !ui.arrival; d += 0.25) update(0.25 / DAYS_PER_SEC); ui.speed = sp; renderPanel(); return S.ship.docked; },
  advance: (days) => { for (let i = 0; i < days * 4; i++) advanceTime(0.25, !S.ship.docked); renderPanel(); },
};

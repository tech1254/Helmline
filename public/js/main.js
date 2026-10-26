// Helmline: start-up, the intro, and the main loop. The game itself lives in the modules.

import { PORTS, findPath } from './world.js';
import * as Contracts from './contracts.js';
import * as Cloud from './cloud.js';
import * as Accounts from './accounts.js';
import { S, market, ui } from './state.js';
import { load, newGame, save } from './save.js';
import { checkCloudOnStart, cloudSync, loadFromCloud, remoteAhead, renderCloudButton } from './cloudsync.js';
import { centerOn, clampCam, resize, toScreen } from './view.js';
import { render } from './render.js';
import { advanceTime, catchUp, showSummary, update } from './sim.js';
import { dock, openEncounter, setCourse, undock, unlockContracts } from './voyage.js';
import { $ } from './util.js';
import { renderHud, renderPanel, setSpeed, warmRoutes } from './panels.js';
import { initInput } from './input.js';
import { initActions } from './actions.js';
import { initDialog } from './dialog.js';
import { initNotices } from './notices.js';

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
  if (r) loadFromCloud(Cloud.cloud.code, true);
});
$('intro-code').addEventListener('click', () => { beginPlay(); ui.panelMode = 'cloud'; renderPanel(); });
$('intro-new').addEventListener('click', () => {
  if ($('intro-continue').hidden === false && !confirm('Start over? Your saved voyage will be lost.')) return;
  newGame();
  beginPlay();
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
  if (ui.pendingSummary && !ui.modal && ui.introDone) { const sm = ui.pendingSummary; ui.pendingSummary = null; showSummary(sm); }
  if (ui.pendingEncounter && !ui.modal && ui.introDone) { const e = ui.pendingEncounter; ui.pendingEncounter = null; openEncounter(e); }
  saveClock += dt;
  if (saveClock > 5 && ui.introDone) { saveClock = 0; save(); }
  ui.cloudClock += dt;
  if (ui.cloudClock > 30 && ui.introDone) { ui.cloudClock = 0; cloudSync(); }
  render();
  renderHud();
  requestAnimationFrame(frame);
}

initInput();
initActions();
initDialog();
initNotices();
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
  for (const p of PORTS) if (S.discovered[p.id] && p.id !== S.ship.docked) findPath(S.ship.lon, S.ship.lat, p.lon, p.lat);
  warmRoutes();
}, 300);
centerOn(-13, 29, 0.85);
setSpeed(1);
startIntro(hasSave);
requestAnimationFrame(frame);

// Exposed for debugging in the console.
window.helmline = {
  get state() { return S; }, market: () => market, offers: (pid) => Contracts.offersAt(S, market, pid), setCourse, setSpeed, screenOf: (lon, lat) => toScreen(lon, lat),
  away: (minutes) => { S.lastSeen = Date.now() - minutes * 60000; const sum = catchUp(); if (sum) ui.pendingSummary = sum; return sum && { days: sum.days, purse: Math.round(sum.purse), capped: sum.capped }; },
  encounter: (big = false) => { ui.pendingEncounter = { where: 'the Barbary coast', big, strength: big ? 1.35 : 1 }; },
  dockAt: (id) => { if (S.ship.docked) undock(); dock(id); },
  accounts: () => ({ purse: S.purse, known: Accounts.known(S), unaccounted: Accounts.unaccounted(S), pending: S.accounts.pending.reduce((t, e) => t + e.amount, 0), due: S.fleet.ships.reduce((t, x) => t + (x.wagesDue || 0), 0), voyage: S.accounts.voyage?.wages || 0, entries: S.accounts.entries.length }),
  advance: (days) => { for (let i = 0; i < days * 4; i++) advanceTime(0.25, !S.ship.docked); renderPanel(); },
};

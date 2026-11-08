// The phone layout's controls, grouped by what you do with them:
//   bottom bar: time (one button: 1x, 2x, 4x, paused, round again), Sail, Ship (refit and repair; lit
//   in a port that can do it), Books (the trading panels as tabs), More
//   More: winds, centre on the ship, saves, a new voyage, how to play, feedback
// On a wide screen the full top bar is shown instead and this bar is hidden.

import * as Works from './works.js';
import { S, ui } from './state.js';
import { $ } from './util.js';
import { renderPanel, setSpeed, toggleWind } from './panels.js';
import { centerOn } from './view.js';
import { openFeedback } from './feedback.js';
import { openShips } from './shipyard.js';
import { newGame, save } from './save.js';
import * as Cloud from './cloud.js';
import { newVoyageSlot } from './cloudsync.js';
import { confirmDialog } from './dialog.js';
import { fmtDate } from './util.js';
import { YARDS, BEACH_TO } from './wear.js';
import { SCENE_MODES, sceneMode, setSceneMode } from './scene.js';
import { playlogOn, setPlaylog } from './playlog.js';

export const BOOKS = ['port', 'prices', 'ledger', 'rutter', 'contracts', 'fleet'];
const NEXT_TIME = { 0: 1, 1: 2, 2: 4, 4: 0, 10: 0 }; // round the speeds, then pause (10x after 4x, for an account that has it)
const nextTime = (v) => (v === 4 && Cloud.fastest() === 10 ? 10 : NEXT_TIME[v] ?? 1);

// Where the flagship can be seen to: a shipyard (refits, repairs, new ships), or any port when she
// needs careening.
export function serviceHere() {
  const pid = S.ship.docked;
  if (!pid) return null;
  if (Works.isYard(S, pid)) return 'yard';
  if ((S.hull ?? 100) < BEACH_TO) return 'beach';
  return null;
}

export function isBook(mode) {
  return BOOKS.includes(mode);
}

function openBooks() {
  if (isBook(ui.panelMode)) { ui.panelMode = null; renderPanel(); return; }
  let mode = ui.lastBook || 'prices';
  if (mode === 'port' && !S.ship.docked) mode = 'prices';
  if (S.ship.docked && !ui.lastBook) mode = 'port';
  ui.panelMode = mode;
  renderPanel();
}

function toggle(mode) {
  ui.panelMode = ui.panelMode === mode ? null : mode;
  renderPanel();
}

export function renderDock() {
  const paused = ui.speed === 0;
  const time = $('dock-time');
  const next = nextTime(ui.speed);
  time.innerHTML = `<span class="ico">${paused ? '❚❚' : `${ui.speed}×`}</span><span>${paused ? 'Paused' : 'Speed'}</span>`;
  time.setAttribute('aria-label', `${paused ? 'Paused' : `Speed ${ui.speed}×`}: tap for ${next ? `${next}×` : 'pause'}`);
  time.classList.toggle('on', paused);
  const svc = serviceHere();
  const ship = $('dock-ship');
  ship.classList.toggle('lit', !!svc);
  ship.classList.toggle('on', !!ui.screen);
  ship.setAttribute('aria-label', svc === 'yard' ? 'Your ship: the shipyard is here' : svc === 'beach' ? 'Your ship: she can be careened here' : 'Your ship');
  $('dock-sail').classList.toggle('on', ui.panelMode === 'sail');
  $('dock-books').classList.toggle('on', isBook(ui.panelMode));
  $('dock-more').classList.toggle('on', ui.panelMode === 'menu');
  $('dock-more').classList.toggle('alert', $('btn-cloud').classList.contains('problem')); // cloud save needs attention
  const n = $('contracts-count');
  const badge = $('dock-badge');
  badge.hidden = !S?.contracts?.unlocked || n.hidden;
  badge.textContent = n.textContent;
}

export function renderMenu(el) {
  const item = (act, label, sub = '') => `<button data-menu="${act}"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  el.innerHTML = `
    <header><h2>More</h2><button class="close" data-close aria-label="Close">×</button></header>
    <div class="menu-grid">
      ${item('wind', ui.showWind ? 'Hide the winds' : 'Show the winds', 'The arrows on the chart')}
      ${item('ship', 'Find my ship', 'Centre the chart on her')}
      ${item('cloud', 'Cloud save', 'Play on another device')}
      ${item('scenes', 'Arrival scenes', `${SCENE_MODES.find(([v]) => v === sceneMode())[1]} · tap to change`)}
      ${item('playlog', `Play log: ${playlogOn() ? 'on' : 'off'}`, playlogOn() ? 'Your play is sent for testing · tap to stop' : 'Nothing is sent · tap to share your play')}
      ${item('new', 'New voyage', 'Start again in Lisbon, 1451')}
      ${item('help', 'How to play')}
      ${item('bug', 'Report a bug')}
      ${item('idea', 'Suggest an idea')}
    </div>`;
}

// A choice in the More menu. Returns true if it handled the click.
export function menuAction(act) {
  if (act === 'wind') { toggleWind(); renderPanel(); return true; }
  if (act === 'ship') { ui.panelMode = null; renderPanel(); centerOn(S.ship.lon, S.ship.lat); return true; }
  if (act === 'register') { ui.panelMode = null; renderPanel(); openShips('register'); return true; }
  if (act === 'cloud' || act === 'help') { ui.panelMode = act; renderPanel(); return true; }
  if (act === 'bug' || act === 'idea') { openFeedback(act); return true; }
  if (act === 'new') { askNewVoyage(); return true; }
  if (act === 'playlog') { setPlaylog(!playlogOn()); renderPanel(); return true; }
  if (act === 'scenes') { // every port, then first visits only, then off, and round again
    const i = SCENE_MODES.findIndex(([v]) => v === sceneMode());
    setSceneMode(SCENE_MODES[(i + 1) % SCENE_MODES.length][0]); save(); renderPanel(); return true;
  }
  return false;
}

// Start again. Signed in, the voyage in play stays in the account and the new one gets a save of
// its own; otherwise it is kept only if it is in the cloud under a save code.
export function askNewVoyage() {
  const inAccount = !!(Cloud.account.token && Cloud.cloud.slot);
  const kept = inAccount
    ? `<p>This voyage stays in your account as <b>${Cloud.cloud.slotName || 'a save'}</b>, and you can load it again from Saves. The new voyage gets a save of its own.</p>`
    : Cloud.cloud.code
      ? `<p>This voyage stays in the cloud under your save code <b>${Cloud.cloud.code}</b>, but this device will play the new one.</p>`
      : `<p><b>This voyage (${fmtDate(S.day)}, ${Math.round(S.purse).toLocaleString()} cz) will be lost</b>: it is saved only on this device.${Cloud.account.token ? ' To keep it, first save it to your account in Saves.' : ' To keep it, sign in and save it to an account first (Saves).'}</p>`;
  const start = (nation) => () => {
      if (Cloud.cloud.code) Cloud.unlink(); // don't overwrite the code's save with the new voyage
      newGame(nation);
      ui.panelMode = 'port';
      setSpeed(1);
      renderPanel();
      centerOn(S.ship.lon, S.ship.lat);
      newVoyageSlot(); // signed in: a new save in the account
  };
  confirmDialog({
    title: 'Start a new voyage?',
    body: `${kept}<p>The new voyage begins in March 1451, with a barca and 300 cruzados, for Portugal (from Lisbon) or for Castile (from Palos).</p>
      <div class="row"><button data-modal-action="castile">Sail for Castile</button></div>`,
    ok: 'Sail for Portugal',
    onOk: start('portugal'),
    actions: { castile: start('castile') },
  });
}

export function initDock() {
  // tap: the next speed (or pause, after 4x); press and hold: pause at once
  let held = null, longPress = false;
  $('dock-time').addEventListener('pointerdown', () => { longPress = false; held = setTimeout(() => { longPress = true; setSpeed(0); navigator.vibrate?.(15); }, 450); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('dock-time').addEventListener(ev, () => clearTimeout(held));
  $('dock-time').addEventListener('contextmenu', (e) => e.preventDefault());
  $('dock-time').addEventListener('click', () => { if (longPress) { longPress = false; return; } setSpeed(nextTime(ui.speed)); });
  $('dock-ship').addEventListener('click', () => {
    // no yard here, but she can be careened on the beach: the hull box in the market. In a yard port, the yard (repairs are there too).
    if (S.ship.docked && (S.hull ?? 100) < 90 && serviceHere() === 'beach') { ui.panelMode = 'port'; renderPanel(); $('panel').scrollTop = 0; return; }
    ui.panelMode = null; renderPanel(); openShips(serviceHere() === 'yard' ? 'yard' : 'register');
  });
  $('dock-sail').addEventListener('click', () => toggle('sail'));
  $('dock-books').addEventListener('click', openBooks);
  $('dock-more').addEventListener('click', () => toggle('menu'));
}

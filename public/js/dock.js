// The phone layout's controls, grouped by what you do with them:
//   bottom bar: time (play or pause, speed), Sail, Books (the trading panels as tabs), More
//   More: winds, centre on the ship, cloud save, how to play, feedback
// On a wide screen the full top bar is shown instead and this bar is hidden.

import { S, ui } from './state.js';
import { $ } from './util.js';
import { renderPanel, setSpeed, toggleWind } from './panels.js';
import { centerOn } from './view.js';
import { openFeedback } from './feedback.js';

export const BOOKS = ['port', 'prices', 'ledger', 'contracts', 'fleet'];
const NEXT_SPEED = { 1: 2, 2: 4, 4: 1 };

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
  const play = $('dock-play');
  play.innerHTML = `<span class="ico">${paused ? '▶' : '❚❚'}</span><span>${paused ? 'Play' : 'Pause'}</span>`;
  play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  play.classList.toggle('on', paused);
  $('dock-speed').innerHTML = `<span class="ico">${ui.lastSpeed || 1}×</span><span>Speed</span>`;
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
      ${item('help', 'How to play')}
      ${item('bug', 'Report a bug')}
      ${item('idea', 'Suggest an idea')}
    </div>`;
}

// A choice in the More menu. Returns true if it handled the click.
export function menuAction(act) {
  if (act === 'wind') { toggleWind(); renderPanel(); return true; }
  if (act === 'ship') { ui.panelMode = null; renderPanel(); centerOn(S.ship.lon, S.ship.lat); return true; }
  if (act === 'cloud' || act === 'help') { ui.panelMode = act; renderPanel(); return true; }
  if (act === 'bug' || act === 'idea') { openFeedback(act); return true; }
  return false;
}

export function initDock() {
  $('dock-play').addEventListener('click', () => setSpeed(ui.speed === 0 ? (ui.lastSpeed || 1) : 0));
  $('dock-speed').addEventListener('click', () => setSpeed(NEXT_SPEED[ui.lastSpeed || 1] || 1));
  $('dock-sail').addEventListener('click', () => toggle('sail'));
  $('dock-books').addEventListener('click', openBooks);
  $('dock-more').addEventListener('click', () => toggle('menu'));
}

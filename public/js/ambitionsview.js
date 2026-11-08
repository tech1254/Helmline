// Callings and ambitions on screen: the choice of calling after the first voyage, the box of
// three ambitions under the HUD (folded to one line on phones), and the choice of the next
// ambition when one is done. Rules are in callings.js and ambitions.js.

import * as Callings from './callings.js';
import * as Ambitions from './ambitions.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { report } from './sim.js';
import { renderPanel } from './panels.js';
import { save } from './save.js';
import { plog } from './playlog.js';
import { $ } from './util.js';

// The browser tests see callings only when they ask (they open dialogs).
export const callingsOn = () => !(navigator.webdriver && !window.helmlineCallings);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let clock = 0;
let lastHtml = '';
// Each frame while nothing else is on screen: check the ambitions, then ask what needs asking.
export function ambitionsTick(dt, free) {
  clock += dt;
  if (clock < 0.5 || !S) return;
  clock = 0;
  Callings.ensureCalling(S);
  const msgs = Ambitions.checkAmbitions(S);
  if (msgs.length) { report(msgs); for (const m of msgs) if (m.rank) plog('rank', { rank: m.rank }); renderPanel(); save(); }
  renderAmbitions();
  if (!free || !callingsOn()) return;
  if (Callings.dueForChoice(S)) openCallingChoice();
  else if (Ambitions.needsChoice(S) && !ui.ambitionsLater) openAmbitionChoice();
}

// ---- The choice of calling ---------------------------------------------------------------
export function openCallingChoice() {
  const now = Callings.callingOf(S);
  const cost = Callings.switchCost(S);
  const cards = Callings.CALLING_IDS.map((id) => {
    const C = Callings.CALLINGS[id];
    const merit = Callings.meritOf(S, id);
    return `<div class="calling-card${id === now ? ' current' : ''}">
      <h3>${C.name}</h3>
      <p class="ranks">${C.ranks.join(' → ')}</p>
      <p>${C.pitch}</p>
      <p class="fine">${C.perks[0]}.${merit ? ` You have ${merit} merit on this path already.` : ''}</p>
      ${id === now ? '<p class="fine"><b>Your calling now.</b></p>' : `<button class="primary" data-modal-action="${id}">Become a ${C.short.toLowerCase()}</button>`}
    </div>`;
  }).join('');
  const intro = now
    ? (cost.free
      ? `<p>You have followed your calling for less than a year: you can still change it freely.</p>`
      : `<p>Leaving your calling now costs <b>${cost.standing} standing</b> and <b>${cost.meritLost} of your ${Callings.meritOf(S)} merit</b> as a ${Callings.CALLINGS[now].short.toLowerCase()}. The longer you follow a path, the more it costs to leave.</p>`)
    : `<p>Your first voyage is behind you. How will you make your name? You can change course in the first year without cost; after that, the path sets.</p>`;
  const actions = Object.fromEntries(Callings.CALLING_IDS.map((id) => [id, () => takeCalling(id)]));
  confirmDialog({
    title: now ? 'Change your calling' : 'Choose your calling', kind: 'calling', ok: null,
    cancel: now ? 'Keep my calling' : 'Decide later', actions,
    body: `${intro}<div class="calling-cards">${cards}</div>`,
  });
  if (!now) Callings.snooze(S); // closing it asks again in three weeks
}

function takeCalling(id) {
  const had = Callings.callingOf(S);
  const r = Callings.choose(S, id);
  if (!r.ok) return;
  Ambitions.onCallingChanged(S);
  plog('calling', { calling: id, from: had || undefined });
  const C = Callings.CALLINGS[id];
  report([{ html: `You are now a <b>${C.short.toLowerCase()}</b>: ${C.ranks[Callings.rankOf(S)]}. Your ambitions are under the date at the top left.`, kind: 'discover', log: `Took up a calling: ${C.name}.` }]);
  renderAmbitions(true);
  renderPanel();
  save();
}

// ---- The choice of the next ambition --------------------------------------------------------
export function openAmbitionChoice() {
  const A = Ambitions.ensureAmbitions(S);
  if (!A.offers?.length) return;
  const own = Callings.callingOf(S);
  const actions = {};
  const cards = A.offers.map((a) => {
    actions[`a${a.id}`] = () => { Ambitions.accept(S, a.id); ui.ambitionsLater = false; plog('ambition', { kind: a.kind, big: a.big || undefined }); renderAmbitions(true); save(); };
    return `<button class="ambition-offer${a.big ? ' big' : ''}" data-modal-action="a${a.id}">
      <span class="who">${a.calling === own ? '' : `${Callings.CALLINGS[a.calling].short} · `}${a.big ? 'A great ambition' : 'An ambition'}</span>
      <b>${esc(a.text)}</b>
      <span class="fine">${fmt(a.reward.cz)} cz, standing and ${a.reward.merit} merit</span>
    </button>`;
  }).join('');
  confirmDialog({
    title: 'Your next ambition', kind: 'ambition', ok: null, cancel: 'Later', actions,
    onCancel: () => { ui.ambitionsLater = true; setTimeout(() => { ui.ambitionsLater = false; }, 60000); },
    body: `<p>Choose what to aim for next. The one from another calling builds your name on that path too.</p><div class="ambition-offers">${cards}</div>`,
  });
}

// ---- The box under the HUD ----------------------------------------------------------------
export function renderAmbitions(force = false) {
  const el = $('ambitions');
  if (!el || !S) return;
  const id = Callings.callingOf(S);
  const showChoose = !id && callingsOn() && (S.voyages || 0) >= 1 && !(S.first && !S.first.done);
  if (!id && !showChoose) { if (!el.hidden) { el.hidden = true; layout(); } return; }
  const A = Ambitions.ensureAmbitions(S);
  let html;
  if (!id) {
    html = `<div class="amb-head"><span class="amb-title">Your calling</span></div><button class="amb-choose" data-amb="calling">Choose your calling</button>`;
  } else {
    const C = Callings.CALLINGS[id];
    const r = Callings.rankOf(S), m = Callings.meritOf(S), next = Callings.RANK_MERIT[r + 1];
    const rows = A.active.map((a) => {
      const p = Ambitions.progress(S, a);
      const of = a.target === 1 ? '' : `${fmt(p.v)} / ${fmt(p.of)}`;
      return `<li class="${a.big ? 'big' : ''}"><span class="amb-text">${esc(a.text)}</span><span class="amb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.f * 100)}"><i style="width:${(p.f * 100).toFixed(1)}%"></i></span>${of ? `<span class="amb-of">${of}</span>` : ''}</li>`;
    }).join('');
    const open = Math.max(0, 3 - A.active.length);
    html = `<div class="amb-head"><button class="amb-fold" data-amb="fold" aria-expanded="${!ui.ambFolded}"><span class="amb-title">${C.ranks[r]}</span><span class="amb-sub">${C.short}${next ? ` · ${m} / ${next} merit` : ''}</span></button><button class="amb-link" data-amb="calling" title="Change your calling">Calling</button></div>
      <ol class="amb-list">${rows}</ol>${open && A.offers?.length ? `<button class="amb-choose" data-amb="choose">Choose your next ambition</button>` : ''}`;
  }
  if (html === lastHtml && !force && !el.hidden) return;
  lastHtml = html;
  el.innerHTML = html;
  el.hidden = false;
  el.classList.toggle('folded', !!ui.ambFolded);
  layout();
}

// The captain's notes sit under the box.
function layout() {
  const el = $('ambitions');
  const h = el && !el.hidden ? el.offsetHeight + 8 : 0;
  document.documentElement.style.setProperty('--amb-h', `${h}px`);
}

export function initAmbitions() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches) ui.ambFolded = true;
  $('ambitions')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-amb]');
    if (!b) return;
    if (b.dataset.amb === 'fold') { ui.ambFolded = !ui.ambFolded; renderAmbitions(true); }
    else if (b.dataset.amb === 'calling') openCallingChoice();
    else if (b.dataset.amb === 'choose') openAmbitionChoice();
  });
}

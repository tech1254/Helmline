// A fight at sea on screen (fight.js): both ships' state, the range between them, what she
// means to do, what happened last round, and the actions you can take now. Each choice plays a
// round and shows the next; when it is over, "Continue" hands the result back.

import * as Fight from './fight.js';
import { confirmDialog } from './dialog.js';
import { setSpeed } from './panels.js';
import { ui } from './state.js';
import { plog } from './playlog.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const bar = (label, v, cls = '') => `<div class="fbar ${cls}"><span>${label}</span><i style="--v:${Math.max(0, Math.min(100, Math.round(v)))}%"></i><b>${Math.max(0, Math.round(v))}</b></div>`;
const ODDS = { run: 'to get away this round', board: 'to carry her', demand: 'that she strikes' };
const spirit = (m) => (m >= 70 ? 'eager' : m >= 45 ? 'steady' : m >= 25 ? 'shaken' : 'breaking');

function side(s, you) {
  return `<div class="fside${you ? ' you' : ''}">
    <h3>${you ? `The <i>${s.name}</i>` : `The ${s.name}`}</h3>
    ${bar('Hull', s.hull)}${bar('Spirit', s.morale, s.morale < 30 ? 'low' : '')}${bar('Sails', s.rigging, s.rigging < 40 ? 'low' : '')}
    <p class="fine">${you ? "Your" : "Her"} crew: ${spirit(s.morale)}.</p>
  </div>`;
}

function track(r) {
  const stops = ['Alongside', 'Gunshot', 'Long range', 'Away'];
  return `<ol class="frange" aria-label="Range: ${Fight.RANGE_NAMES[Math.min(3, r)]}">${stops.map((n, i) => `<li class="${i === r ? 'on' : ''}">${n}</li>`).join('')}</ol>`;
}

// opts: { title, intro (html, first round only), onDone(F), auto (offer "let your master fight") }
export function openFight(F, opts) {
  setSpeed(0);
  render(F, opts, []);
}

function render(F, opts, last) {
  const done = !!F.done;
  const acts = done ? '' : Fight.choices(F).map((c) => `<button data-modal-action="${c.id}" class="fact${c.id === 'board' || c.id === 'run' ? ' primary' : ''}">
      <b>${c.name}</b>${c.odds != null ? ` <span class="odds">${pct(c.odds)} ${ODDS[c.id]}</span>` : ''}<small>${c.note}</small></button>`).join('');
  const body = `<div class="fight">
      ${F.round === 1 && !last.length && opts.intro ? `<div class="fintro">${opts.intro}</div>` : ''}
      <div class="fsides">${side(F.you, true)}${side(F.foe, false)}</div>
      ${track(F.r)}
      ${last.length ? `<ul class="flog">${last.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${done ? '' : `<p class="fround">Round ${F.round} of ${Fight.ROUNDS}. <span class="fintent">${F.intentText}</span></p>`}
      ${done ? '' : `<div class="facts-grid">${acts}</div>`}
      ${done ? '<div class="row choice"><button class="primary" data-modal-action="done">Continue</button></div>' : (opts.auto !== false ? '<p class="fine fauto"><button class="link" data-modal-action="auto">Leave it to your sailing master</button> (he fights it out for you)</p>' : '')}
    </div>`;
  const actions = { done: () => opts.onDone(F) };
  for (const c of done ? [] : Fight.choices(F)) actions[c.id] = () => { const l = Fight.round(F, c.id); plog('fight', { act: c.id, r: F.r, round: F.round, done: F.done?.result || null }); render(F, opts, l); };
  actions.auto = () => { const before = F.log.length; Fight.autoplay(F); render(F, opts, F.log.slice(before).slice(-6)); };
  confirmDialog({ title: done ? title(F) : opts.title, body, ok: null, cancel: false, kind: 'fight', actions });
  ui.fight = F;
}

function title(F) {
  const r = Fight.outcome(F);
  return r === 'win' ? (F.role === 'attack' ? 'She is yours' : 'You have beaten them off')
    : r === 'clear' ? 'You are clear of them' : r === 'lose' ? 'Taken' : r === 'paid' ? 'Tribute paid' : 'She got away';
}

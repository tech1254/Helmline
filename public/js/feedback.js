// Feedback: players report a bug or suggest an idea from inside the game. Reports go to
// /api/feedback and into a backlog that is reviewed nightly. The draft is kept as it is
// typed, so a panel redraw (arriving in port, say) or a closed tab does not lose it.

import { S, ui } from './state.js';
import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import { $, fmtDate } from './util.js';
import { renderPanel, setSpeed } from './panels.js';
import { hint } from './notices.js';

const DRAFT_KEY = 'helmline-feedback-draft';
const KINDS = {
  bug: { label: 'Something is wrong', noun: 'bug report', prompt: 'What happened, and what were you doing just before? What did you expect instead?' },
  idea: { label: 'An idea', noun: 'idea', prompt: 'What would make Helmline better?' },
};

function blankDraft() {
  return { kind: 'bug', message: '', contact: '', details: true };
}

function loadDraft() {
  try { return { ...blankDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') }; } catch (e) { return blankDraft(); }
}

let draft = loadDraft();
let sending = false;
let sent = null; // { id, kind } after a report goes through

function keepDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* private mode: keep it in memory */ }
}

const strip = (html) => String(html).replace(/<[^>]+>/g, '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// What the game was doing, to help make sense of a report. Shown to the player before sending.
export function gameContext() {
  const sh = S.ship;
  const where = sh.docked ? PORTS.find((p) => p.id === sh.docked)?.name : `at sea, ${sh.lat.toFixed(1)}° N ${Math.abs(sh.lon).toFixed(1)}° W`;
  const hold = GOODS.filter((g) => S.cargo[g.id]).map((g) => `${S.cargo[g.id]} ${g.unit} of ${g.name.toLowerCase()}`).join(', ');
  return {
    date: fmtDate(S.day),
    place: where,
    purse: Math.round(S.purse),
    hold: hold || 'empty',
    hiredShips: S.fleet?.ships?.length || 0,
    contracts: S.contracts?.active?.length || 0,
    standing: S.contracts?.standing ?? 0,
    panelBefore: ui.feedbackFrom || 'chart',
    recentNotices: (S.notices || []).slice(-6).map((n) => `${fmtDate(n.day)}: ${strip(n.html)}`),
    screen: `${window.innerWidth} × ${window.innerHeight}, pixel ratio ${window.devicePixelRatio || 1}`,
    browser: navigator.userAgent,
  };
}

export function openFeedback(kind) {
  if (ui.panelMode !== 'feedback') ui.feedbackFrom = ui.panelMode;
  if (kind && KINDS[kind]) draft.kind = kind;
  sent = null;
  if (ui.speed) { ui.feedbackResume = ui.speed; setSpeed(0); }
  ui.panelMode = 'feedback';
  renderPanel();
  setTimeout(() => $('panel').querySelector('textarea')?.focus(), 0);
}

// Closing the form lets time run again if opening it paused the game.
export function closeFeedback() {
  ui.panelMode = S.ship.docked ? 'port' : null;
  if (ui.feedbackResume) { setSpeed(ui.feedbackResume); ui.feedbackResume = null; }
  renderPanel();
}

export function renderFeedback(el) {
  if (sent) {
    el.innerHTML = `
      <header><h2>Thank you</h2><button class="close" data-feedback-close aria-label="Close">×</button></header>
      <p>Your ${KINDS[sent.kind].noun}${sent.id ? ` (number ${sent.id})` : ''} is in the backlog. We read them every night.</p>
      <div class="row"><button data-feedback="${sent.kind}">Send another</button><button class="primary" data-feedback-close>Back to the game</button></div>`;
    return;
  }
  const k = KINDS[draft.kind];
  const ctx = gameContext();
  const shown = [
    ['Date', ctx.date], ['Where', ctx.place], ['Purse', `${ctx.purse.toLocaleString()} cz`], ['Hold', ctx.hold],
    ['Hired ships', ctx.hiredShips], ['Contracts', ctx.contracts], ['Last notices', ctx.recentNotices.length ? ctx.recentNotices.join(' · ') : 'none'],
    ['Screen', ctx.screen], ['Browser', ctx.browser],
  ];
  el.innerHTML = `
    <header><h2>Feedback</h2><button class="close" data-feedback-close aria-label="Close">×</button></header>
    <p class="blurb">Tell us about a bug, or suggest an idea. Every report goes into the backlog we review each night.${ui.feedbackResume ? ' The game is paused while you write.' : ''}</p>
    <form data-feedback-form class="feedback">
      <div class="seg kind" role="radiogroup" aria-label="Kind of feedback">
        ${Object.entries(KINDS).map(([id, x]) => `<label class="${draft.kind === id ? 'on' : ''}"><input type="radio" name="kind" value="${id}" ${draft.kind === id ? 'checked' : ''}> ${x.label}</label>`).join('')}
      </div>
      <label class="field">${draft.kind === 'bug' ? 'What went wrong?' : 'Your idea'}
        <textarea name="message" rows="6" maxlength="4000" placeholder="${esc(k.prompt)}">${esc(draft.message)}</textarea>
      </label>
      <label class="field">Your name or email <span class="muted">(optional, if you would like a reply)</span>
        <input name="contact" maxlength="200" autocomplete="email" value="${esc(draft.contact)}">
      </label>
      <label class="check"><input type="checkbox" name="details" ${draft.details ? 'checked' : ''}> Include game details</label>
      <details class="fine"><summary>What the game details include</summary>
        <dl class="facts small">${shown.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
      </details>
      <div class="row"><button type="submit" class="primary" ${sending ? 'disabled' : ''}>${sending ? 'Sending…' : `Send ${k.noun}`}</button></div>
    </form>`;
}

// Typing keeps the draft; choosing bug or idea redraws the form for its wording.
export function feedbackInput(e) {
  const f = e.target.closest('[data-feedback-form]');
  if (!f) return false;
  const name = e.target.name;
  if (name === 'message' || name === 'contact') draft[name] = e.target.value;
  else if (name === 'details') draft.details = e.target.checked;
  else if (name === 'kind' && e.type === 'change') { draft.kind = e.target.value; keepDraft(); renderPanel(); return true; }
  keepDraft();
  return true;
}

export async function submitFeedback() {
  if (sending) return;
  const message = draft.message.trim();
  if (message.length < 5) { hint('Please describe it in a few words first.'); return; }
  sending = true;
  renderPanel();
  let r;
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: draft.kind, message, contact: draft.contact.trim() || undefined, context: draft.details ? gameContext() : undefined }),
    });
    r = { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch (e) {
    r = { ok: false, error: 'Could not reach the server. Your note is kept here; try again in a while.' };
  }
  sending = false;
  if (r.ok) {
    sent = { id: r.id, kind: draft.kind };
    draft = { ...blankDraft(), contact: draft.contact, kind: draft.kind };
    keepDraft();
  } else {
    hint(r.error || 'That did not go through. Your note is kept; please try again.');
  }
  if (ui.panelMode === 'feedback') renderPanel();
}

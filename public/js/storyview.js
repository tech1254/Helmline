// The story on screen: letters and chapter cards as dialogs when their moment comes, and the
// Rutter panel (the book's pages, and the letters received). Rules are in story.js.

import * as Story from './story.js';
import { PORTS } from './world.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { revealAt } from './fog.js';
import { log } from './pricebook.js';
import { fmtDate } from './util.js';
import { tabs, renderPanel } from './panels.js';
import { save } from './save.js';

// Tests run without the story unless they ask for it (as with the arrival scenes).
export const storyOn = () => !(navigator.webdriver && !window.helmlineStory) && !S.story?.off;

let clock = 0;
// Called each frame while nothing else is on screen: show the next beat that is due.
export function storyTick(dt) {
  clock += dt;
  if (clock < 0.5 || !storyOn()) return;
  clock = 0;
  const beat = Story.due(S);
  if (beat) showBeat(beat);
}

function showBeat(beat) {
  const v = beat.show(S);
  const head = v.kind === 'letter' ? `<p class="story-from">${v.from ? `From ${v.from}` : ''}<span>${fmtDate(S.day)}</span></p>` : `<p class="story-from"><span>${fmtDate(S.day)}</span></p>`;
  const done = (choice) => {
    const input = document.getElementById('story-house')?.value;
    const line = Story.resolve(S, beat, choice, input);
    if (S.story.reveal) {
      const p = PORTS.find((x) => x.id === S.story.reveal);
      if (p) revealAt(p.lon, p.lat, 0.5); // charted, as if found: the crown pays for it in Lisbon
      delete S.story.reveal;
    }
    if (line) log(line);
    renderPanel();
    save();
  };
  if (v.choices) {
    const actions = Object.fromEntries(v.choices.map((c) => [c.id, () => done(c.id)]));
    confirmDialog({
      title: v.title, kind: `story story-${v.kind}`, ok: null, cancel: false, actions,
      body: `<div class="story story-${v.kind}">${head}${v.body}<div class="row story-choices">${v.choices.map((c) => `<button data-modal-action="${c.id}" class="${c.primary ? 'primary' : ''}">${c.label}</button>`).join('')}</div></div>`,
    });
  } else {
    confirmDialog({ title: v.title, kind: `story story-${v.kind}`, ok: v.ok || 'Read', cancel: false, onOk: () => done(null), body: `<div class="story story-${v.kind}">${head}${v.body}</div>` });
  }
}

// The Rutter: the book's pages, then the letters.
export function renderRutter(el) {
  const st = Story.ensureStory(S);
  const sold = st.choices.rutter === 'sell';
  const pages = Story.PAGES.map((p) => {
    const found = st.pages[p.n] != null;
    return `<li class="rutter-page ${found ? 'found' : ''}">
      <h4>${p.n}. ${p.title}</h4>
      <p class="riddle">${p.riddle}</p>
      ${found ? `<p class="found-line">Found ${fmtDate(st.pages[p.n])}: ${p.found}</p>` : p.n === 1 && st.alvaro ? '<p class="fine">Mestre Álvaro: south of the Cape of Masts.</p>' : ''}
    </li>`;
  }).join('');
  const letters = st.letters.slice().reverse().map((l) => `<li><span class="when">${fmtDate(l.day)}</span> ${l.line || l.title}</li>`).join('');
  el.innerHTML = `
    ${tabs('rutter')}
    <header><h2>The rutter of João Vaz</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">${sold ? `You sold your father's book to Lorenzo Salvago. Your copy of the first page is all the house of ${st.house} keeps.` : `Your father's book of courses, soundings and landmarks: what he saw, written for the pilot who comes after. Each page you find is a step of the house of ${st.house}'s story.`}</p>
    <ol class="rutter">${sold ? pages.split('</li>')[0] + '</li>' : pages}</ol>
    ${st.debt && !st.debt.paid ? `<p class="foot">João Vaz's debt to Salvago, <b>${Story.DEBT} cz</b>, falls due on ${fmtDate(Story.DEBT_DUE)}. Pay it at the market in Lisbon.</p>` : ''}
    <h3>The house's story</h3>
    ${letters ? `<ul class="story-log">${letters}</ul>` : '<p class="muted">Nothing yet.</p>'}
    <div class="row"><label class="fine"><input type="checkbox" data-story-off ${st.off ? 'checked' : ''}> Turn the story off (no letters or chapter cards)</label></div>`;
}

// For the Lisbon market panel: the debt, while it is owed.
export function debtBox() {
  if (!Story.canPayDebt(S) || !storyOn()) return '';
  return `<div class="note story-debt"><p>João Vaz owed the house of Salvago <b>${Story.DEBT} cz</b>, due ${fmtDate(Story.DEBT_DUE)}.</p><div class="row"><button data-pay-debt ${S.purse < Story.DEBT ? 'disabled' : ''}>Pay Salvago ${Story.DEBT} cz</button></div></div>`;
}

export function payDebtNow(toast) {
  const r = Story.payDebt(S);
  if (r) { toast(`Paid Salvago the ${Story.DEBT} cz your father owed${r === 'early' ? '. His clerk looks surprised.' : '.'}`, 'port'); log(`Paid João Vaz's debt to Salvago.`); }
  renderPanel(); save();
}

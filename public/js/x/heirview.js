// Your heir on screen (x/heir.js): matches, placing a child and handing the house on, in your home
// port; the family in the house panel.

import * as Heir from './heir.js';
import { S } from '../state.js';
import { confirmDialog } from '../dialog.js';
import { report } from '../sim.js';
import { save } from '../save.js';
import { renderPanel } from '../panels.js';
import { fmtDate } from '../util.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const homeId = () => ((S.nation || 'portugal') === 'castile' ? 'seville' : 'lisbon');

function portBox(pid) {
  if (pid !== homeId() || S.ship.docked !== pid) return '';
  const bits = [];
  const f = Heir.family(S);
  if (Heir.matchOffer(S)) bits.push(`<p class="harbour">Matches are proposed for ${f.head.name} ${Heir.house(S)}, ${f.head.age}.</p><div class="row invest"><button data-heir-match>Hear the matches</button></div>`);
  const c = Heir.toPlace(S);
  if (c) bits.push(`<p class="harbour">${c.name} is ${Heir.ageOf(S, c)}, and must be placed.</p><div class="row invest"><button data-heir-place>Place ${c.name}</button></div>`);
  if (Heir.canHandOver(S)) bits.push(`<p class="harbour">${f.head.name} is ${f.head.age}. ${Heir.heirOf(S).name} is ready to take the house.</p><div class="row invest"><button data-heir-hand>Hand the house to ${Heir.heirOf(S).name}</button></div>`);
  return bits.join('');
}

function houseBox() {
  const f = Heir.family(S), h = Heir.house(S);
  const kids = f.children.filter((c) => !c.died);
  return `<h3>The family</h3><ul class="help">
    <li><b>${f.head.name} ${h}</b>, ${f.head.age}, head of the house${f.head.gen > 1 ? ` (the ${['', 'first', 'second', 'third', 'fourth', 'fifth'][f.head.gen] || `${f.head.gen}th`} generation)` : ''}${f.spouse ? `, married to ${f.spouse.name}` : ''}.</li>
    ${kids.length ? `<li>Children: ${kids.map((c) => `${c.name} (${c.age}${c.place ? `, ${Heir.PLACES[c.place].name}` : ''})`).join(', ')}.</li>` : ''}
    ${f.heads.slice(-4).map((e) => `<li>${fmtDate(e.day)}: ${e.text}.</li>`).join('')}
  </ul>`;
}

function click(t) {
  const d = t.dataset;
  if (d.heirMatch !== undefined) {
    const o = Heir.matchOffer(S);
    if (!o) return true;
    confirmDialog({
      title: 'A match for the house',
      body: `<p>The house needs an heir, and ${Heir.family(S).head.name} ${Heir.family(S).head.sex === 'f' ? 'a husband' : 'a wife'}. Three matches are proposed.</p>
        <ul class="spoils">
          <li><button data-modal-action="merchant"><b>${cap(o.merchant.name)}</b><small>${o.merchant.text} ${fmt(o.merchant.dowry)} cz.</small></button></li>
          <li><button data-modal-action="noble"><b>${cap(o.noble.name)}</b><small>${o.noble.text}</small></button></li>
          ${o.rival ? `<li><button data-modal-action="rival"><b>The house of ${o.rival.houseName}</b><small>${o.rival.text}</small></button></li>` : ''}
        </ul>`,
      ok: null, cancel: 'Not yet', kind: 'rumour',
      actions: Object.fromEntries(['merchant', 'noble', 'rival'].map((k) => [k, () => { const r = Heir.marry(S, k); if (r) { report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); } }])),
      onCancel: () => { Heir.decline(S); save(); },
    });
    return true;
  }
  if (d.heirPlace !== undefined) {
    const c = Heir.toPlace(S);
    if (!c) return true;
    confirmDialog({
      title: `Where to place ${c.name}`,
      body: `<p>${c.name} is ${Heir.ageOf(S, c)}. What the house's heir learns now is what the house will have when the heir takes it.</p>
        <ul class="spoils">${Object.entries(Heir.PLACES).map(([k, P]) => `<li><button data-modal-action="${k}"><b>${P.name[0].toUpperCase()}${P.name.slice(1)}</b><small>${c.name} ${P.text}. ${P.gift.purse ? `Brings ${fmt(P.gift.purse)} cz into the house on taking it.` : `Standing at court +${P.gift.standing} on taking the house.`}</small></button></li>`).join('')}</ul>`,
      ok: null, cancel: 'Later', kind: 'rumour',
      actions: Object.fromEntries(Object.keys(Heir.PLACES).map((k) => [k, () => { const r = Heir.place(S, k); if (r) { report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); } }])),
    });
    return true;
  }
  if (d.heirHand !== undefined) {
    const n = Heir.heirOf(S);
    confirmDialog({
      title: 'Hand the house on',
      body: `<p>${Heir.family(S).head.name} ${Heir.house(S)} gives up the head of the house to ${n.name}, and retires to the country. Your ships, your purse, your ports, your standing: all go on.</p>`,
      ok: `Hand the house to ${n.name}`, kind: 'rumour',
      onOk: () => { const r = Heir.handOver(S); report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); },
    });
    return true;
  }
  return false;
}

export default { id: 'heir', portBox, houseBox, click };

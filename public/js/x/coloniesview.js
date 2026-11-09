// Settling the New World on screen (x/colonies.js): charters in your home port; landing the
// settlers at the site; the colony's stores, people, neighbours and produce when you call there;
// your colonies in the house panel.

import * as Col from './colonies.js';
import * as Ships from '../ships.js';
import { S } from '../state.js';
import { confirmDialog } from '../dialog.js';
import { report } from '../sim.js';
import { save } from '../save.js';
import { renderPanel } from '../panels.js';
import { toast } from '../notices.js';
import { held, fmtDate } from '../util.js';
import { log } from '../pricebook.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const room = () => Ships.flagStats(S).hold - held();
const cap = (t) => t[0].toUpperCase() + t.slice(1);

function homeBox() {
  const open = Col.sitesOpen(S);
  if (!open.length) return '';
  const title = (S.nation || 'portugal') === 'portugal' ? 'Captaincies in Brazil' : 'Charters to settle the Indies';
  return `<details class="port-about"><summary>${title}</summary>
    <p class="harbour">The crown grants land to settle, at the settler's own cost: ${fmt(Col.CHARTER_COST)} cz for the patent, ${Col.SETTLERS} settlers and their tools. Keep them fed through the first years and the colony grows into a town that pays your house its dues, and sends home what its land gives.</p>
    <ul class="spoils">${open.map((s) => {
      const q = Col.canCharter(S, s.id);
      return `<li><button data-colony-charter="${s.id}" ${q.ok ? '' : 'disabled'}><b>${s.name}, ${s.region}</b><small>${s.blurb} It gives ${Object.keys(s.produce).join(', ').replace(/, ([^,]*)$/, ' and $1')}.${q.ok ? '' : ` <i>(${q.why})</i>`}</small></button></li>`;
    }).join('')}</ul></details>`;
}

function colonyBox(pid) {
  const c = Col.summary(S, pid);
  if (!c) return '';
  const site = Col.SITES[pid];
  const builds = Object.entries(Col.BUILD).filter(([b]) => !c.built[b] && (b !== 'mill' || site.produce.sugar)).map(([b, B]) => {
    const q = Col.canBuild(S, pid, b);
    return `<button data-colony-build="${b}" ${q.ok ? '' : 'disabled'} title="${B.text}">Build ${B.name}: ${fmt(B.cost)} cz${q.why && !q.ok ? ` (${q.why})` : ''}</button>`;
  }).join('');
  const has = (g) => S.cargo?.[g] || 0;
  return `<div class="colony"><h3>Your colony: ${c.name}</h3>
    <dl class="facts">
      <dt>Settlers</dt><dd>${fmt(c.pop)}, ${c.stage}${c.dues ? `, paying ${fmt(c.dues)} cz a month in dues` : ''}</dd>
      <dt>Stores</dt><dd>${c.months >= 99 ? 'it feeds itself' : `${c.months} month${c.months === 1 ? '' : 's'} of what it cannot grow`} · grows ${c.fed}% of its own food</dd>
      <dt>Spirits</dt><dd>${c.heart >= 70 ? 'high' : c.heart >= 45 ? 'steady' : 'low'} (wine and cloth hearten them)</dd>
      <dt>Neighbours</dt><dd>${cap(c.people)}: ${c.relations >= 70 ? 'friendly, and cutting brazilwood for trade' : c.relations >= 40 ? 'wary' : 'angry: there will be fighting'}</dd>
      <dt>Built</dt><dd>${Object.keys(c.built).map((b) => Col.BUILD[b].name).join(', ') || 'a palisade and huts'}</dd>
      <dt>In the store-houses</dt><dd>${c.stock.map((x) => `${x.qty} ${x.name}`).join(', ') || 'nothing yet'}</dd>
    </dl>
    <div class="row invest">
      <button data-colony-load ${c.stock.length && room() > 0 ? '' : 'disabled'}>Load the colony's goods (${room()} room)</button>
      <button data-colony-land="wheat" ${has('wheat') ? '' : 'disabled'}>Land wheat (${has('wheat')})</button>
      <button data-colony-land="wine" ${has('wine') ? '' : 'disabled'}>Land wine (${has('wine')})</button>
      <button data-colony-gift ${has('cloth') ? '' : 'disabled'}>Trade cloth with ${c.people.split(' and ')[0]} (${has('cloth')})</button>
    </div>
    ${builds ? `<div class="row invest">${builds}</div>` : ''}
    <p class="fine"><label><input type="checkbox" data-colony-auto ${c.auto ? 'checked' : ''}> Your factor ships provisions when the stores run short (${Col.FACTOR_PRICE * 100 | 0} cz for a hundred settler-months)</label></p></div>`;
}

function portBox(pid) {
  if (pid === Col.home(S) && S.ship.docked === pid) return homeBox();
  if (S.ship.docked !== pid) return '';
  if (Col.canFound(S, pid)) {
    const s = Col.SITES[pid];
    return `<p class="harbour">Your charter for ${s.region} is aboard, with ${Col.SETTLERS} settlers and their tools, waiting to go ashore.</p><div class="row invest"><button class="primary" data-colony-found>Land the settlers and found the colony</button></div>`;
  }
  return colonyBox(pid);
}

function houseBox() {
  const all = Object.keys(Col.colonies(S));
  const ch = Object.keys(Col.ensure(S).charters);
  if (!all.length && !ch.length) return '';
  return `<h3>Your colonies</h3><ul class="help">${all.map((pid) => { const c = Col.summary(S, pid); return `<li><b>${c.name}</b> (${Col.SITES[pid].region}): ${cap(c.stage)} of ${fmt(c.pop)} settlers, founded ${fmtDate(c.founded)}${c.dues ? `; ${fmt(c.dues)} cz a month in dues` : ''}.</li>`; }).join('')}${ch.map((pid) => `<li>A charter for ${Col.SITES[pid].region}: the settlers wait to be landed at <b>${Col.SITES[pid].name}</b>.</li>`).join('')}</ul>`;
}

const LABOUR = {
  portugal: 'On the other captaincies the planters are raiding the Tupi villages for men to cut cane, and buying Africans at São Tomé to work the mills. Your settlers clear and plant the land themselves, and hire Tupi hands for cloth and iron tools. The colony will grow slower for it.',
  castile: 'In the older towns of the islands the Taíno have been parcelled out among the settlers to work, and they are dying of it, and of the new fevers; the friars preach against it. Your settlers work their own land, and trade with the Taíno for what they need. The colony will grow slower for it.',
};

function click(t) {
  const d = t.dataset;
  const pid = S.ship.docked;
  if (d.colonyCharter) {
    const s = Col.SITES[d.colonyCharter];
    confirmDialog({
      title: `A charter for ${s.region}`,
      body: `<p>${s.blurb}</p><p>The crown grants your house the land, to settle at your own cost: <b>${fmt(Col.CHARTER_COST)} cz</b> for the patent, and ${Col.SETTLERS} settlers with their tools, seed and livestock. The first years are the hard ones: the settlers must be fed until they grow their own food. ${cap(s.people)} live there.</p><p class="fine">${LABOUR[s.crown]}</p>`,
      ok: 'Take the charter',
      kind: 'rumour',
      onOk: () => { const r = Col.charter(S, d.colonyCharter); if (r) { report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); } },
    });
    return true;
  }
  if (d.colonyFound !== undefined) {
    const r = Col.found(S, pid);
    if (r) { report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); }
    return true;
  }
  if (d.colonyLand) {
    const n = Col.land(S, pid, d.colonyLand, S.cargo?.[d.colonyLand] || 0);
    if (n) { toast(`You land ${n} ${d.colonyLand === 'wheat' ? 'sacks of wheat for the stores' : 'casks of wine for the settlers'} at ${Col.SITES[pid].name}.`, 'port'); log(`Landed ${n} ${d.colonyLand} at ${Col.SITES[pid].name}.`); renderPanel(); save(); }
    return true;
  }
  if (d.colonyGift !== undefined) {
    const n = Col.gift(S, pid, S.cargo?.cloth || 0);
    if (n) { toast(`You trade ${n} bolts of cloth with ${Col.SITES[pid].people}. They bring brazilwood, game and manioc to the landing.`, 'port'); renderPanel(); save(); }
    return true;
  }
  if (d.colonyLoad !== undefined) {
    const got = Col.loadProduce(S, pid, room());
    if (got.length) { toast(`You load ${got.map((x) => `${x.qty} ${x.good}`).join(' and ')} from your colony's store-houses.`, 'port'); log(`Loaded ${got.map((x) => `${x.qty} ${x.good}`).join(', ')} at ${Col.SITES[pid].name}.`); renderPanel(); save(); }
    return true;
  }
  if (d.colonyBuild) {
    const b = d.colonyBuild;
    confirmDialog({
      title: `${cap(Col.BUILD[b].name)} at ${Col.SITES[pid].name}`,
      body: `<p>${Col.BUILD[b].text}</p>${b === 'mill' ? `<p class="fine">${LABOUR[Col.SITES[pid].crown]}</p>` : ''}`,
      ok: `Build it: ${fmt(Col.BUILD[b].cost)} cz`,
      kind: 'trade',
      onOk: () => { const r = Col.build(S, pid, b); if (r) { report([{ html: `${cap(Col.BUILD[b].name)} is built at ${Col.SITES[pid].name}. ${r.html}`, kind: 'discover', log: r.log }]); renderPanel(); save(); } },
    });
    return true;
  }
  return false;
}

// The provisions box is a checkbox, not a button: it has its own listener.
function init() {
  document.getElementById('panel')?.addEventListener('change', (e) => {
    if (e.target.dataset?.colonyAuto === undefined) return;
    const col = Col.colony(S, S.ship.docked);
    if (col) { col.auto = e.target.checked; save(); }
  });
}

export default { id: 'colonies', init, portBox, houseBox, click };

// Port works on screen (works.js): what you can build in the port you are in, what you have
// built, the warehouse, and all your works elsewhere. Opened from the market ("Port works").

import * as Works from './works.js';
import * as Houses from './houses.js';
import * as Accounts from './accounts.js';
import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { report } from './sim.js';
import { save } from './save.js';
import { held } from './util.js';
import * as Ships from './ships.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const portName = (id) => PORTS.find((p) => p.id === id)?.name || id;
const good = (id) => GOODS.find((g) => g.id === id);
const dateIn = (days) => (days <= 1 ? 'tomorrow' : `in about ${Math.ceil(days)} days`);

export function renderWorks(el) {
  const pid = S.ship.docked;
  if (!pid) { ui.panelMode = 'port'; return; }
  const p = PORTS.find((x) => x.id === pid);
  const sh = Houses.shares(S, pid);
  const cards = Works.buildingsAt(pid).map((id) => {
    const B = Works.BUILDINGS[id];
    const b = Works.building(S, pid, id);
    const cost = B.cost(S, pid);
    let state;
    if (b && S.day < b.ready) state = `<span class="tag">Being built: ready ${dateIn(b.ready - S.day)}</span>`;
    else if (b && b.neglected) state = `<span class="tag bad">Neglected: no money for its upkeep</span>`;
    else if (b) state = `<span class="tag ok">Yours</span>`;
    else {
      const c = Works.canBuild(S, pid, id);
      state = c.ok ? `<button class="primary" data-build="${id}">Build: ${fmt(cost)} cz</button>` : `<span class="fine">${fmt(cost)} cz. ${c.why && !c.why.startsWith('It would cost') ? c.why : ''}</span>`;
    }
    const earns = Works.earnsMonthly(S, pid, id);
    const upkeep = id === 'post' ? 'its factor draws 1 cz a day' : `${B.upkeep} cz a month to keep up${earns ? `; earns about ${earns} cz a month here` : ''}`;
    const months = Math.round(B.days / 30);
    return `<li class="work${b ? ' have' : ''}"><div><b>${B.name}</b><span class="fine">${B.days ? `${months} ${months === 1 ? 'month' : 'months'} to build · ` : ''}${upkeep}</span></div><p>${B.does}</p><div class="row">${state}</div></li>`;
  }).join('');
  const store = Works.stored(S, pid);
  let warehouse = '';
  if (store) {
    const inHold = GOODS.filter((g) => (S.cargo[g.id] || 0) > 0);
    const inStore = Object.entries(store).filter(([, v]) => v.n > 0);
    const free = Ships.flagStats(S).hold - held();
    warehouse = `<h3>Your warehouse here</h3><p class="fine">${fmt(Works.storedUnits(S, pid))} of ${Works.BUILDINGS.warehouse.store} units stored · ${free} free in your hold.</p>
      <table class="store"><thead><tr><th>Good</th><th class="num">In your hold</th><th class="num">Stored</th><th></th></tr></thead><tbody>
      ${[...new Set([...inHold.map((g) => g.id), ...inStore.map(([g]) => g)])].map((g) => `<tr><td>${good(g).name}</td><td class="num">${S.cargo[g] || 0}</td><td class="num">${store[g]?.n || 0}</td>
        <td class="acts">${(S.cargo[g] || 0) > 0 && Works.room(S, pid) > 0 ? `<button data-store="${g}">Store</button>` : ''}${store[g]?.n && free > 0 ? `<button data-take="${g}">Take</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="fine">Nothing in your hold or the warehouse.</td></tr>'}
      </tbody></table>`;
  }
  const elsewhere = Works.list(S).filter((b) => b.pid !== pid);
  const byPort = {};
  for (const b of elsewhere) (byPort[b.pid] = byPort[b.pid] || []).push(b);
  const empire = Object.keys(byPort).length ? `<h3>Your works elsewhere</h3><ul class="empire">${Object.entries(byPort).map(([q, bs]) => `<li><b>${portName(q)}</b>: ${bs.map((b) => `${Works.BUILDINGS[b.id].name.toLowerCase()}${!b.done ? ' (building)' : b.neglected ? ' (neglected)' : ''}`).join(', ')}</li>`).join('')}</ul>` : '';
  el.innerHTML = `<div class="row"><button data-tab="port">‹ Back to the market</button></div>
    <h2>Port works: ${p.name}</h2>
    <p class="blurb">Build here and the port's trade leans your way: your share now is <b>${Math.round((sh.you || 0) * 100)}%</b>. Each building does work of its own, costs its upkeep monthly, and stands idle if the upkeep goes unpaid.</p>
    <ol class="works">${cards}</ol>
    ${warehouse}
    ${empire}`;
}

export function worksClick(t) {
  const pid = S.ship.docked;
  if (!pid) return false;
  if (t.dataset.build) {
    const id = t.dataset.build, B = Works.BUILDINGS[id], c = Works.canBuild(S, pid, id);
    if (!c.ok) return true;
    confirmDialog({
      title: `Build a ${B.name.toLowerCase()} at ${portName(pid)}?`,
      body: `<p>${B.does}</p><dl class="facts"><dt>Cost</dt><dd>${fmt(c.cost)} cz now</dd>${B.days ? `<dt>Built</dt><dd>in about ${Math.round(B.days / 30)} ${Math.round(B.days / 30) === 1 ? 'month' : 'months'}</dd>` : ''}<dt>Upkeep</dt><dd>${id === 'post' ? '1 cz a day for the factor' : `${B.upkeep} cz a month`}</dd></dl>`,
      ok: `Build it for ${fmt(c.cost)} cz`,
      onOk: () => {
        const cost = Works.build(S, pid, id);
        if (cost == null) return;
        if (id !== 'post') Accounts.record(S, { kind: 'build', amount: -cost, port: pid, text: `${B.name} at ${portName(pid)}` });
        report([{ html: `${B.days ? 'Work begins on your' : 'You found your'} <b>${B.name.toLowerCase()}</b> at ${portName(pid)}.`, kind: 'discover', log: `${B.name} begun at ${portName(pid)} (${cost} cz).` }]);
        save();
      },
    });
    return true;
  }
  if (t.dataset.store) { Works.storeGoods(S, pid, t.dataset.store, S.cargo[t.dataset.store] || 0); save(); return true; }
  if (t.dataset.take) {
    const free = Ships.flagStats(S).hold - held();
    Works.takeGoods(S, pid, t.dataset.take, free);
    save();
    return true;
  }
  return false;
}

// The ship register and the shipyard: two full screens over the chart.
//   Register: your flagship, ships on order (drawn as they are built), the hulls ahead on a
//   timeline (pencil sketches until you can have them), and your hired ships.
//   Shipyard: rig, sail, arm and paint your flagship and watch her change; trade her up for a
//   bigger hull, or order one that is not yet built. Full yard in Lisbon; refits only in
//   Lagos and Funchal.
// Time stands still while either screen is open.

import { PORTS } from './world.js';
import * as Ships from './ships.js';
import * as Fleet from './fleet.js';
import * as Pirates from './pirates.js';
import * as Accounts from './accounts.js';
import { S, ui } from './state.js';
import { save } from './save.js';
import { waitInPort } from './voyage.js';
import { $, fmtDate, held } from './util.js';
import { renderPanel } from './panels.js';
import { confirmDialog } from './dialog.js';
import { hint, toast } from './notices.js';
import { log } from './pricebook.js';
import { shipSVG } from './shipart.js';
import { SCENE_MODES, sceneMode, setSceneMode } from './scene.js';

export const FULL_YARD = 'lisbon';
export const YARDS = ['lisbon', 'lagos', 'funchal'];
const portName = (id) => PORTS.find((p) => p.id === id)?.name || id;
const fmt = (n) => Math.round(n).toLocaleString();
const pct = (x) => `${Math.round(x * 100)}%`;

export function yardHere() {
  const pid = S.ship.docked;
  return YARDS.includes(pid) ? pid : null;
}

export function openShips(view = 'register', opts = {}) {
  Ships.ensureFlagship(S);
  if (view === 'yard' && !yardHere()) { hint('Shipyards: Lisbon (ships and refits), Lagos and Funchal (refits).'); view = 'register'; }
  ui.screen = { view, tab: opts.tab || 'hull', draft: { ...S.ship.fit }, name: S.ship.name, pick: opts.pick || null };
  $('yard').hidden = false;
  document.body.classList.add('screen-open');
  renderShips();
  $('yard').querySelector('.yard-close')?.focus();
}

export function closeShips() {
  if (!ui.screen) return;
  ui.screen = null;
  $('yard').hidden = true;
  $('yard').innerHTML = '';
  document.body.classList.remove('screen-open');
  renderPanel();
  save();
}

export function renderShips() {
  const el = $('yard');
  if (!ui.screen) return;
  const y = ui.screen;
  const scrollTop = el.querySelector('.yard-body')?.scrollTop || 0;
  el.innerHTML = y.view === 'yard' ? yardHtml() : registerHtml();
  const body = el.querySelector('.yard-body');
  if (body) body.scrollTop = scrollTop;
}

// ---- Figures ------------------------------------------------------------------------

function statRows(st, base) {
  const row = (label, v, b, show, better = 1) => {
    let delta = '';
    if (b != null && Math.abs(v - b) > 1e-6) {
      const up = (v - b) * better > 0;
      delta = `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}</span>`;
    }
    return `<div><dt>${label}</dt><dd>${show(v)}${delta}</dd></div>`;
  };
  return `<dl class="ship-stats">
      ${row('Hold', st.hold, base?.hold, (v) => `${v}`)}
      ${row('Speed', st.knots, base?.knots, (v) => `${v.toFixed(1)} kn`)}
      ${row('To windward', st.up, base?.up, pct)}
      ${row('Off the wind', st.down * st.offWind, base ? base.down * base.offWind : null, pct)}
      ${row('In a calm', st.oars, base?.oars, (v) => (v ? `oars, ${v} kn` : 'drifts'))}
      ${row('Fighting', st.fight, base?.fight, (v) => (v ? `+${Math.round(v * 100)} pts` : 'crew only'))}
      ${row('Spoilage', st.spoil, base?.spoil, (v) => (v < 1 ? `−${Math.round((1 - v) * 100)}%` : 'ordinary'), -1)}
      ${row('Wages', st.upkeep, base?.upkeep, (v) => `${v} cz a day`, -1)}
    </dl>`;
}

function fitSummary(hullId, fit) {
  const parts = [];
  for (const g of Ships.groupsFor(hullId)) {
    if (g.cosmetic) continue;
    const c = Ships.choice(g.id, fit[g.id]);
    if (c && c.id !== Ships.DEFAULT_FIT[g.id]) parts.push(lc(c.name));
  }
  return parts.length ? parts.join(' · ') : 'as built';
}

function header(title, sub) {
  return `<header class="yard-head">
      <div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      <button class="close yard-close" data-yard="close" aria-label="Close">×</button>
    </header>`;
}

// ---- The register ----------------------------------------------------------------------

function registerHtml() {
  const sh = S.ship;
  const st = Ships.flagStats(S);
  const h = Ships.HULLS[sh.hull];
  const yard = yardHere();
  const year = Ships.yearOf(S.day);
  const orders = (S.yard.orders || []).map((o) => {
    const p = Ships.progress(S, o);
    const art = o.kind === 'hull'
      ? shipSVG({ hull: o.hull, fit: Ships.normalFit(o.hull, {}), name: o.name }, { stage: p >= 1 ? 1 : Math.max(0.05, p), sea: p >= 1 })
      : shipSVG({ hull: sh.hull, fit: { ...sh.fit, [o.group]: o.choice }, name: sh.name }, { style: p >= 1 ? 'colour' : 'ink', sea: true });
    const what = o.kind === 'hull' ? `${Ships.HULLS[o.hull].name}${o.name ? `: <i>${o.name}</i>` : ''}` : Ships.choice(o.group, o.choice).name;
    return `<li class="order-card">
        <div class="art">${art}</div>
        <div><h4>${what}</h4>
          <p>${o.kind === 'hull' ? `${cap(Ships.stageText(p))}.` : p >= 1 ? 'Ready to fit.' : 'Being made ready.'} ${p >= 1 ? 'Waiting for you at the Lisbon yard.' : `Ready ${fmtDate(o.due)}.`}</p>
          <p class="muted">Paid ${fmt(o.paid)} cz of ${fmt(o.price)}; ${fmt(o.price - o.paid)} cz due on delivery.${o.kind === 'fit' && !Ships.groupsFor(sh.hull).includes(Ships.group(o.group)) ? ` It does not fit a ${Ships.HULLS[sh.hull].name.toLowerCase()}: the yard will refund your ${fmt(o.paid)} cz when you call.` : ''}</p>
          <div class="bar"><span style="width:${Math.round(p * 100)}%"></span></div>
        </div></li>`;
  }).join('');
  const hulls = Ships.HULL_ORDER.map((id) => {
    const H = Ships.HULLS[id];
    const av = Ships.availability(S, H);
    const mine = id === sh.hull;
    const style = mine ? 'colour' : av.ok === 'no' ? 'pencil' : 'ink';
    const cst = Ships.stats({ hull: id });
    const tag = mine ? '<span class="tag own">Your ship</span>' : av.ok === 'yes' ? '<span class="tag">Available</span>' : av.ok === 'order' ? '<span class="tag order">On order book</span>' : '<span class="tag locked">Not yet</span>';
    return `<li class="hull-card ${style}" data-hull="${id}">
        <div class="year">${H.orderYear && year < H.year ? `${H.orderYear}–${H.year}` : H.year}</div>
        <div class="art">${shipSVG(mine ? sh : { hull: id }, { style, crop: 'fixed', sea: style !== 'pencil' })}</div>
        <h4>${H.name} ${tag}</h4>
        <p class="nums">${cst.hold} hold · ${cst.knots} kn · windward ${pct(cst.up)} · ${fmt(H.price)} cz</p>
        <p>${H.blurb}</p>
        ${av.ok !== 'yes' && !mine ? `<p class="need">${cap(av.why)}.</p>` : ''}
      </li>`;
  }).join('');
  const fleet = (S.fleet?.ships || []).map((x) => `<li class="hired">
      <div class="art">${shipSVG({ hull: x.hull || 'caravel', name: x.name }, { crop: 'tight', style: 'ink' })}</div>
      <div><b>${x.name}</b><br><span class="muted">${Ships.HULLS[x.hull || 'caravel'].name} · Captain ${x.captain.name} · hold ${Fleet.holdSize(x)}</span></div></li>`).join('');
  return `<div class="yard-card register">
    ${header('Ship register', `${fmtDate(S.day)} · ${yard ? `in ${portName(yard)}, with a shipyard` : S.ship.docked ? `in ${portName(S.ship.docked)}` : 'at sea'}`)}
    <div class="yard-body">
      <section class="hero">
        <div class="art big">${shipSVG(sh, { sea: true, crop: 'tight' })}</div>
        <div class="hero-text">
          <p class="kicker">Your flagship</p>
          <h3>${esc(sh.name)}</h3>
          <p class="muted">${h.name}${sh.hull === 'caravel' ? (sh.fit.rig === 'square' ? ', square-rigged' : ', lateen-rigged') : ''} · ${fitSummary(sh.hull, sh.fit)}${S.hull < 100 ? ` · hull ${S.hull}%` : ''}</p>
          ${statRows(st)}
          <div class="row start">
            ${yard ? '<button class="primary" data-yard="open-yard">Go to the shipyard</button>' : '<p class="fine">Shipyards: Lisbon builds ships and refits them; Lagos and Funchal refit.</p>'}
          </div>
        </div>
      </section>
      ${orders ? `<h3 class="sec">On the stocks</h3><ul class="orders">${orders}</ul>` : ''}
      <h3 class="sec">Ships of the age</h3>
      <p class="fine">Hulls come within reach as your standing grows and the years pass. Pencil sketches are ships you cannot have yet.</p>
      <ol class="hulls">${hulls}</ol>
      ${fleet ? `<h3 class="sec">Your captains' ships</h3><ul class="fleet-list">${fleet}</ul>` : ''}
      <p class="setting"><label>Arrival scenes <select data-scene-mode>${SCENE_MODES.map(([v, l]) => `<option value="${v}" ${sceneMode() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label> <span class="fine">Your ship sailing into each port. Tap to skip one.</span></p>
    </div>
  </div>`;
}

// ---- The shipyard ----------------------------------------------------------------------

function yardHtml() {
  const y = ui.screen;
  const sh = S.ship;
  const pid = yardHere();
  const full = pid === FULL_YARD;
  const draft = Ships.normalFit(sh.hull, y.draft);
  y.draft = draft;
  const now = Ships.flagStats(S);
  const after = Ships.stats({ hull: sh.hull, fit: draft });
  const q = Ships.quoteFit(S, draft);
  const ready = Ships.ready(S);
  const tabs = [...Ships.TABS, ...(full ? [['new', 'New ship']] : [])];
  const tabBar = `<nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" data-yard-tab="${id}" class="${y.tab === id ? 'on' : ''}" aria-selected="${y.tab === id}">${label}</button>`).join('')}</nav>`;
  let content;
  if (y.tab === 'new') content = newShipHtml();
  else {
    content = Ships.groupsFor(sh.hull).filter((g) => g.tab === y.tab).map((g) => {
      const lock = g.id === 'rig' && !full;
      const opts = Ships.choicesFor(g, sh.hull).map((c) => {
        const av = Ships.availability(S, c);
        const price = Ships.priceFor(sh.hull, c);
        const current = sh.fit[g.id] === c.id;
        const chosen = draft[g.id] === c.id;
        const ordered = Ships.hasOrder(S, 'fit', c.id);
        const disabled = (av.ok === 'no' && !current) || (lock && !current) || (ordered && !current);
        const note = current ? 'fitted now' : ordered ? 'on order' : av.ok === 'no' ? av.why : lock ? 'only at the Lisbon yard' : av.ok === 'order' ? `order now, a third down; ${av.why.replace('can be ordered now for ', '')}` : price ? `${fmt(price)} cz · ${c.days} days` : (c.days ? `free · ${c.days} ${c.days === 1 ? 'day' : 'days'}` : 'free');
        return `<button class="opt ${chosen ? 'on' : ''} ${current ? 'current' : ''}" data-opt="${g.id}:${c.id}" ${disabled ? 'disabled' : ''} aria-pressed="${chosen}">
            <b>${c.name}</b>${c.note ? `<span class="note">${c.note}</span>` : ''}<span class="price">${note}</span></button>`;
      }).join('');
      return `<fieldset class="opt-group"><legend>${g.name}</legend><div class="opts">${opts}</div></fieldset>`;
    }).join('') || '<p class="muted">Nothing to change here on this hull.</p>';
  }
  const bill = q.error ? `<p class="warn">${q.error}</p>` : q.lines.length ? `
      <ul class="bill">${q.lines.map((l) => `<li><span>${l.g.name}: ${l.c.name}${l.order ? ' (ordered)' : ''}</span><span>${l.order ? `${fmt(Math.round(l.price / 3))} cz now` : l.price ? `${fmt(l.price)} cz` : 'free'}</span></li>`).join('')}</ul>
      <p class="total"><span>${q.days ? `${q.days} ${q.days === 1 ? 'day' : 'days'} in the yard` : q.ordered.length ? 'Ordered for later' : ''}</span><b>${fmt(q.cost + q.down)} cz</b></p>` : '<p class="muted">Choose what to change. Your ship is redrawn as you go.</p>';
  const canPay = !q.error && q.lines.length && S.purse >= q.cost + q.down;
  const renamed = (y.name || '').trim() && y.name.trim() !== sh.name;
  return `<div class="yard-card shipyard">
    ${header(full ? 'The Lisbon shipyard' : `The shipwrights of ${portName(pid)}`, full ? 'Refits, new ships and orders for ships not yet built' : 'Refits. New ships and re-rigging only in Lisbon.')}
    ${ready.length && full ? `<div class="banner ready">${ready.map((o) => `<span>${o.kind === 'hull' ? `Your new ${Ships.HULLS[o.hull].name.toLowerCase()}${o.name ? ` <i>${esc(o.name)}</i>` : ''}` : Ships.choice(o.group, o.choice).name} is ready. ${fmt(o.price - o.paid)} cz due.</span><button class="primary" data-deliver-order="${S.yard.orders.indexOf(o)}">Take delivery</button>`).join('')}</div>` : ''}
    <div class="yard-body split">
      <section class="stage">
        <div class="art big">${shipSVG({ hull: sh.hull, fit: y.tab === 'new' ? sh.fit : draft, name: (y.name || sh.name).trim() || sh.name }, { sea: true, crop: 'tight' })}</div>
        <label class="name">Her name <input data-yard-name maxlength="28" value="${esc(y.name ?? sh.name)}" autocomplete="off"></label>
        ${renamed ? '<button class="mini" data-yard="rename">Paint the new name on (free)</button>' : ''}
        ${y.tab === 'new' ? statRows(now) : statRows(after, now)}
      </section>
      <section class="choices">
        ${tabBar}
        ${content}
      </section>
    </div>
    ${y.tab === 'new' ? '' : `<footer class="yard-foot">
      <div class="bill-wrap">${bill}</div>
      <div class="row"><button data-yard="reset" ${q.lines.length ? '' : 'disabled'}>Start again</button><button class="primary" data-yard="commission" ${canPay ? '' : 'disabled'}>${q.ordered.length && !q.days ? 'Place the order' : 'Commission the work'}</button></div>
      ${!q.error && q.lines.length && !canPay ? `<p class="warn fine">You need ${fmt(q.cost + q.down)} cz in your purse.</p>` : ''}
    </footer>`}
  </div>`;
}

function newShipHtml() {
  const sh = S.ship;
  const repair = Pirates.repairCost(S);
  const value = Ships.tradeInValue(S, repair);
  return `<p class="blurb">Trade up your flagship: the yard takes the <i>${esc(sh.name)}</i> in part exchange for ${fmt(value)} cz (half her hull price${repair ? ', less her repairs' : ''}). Her fittings stay with her; her name and colours go with you. Ships for your captains are bought in the Fleet tab.</p>
    <ol class="hulls compact">${Ships.HULL_ORDER.map((id) => {
      const H = Ships.HULLS[id];
      const av = Ships.availability(S, H);
      const st = Ships.stats({ hull: id });
      const mine = id === sh.hull;
      const net = H.price - value;
      const onOrder = Ships.hasOrder(S, 'hull', id);
      const fits = held() <= st.hold;
      let act;
      if (mine) act = '<span class="tag own">Your ship</span>';
      else if (onOrder) act = '<span class="tag order">On order</span>';
      else if (av.ok === 'yes') act = `<button class="primary" data-trade-up="${id}" ${S.purse < net || !fits ? 'disabled' : ''}>${H.price > Ships.HULLS[sh.hull].price ? 'Trade up' : 'Exchange'}: ${net >= 0 ? `${fmt(net)} cz` : `you receive ${fmt(-net)} cz`}</button>${!fits ? `<span class="warn fine">Lighten your hold to ${st.hold} first.</span>` : ''}`;
      else if (av.ok === 'order') act = `<button class="primary" data-order-hull="${id}" ${S.purse < Math.round(H.price / 3) ? 'disabled' : ''}>Order: ${fmt(Math.round(H.price / 3))} cz down</button><span class="fine">Delivered in ${H.year}; ${fmt(H.price - Math.round(H.price / 3))} cz then.</span>`;
      else act = `<span class="need">${cap(av.why)}.</span>`;
      return `<li class="hull-card wide ${av.ok === 'no' && !mine ? 'pencil' : mine ? 'colour' : 'ink'}">
          <div class="art">${shipSVG(mine ? sh : { hull: id, fit: { paint: sh.fit.paint, mark: sh.fit.mark, flags: sh.fit.flags } }, { style: av.ok === 'no' && !mine ? 'pencil' : 'colour', crop: 'fixed', sea: av.ok !== 'no' || mine })}</div>
          <div class="info">
            <h4>${H.name} <small class="muted">${fmt(H.price)} cz</small></h4>
            <p>${H.blurb}</p>
            ${statRows(st, mine ? null : Ships.flagStats(S))}
            <div class="row start">${act}</div>
          </div>
        </li>`;
    }).join('')}</ol>`;
}

// ---- Actions ---------------------------------------------------------------------------

export function initShipyard() {
  const el = $('yard');
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !ui.screen) return;
    const y = ui.screen;
    const act = t.dataset.yard;
    if (act === 'close') { closeShips(); return; }
    if (act === 'open-yard') { openShips('yard'); return; }
    if (t.dataset.yardTab) { y.tab = t.dataset.yardTab; renderShips(); return; }
    if (t.dataset.opt) {
      const [g, c] = t.dataset.opt.split(':');
      y.draft[g] = c;
      renderShips();
      return;
    }
    if (act === 'reset') { y.draft = { ...S.ship.fit }; renderShips(); return; }
    if (act === 'rename') {
      const name = cleanName(y.name);
      if (!name) return;
      const old = S.ship.name;
      S.ship.name = name;
      toast(`The <i>${esc(old)}</i> is now the <b>${esc(name)}</b>.`, 'port');
      log(`Renamed the ${old} the ${name}.`);
      save();
      renderShips();
      return;
    }
    if (act === 'commission') { commission(); return; }
    if (t.dataset.tradeUp) { tradeUp(t.dataset.tradeUp); return; }
    if (t.dataset.orderHull) { orderHull(t.dataset.orderHull); return; }
    if (t.dataset.deliverOrder != null) { deliver(+t.dataset.deliverOrder); }
  });
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-yard-name]') && ui.screen) {
      ui.screen.name = e.target.value;
      // redraw the name board without losing the cursor
      const btn = el.querySelector('[data-yard="rename"]');
      const changed = cleanName(e.target.value) && cleanName(e.target.value) !== S.ship.name;
      if (!!btn !== !!changed) { const pos = e.target.selectionStart; renderShips(); const inp = el.querySelector('[data-yard-name]'); inp.focus(); inp.setSelectionRange(pos, pos); }
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-scene-mode]')) { setSceneMode(e.target.value); save(); }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.modal) { e.stopPropagation(); closeShips(); }
  });
}

function cleanName(s) {
  return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);
}

function commission() {
  const y = ui.screen;
  const q = Ships.quoteFit(S, y.draft);
  if (q.error || !q.lines.length) return;
  const total = q.cost + q.down;
  if (S.purse < total) { hint(`You need ${fmt(total)} cz.`); return; }
  const sh = S.ship;
  confirmDialog({
    title: q.days ? `Put the ${sh.name} in the yard?` : 'Place the order?',
    body: `<ul class="help">${q.lines.map((l) => `<li><b>${l.g.name}:</b> ${l.c.name}${l.order ? `, ordered: ${fmt(Math.round(l.price / 3))} cz now, ${fmt(l.price - Math.round(l.price / 3))} cz on delivery in ${Ships.choice(l.g.id, l.c.id).year}` : ''}</li>`).join('')}</ul>
      <dl class="facts"><dt>Cost now</dt><dd>${fmt(total)} cz</dd>${q.days ? `<dt>In the yard</dt><dd>${q.days} ${q.days === 1 ? 'day' : 'days'} (your captains sail on)</dd>` : ''}<dt>Purse after</dt><dd>${fmt(S.purse - total)} cz</dd></dl>`,
    ok: q.days ? `Commission for ${fmt(total)} cz` : `Order for ${fmt(total)} cz`,
    kind: 'yard',
    onOk: () => {
      S.purse -= total;
      if (total) Accounts.record(S, { kind: 'ships', amount: -total, text: `Shipyard: ${q.lines.map((l) => lc(l.c.name)).join(', ')}` });
      Ships.applyFit(S, y.draft, q);
      y.draft = { ...S.ship.fit };
      if (q.days) waitInPort(q.days);
      const done = q.lines.filter((l) => !l.order);
      if (done.length) toast(`The <b>${esc(sh.name)}</b> comes out of the yard: ${done.map((l) => lc(l.c.name)).join(', ')}.`, 'discover');
      if (q.ordered.length) toast(`Ordered: ${q.ordered.map((o) => lc(Ships.choice(o.group, o.choice).name)).join(', ')}. The yard will send word when it is ready.`, 'port');
      log(`Shipyard work on the ${sh.name}: ${q.lines.map((l) => lc(l.c.name)).join(', ')} (${total} cz).`);
      save();
      renderShips();
    },
  });
}

function tradeUp(hullId) {
  const sh = S.ship;
  const H = Ships.HULLS[hullId];
  const repair = Pirates.repairCost(S);
  const value = Ships.tradeInValue(S, repair);
  const net = H.price - value;
  const st = Ships.stats({ hull: hullId });
  if (held() > st.hold) { hint(`Your cargo will not fit in a ${H.name.toLowerCase()}'s hold of ${st.hold}.`); return; }
  if (S.purse < net) { hint(`You need ${fmt(net)} cz.`); return; }
  const name = cleanName(ui.screen.name) || sh.name;
  confirmDialog({
    title: `A ${H.name.toLowerCase()} for the ${name}?`,
    body: `<dl class="facts"><dt>${H.name}</dt><dd>${fmt(H.price)} cz</dd><dt>The ${esc(sh.name)} in part exchange</dt><dd>−${fmt(value)} cz</dd><dt>To pay</dt><dd>${net >= 0 ? fmt(net) : `you receive ${fmt(-net)}`} cz</dd><dt>Hold</dt><dd>${Ships.flagStats(S).hold} → ${st.hold}</dd><dt>Wages</dt><dd>${Ships.flagStats(S).upkeep} → ${st.upkeep} cz a day at sea</dd></dl>
      <p>Your cargo is carried across. Her fittings stay with the old ship; her name and colours go with you. ${H.year > 1451 ? '' : 'The yard has one ready.'}</p>`,
    ok: net >= 0 ? `Pay ${fmt(net)} cz` : 'Make the exchange',
    kind: 'yard',
    onOk: () => {
      S.purse -= net;
      Accounts.record(S, { kind: 'ships', amount: -net, text: `Traded the ${sh.hull} ${sh.name} for a ${H.name.toLowerCase()}` });
      Ships.tradeUp(S, hullId, name);
      ui.screen.draft = { ...S.ship.fit };
      ui.screen.tab = 'hull';
      toast(`The <b>${esc(name)}</b>, a ${H.name.toLowerCase()}, is yours. Fit her out as you please.`, 'discover');
      log(`New flagship: the ${H.name.toLowerCase()} ${name}.`);
      save();
      renderShips();
    },
  });
}

function orderHull(hullId) {
  const H = Ships.HULLS[hullId];
  const down = Math.round(H.price / 3);
  if (S.purse < down) { hint(`You need ${fmt(down)} cz.`); return; }
  const name = cleanName(ui.screen.name);
  const keep = name && name !== S.ship.name ? name : null;
  confirmDialog({
    title: `Order a ${H.name.toLowerCase()}?`,
    body: `<p>The Lisbon yard will lay her keel now. You can watch her take shape in the ship register.</p>
      <dl class="facts"><dt>Paid now</dt><dd>${fmt(down)} cz</dd><dt>Due on delivery</dt><dd>${fmt(H.price - down)} cz, less your flagship in part exchange</dd><dt>Ready</dt><dd>${fmtDate(Ships.dayOfYear(H.year))}</dd>${keep ? `<dt>Her name</dt><dd>${esc(keep)}</dd>` : ''}</dl>
      <p class="fine">The building goes on while you are away from the game, too.</p>`,
    ok: `Order for ${fmt(down)} cz`,
    kind: 'yard',
    onOk: () => {
      const paid = Ships.orderHull(S, hullId, keep);
      S.purse -= paid;
      Accounts.record(S, { kind: 'ships', amount: -paid, text: `Ordered a ${H.name.toLowerCase()} at the Lisbon yard (a third down)` });
      toast(`The keel of your ${H.name.toLowerCase()} is laid in Lisbon. She will be ready in ${H.year}.`, 'discover');
      log(`Ordered a ${H.name.toLowerCase()}, delivery ${H.year}.`);
      save();
      renderShips();
    },
  });
}

function deliver(i) {
  const o = S.yard.orders[i];
  if (!o || S.day < o.due || S.ship.docked !== FULL_YARD) return;
  const sh = S.ship;
  const due = o.price - o.paid;
  if (o.kind === 'fit') {
    const g = Ships.group(o.group);
    if (!Ships.groupsFor(sh.hull).includes(g)) {
      // the ship it was ordered for is gone: the yard returns the money
      S.yard.orders.splice(i, 1);
      S.purse += o.paid;
      Accounts.record(S, { kind: 'ships', amount: o.paid, text: `Refund: ${lc(Ships.choice(o.group, o.choice).name)} no longer fits your ship` });
      toast(`The ${lc(Ships.choice(o.group, o.choice).name)} does not fit the ${sh.name}. The yard returns your ${fmt(o.paid)} cz.`, 'port');
      save(); renderShips(); return;
    }
    if (S.purse < due) { hint(`You need ${fmt(due)} cz.`); return; }
    const c = Ships.choice(o.group, o.choice);
    confirmDialog({
      title: `Fit the ${lc(c.name)}?`,
      body: `<dl class="facts"><dt>Balance due</dt><dd>${fmt(due)} cz</dd><dt>In the yard</dt><dd>${c.days} days</dd></dl>`,
      ok: `Pay ${fmt(due)} cz`,
      kind: 'yard',
      onOk: () => {
        S.yard.orders.splice(i, 1);
        S.purse -= due;
        Accounts.record(S, { kind: 'ships', amount: -due, text: `Shipyard: ${lc(c.name)} (balance)` });
        sh.fit[o.group] = o.choice;
        ui.screen.draft = { ...sh.fit };
        waitInPort(c.days);
        toast(`The <b>${esc(sh.name)}</b> comes out of the yard with her ${lc(c.name)}.`, 'discover');
        save(); renderShips();
      },
    });
    return;
  }
  const H = Ships.HULLS[o.hull];
  const st = Ships.stats({ hull: o.hull });
  const value = Ships.tradeInValue(S, Pirates.repairCost(S));
  const net = due - value;
  if (held() > st.hold) { hint(`Your cargo will not fit in her hold of ${st.hold}.`); return; }
  if (S.purse < net) { hint(`You need ${fmt(net)} cz.`); return; }
  const name = o.name || sh.name;
  confirmDialog({
    title: `Take delivery of the ${name}?`,
    body: `<div class="art">${shipSVG({ hull: o.hull, fit: Ships.normalFit(o.hull, sh.fit), name }, { sea: true, crop: 'tight' })}</div>
      <dl class="facts"><dt>Balance due</dt><dd>${fmt(due)} cz</dd><dt>The ${esc(sh.name)} in part exchange</dt><dd>−${fmt(value)} cz</dd><dt>To pay</dt><dd>${net >= 0 ? fmt(net) : `you receive ${fmt(-net)}`} cz</dd></dl>`,
    ok: net >= 0 ? `Pay ${fmt(net)} cz` : 'Take her',
    kind: 'yard',
    onOk: () => {
      S.yard.orders.splice(i, 1);
      S.purse -= net;
      Accounts.record(S, { kind: 'ships', amount: -net, text: `Delivery of the ${H.name.toLowerCase()} ${name}, less the ${sh.name} in part exchange` });
      Ships.tradeUp(S, o.hull, name);
      ui.screen.draft = { ...S.ship.fit };
      ui.screen.name = S.ship.name;
      toast(`The <b>${esc(name)}</b> slides down the ways into the Tagus. Your ${H.name.toLowerCase()} is ready for sea.`, 'discover');
      log(`Took delivery of the ${H.name.toLowerCase()} ${name}.`);
      save(); renderShips();
    },
  });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

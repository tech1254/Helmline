// The HUD and the side panels: market, contracts, sail, fleet, help, tips and tabs.

import { PORTS, pointOfSail, compassPoint, distNm, findPath } from './world.js';
import { GOODS, Market } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Pirates from './pirates.js';
import { CHART_REWARD, OFFLINE_MAX_DAYS, SHIP, STANDING_FADES_AFTER_HOURS } from './config.js';
import { S, market, ui } from './state.js';
import { load, save } from './save.js';
import { renderCloud } from './cloudsync.js';
import { W } from './view.js';
import { report, shipWind, spoil, syncMarket } from './sim.js';
import { estimateVoyage, observe, planCourse } from './voyage.js';
import { drag } from './input.js';
import { $, cz, fmtDate, held } from './util.js';
import { renderLedger } from './ledgerview.js';
import { renderPrices } from './pricebook.js';
import { placeToasts, renderNoticeBadge, renderNotices } from './notices.js';
import { renderFeedback } from './feedback.js';
import { isBook, renderDock, renderMenu } from './dock.js';

// ---- HUD & panels -----------------------------------------------------------

export function setSpeed(v) {
  if (v) ui.lastSpeed = v;
  ui.speed = v;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === v));
  renderDock();
}

export function toggleWind() {
  ui.showWind = !ui.showWind;
  $('btn-wind').classList.toggle('on', ui.showWind);
}

export function togglePanel(mode) {
  ui.panelMode = ui.panelMode === mode ? (S.ship.docked ? 'port' : null) : mode;
  renderPanel();
}

export function renderHud() {
  $('hud-date').textContent = fmtDate(S.day);
  const purse = Math.floor(S.purse);
  $('hud-purse').textContent = `${purse.toLocaleString()} cz`;
  $('hud-purse').classList.toggle('debt', purse < 0);
  $('hud-hold').textContent = `${held()} / ${SHIP.hold}`;
  const sh = S.ship;
  let status;
  if (sh.docked) {
    status = `At anchor in ${PORTS.find((p) => p.id === sh.docked).name}. Click the chart to set sail.`;
  } else {
    const { w, off, knots } = shipWind();
    const windTxt = `Wind from the ${compassPoint(w.from)}`;
    if (sh.route.length) {
      let nm = 0, lon = sh.lon, lat = sh.lat;
      for (const [x, y] of sh.route) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
      const dest = sh.dest?.port ? PORTS.find((p) => p.id === sh.dest.port).name : 'the mark';
      status = `${windTxt} · heading ${compassPoint(sh.heading)} · ${pointOfSail(off)} · ${knots.toFixed(1)} kn${S.hull < 100 ? ` · hull ${S.hull}%` : ''} · ${Math.round(nm)} nm to ${dest}`;
    } else {
      status = `${windTxt} · hove to · click the chart to set a course`;
    }
  }
  $('status').textContent = status;
  renderTip();
  const fleetBtn = !fleetUnlocked(), contractsBtn = !S.contracts?.unlocked;
  if ($('btn-fleet').hidden !== fleetBtn) $('btn-fleet').hidden = fleetBtn;
  if ($('btn-contracts').hidden !== contractsBtn) $('btn-contracts').hidden = contractsBtn;
  const n = S.contracts ? S.contracts.active.length : 0;
  const badge = $('contracts-count');
  if (badge.textContent !== String(n)) badge.textContent = n;
  badge.hidden = !n;
}

export function priceCell(v) {
  return v == null ? '<span class="muted">—</span>' : `${v}`;
}

export function renderPanel() {
  const el = $('panel');
  syncMarket();
  const fleetOpen = fleetUnlocked();
  $('btn-fleet').hidden = !fleetOpen;
  $('btn-fleet').classList.toggle('on', ui.panelMode === 'fleet');
  $('btn-help').classList.toggle('on', ui.panelMode === 'help');
  $('btn-cloud').classList.toggle('on', ui.panelMode === 'cloud');
  $('btn-notices').classList.toggle('on', ui.panelMode === 'notices');
  renderNoticeBadge();
  if (ui.panelMode === 'fleet' && !fleetOpen) ui.panelMode = S.ship.docked ? 'port' : null;
  $('btn-prices').classList.toggle('on', ui.panelMode === 'prices');
  $('btn-ledger').classList.toggle('on', ui.panelMode === 'ledger');
  $('btn-port').classList.toggle('on', ui.panelMode === 'port');
  $('btn-sail').classList.toggle('on', ui.panelMode === 'sail');
  $('btn-contracts').classList.toggle('on', ui.panelMode === 'contracts');
  $('btn-contracts').hidden = !S.contracts?.unlocked;
  if (ui.panelMode === 'contracts' && !S.contracts?.unlocked) ui.panelMode = S.ship.docked ? 'port' : null;
  if (!ui.panelMode) { el.hidden = true; placeToasts(); renderDock(); return; }
  el.hidden = false;
  el.classList.toggle('wide', ui.panelMode === 'prices' || ui.panelMode === 'ledger');
  if (ui.panelMode === 'port') renderPort(el);
  else if (ui.panelMode === 'sail') renderSail(el);
  else if (ui.panelMode === 'contracts') renderContracts(el);
  else if (ui.panelMode === 'fleet') renderFleet(el);
  else if (ui.panelMode === 'help') renderHelp(el);
  else if (ui.panelMode === 'cloud') renderCloud(el);
  else if (ui.panelMode === 'feedback') renderFeedback(el);
  else if (ui.panelMode === 'menu') renderMenu(el);
  else if (ui.panelMode === 'ledger') renderLedger(el);
  else if (ui.panelMode === 'notices') renderNotices(el);
  else renderPrices(el);
  if (isBook(ui.panelMode)) ui.lastBook = ui.panelMode;
  placeToasts();
  renderDock();
}

export function renderPort(el) {
  const pid = S.ship.docked;
  if (!pid) { ui.panelMode = null; el.hidden = true; return; }
  const p = PORTS.find((x) => x.id === pid);
  observe(pid);
  const free = SHIP.hold - held();
  const shut = Events.closure(S, pid);
  const rows = GOODS.map((g) => {
    const sells = market.sells(pid, g.id) && !shut;
    const buy = sells ? market.buyPrice(pid, g.id) : null;
    const sell = market.sellPrice(pid, g.id);
    const have = S.cargo[g.id];
    const avg = have ? Math.round(S.paid[g.id] / have) : null;
    const best = bestKnownSale(g.id, pid);
    return `<tr>
      <th scope="row">${g.name}<small>${[best ? `best seen: ${best.price} at ${best.name}` : '', g.spoil ? 'perishable' : ''].filter(Boolean).join(' · ')}</small></th>
      <td class="num">${priceCell(buy)}</td>
      <td class="num">${sell}</td>
      <td class="num">${have || '<span class="muted">0</span>'}${avg ? `<small>paid ~${avg}</small>` : ''}</td>
      <td class="acts">
        ${sells ? `<button data-buy="${g.id}" data-n="1" ${buy > S.purse || !free ? 'disabled' : ''}>+1</button><button data-buy="${g.id}" data-n="10" ${buy > S.purse || !free ? 'disabled' : ''}>+10</button><button data-buy="${g.id}" data-n="max" ${buy > S.purse || !free ? 'disabled' : ''}>Max</button>` : ''}
        ${have && !shut ? `<button data-sell="${g.id}" data-n="1">−1</button><button data-sell="${g.id}" data-n="all">All</button>` : ''}
      </td></tr>`;
  }).join('');
  el.innerHTML = `
    ${tabs('port')}
    <header><h2>${p.name}</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">${p.blurb}</p>
    ${S.hull < 100 ? `<p class="banner ${S.hull < 50 ? 'warn' : ''}"><b>Hull ${S.hull}%</b> · ${S.hull < 50 ? 'badly damaged, ' : ''}sailing at ${Math.round(Pirates.hullFactor(S) * 100)}% speed.
      ${Pirates.REPAIR_PORTS.includes(pid) ? `<button data-repair ${S.purse < Pirates.repairCost(S) ? 'disabled' : ''}>Repair for ${Pirates.repairCost(S)} cz</button>` : 'The shipwrights of Lisbon, Lagos and Funchal can repair her.'}</p>` : ''}
    ${shut ? `<p class="banner warn"><b>Closed to trade:</b> ${Events.template(shut).title.toLowerCase()}. Expected to reopen around ${fmtDate(shut.end)}.</p>` : ''}
    <table class="market">
      <thead><tr><th>Good</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Hold</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">Hold ${held()} / ${SHIP.hold} · purse ${Math.floor(S.purse).toLocaleString()} cz · upkeep ${SHIP.upkeep} cz a day at sea.<br>
    Buying pushes the price up; selling pushes it down. Prices recover over a few weeks. <i>Max</i> keeps two weeks of wages in the purse.</p>
    <div class="row"><button data-wait title="Let a week pass: prices recover, news arrives, your fleet sails on. Your crew draws no wages in port; hired captains are still paid.">Wait a week</button><button class="primary" data-tab="sail">Set sail…</button></div>`;
}

export function contractCard(c, actions) {
  const g = c.good ? GOODS.find((x) => x.id === c.good) : null;
  const lines = [];
  if (c.kind === 'discover') {
    lines.push(c.text);
    lines.push(c.stage === 'find' ? '<b>Next:</b> find and anchor at an uncharted port.' : `<b>Next:</b> report to Lisbon. You opened trade with ${PORTS.find((p) => p.id === c.found).name}.`);
  } else {
    const src = PORTS.find((p) => p.id === c.source);
    lines.push(`${g.name} can be bought at ${src.name}.`);
    if (c.deadline != null) {
      const left = Math.ceil(c.deadline - S.day);
      lines.push(`<b>Due</b> ${fmtDate(c.deadline)} <span class="${left < 10 ? 'warn' : 'muted'}">(${left} days left)</span> · in your hold: ${S.cargo[c.good]} / ${c.qty}`);
    } else {
      lines.push(`<b>Time allowed:</b> ${c.offeredDays} days`);
    }
  }
  return `<li class="contract">
      <div class="c-head"><span class="c-title">${c.title}</span><span class="c-pay">${c.reward.toLocaleString()} cz</span></div>
      <div class="c-patron">${c.patron}</div>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      ${actions ? `<div class="row">${actions}</div>` : ''}
    </li>`;
}

export function perkList(t) {
  const out = [];
  if (t.payMult > 1) out.push(`contracts pay ${Math.round((t.payMult - 1) * 100)}% more`);
  if (t.payMult < 1) out.push(`contracts pay ${Math.round((1 - t.payMult) * 100)}% less`);
  if (t.priceEdge) out.push(`${Math.round(t.priceEdge * 100)}% better prices in Portuguese ports`);
  out.push(`${t.offers} ${t.offers === 1 ? 'offer' : 'offers'} per port`, `up to ${t.maxActive} contracts`);
  if (t.maxShips) out.push(`you may command ${t.maxShips} hired ${t.maxShips === 1 ? 'ship' : 'ships'}`);
  return out.join(', ');
}

export function standingBox(C) {
  const t = Contracts.perks(S), next = Contracts.nextTier(S);
  return `<div class="standing">
      <p><b>${t.title}</b> · standing ${C.standing} · ${C.done} completed${C.failed ? `, ${C.failed} failed` : ''}</p>
      <p class="muted">Now: ${perkList(t)}.</p>
      ${next ? `<p class="muted">At ${next.min} standing you become <i>${next.title}</i>: ${perkList(next)}.</p>` : ''}
    </div>`;
}

export function renderContracts(el) {
  const C = Contracts.ensureContracts(S);
  const pid = S.ship.docked;
  const active = C.active.map((c) => contractCard(c, [
    Contracts.canDeliver(S, c) && !market.closed(pid) ? `<button class="primary" data-deliver="${c.id}">Deliver</button>` : '',
    c.kind === 'deliver' ? `<button data-abandon="${c.id}">Abandon</button>` : '',
  ].join(''))).join('');
  let offers = '';
  if (pid) {
    const full = C.active.length >= Contracts.maxActive(S);
    const list = Contracts.offersAt(S, market, pid);
    offers = list.length
      ? list.map((o) => contractCard(o, `<button class="primary" data-accept="${o.id}" ${full ? 'disabled' : ''}>Accept</button>`)).join('')
      : `<li class="muted">No work posted here right now.${Contracts.nextOfferDay(S, pid) ? ` New offers around ${fmtDate(Contracts.nextOfferDay(S, pid))}.` : ''} Charting more ports opens more trades.</li>`;
  }
  el.innerHTML = `
    ${tabs('contracts')}
    <header><h2>Contracts</h2><button class="close" data-close aria-label="Close">×</button></header>
    ${standingBox(C)}
    <h3>Your contracts</h3>
    <ul class="contracts">${active || '<li class="muted">None at the moment.</li>'}</ul>
    ${pid ? `<h3>Offered at ${PORTS.find((p) => p.id === pid).name}</h3><ul class="contracts">${offers}</ul>
      <p class="foot">You can hold ${Contracts.maxActive(S)} contracts at once. Offers change every month. Missing a deadline costs standing.</p>`
      : '<p class="foot">Visit a port to see the work on offer there.</p>'}`;
}

// A list of charted ports to sail to: easier than tapping a small marker on a phone.
export function renderSail(el) {
  const rows = PORTS.filter((p) => S.discovered[p.id] && p.id !== S.ship.docked).map((p) => {
    const plan = planCourse(p.lon, p.lat, p.id, false);
    if (!plan) return null;
    const est = estimateVoyage(plan.route);
    return { p, est };
  }).filter(Boolean).sort((a, b) => a.est.days - b.est.days);
  const list = rows.map(({ p, est }) => `
      <li><button class="dest" data-sailto="${p.id}">
        <span class="name">${p.name}</span>
        <span class="meta">about ${Math.max(1, Math.round(est.days))} ${Math.round(est.days) <= 1 ? 'day' : 'days'} · ${Math.round(est.nm).toLocaleString()} nm · ${est.cost} cz wages</span>
      </button></li>`).join('');
  el.innerHTML = `
    ${tabs('sail')}
    <header><h2>Set a course</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">Pick a charted port, or tap anywhere on the open sea to sail there. Uncharted waters only appear once you sail into them.</p>
    <ul class="dests">${list || '<li class="muted">No other ports charted yet.</li>'}</ul>
    <p class="foot">Times are estimated from today's winds.</p>`;
}

export function fleetUnlocked() {
  return !!(S.fleet?.ships.length || (S.contracts?.unlocked && Contracts.perks(S).shipyard));
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function portOptions(selected) {
  return PORTS.filter((p) => S.discovered[p.id]).map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name}</option>`).join('');
}

// Route editor. Each ship card edits a draft route; the captain only gets it on Start/Change.
export const routeDrafts = {};

export function draftFor(ship) {
  if (!routeDrafts[ship.id]) {
    const other = PORTS.find((p) => S.discovered[p.id] && p.id !== ship.at)?.id || ship.at;
    routeDrafts[ship.id] = JSON.parse(JSON.stringify(ship.route?.stops ? { stops: ship.route.stops } : Fleet.simpleRoute(ship.at, other)));
  }
  return routeDrafts[ship.id];
}

export function orderGoodOptions(order, portId) {
  if (order.act === 'sell') {
    return `<option value="all" ${order.good === 'all' ? 'selected' : ''}>Everything aboard</option>` +
      GOODS.map((g) => `<option value="${g.id}" ${order.good === g.id ? 'selected' : ''}>${g.name}</option>`).join('');
  }
  return `<option value="best" ${order.good === 'best' ? 'selected' : ''}>Best available (captain's choice)</option>` +
    GOODS.filter((g) => market.sells(portId, g.id)).map((g) => `<option value="${g.id}" ${order.good === g.id ? 'selected' : ''}>${g.name}</option>`).join('');
}

export function routeEditor(ship) {
  const d = draftFor(ship);
  const stops = d.stops.map((st, i) => `
      <div class="stop" data-stop-i="${i}">
        <div class="stop-head">
          <span class="stop-n">${i + 1}</span>
          <select data-f="port" aria-label="Stop ${i + 1} port">${portOptions(st.port)}</select>
          ${d.stops.length > 2 ? `<button class="mini" data-draft="del-stop" aria-label="Remove stop ${i + 1}">Remove</button>` : ''}
        </div>
        ${st.orders.map((o, j) => `
          <div class="order" data-order-j="${j}">
            <select data-f="act" aria-label="Order"><option value="sell" ${o.act === 'sell' ? 'selected' : ''}>Sell</option><option value="buy" ${o.act === 'buy' ? 'selected' : ''}>Buy</option></select>
            <select data-f="good" aria-label="Good">${orderGoodOptions(o, st.port)}</select>
            ${o.act === 'buy' ? `<select data-f="pct" aria-label="Share of the hold">${[25, 50, 75, 100].map((n) => `<option value="${n}" ${o.pct === n ? 'selected' : ''}>${n}% of hold</option>`).join('')}</select>` : '<span></span>'}
            <button class="mini" data-draft="del-order" aria-label="Remove order">×</button>
          </div>`).join('')}
        ${st.orders.length < Fleet.MAX_ORDERS ? '<button class="mini" data-draft="add-order">+ Order</button>' : ''}
      </div>`).join('<div class="stop-arrow" aria-hidden="true">↓</div>');
  return `<div class="route-editor">
      ${stops}
      <div class="stop-arrow" aria-hidden="true">↺ back to stop 1</div>
      <div class="row" style="justify-content:flex-start">${d.stops.length < Fleet.MAX_STOPS ? '<button class="mini" data-draft="add-stop">+ Add stop</button>' : ''}<button class="mini" data-draft="simple">Reset to two ports</button></div>
    </div>`;
}

export function routeSummary(route) {
  if (!route?.stops) return '';
  return route.stops.map((st) => PORTS.find((p) => p.id === st.port).name).join(' → ') + ' → …';
}

export function renderFleet(el) {
  const F = Fleet.ensureFleet(S);
  const ships = F.ships.map((ship) => {
    const last = ship.last ? `Last: at ${PORTS.find((p) => p.id === ship.last.at).name} sold ${ship.last.text || 'cargo'} for ${ship.last.income.toLocaleString()} cz (${ship.last.profit >= 0 ? '+' : ''}${ship.last.profit.toLocaleString()}).` : 'No voyages yet.';
    return `<li class="contract" data-ship="${ship.id}">
        <div class="c-head"><span class="c-title">${ship.name}</span><span class="c-pay">${ship.profit >= 0 ? '+' : ''}${ship.profit.toLocaleString()} cz</span></div>
        <div class="c-patron">Captain ${ship.captain.name} · navigation ${stars(ship.captain.nav)} · trade ${stars(ship.captain.trade)} · ${Fleet.dailyCost(ship)} cz a day at sea, half in port · ${Fleet.loyaltyText(ship.captain.loyalty)}</div>
        <p>${Fleet.statusText(S, ship)} ${ship.trips} ${ship.trips === 1 ? 'sale' : 'sales'} so far.</p>
        ${ship.route ? `<p class="muted">Route: ${routeSummary(ship.route)}</p>` : ''}
        <p class="muted">${last}</p>
        <details ${ship.route ? '' : 'open'}><summary>${ship.route ? 'Edit route' : 'Set a route'}</summary>
          ${routeEditor(ship)}
          <p class="foot">Stops are visited in order, then back to the first. Orders run top to bottom, so sell before you buy to make room. "Best available" picks what pays most where it will next be sold; a named good is bought as long as it should sell without loss where it is next sold.</p>
        </details>
        <div class="row">${ship.route ? `<button data-halt="${ship.id}">Stop at next port</button>` : ''}<button class="primary" data-route="${ship.id}">${ship.route ? 'Change route' : 'Start route'}</button></div>
      </li>`;
  }).join('');
  let yard = '';
  const maxShips = Contracts.perks(S).maxShips;
  const nextShips = Contracts.TIERS.filter((t) => t.maxShips > maxShips && Number.isFinite(t.min)).pop();
  const allowance = `<p class="foot">Your standing lets you command ${maxShips} hired ${maxShips === 1 ? 'ship' : 'ships'}; you have ${F.ships.length}.${nextShips ? ` Become <i>${nextShips.title}</i> (standing ${nextShips.min}) to command ${nextShips.maxShips}.` : ''}</p>`;
  if (Fleet.canBuy(S, maxShips)) {
    if (S.ship.docked === 'lisbon') {
      yard = `<h3>The Lisbon shipyard</h3>
        <p class="blurb">A caravel like yours costs ${Fleet.SHIP_COST.toLocaleString()} cz. Choose the captain who will sail her.</p>
        <ul class="contracts">${Fleet.candidates(S).map((c) => `<li class="contract">
          <div class="c-head"><span class="c-title">Captain ${c.name}</span><span class="c-pay">${c.wage} cz a day</span></div>
          <p>Navigation ${stars(c.nav)} (faster passages) · Trade ${stars(c.trade)} (better sale prices)</p>
          <div class="row"><button class="primary" data-hire="${c.id}" ${S.purse < Fleet.SHIP_COST ? 'disabled' : ''}>Buy a caravel and hire him</button></div>
        </li>`).join('')}</ul>
        ${S.purse < Fleet.SHIP_COST ? `<p class="foot">You need ${Fleet.SHIP_COST.toLocaleString()} cz in your purse.</p>` : ''}`;
    } else {
      yard = `<p class="foot">The Lisbon shipyard will build you a caravel for ${Fleet.SHIP_COST.toLocaleString()} cz.</p>`;
    }
  }
  yard += allowance;
  el.innerHTML = `
    ${tabs('fleet')}
    <header><h2>Fleet</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">Hired captains sail a loop of ports on their own, following your orders at each stop: they buy with your purse, sell in the same markets, and keep at it until you stop them. Each sale moves prices like yours do.</p>
    ${ships ? `<ul class="contracts">${ships}</ul>` : ''}
    ${yard}
    ${F.ships.length ? `<p class="foot">Your fleet only sails while time passes: at sea, or when you wait in port. Captains never spend the last 150 cz of your purse.</p>
      ${S.ship.docked ? '<div class="row"><button data-wait>Wait a week</button></div>' : ''}` : ''}`;
}

export function renderHelp(el) {
  el.innerHTML = `
    <header><h2>How to play</h2><button class="close" data-close aria-label="Close">×</button></header>
    <div class="row feedback-entry"><button data-feedback="bug">Report a bug</button><button data-feedback="idea">Suggest an idea</button></div>
    <h3>Sailing</h3>
    <ul class="help">
      <li><b>Set a course:</b> click or tap the sea, a port, or use <i>Sail to…</i>. Shift-click adds a waypoint. You confirm each voyage first.</li>
      <li><b>Wind:</b> the arrows show where it blows. Running before it is fast; beating into it is slow. Coming home from Africa, swing out to sea and catch the westerlies.</li>
      <li><b>Map:</b> drag to pan, scroll, pinch or use + and − to zoom. The locate button finds your ship.</li>
      <li><b>Time:</b> pause or speed up with the buttons, or space and 1, 2, 3. Time only passes at sea, or when you wait in port.</li>
    </ul>
    <h3>Trading</h3>
    <ul class="help">
      <li><b>Prices move</b> as you buy and sell, and recover over weeks. Contracts and events move them too.</li>
      <li><b>The price book</b> remembers only the prices you have seen, and they go stale. News of events reaches you in port, late for distant places.</li>
      <li><b>Perishables</b> such as wine, dye and pepper slowly spoil at sea, faster in the tropics. Gold and ivory keep.</li>
      <li><b>Corsairs</b> prowl off Morocco, the Algarve and the Canaries. When challenged, run, fight or pay. Fighting makes your name feared and draws more of them; avoiding fights calms the seas. Battle damage slows you until a shipwright in Lisbon, Lagos or Funchal repairs it.</li>
      <li><b>Charts:</b> the crown pays ${CHART_REWARD} cz for each new port or island group, on your return to Lisbon.</li>
    </ul>
    <h3>Growing</h3>
    <ul class="help">
      <li><b>Contracts</b> open up at 500 cz. Completing them builds standing; missing deadlines costs it.</li>
      <li><b>Standing</b> brings better pay, better prices in Portuguese ports, and the right to buy a second caravel.</li>
      <li><b>Your fleet:</b> a hired captain runs a trade route for you, paid from your purse.</li>
      <li><b>The ledger</b> accounts for every cruzado in and out. Your own dealings are entered at once. A hired captain's are entered when you are in any port on his route, so until then part of your purse is not yet accounted for.</li>
      <li><b>Time away:</b> if you have hired captains and your own ship is in port, the world moves on while you are gone: at a tenth of its usual pace at first, more slowly after a few weeks, up to ${OFFLINE_MAX_DAYS} days. Contract deadlines wait for you. A night's sleep or a working day is safe; stay away longer than ${Fleet.STRAY_AFTER_HOURS} hours and captains start to stray (skimming, then going ashore), and after ${STANDING_FADES_AFTER_HOURS} hours your standing starts to fade.</li>
    </ul>
    <h3>Saving</h3>
    <ul class="help">
      <li><b>On this device</b> your game saves by itself as you play.</li>
      <li><b>Cloud save:</b> tap the cloud button to get a save code. Enter it on another device to continue there; both stay in sync. A green dot means synced, red means it needs attention.</li>
    </ul>
    <p class="foot">Keyboard: space pause · 1 2 3 speed · P price book · L ledger · N notices · W winds · Esc close.</p>`;
}

// Captain's notes: a gentle nudge through the first voyages, until contracts open up.
export function tipText() {
  if (!S.tips || S.tips.off || S.contracts?.unlocked || !ui.introDone || ui.modal) return null;
  const sh = S.ship;
  if (sh.docked) {
    if (held() === 0 && S.voyages === 0) return 'Buy wine or wool cloth here: both sell for close to double in the Canaries and further south.';
    if (held() > 0 && S.voyages === 0) return 'Now set sail: tap Sail to…, or a port on the chart. Lanzarote is an easy first run.';
    if (held() > 0) return 'Sell where the price beats what you paid (shown under Hold). Then load something the next port wants.';
    return 'Open the Price book: the harbourmaster suggests runs from the prices you have seen.';
  }
  if (S.voyages === 0) return 'The arrows show the wind. Running before it is fast; beating into it is slow.';
  return 'Reach 500 cruzados and Prince Henry will notice you.';
}

export function renderTip() {
  const t = tipText();
  const el = $('tip');
  el.hidden = !t;
  if (t && $('tip-text').textContent !== t) $('tip-text').textContent = t;
}

// Market, Price book and other tabs, shown while in port so either is one click away.
// The trading panels, one tab each. In port: the market and Set sail too.
export function tabs(active) {
  const docked = !!S.ship.docked;
  return `<nav class="tabs" role="tablist">
      ${docked ? `<button role="tab" data-tab="port" aria-selected="${active === 'port'}" class="${active === 'port' ? 'on' : ''}">Market</button>` : ''}
      <button role="tab" data-tab="prices" aria-selected="${active === 'prices'}" class="${active === 'prices' ? 'on' : ''}">Price book</button>
      <button role="tab" data-tab="ledger" aria-selected="${active === 'ledger'}" class="${active === 'ledger' ? 'on' : ''}">Ledger</button>
      ${S.contracts?.unlocked ? `<button role="tab" data-tab="contracts" aria-selected="${active === 'contracts'}" class="${active === 'contracts' ? 'on' : ''}">Contracts</button>` : ''}
      ${fleetUnlocked() ? `<button role="tab" data-tab="fleet" aria-selected="${active === 'fleet'}" class="${active === 'fleet' ? 'on' : ''}">Fleet</button>` : ''}
      ${docked ? `<button role="tab" data-tab="sail" aria-selected="${active === 'sail'}" class="${active === 'sail' ? 'on' : ''}">Set sail</button>` : ''}
    </nav>`;
}

export function bestKnownSale(good, exceptPort) {
  let best = null;
  for (const [pid, rec] of Object.entries(S.seen)) {
    if (pid === exceptPort) continue;
    const price = rec.prices[good].sell;
    if (!best || price > best.price) best = { price, name: PORTS.find((p) => p.id === pid).name };
  }
  return best;
}

export let warmQueue = [], warmTimer = null;
export function warmRoutes() {
  warmQueue = [];
  const known = PORTS.filter((p) => S.discovered[p.id]);
  for (const a of known) for (const b of known) if (a !== b) warmQueue.push([a, b]);
  if (!warmTimer) warmTimer = setTimeout(warmStep, 50);
}
export function warmStep() {
  warmTimer = null;
  const pair = warmQueue.shift();
  if (!pair) return;
  findPath(pair[0].lon, pair[0].lat, pair[1].lon, pair[1].lat);
  warmTimer = setTimeout(warmStep, 40);
}

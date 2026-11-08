// The HUD and the side panels: market, contracts, sail, fleet, help, tips and tabs.

import * as Works from './works.js';
import { home, homeName } from './nations.js';
import { PORTS, pointOfSail, compassPoint, distNm, findPath, shoalDepth, DEEP_DRAFT } from './world.js';
import { GOODS, Market } from './economy.js';
import * as Wear from './wear.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Pirates from './pirates.js';
import * as Investments from './investments.js';
import * as House from './house.js';
import * as Competition from './competition.js';
import { renderHouses, shareLine, housesOpen } from './housesview.js';
import { renderWorks } from './worksview.js';
import { CHART_REWARD, OFFLINE_MAX_DAYS, STANDING_FADES_AFTER_HOURS } from './config.js';
import * as Ships from './ships.js';
import * as Captains from './captains.js';
import { shipFigure } from './photos.js';
import { S, market, ui } from './state.js';
import { load, save } from './save.js';
import { renderCloud } from './cloudsync.js';
import { W } from './view.js';
import { report, shipWind, spoil, syncMarket, loadOf } from './sim.js';
import * as Ports from './ports.js';
import { estimateVoyage, observe, planCourse } from './voyage.js';
import { drag } from './input.js';
import { $, cz, fmtDate, fmtDateShort, held } from './util.js';
import { renderLedger } from './ledgerview.js';
import { debtBox, renderRutter, storyOn } from './storyview.js';
import * as Cloud from './cloud.js';
import { timeScale } from './cloud.js';
import { renderPlanner, renderRouteEstimate } from './voyageplan.js';
import { renderPrices } from './pricebook.js';
import { placeToasts, renderNoticeBadge, renderNotices } from './notices.js';
import { renderFeedback } from './feedback.js';
import { isBook, renderDock, renderMenu, serviceHere } from './dock.js';
import { YARDS } from './shipyard.js';
import { moneyBox } from './lendingview.js';
import { ensureFirst, firstActive, firstAtSea, firstBox } from './firstvoyage.js';

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
  $('hud-date').textContent = window.matchMedia('(max-width: 700px)').matches ? fmtDateShort(S.day) : fmtDate(S.day);
  const purse = Math.floor(S.purse);
  const owed = Math.ceil(S.crewOwed || 0);
  $('hud-purse').innerHTML = owed ? `${purse.toLocaleString()} cz<em class="owed">crew owed ${owed}</em>` : `${purse.toLocaleString()} cz`;
  $('hud-purse').classList.toggle('debt', purse < 0 || owed > 0);
  const ten = document.querySelector('[data-speed="10"]'); if (ten) ten.hidden = Cloud.fastest() !== 10;
  $('hud-hold').textContent = `${held()} / ${Ships.flagStats(S).hold}`;
  const hull = Math.round(S.hull ?? 100);
  $('hud-hull').textContent = `${hull}%`;
  $('hud-hull').classList.toggle('warn', hull < Wear.LEAKS_BELOW + 10);
  $('hud-hull').classList.toggle('danger', hull < Wear.LEAKS_BELOW);
  $('dock-ship').classList.toggle('lit', !!serviceHere()); // the bottom bar's Ship button, lit where she can be seen to
  const sh = S.ship;
  let status;
  if (sh.docked) {
    const pn = PORTS.find((p) => p.id === sh.docked).name;
    const b = sh.boats;
    if (b && b.moved < b.total) {
      const left = Math.max(1, Math.ceil((b.total - b.moved) / b.rate));
      status = b.quay
        ? `Alongside in ${pn} · working the cargo: ${Math.floor(b.moved)} of ${b.total} units, about ${left} ${left === 1 ? 'day' : 'days'} more${ui.speed === 0 ? ' (paused)' : ''}.`
        : `At anchor off ${pn} · her boats are working the cargo: ${Math.floor(b.moved)} of ${b.total} units, about ${left} ${left === 1 ? 'day' : 'days'} more${ui.speed === 0 ? ' (paused)' : ''}.`;
    } else {
      status = `${sh.offshore ? `At anchor off ${pn}` : `At anchor in ${pn}`}. Click the chart to set sail.`;
    }
  } else {
    const { w, off, knots } = shipWind();
    const windTxt = `Wind from the ${compassPoint(w.from)}`;
    if (sh.route.length) {
      let nm = 0, lon = sh.lon, lat = sh.lat;
      for (const [x, y] of sh.route) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
      const dest = sh.dest?.port ? PORTS.find((p) => p.id === sh.dest.port).name : 'the mark';
      status = `${windTxt} · heading ${compassPoint(sh.heading)} · ${pointOfSail(off)} · ${knots.toFixed(1)} kn${S.hull < 90 ? ` · hull ${Math.round(S.hull)}%` : ''} · ${Math.round(nm)} nm to ${dest}`;
    } else {
      status = `${windTxt} · hove to · click the chart to set a course`;
    }
  }
  $('status').textContent = timeScale() > 1 ? `${status} · time ×${timeScale()} (your account)` : status;
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
  el.classList.toggle('wide', ui.panelMode === 'prices' || ui.panelMode === 'ledger' || ui.panelMode === 'houses' || ui.panelMode === 'works');
  if (ui.panelMode === 'port') renderPort(el);
  else if (ui.panelMode === 'sail') renderSail(el);
  else if (ui.panelMode === 'contracts') renderContracts(el);
  else if (ui.panelMode === 'fleet') renderFleet(el);
  else if (ui.panelMode === 'help') renderHelp(el);
  else if (ui.panelMode === 'cloud') renderCloud(el);
  else if (ui.panelMode === 'feedback') renderFeedback(el);
  else if (ui.panelMode === 'menu') renderMenu(el);
  else if (ui.panelMode === 'ledger') renderLedger(el);
  else if (ui.panelMode === 'houses') renderHouses(el);
  else if (ui.panelMode === 'works') renderWorks(el);
  else if (ui.panelMode === 'notices') renderNotices(el);
  else if (ui.panelMode === 'rutter') renderRutter(el);
  else renderPrices(el);
  if (isBook(ui.panelMode)) ui.lastBook = ui.panelMode;
  fitTabs(el);
  placeToasts();
  renderDock();
}

// A row of tabs wider than the panel scrolls: the open tab is brought into view, and a fade at
// either edge shows there are more tabs that way.
function fitTabs(el) {
  const t = el.querySelector('.tabs');
  if (!t) return;
  const on = t.querySelector('.on');
  if (on && (on.offsetLeft < t.scrollLeft || on.offsetLeft + on.offsetWidth > t.scrollLeft + t.clientWidth)) t.scrollLeft = on.offsetLeft - 24;
  const mark = () => {
    t.classList.toggle('more-right', t.scrollLeft + t.clientWidth < t.scrollWidth - 4);
    t.classList.toggle('more-left', t.scrollLeft > 4);
  };
  mark();
  t.addEventListener('scroll', mark, { passive: true });
}

// A port is described in full on your first stay; after that, folded under "About" (unless she lies
// offshore, which you need to know). Marked when you leave (voyage.js undock).
export function portKnown(pid) {
  if (!S.portsKnown) S.portsKnown = { ...(S.called || {}) }; // a save from before: ports you have arrived at
  return !!S.portsKnown[pid];
}

// The port's size and the water at its berth, against what the flagship draws.
function harbourLine(pid) {
  const p = PORTS.find((x) => x.id === pid);
  const L = Ports.portLine(S, pid);
  const sh = S.ship;
  const draft = Ships.draftOf(sh.hull, loadOf()), laden = Ships.draftOf(sh.hull, 1), depth = Ports.depthOf(S, pid);
  const name = Ships.hullOf(sh).name.toLowerCase();
  const fit = sh.offshore
    ? (() => { const w = Ports.boatWork(pid, sh.hull, 1, Ships.isDeep(sh.hull) && shoalDepth(p.lon, p.lat) <= DEEP_DRAFT); return `She draws ${draft} m: she lies at the anchorage${w.nm > 15 ? `, ${Math.round(w.nm)} miles out,` : ''} and her boats work the cargo (${w.rate} units a day, the boatmen ${w.fee} cz a unit).`; })()
    : laden > depth ? `Your ${name} draws ${draft} m now, ${laden} m fully laden: load her deep and she must move out to the anchorage.` : `Your ${name} draws up to ${laden} m: she can lie here laden.`;
  const season = Ports.seasonText(pid, S.day);
  const rivals = Competition.levelText(Competition.level(S, pid));
  return `<p class="harbour">${L ? `A ${L.tier} of about ${L.people.toLocaleString()} people, ${L.trend}${rivals ? `, ${rivals}` : ''}. ` : ''}${p.kind[0].toUpperCase() + p.kind.slice(1)}, ${depth} m at the berth. ${season ? `${season} ` : ''}${fit}</p>`;
}

// Investments ashore in this port: a feitoria of your own, and in Lisbon shares in the India fleet.
function investLine(pid) {
  const parts = [];
  if (Investments.hasFeitoria(S, pid)) {
    parts.push(`<p class="harbour">Your <b>feitoria</b> here: your factor gets you prices ${Math.round(Investments.FEITORIA_EDGE * 100)}% better and finds you an extra contract. He and his clerks draw ${Investments.FACTOR_WAGE} cz a day.</p>`);
  } else if (pid !== home(S)) {
    // a feitoria is now founded from the port works (worksview.js)
  }
  const mine = Works.BUILDING_IDS.filter((id) => id !== 'post' && Works.building(S, pid, id));
  if (mine.length) parts.push(`<p class="harbour">Your works here: ${mine.map((id) => Works.BUILDINGS[id].name.toLowerCase() + (Works.has(S, pid, id) ? '' : Works.building(S, pid, id).neglected ? ' (neglected)' : ' (being built)')).join(', ')}.</p>`);
  if (pid === home(S) && S.purse >= 5000) {
    const t = House.title(S);
    parts.push(`<div class="row invest"><button data-house>Your house${House.renown(S) ? `: ${t.name}, renown ${House.renown(S)}` : ''}…</button></div>`);
  }
  if (pid === 'lisbon' && Investments.fleetsOpen(S)) {
    const f = Investments.nextFleet(S);
    const have = Investments.sharesIn(S, f.year);
    parts.push(`<div class="row invest"><button data-shares="5" ${S.purse < Investments.SHARE * 5 || have >= Investments.MAX_SHARES ? 'disabled' : ''}>Shares in the India fleet of ${f.year}: 5 for ${(Investments.SHARE * 5).toLocaleString()} cz</button></div>${have ? `<p class="fine">You hold ${have} shares in it. It sails ${fmtDate(f.sails)}.</p>` : ''}`);
  }
  return parts.join('');
}

const yardNames = () => YARDS.map((y) => PORTS.find((p) => p.id === y).name).join(', ').replace(/, ([^,]*)$/, ' and $1');

export function renderPort(el) {
  const pid = S.ship.docked;
  if (!pid) { ui.panelMode = null; el.hidden = true; return; }
  const p = PORTS.find((x) => x.id === pid);
  observe(pid);
  const st = Ships.flagStats(S);
  const free = st.hold - held();
  const shut = Events.closure(S, pid);
  ensureFirst(); // a new game: the guided first voyage (firstvoyage.js)
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
    ${portKnown(pid)
      ? `<details class="port-about"><summary>About ${p.name}</summary><p class="blurb">${p.blurb}</p>${S.ship.offshore ? '' : harbourLine(pid)}</details>${S.ship.offshore ? harbourLine(pid) : ''}`
      : `<p class="blurb">${p.blurb}</p>${harbourLine(pid)}`}
    ${shareLine(pid)}
    ${firstBox()}
    ${debtBox()}
    ${moneyBox()}
    ${hullBanner(pid)}
    ${shut ? `<p class="banner warn"><b>Closed to trade:</b> ${Events.template(shut).title.toLowerCase()}. Expected to reopen around ${fmtDate(shut.end)}.</p>` : ''}
    <table class="market">
      <thead><tr><th>Good</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Hold</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${investLine(pid)}
    <p class="foot">Hold ${held()} / ${st.hold} · purse ${Math.floor(S.purse).toLocaleString()} cz · upkeep ${st.upkeep} cz a day at sea.<br>
    Buying pushes the price up; selling pushes it down. Prices recover over a few weeks. <i>Max</i> keeps two weeks of wages in the purse.</p>
    <div class="row"><button data-ships="register" title="Your ship and the ships ahead (S)">Your ship</button>${Works.isYard(S, pid) ? `<button data-ships="yard" title="Refit your ship${pid === home(S) ? ', or buy and order new ones' : ''}">Shipyard</button>` : ''}${S.voyages >= 1 || Works.list(S).length ? '<button data-tab="works" title="Build quays, warehouses, trading posts, forts, shipyards and churches here">Port works</button>' : ''}<button data-wait title="Let a week pass: prices recover, news arrives, your fleet sails on. Your crew draws no wages in port; hired captains are still paid.">Wait a week</button><button class="primary" data-tab="sail">Set sail…</button></div>`;
}

export function contractCard(c, actions) {
  const g = c.good ? GOODS.find((x) => x.id === c.good) : null;
  const lines = [];
  if (c.kind === 'discover') {
    lines.push(c.text);
    lines.push(c.stage === 'find' ? '<b>Next:</b> find and anchor at an uncharted port.' : `<b>Next:</b> report to ${homeName(S)}. You opened trade with ${PORTS.find((p) => p.id === c.found).name}.`);
  } else {
    const src = PORTS.find((p) => p.id === c.source);
    lines.push(`${g.name} can be bought at ${src.name}.${c.spare ? ` Carry ${c.spare} extra: some will spoil on the way.` : ''}`);
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

// Where a contract sends you next: to buy the goods, to deliver them, or home to Lisbon to report.
// A button to set that course (confirmed as any voyage is), or nothing when you are there already.
export function sailButton(c) {
  let to, what;
  if (c.kind === 'discover') {
    if (c.stage === 'find') return '';
    to = home(S); what = 'report';
  } else if ((S.cargo[c.good] || 0) < c.qty) {
    to = c.source; what = 'buy';
  } else {
    to = c.to; what = 'deliver';
  }
  if (!to || to === S.ship.docked) return '';
  const name = PORTS.find((p) => p.id === to)?.name;
  if (!name) return '';
  if (S.ship.dest?.port === to) return `<span class="muted on-course">On course for ${name}</span>`;
  return `<button class="primary" data-sailto="${to}">Sail to ${name} to ${what}</button>`;
}

export function renderContracts(el) {
  const C = Contracts.ensureContracts(S);
  const pid = S.ship.docked;
  const active = C.active.map((c) => contractCard(c, [
    Contracts.canDeliver(S, c) && !market.closed(pid) ? `<button class="primary" data-deliver="${c.id}">Deliver</button>` : '',
    c.kind === 'deliver' ? `<button data-abandon="${c.id}">Abandon</button>` : '',
    Contracts.canDeliver(S, c) && !market.closed(pid) ? '' : sailButton(c),
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
// The flagship's hull, when it needs looking at: the yard's price and days, or careening her
// on the beach where there is no yard.
function hullBanner(pid) {
  const h = S.hull ?? 100;
  const years = Ships.serviceYears(S.ship, S.day);
  const cap = Wear.soundCap(S.ship.hull, years);
  const rb = pid === home(S) ? Ships.rebuildQuote(S.ship, S.ship.hull, S.day) : null;
  const ageLine = cap < 100 || rb
    ? `<br><span class="fine">She has ${Ships.ageText(S.ship.hull, years)}${cap < 100 ? `; the yards can make her no better than ${cap}%` : ''}.</span>${rb ? ` <button data-rebuild ${S.purse < rb.cost ? 'disabled' : ''}>A great rebuild: ${rb.cost.toLocaleString()} cz, ${rb.days} days, gives back about ${Math.round(rb.years)} years${rb.n ? ' (her last)' : ''}</button>` : ''}`
    : '';
  if (h >= 90 && !ageLine) return '';
  if (h >= Math.min(90, cap - 1) && ageLine) return `<p class="banner ${cap < Wear.LEAKS_BELOW ? 'warn' : ''}"><b>Hull ${Math.round(h)}%</b>${ageLine}</p>`;
  const yard = Works.isYard(S, pid);
  const q = yard ? Wear.yardQuote(S.ship.hull, h, years) : Wear.beachQuote(S.ship.hull, h, years);
  const bq = Wear.beachQuote(S.ship.hull, h, years); // the beach is there in a yard port too, and cheaper
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const state = h < Wear.DANGER_BELOW ? 'in danger, ' : h < Wear.LEAKS_BELOW ? 'leaking, ' : '';
  const act = yard
    ? `<button data-repair ${S.purse < q.cost ? 'disabled' : ''}>Repair in the yard: ${q.cost.toLocaleString()} cz, ${days(q.days)}</button>${bq.pts > 0 ? ` <button data-careen ${S.purse < bq.cost ? 'disabled' : ''}>Or careen her on the beach: ${bq.cost.toLocaleString()} cz, ${days(bq.days)}, to ${Wear.BEACH_TO}%</button>` : ''}`
    : q.pts > 0
      ? `<button data-careen ${S.purse < q.cost ? 'disabled' : ''}>Careen her on the beach: ${q.cost.toLocaleString()} cz, ${days(q.days)}, to ${Wear.BEACH_TO}%</button> <span class="fine">The yards of ${yardNames()} make her fully sound.</span>`
      : `<span class="fine">The yards of ${yardNames()} can make her fully sound.</span>`;
  return `<p class="banner ${h < Wear.LEAKS_BELOW ? 'warn' : ''}"><b>Hull ${Math.round(h)}%</b> · ${state}sailing at ${Math.round(Pirates.hullFactor(S) * 100)}% speed. ${act}${ageLine}</p>`;
}

// Set sail: the voyage planner (voyageplan.js), or the plain list of ports as before. A switch at
// the top chooses; S.sailView remembers it ('planner' or 'list').
const sailSwitch = (view) => `<div class="seg sail-view" role="radiogroup" aria-label="Set sail view">
    <button role="radio" aria-checked="${view === 'planner'}" class="${view === 'planner' ? 'on' : ''}" data-sail-view="planner">Planner</button>
    <button role="radio" aria-checked="${view !== 'planner'}" class="${view !== 'planner' ? 'on' : ''}" data-sail-view="list">Plain list</button>
  </div>`;
export function renderSail(el) {
  const view = S.sailView || 'planner';
  if (view === 'planner') {
    el.innerHTML = `
      ${tabs('sail')}
      <header><h2>Plan a voyage</h2><button class="close" data-close aria-label="Close">×</button></header>
      ${sailSwitch(view)}
      ${renderPlanner(ui.planSort)}`;
    // after loading for a port, keep that port in view (the list re-sorts as the hold changes)
    if (ui.planFocus) {
      const li = el.querySelector(`li.plan[data-port="${ui.planFocus}"]`);
      if (li) { li.classList.add('focus'); li.scrollIntoView({ block: 'nearest' }); }
    }
    return;
  }
  renderSailList(el, sailSwitch(view));
}

function renderSailList(el, head) {
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
    ${head}
    <p class="blurb">Pick a charted port, or tap anywhere on the open sea to sail there. Uncharted waters only appear once you sail into them.</p>
    <ul class="dests">${list || '<li class="muted">No other ports charted yet.</li>'}</ul>
    <p class="foot">Times are estimated from today's winds.</p>`;
}

export function fleetUnlocked() {
  return !!(S.fleet?.ships.length || (S.contracts?.unlocked && Contracts.perks(S).shipyard));
}

export const stars = (n) => { const k = Captains.stars(n); return '★'.repeat(k) + '☆'.repeat(5 - k); };

export function portOptions(selected) {
  return PORTS.filter((p) => S.discovered[p.id]).map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name}</option>`).join('');
}

// Route editor. Each ship card edits a draft route; the captain only gets it on Start/Change.
export const routeDrafts = {};

export function draftFor(ship) {
  if (!routeDrafts[ship.id]) {
    const other = PORTS.find((p) => S.discovered[p.id] && p.id !== ship.at)?.id || ship.at;
    const d = JSON.parse(JSON.stringify(ship.route?.stops ? { stops: ship.route.stops } : Fleet.simpleRoute(ship.at, other)));
    // Simple unless the route has orders of its own, or the owner prefers to set them
    d.mode = !Fleet.isSimpleRoute(d.stops) || S.routeMode === 'advanced' ? 'advanced' : 'simple';
    routeDrafts[ship.id] = d;
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

// Whether this ship can lie at a stop, or must work her cargo with boats, or cannot get up the river.
function stopWaterNote(ship, pid) {
  const hull = ship.hull || 'caravel', p = PORTS.find((x) => x.id === pid);
  if (!p) return '';
  const light = Ships.draftOf(hull, 0), laden = Ships.draftOf(hull, 1), depth = Ports.depthOf(S, pid);
  const name = Ships.HULLS[hull].name.toLowerCase();
  if (p.river) {
    if (light > depth + 0.8) return `<p class="stop-note warn">Too deep for the river: a ${name} draws ${light} m even light, and the channel to ${p.name} is ${depth} m (a little more in the rains).</p>`;
    if (laden > depth) return `<p class="stop-note">Up the river only part laden: the channel is ${depth} m just now and she draws up to ${laden} m. Laden deep, she waits for the water to rise.</p>`;
    return '';
  }
  if (laden > depth) return `<p class="stop-note">${light > depth ? 'She lies' : 'Laden, she lies'} at the anchorage here (${depth} m, she draws up to ${laden} m): her boats work the cargo, which takes some days.</p>`;
  return '';
}

export function routeEditor(ship) {
  const d = draftFor(ship);
  const modes = `<div class="seg route-mode" role="radiogroup" aria-label="Route orders">
      <button role="radio" aria-checked="${d.mode === 'simple'}" class="${d.mode === 'simple' ? 'on' : ''}" data-draft="mode-simple">Simple</button>
      <button role="radio" aria-checked="${d.mode !== 'simple'}" class="${d.mode !== 'simple' ? 'on' : ''}" data-draft="mode-advanced">Advanced</button>
    </div>`;
  if (d.mode === 'simple') {
    const stops = d.stops.map((st, i) => `
      <div class="stop" data-stop-i="${i}">
        <div class="stop-head">
          <span class="stop-n">${i + 1}</span>
          <select data-f="port" aria-label="Stop ${i + 1} port">${portOptions(st.port)}</select>
          ${d.stops.length > 2 ? `<button class="mini" data-draft="del-stop" aria-label="Remove stop ${i + 1}">Remove</button>` : ''}
        </div>
        ${stopWaterNote(ship, st.port)}
      </div>`).join('<div class="stop-arrow" aria-hidden="true">↓</div>');
    return `<div class="route-editor simple">
      ${modes}
      <p class="fine">Name the ports. At each one Captain ${ship.captain.name} sells everything aboard and loads whatever pays best at the next.</p>
      ${stops}
      <div class="stop-arrow" aria-hidden="true">↺ back to stop 1</div>
      <div class="row" style="justify-content:flex-start">${d.stops.length < Fleet.MAX_STOPS ? '<button class="mini" data-draft="add-stop">+ Add a port</button>' : ''}</div>
      ${renderRouteEstimate(ship, d.stops)}
    </div>`;
  }
  const stops = d.stops.map((st, i) => `
      <div class="stop" data-stop-i="${i}">
        <div class="stop-head">
          <span class="stop-n">${i + 1}</span>
          <select data-f="port" aria-label="Stop ${i + 1} port">${portOptions(st.port)}</select>
          ${d.stops.length > 2 ? `<button class="mini" data-draft="del-stop" aria-label="Remove stop ${i + 1}">Remove</button>` : ''}
        </div>
        ${stopWaterNote(ship, st.port)}
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
      ${modes}
      <p class="fine">Set what to sell and buy at each stop, in order.</p>
      ${stops}
      <div class="stop-arrow" aria-hidden="true">↺ back to stop 1</div>
      <div class="row" style="justify-content:flex-start">${d.stops.length < Fleet.MAX_STOPS ? '<button class="mini" data-draft="add-stop">+ Add stop</button>' : ''}<button class="mini" data-draft="simple">Reset to two ports</button></div>
      ${renderRouteEstimate(ship, d.stops)}
    </div>`;
}

export function routeSummary(route) {
  if (!route?.stops) return '';
  return route.stops.map((st) => PORTS.find((p) => p.id === st.port).name).join(' → ') + ' → …' + (Fleet.isSimpleRoute(route.stops) ? ' (the captain chooses the cargo)' : '');
}

// A captain's raise request, and his training: what's asked, what's ordered, what can be.
function captainBox(ship) {
  const c = ship.captain;
  const out = [];
  if (c.asks) out.push(`<div class="note warn-note"><p>Captain ${c.name} asks for <b>${c.asks.wage} cz a day</b> (now ${c.wage}). Refuse and his loyalty falls; leave him unanswered ${Math.max(1, Math.ceil(Captains.ANSWER_DAYS - (S.day - c.asks.day)))} more days and he takes it as a no.</p>
    <div class="row"><button data-raise="refuse" data-cap="${ship.id}">Refuse</button><button class="primary" data-raise="grant" data-cap="${ship.id}">Pay him ${c.asks.wage} cz a day</button></div></div>`);
  if (ship.status === 'training') return out.join('');
  const opts = Object.entries(Captains.TRAINING).filter(([k]) => Captains.canTrain(c, k));
  if (ship.trainNext) {
    const T = Captains.TRAINING[ship.trainNext];
    const calls = !ship.route || ship.route.stops.some((st) => st.port === T.port) || ship.at === T.port;
    out.push(`<p class="muted">A season ${T.where} (${Captains.trainFee(c, ship.trainNext)} cz, ${T.days} days, his ship waiting) when she next calls there.${calls ? '' : ` <span class="warn">Her route does not call at ${PORTS.find((p) => p.id === T.port).name}.</span>`} <button class="mini" data-train="none" data-cap="${ship.id}">Cancel</button></p>`);
  } else if (opts.length) {
    out.push(`<details class="train"><summary>Train Captain ${c.name}…</summary><p class="fine">A season ashore teaches him a star sooner (to four at most; the fifth is earned). His ship waits in port, his wage still paid.</p><div class="row">${opts.map(([k, T]) => `<button data-train="${k}" data-cap="${ship.id}">${T.learns[0].toUpperCase() + T.learns.slice(1)} ${T.where} · ${Captains.trainFee(c, k)} cz</button>`).join('')}</div></details>`);
  }
  return out.join('');
}

// Work ordered for a hired ship at the yards, until it is done.
function ordersLine(ship) {
  const o = ship.orders;
  if (!o?.fit && !o?.hull) return '';
  const bits = [];
  if (o.fit) bits.push(`a refit (${Object.entries(o.fit).map(([g, c]) => Ships.choice(g, c)?.name).filter(Boolean).map(Ships.lc).join(', ')}) at her next yard`);
  if (o.hull) bits.push(`a new ${Ships.HULLS[o.hull].name.toLowerCase()} at ${homeName(S)}`);
  return `<p class="note">Ordered: ${bits.join('; ')}. <button class="mini" data-cancel-orders="${ship.id}">Cancel</button></p>`;
}

export function renderFleet(el) {
  const F = Fleet.ensureFleet(S);
  const ships = F.ships.map((ship) => {
    const last = ship.last ? `Last: at ${PORTS.find((p) => p.id === ship.last.at).name} sold ${ship.last.text || 'cargo'} for ${ship.last.income.toLocaleString()} cz (${ship.last.profit >= 0 ? '+' : ''}${ship.last.profit.toLocaleString()}).` : 'No voyages yet.';
    return `<li class="contract" data-ship="${ship.id}">
        <div class="c-head"><span class="c-title">${ship.name} <small class="muted">${Ships.HULLS[ship.hull || 'caravel'].name.toLowerCase()} · hold ${Fleet.holdSize(ship)} · hull ${Math.round(ship.hullPct ?? 100)}%</small></span><span class="c-pay">${ship.profit >= 0 ? '+' : ''}${ship.profit.toLocaleString()} cz</span></div>
        <div class="c-patron">Captain ${ship.captain.name} · navigation ${stars(ship.captain.nav)} · trade ${stars(ship.captain.trade)} · ${Fleet.dailyCost(ship)} cz a day at sea, half in port · ${Fleet.loyaltyText(ship.captain.loyalty)}</div>
        ${captainBox(ship)}
        <p>${Fleet.statusText(S, ship)} ${ship.trips} ${ship.trips === 1 ? 'sale' : 'sales'} so far.</p>
        ${ship.route ? `<p class="muted">Route: ${routeSummary(ship.route)}</p>` : ''}
        <p class="muted">${last}</p>
        <details class="route-edit" ${ship.route ? '' : 'open'}><summary>${ship.route ? 'Edit route' : 'Set a route'}</summary>
          ${routeEditor(ship)}
          ${draftFor(ship).mode === 'simple' ? '' : `<p class="foot">Stops are visited in order, then back to the first. Orders run top to bottom, so sell before you buy to make room. "Best available" picks what pays most where it will next be sold; a named good is bought as long as it should sell without loss where it is next sold.</p>`}
        </details>
        ${ordersLine(ship)}
        <p class="muted">${Ships.ageText(ship.hull || 'caravel', Fleet.yearsOf(S, ship))}${Wear.soundCap(ship.hull || 'caravel', Fleet.yearsOf(S, ship)) < 100 ? `; the yards can make her no better than ${Wear.soundCap(ship.hull || 'caravel', Fleet.yearsOf(S, ship))}%` : ''}.</p>
        <div class="row">${ship.route ? `<button data-halt="${ship.id}">Stop at next port</button>` : ''}<button data-ship-yard="${ship.id}">Refit or replace…</button><button class="primary" data-route="${ship.id}">${ship.route ? 'Change route' : 'Start route'}</button></div>
      </li>`;
  }).join('');
  let yard = '';
  const maxShips = Contracts.perks(S).maxShips;
  const nextShips = Contracts.TIERS.filter((t) => t.maxShips > maxShips && Number.isFinite(t.min)).pop();
  const allowance = `<p class="foot">Your standing lets you command ${maxShips} hired ${maxShips === 1 ? 'ship' : 'ships'}; you have ${F.ships.length}.${nextShips ? ` Become <i>${nextShips.title}</i> (standing ${nextShips.min}) to command ${nextShips.maxShips}.` : ''}</p>`;
  if (Fleet.canBuy(S, maxShips)) {
    if (S.ship.docked === home(S)) {
      const hulls = Ships.hullOrder(S).filter((id) => Ships.availability(S, Ships.HULLS[id]).ok === 'yes');
      if (!hulls.includes(ui.hireHull)) ui.hireHull = hulls.includes('caravel') ? 'caravel' : hulls[0];
      const H = Ships.HULLS[ui.hireHull];
      const hst = Ships.stats({ hull: H.id });
      yard = `<h3>The ${homeName(S)} shipyard</h3>
        <div class="hire-hulls" role="radiogroup" aria-label="Ship for your captain">${hulls.map((id) => `<button role="radio" aria-checked="${id === H.id}" class="${id === H.id ? 'on' : ''}" data-hire-hull="${id}">${shipFigure({ hull: id }, { size: 'mini', decorative: true })}<b>${Ships.HULLS[id].name}</b><small>${Ships.HULLS[id].price.toLocaleString()} cz</small></button>`).join('')}</div>
        <p class="blurb">A ${H.name.toLowerCase()}: hold ${hst.hold}, ${hst.knots} knots, ${Ships.HULLS[H.id].hiredUpkeep} cz a day upkeep on top of her captain's wage. ${H.blurb} Choose the captain who will sail her.</p>
        <ul class="contracts">${Fleet.candidates(S).map((c) => `<li class="contract">
          <div class="c-head"><span class="c-title">Captain ${c.name}</span><span class="c-pay">${c.wage} cz a day</span></div>
          <p>Navigation ${stars(c.nav)} (faster passages) · Trade ${stars(c.trade)} (better sale prices) · ${c.nav + c.trade <= 4 ? 'green: he will learn at sea and in the market' : 'seasoned'}</p>
          <div class="row"><button class="primary" data-hire="${c.id}" ${S.purse < H.price ? 'disabled' : ''}>Buy a ${H.name.toLowerCase()} and hire him</button></div>
        </li>`).join('')}</ul>
        ${S.purse < H.price ? `<p class="foot">You need ${H.price.toLocaleString()} cz in your purse.</p>` : ''}`;
    } else {
      yard = `<p class="foot">The ${homeName(S)} shipyard will build a ship for a captain: a caravel costs ${Fleet.SHIP_COST.toLocaleString()} cz.</p>`;
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
      <li><b>Corsairs</b> prowl off Morocco, the Algarve and the Canaries. When challenged, run, fight or pay. Beat a galley and you can plunder her, and the crown pays a bounty for her in any Portuguese port; but plundering makes your name feared and draws more of them, while avoiding fights calms the seas. Fighting men and boarding nets from the shipyard improve your odds. Battle damage slows you until a shipwright in Lisbon, Lagos or Funchal repairs it.</li>
      <li><b>The pilot's work:</b> your instruments help on their own, but at sea you can also do the pilot's work yourself, each once a passage, for a bonus that lasts until you make port. A miss costs nothing.
        <b>Take a sight</b> (8 days out, 6 to go): set your sight on the Pole Star and mark as she rolls level; with an astrolabe (1485), shoot the noon sun instead, keeping its light through both sights as it swings, and with Zacuto's almanac (1496) work the latitude from the table. A good sight is 5% faster, a fine one 10%.
        <b>Keep the traverse board</b> (3 days out, 4 to go): peg each course the helmsman calls, 3% or 5% faster.
        <b>Heave the lead</b> (near a harbour where she must lie off): call the bottom as the lead touches, and she anchors closer: her boats work half as fast again, or twice as fast.</li>
      <li><b>Charts:</b> the crown pays ${CHART_REWARD} cz for each new port or island group, on your return to ${homeName(S)}.</li>
    </ul>
    <p class="fine">Captain's notes explain each of these as it first matters. The rest, in full:</p>
    <details class="help-more"><summary>Contracts and standing</summary>
    <ul class="help">
      <li><b>Contracts</b> open up at 500 cz. Completing them builds standing; missing deadlines costs it.</li>
      <li><b>Standing</b> brings better pay, better prices in Portuguese ports, the right to command hired ships, and bigger hulls at the shipyard.</li>
    </ul></details>
    <details class="help-more"><summary>Your ship</summary>
    <ul class="help">
      <li><b>Your ship:</b> the ship register (S, or <i>Ship</i>) shows your flagship, ships on order and the hulls ahead. The Lisbon shipyard refits her (sails, rig, guns, stores, colours), trades her up for a bigger hull, or builds one to order; Lagos and Funchal refit. A nau can be ordered from 1466 and is delivered from 1470; later come the galleon and the great Nau da Índia.</li>
      <li><b>Arriving:</b> your ship sails into each port in a short scene. Tap to skip it; choose every port, first visits only or off in the ship register.</li>
    </ul></details>
    <details class="help-more"><summary>Harbours and rivers</summary>
    <ul class="help">
      <li><b>Your calling:</b> after your first voyage you choose to be a free merchant, a captain of the crown or a privateer. Three ambitions under the date show what to aim for; finishing them earns money, standing and merit, and merit raises your rank, which pays (better prices, bigger rewards or bigger prizes). You can change calling freely in the first year; after that it costs more the longer you have followed it.</li>
      <li><b>Rival houses:</b> the Houses tab ranks you against the great merchant houses. Every port's trade is shared between its merchants, the houses and you; trade there to grow your share. A ring round a port shows who leads it. Weakened houses can be ruined, or bought out once you are worth twice as much.</li>
      <li><b>Port works:</b> in any port you trade with, the Port works button builds a quay (any ship berths, cargo moves twice as fast), a warehouse (store cargo), a trading post (better prices and its own earnings), a fort (keeps corsairs off and halves the rival houses' sway), a shipyard (refits) or a church and hospital (standing). Each takes weeks, costs upkeep monthly and raises your share of the port's trade.</li>
      <li><b>Draft:</b> a laden ship sits deeper. Where she draws more than the harbour has, she anchors offshore and her boats ferry the cargo: some days, and a small fee to the boatmen. A nau keeps outside the Arguin banks. River bars rise in the rains and fall in the dry season.</li>
      <li><b>Up the Gambia:</b> Cantor, far upriver, trades gold and ivory from the caravans and pays well for salt. Only a shallow ship gets there: a barca, or a caravel not too deeply laden.</li>
      <li><b>Ports grow:</b> with their history and with the trade through them. A bigger port has a deeper market, and some build quays that let deeper ships come in. The market panel shows each port's size.</li>
    </ul></details>
    <details class="help-more"><summary>Your fleet and time away</summary>
    <ul class="help">
      <li><b>Your fleet:</b> a hired captain runs a trade route for you, paid from your purse.</li>
      <li><b>Captains learn:</b> most men on the quay are green (one or two stars) and cheap; a seasoned man asks more. Navigation grows with days at sea, faster in the tropics and beyond the Cape; trade with every cargo sold. A season with the pilots at Lagos or a factor in Lisbon buys a star sooner (to four; the fifth is earned). A captain who has grown asks for a raise: refuse and his loyalty falls.</li>
      <li><b>The ledger</b> accounts for every cruzado in and out. Your own dealings are entered at once. A hired captain's are entered when you are in any port on his route, so until then part of your purse is not yet accounted for.</li>
      <li><b>Time away:</b> if you have hired captains and your own ship is in port, the world moves on while you are gone: at a tenth of its usual pace at first, more slowly after a few weeks, up to ${OFFLINE_MAX_DAYS} days. Contract deadlines wait for you. A night's sleep or a working day is safe; stay away longer than ${Fleet.STRAY_AFTER_HOURS} hours and captains start to stray (skimming, then going ashore), and after ${STANDING_FADES_AFTER_HOURS} hours your standing starts to fade.</li>
    </ul></details>
    <details class="help-more"><summary>History and the Indies</summary>
    <ul class="help">
      <li><b>The road to the Indies:</b> history moves on as you sail. Diogo Cão reaches the Kongo (1483), São Tomé is settled (1486), Dias rounds the Cape (1488), da Gama comes home from India (1499) and Cabral finds Brazil (1500); each opens new ports. The chart ends beyond the Cape: sail to its edge to go on to <b>Calicut</b>, months away across the Indian Ocean. Go with the monsoon (round the Cape June to August, leave India December to February) or pay for it in days, scurvy and storms. Hired captains can sail there too.</li>
    </ul></details>
    <details class="help-more"><summary>Rivals and the crown</summary>
    <ul class="help">
      <li><b>Rivals and the crown:</b> where trade pays, others follow. Rival merchants reach each part of the coast in their time, and crowd onto any route you work hard; they narrow the gap between where a good is cheap and where it is dear, so old routes pay less and new frontiers pay best. And once your gains pass 3,000 cz a year the crown's officials take a share each New Year (10%, then 20% over 10,000, 30% over 25,000), less for a man of renown. The Ledger shows this year's reckoning so far.</li>
    </ul></details>
    <details class="help-more"><summary>Wealth and honours</summary>
    <ul class="help">
      <li><b>Your house:</b> once your purse passes 5,000 cz, the House panel in Lisbon offers what a rich merchant bought for honour: a house on the Rua Nova, a quinta at Sintra, a family chapel, knighthood of the Order of Christ, a place in the Royal Household, loans to the crown, a palace on the Tagus. They bring renown and titles, some cost upkeep, and none earns its price back.</li>
      <li><b>Investments:</b> once you are Respected, found a <b>feitoria</b> in a port: a factor of your own gets you better prices there and finds you work, for his wages. From 1500, buy shares in the crown's India fleet in Lisbon: paid out when it comes home, if it comes home.</li>
    </ul></details>
    <h3>Saving</h3>
    <ul class="help">
      <li><b>On this device</b> your game saves by itself as you play.</li>
      <li><b>Cloud save:</b> tap the cloud button to get a save code. Enter it on another device to continue there; both stay in sync. A green dot means synced, red means it needs attention.</li>
    </ul>
    <p class="foot">Keyboard: space pause · 1 2 3 speed · P price book · L ledger · N notices · S ship register · W winds · Esc close.</p>`;
}

// Captain's notes: a nudge through the first voyages, then one short note for each part of the
// game as it first matters (shown until dismissed with ×; 'No more notes' turns them all off).
// Each later note: [key, when it applies, text].
const NOTES = [
  ['contracts', () => S.contracts?.unlocked, 'Contracts are open: merchants in each port post jobs (the Contracts tab). Deliver on time and your standing rises; standing lets you hire captains and buy bigger ships.'],
  ['fleet', () => Contracts.perks(S).maxShips > 0 && !S.fleet.ships.length, `Your standing lets you hire a captain. In ${homeName(S)}, open Fleet: buy him a ship and give him a route, and he trades on his own with your purse.`],
  ['captains', () => S.fleet.ships.some((x) => x.captain.nav >= 2 || x.captain.trade >= 2 || x.captain.asks), 'Your captains learn: stars for navigation come with days at sea, for trade with every cargo sold. One who grows good will ask for a raise. You can also send him to train (Fleet).'],
  ['accounts', () => S.fleet.ships.length > 0, 'Your captains\' dealings enter your Ledger when you are in any port on their route. Until then part of your purse is "not yet accounted for".'],
  ['corsairs', () => ['won', 'lost', 'paid', 'fled'].some((k) => (S.pirates?.[k] || 0) > 0), 'Corsairs: running depends on your speed; crossbowmen, men-at-arms and boarding nets (the shipyard\'s Arms tab) improve your fighting odds. Beat a galley and the crown pays a bounty for her.'],
  ['hull', () => (S.hull ?? 100) < 70, `A worn hull is slower, and below 60% she leaks and spoils cargo. The yards of ${yardNames()} make her sound; anywhere else her crew can careen her on a beach.`],
  ['boats', () => S.ship.offshore, 'She draws too much for this harbour, so she lies at the anchorage and her boats ferry the cargo: some days, and a small fee. Shallow hulls lie alongside.'],
  ['rivals', () => S.ship.docked && Competition.level(S, S.ship.docked) >= 0.15, 'Rival merchants trade here now. On busy, old routes they narrow the gap between where goods are cheap and where they are dear: new frontiers pay best.'],
  ['crown', () => (S.taxes?.last?.tax || 0) > 0, 'The crown has taken its share of last year\'s gains (the Ledger shows this year\'s so far). Renown, from your house in Lisbon, lowers it.'],
  ['age', () => Ships.lifeShare(S.ship.hull, Ships.serviceYears(S.ship, S.day)) >= 0.7, `Your ship is growing old: the yards can no longer make her fully sound. A great rebuild in ${homeName(S)} gives back years, twice at most; in the end she must be replaced.`],
  ['house', () => S.ship.docked === home(S) && S.purse >= 5000, `Rich enough for honours: Your house, in the ${homeName(S)} market panel. A house, a knighthood, a chapel: renown, and a smaller share for the crown.`],
  ['history', () => S.discovered.mpinda || S.discovered.saotome, 'History moves on: as the explorers come home, new ports open and appear on your chart. Watch the notices.'],
  ['indies', () => S.discovered.calicut, 'The way to the Indies is open. Sail to the edge of the chart beyond the Cape, and on to Calicut. Go with the monsoon: round the Cape June to August, leave India December to February.'],
];

export function tipText() {
  if (!S.tips || S.tips.off || !ui.introDone || ui.modal) return null;
  ui.tipKey = null;
  const sh = S.ship;
  const seen = S.tips.seen || {};
  if (firstActive()) return sh.docked ? null : firstAtSea(); // the first voyage box says it in port
  if (!S.contracts?.unlocked) {
    if (seen.early) return null;
    ui.tipKey = 'early';
    if (sh.docked) {
      if (held() === 0 && S.voyages === 0) return 'Buy ten casks of wine or bolts of wool cloth: they sell for close to double in the Canaries and further south. Not a full hold: a small port\'s price falls with every one you sell.';
      if (held() > 0 && S.voyages === 0) return 'Now set sail: tap Sail to…, or a port on the chart. Lanzarote is an easy first run.';
      if (held() > 0) return 'Sell where the price beats what you paid (shown under Hold); watch it fall as you sell, and keep the rest for a better market. Then load something the next port wants.';
      return 'Open the Price book: the harbourmaster suggests runs from the prices you have seen.';
    }
    if (S.voyages === 0) return 'The arrows show the wind. Running before it is fast; beating into it is slow.';
    return 'Reach 500 cruzados and Prince Henry will notice you.';
  }
  for (const [key, when, text] of NOTES) {
    if (seen[key]) continue;
    let applies = false;
    try { applies = !!when(); } catch { /* not readable yet */ }
    if (applies) { ui.tipKey = key; return text; }
  }
  return null;
}

export function renderTip() {
  const t = tipText();
  const el = $('tip');
  el.hidden = !t;
  if (t && $('tip-text').textContent !== t) $('tip-text').textContent = t;
  // beside an open panel the note narrows; on phones the panel fills the screen, so it shortens
  // by the note's height instead (style.css)
  const open = !$('panel').hidden;
  const narrow = window.matchMedia('(max-width: 700px)').matches;
  if (document.body.classList.contains('panel-open') !== open) document.body.classList.toggle('panel-open', open);
  const h = open && narrow && t ? `${el.offsetHeight + 6}px` : '0px';
  if (document.body.style.getPropertyValue('--tip-h') !== h) document.body.style.setProperty('--tip-h', h);
}

// Market, Price book and other tabs, shown while in port so either is one click away.
// The trading panels, one tab each. In port: the market and Set sail too.
export function tabs(active) {
  const docked = !!S.ship.docked;
  return `<nav class="tabs" role="tablist">
      ${docked ? `<button role="tab" data-tab="port" aria-selected="${active === 'port'}" class="${active === 'port' ? 'on' : ''}">Market</button>` : ''}
      <button role="tab" data-tab="prices" aria-selected="${active === 'prices'}" class="${active === 'prices' ? 'on' : ''}">Price book</button>
      <button role="tab" data-tab="ledger" aria-selected="${active === 'ledger'}" class="${active === 'ledger' ? 'on' : ''}">Ledger</button>
      ${housesOpen() ? `<button role="tab" data-tab="houses" aria-selected="${active === 'houses'}" class="${active === 'houses' ? 'on' : ''}">Houses</button>` : ''}
      ${storyOn() || S.story?.letters?.length ? `<button role="tab" data-tab="rutter" aria-selected="${active === 'rutter'}" class="${active === 'rutter' ? 'on' : ''}">Rutter</button>` : ''}
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

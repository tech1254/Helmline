// Voyages and port calls: corsairs, planning a course, docking, milestones.

import { COS0, D2R, PORTS, windAt, sailFactor, bearing, distNm, angleDiff, findPath } from './world.js';
import { GOODS } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Accounts from './accounts.js';
import * as Pirates from './pirates.js';
import * as Fleet from './fleet.js';
import { CHART_REWARD, MILESTONES, SHIP } from './config.js';
import { S, market, ui } from './state.js';
import { save } from './save.js';
import { cloudSync } from './cloudsync.js';
import { H, W, cam, clampCam } from './view.js';
import { advanceTime, flushRot, report, shipWind } from './sim.js';
import { $, cz, fmtDate } from './util.js';
import { renderPanel, setSpeed } from './panels.js';
import { log, passage } from './pricebook.js';
import { confirmDialog } from './dialog.js';
import { addNotice, hint, toast } from './notices.js';

// ---- Corsairs ----------------------------------------------------------------------

export function openEncounter(enc) {
  const { knots } = shipWind();
  const o = Pirates.odds(S, enc, knots);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const t = Pirates.tribute(S, enc);
  confirmDialog({
    title: enc.big ? 'A great corsair galley!' : 'Corsairs!',
    body: `<p>${enc.big ? 'A big Barbary galley, packed with fighting men,' : 'A Barbary galley, oars flashing,'} is closing on you off ${enc.where}.</p>
      <dl class="facts">
        <dt>Run for it</dt><dd>${pct(o.run)} chance to escape at ${knots.toFixed(1)} kn</dd>
        <dt>Fight</dt><dd>${pct(o.fight)} chance to win${S.hull < 100 ? `, hull at ${S.hull}%` : ''}</dd>
        <dt>Pay tribute</dt><dd>${t} cz, and they let you pass</dd>
      </dl>
      <p class="fine">Fighting makes your name feared, and corsairs seek you out. Avoiding fights makes the seas around you calmer.</p>
      <div class="row choice">
        <button data-modal-action="pay">Pay ${t} cz</button>
        <button data-modal-action="fight">Fight</button>
        <button class="primary" data-modal-action="run">Run</button>
      </div>`,
    ok: null,
    cancel: false,
    kind: 'encounter',
    actions: {
      run: () => settleEncounter(enc, 'run', knots),
      fight: () => settleEncounter(enc, 'fight', knots),
      pay: () => settleEncounter(enc, 'pay', knots),
    },
  });
}

export function settleEncounter(enc, choice, knots) {
  const r = Pirates.resolve(S, enc, choice, knots);
  log(r.lines[r.lines.length - 1]);
  for (const line of r.lines) addNotice(line, r.kind);
  afterEncounter(r);
  renderPanel();
  save();
}

const dayText = (d) => { const n = Math.max(1, Math.round(d)); return `${n} ${n === 1 ? 'day' : 'days'}`; };

// After a brush with the corsairs the game pauses, so the captain can take stock: his hull,
// his purse, what his contracts still need, and whether to hold his course or turn back.
function afterEncounter(r) {
  const resume = ui.speed || ui.lastSpeed || 1;
  setSpeed(0);
  const sh = S.ship;
  const goingTo = sh.dest?.port ? PORTS.find((p) => p.id === sh.dest.port) : null;
  const left = sh.route.length ? estimateVoyage(sh.route) : null;
  // the nearest shipyard, by sailing time
  let yard = null;
  for (const pid of Pirates.REPAIR_PORTS) {
    if (pid === sh.dest?.port) continue;
    const plan = planCourse(PORTS.find((p) => p.id === pid).lon, PORTS.find((p) => p.id === pid).lat, pid, false);
    if (!plan) continue;
    const days = estimateVoyage(plan.route).days;
    if (!yard || days < yard.days) yard = { pid, plan, days };
  }
  const held = GOODS.map((g) => (S.cargo[g.id] ? `${S.cargo[g.id]} ${g.unit} of ${g.name.toLowerCase()}` : '')).filter(Boolean);
  const contracts = (S.contracts?.active || []).map((c) => {
    const daysLeft = c.deadline == null ? null : Math.floor(c.deadline - S.day);
    const due = daysLeft == null ? 'no deadline' : `due in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
    return `<li><b>${c.title}</b>: ${due}${c.good && c.qty ? `, you hold ${S.cargo[c.good] || 0} of ${c.qty}` : ''}.</li>`;
  }).join('');
  const title = /escaped/i.test(r.lines.join(' ')) ? 'You got away' : /pay the corsairs/i.test(r.lines.join(' ')) ? 'Tribute paid' : r.kind === 'discover' ? 'The corsairs are beaten off' : 'The corsairs have had their way';
  confirmDialog({
    title,
    body: `${r.lines.map((l) => `<p>${l}</p>`).join('')}
      <dl class="facts">
        <dt>Hull</dt><dd class="${S.hull < 50 ? 'warn' : ''}">${S.hull}%${S.hull < 100 ? `, sailing at ${Math.round(Pirates.hullFactor(S) * 100)}% speed` : ''}</dd>
        <dt>Purse</dt><dd>${Math.floor(S.purse).toLocaleString()} cz</dd>
        <dt>Hold</dt><dd>${held.length ? held.join(', ') : 'empty'}</dd>
        ${left ? `<dt>${goingTo ? goingTo.name : 'Your mark'}</dt><dd>about ${dayText(left.days)} on</dd>` : ''}
        ${yard ? `<dt>${PORTS.find((p) => p.id === yard.pid).name} (shipyard)</dt><dd>about ${dayText(yard.days)} back</dd>` : ''}
      </dl>
      ${contracts ? `<p class="fine">Your contracts:</p><ul class="help">${contracts}</ul>` : ''}
      <p class="fine">The game is paused.</p>
      ${yard ? `<div class="row choice"><button data-modal-action="back">Turn back for ${PORTS.find((p) => p.id === yard.pid).name}</button></div>` : ''}`,
    ok: left ? 'Hold course' : 'Carry on',
    cancel: 'Stay paused',
    kind: 'summary',
    actions: { back: () => { if (yard) confirmVoyage(yard.plan); } },
    onOk: () => setSpeed(resume),
  });
}

export function waitInPort(days) {
  const pid = S.ship.docked;
  if (!pid) return;
  for (let i = 0; i < days * 4; i++) advanceTime(0.25, false);
  observe(pid);
  report(Events.hearNews(S, pid));
  hint(`${days === 7 ? 'A week' : `${days} days`} pass${days === 7 ? 'es' : ''} in ${PORTS.find((p) => p.id === pid).name}.`, 'port');
}

export function replan(dest) {
  const path = findPath(S.ship.lon, S.ship.lat, dest.lon, dest.lat);
  if (!path) return false;
  S.ship.route = path;
  return true;
}

// Work out a course to a point (optionally a port), appended to the current one if `append`.
export function planCourse(lon, lat, portId, append) {
  const sh = S.ship;
  const keep = append && sh.route.length ? sh.route : [];
  const fromLon = keep.length ? keep[keep.length - 1][0] : sh.lon;
  const fromLat = keep.length ? keep[keep.length - 1][1] : sh.lat;
  const path = findPath(fromLon, fromLat, lon, lat);
  if (!path) return null;
  return { route: keep.concat(path), dest: { lon, lat, port: portId || null } };
}

export function setCourse(lon, lat, portId, append) {
  const plan = planCourse(lon, lat, portId, append);
  if (!plan) { hint('The pilot can find no passage there.'); return; }
  applyCourse(plan);
}

export function applyCourse(plan) {
  S.ship.route = plan.route;
  S.ship.dest = plan.dest;
  if (S.ship.docked) undock();
}

// Sail the route on paper, with the winds as they stand today, to estimate the passage.
export function estimateVoyage(route, from = S.ship, startDay = S.day) {
  let lon = from.lon, lat = from.lat, day = startDay, nm = 0, hot = 0;
  for (const [tl, ta] of route) {
    for (let guard = 0; guard < 20000; guard++) {
      const rem = distNm(lon, lat, tl, ta);
      if (rem < 0.5) break;
      const b = bearing(lon, lat, tl, ta);
      const w = windAt(lon, lat, day);
      const f = sailFactor(angleDiff(b, w.from)) * (0.45 + 0.55 * w.strength);
      const perDay = SHIP.knots * Pirates.hullFactor(S) * 24 * f;
      const step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(b * D2R)) / 60;
      lon += (step * Math.sin(b * D2R)) / (60 * Math.cos(lat * D2R));
      day += step / perDay;
      if (lat < 26) hot += step / perDay;
      nm += step;
    }
    lon = tl; lat = ta;
  }
  const days = day - startDay;
  return { days, nm, hot, cost: Math.ceil(days * SHIP.upkeep) };
}

// Zoom and pan so every point fits on screen, leaving room for the dialog.
export function frameView(points) {
  const xs = points.map(([x]) => x * COS0), ys = points.map(([, y]) => -y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const narrow = W < 700;
  const availW = W - (narrow ? 40 : 520), availH = H - (narrow ? 420 : 200);
  cam.scale = Math.min(cam.scale, Math.max(1, Math.min(availW / Math.max(0.5, x1 - x0), Math.max(80, availH) / Math.max(0.5, y1 - y0))));
  cam.x = (x0 + x1) / 2 - (narrow ? 0 : 230 / cam.scale);
  cam.y = (y0 + y1) / 2 + (narrow ? 150 / cam.scale : 0);
  clampCam();
}

export function confirmVoyage(plan) {
  frameView([[S.ship.lon, S.ship.lat], ...plan.route]);
  const { days, nm, cost } = estimateVoyage(plan.route);
  const to = plan.dest.port ? PORTS.find((p) => p.id === plan.dest.port).name : 'the mark on the chart';
  const left = Math.floor(S.purse) - cost;
  const d = Math.max(1, Math.round(days));
  confirmDialog({
    title: S.ship.docked || !S.ship.route.length ? `Set sail for ${to}?` : `Change course for ${to}?`,
    body: `<dl class="facts">
        <dt>Passage</dt><dd>about ${d} ${d === 1 ? 'day' : 'days'} · ${Math.round(nm).toLocaleString()} nm</dd>
        <dt>Arrival</dt><dd>around ${fmtDate(S.day + days)}</dd>
        <dt>Wages</dt><dd>${cost.toLocaleString()} cz (${SHIP.upkeep} cz a day)</dd>
        <dt>Purse on arrival</dt><dd class="${left < 0 ? 'warn' : ''}">${left.toLocaleString()} cz</dd>
      </dl>
      ${left < 0 ? '<p class="warn">You cannot cover the wages for this passage. The crew will sail on credit, but sell cargo soon.</p>' : ''}
      <p class="fine">Estimated from today's winds. They shift as you sail.</p>`,
    ok: 'Set sail',
    kind: 'voyage',
    preview: plan.route,
    onOk: () => applyCourse(plan),
  });
}

export function dock(portId) {
  const sh = S.ship;
  const p = PORTS.find((x) => x.id === portId);
  sh.docked = portId;
  sh.route = [];
  sh.dest = null;
  sh.lon = p.lon; sh.lat = p.lat;
  S.voyages++;
  observe(portId);
  Accounts.closeVoyage(S, portId);
  let msg = `Dropped anchor at <b>${p.name}</b>.`;
  if (portId === 'lisbon' && S.unpaidCharts.length) {
    const reward = S.unpaidCharts.length * CHART_REWARD;
    S.purse += reward;
    Accounts.record(S, { kind: 'charts', amount: reward, text: `Charts of ${S.unpaidCharts.join(', ')}` });
    msg = `The crown buys your charts of ${S.unpaidCharts.join(', ')} for <b>${reward} cz</b>.`;
    log(`Sold charts to the crown for ${reward} cz.`);
    S.unpaidCharts = [];
  }
  toast(msg, 'port');
  flushRot();
  report(Contracts.onDock(S, portId));
  report(Events.hearNews(S, portId));
  const heard = Accounts.reveal(S, portId, S.fleet.ships);
  const prices = Fleet.sharePrices(S, portId, S.fleet.ships).filter((x) => x !== portId);
  const priceText = prices.length ? ` Their notes bring fresh prices from ${prices.map((x) => PORTS.find((q) => q.id === x).name).join(', ')} to your price book.` : '';
  if (heard) {
    const net = Math.round(heard.net);
    toast(`The factor in ${p.name} has accounts from the <b>${heard.ships.join(', ')}</b>: ${heard.count} ${heard.count === 1 ? 'entry' : 'entries'}, ${net >= 0 ? '+' : ''}${net.toLocaleString()} cz, now in your ledger.${priceText}`, 'port');
    log(`Accounts from ${heard.ships.join(', ')} received in ${p.name} (${net >= 0 ? '+' : ''}${net} cz).`);
  } else if (prices.length) {
    toast(`Your captains' notes bring fresh prices from ${prices.map((x) => PORTS.find((q) => q.id === x).name).join(', ')} to your price book.`, 'port');
  }
  const shut = Events.closure(S, portId);
  if (shut) toast(`<b>${p.name} is closed:</b> ${Events.template(shut).title.toLowerCase()}. You may anchor, but not trade.`, '');
  checkMilestones();
  ui.panelMode = 'port';
  renderPanel();
  save();
  cloudSync();
}

export function undock() {
  S.ship.lastPort = S.ship.docked;
  S.ship.docked = null;
  if (ui.panelMode === 'port') ui.panelMode = null;
  renderPanel();
}

export function observe(portId) {
  S.seen[portId] = { day: S.day, prices: market.observe(portId) };
}

export function unlockContracts() {
  const m = Contracts.maybeUnlock(S);
  if (!m) return;
  toast(m.html, m.kind);
  log(m.log);
  renderPanel();
  save();
}

export function checkMilestones() {
  unlockContracts();
  for (const m of MILESTONES) {
    if (S.purse >= m && !S.milestones.includes(m)) {
      S.milestones.push(m);
      toast(`Your purse passes <b>${m.toLocaleString()} cruzados</b>. The Lisbon merchants take notice.`, 'discover');
      log(`Purse passed ${m.toLocaleString()} cz.`);
    }
  }
}

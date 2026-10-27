// What the panel buttons and top-bar controls do.

import { PORTS, findPath } from './world.js';
import { GOODS } from './economy.js';
import * as Contracts from './contracts.js';
import * as Fleet from './fleet.js';
import * as Cloud from './cloud.js';
import * as Accounts from './accounts.js';
import * as Pirates from './pirates.js';
import { WAGE_RESERVE_DAYS } from './config.js';
import * as Ships from './ships.js';
import { S, market, ui } from './state.js';
import { newGame, save } from './save.js';
import { cloudSync, loadFromCloud, renderCloudButton, startCloudSave } from './cloudsync.js';
import { cam, centerOn, clampCam } from './view.js';
import { report } from './sim.js';
import { checkMilestones, confirmVoyage, noPassage, observe, planCourse, waitInPort } from './voyage.js';
import { menuAction } from './dock.js';
import { openShips } from './shipyard.js';
import { closeFeedback, feedbackInput, openFeedback, submitFeedback } from './feedback.js';
import { $, cz, fmtDate, held } from './util.js';
import { draftFor, renderPanel, renderTip, routeDrafts, routeSummary, setSpeed, togglePanel, toggleWind } from './panels.js';
import { log, passage, quote, tradeFacts } from './pricebook.js';
import { confirmDialog } from './dialog.js';
import { hint, toast } from './notices.js';

// Route editor: keep the draft in step with the selects.

export function keepDetailsOpen(shipId) {
  const det = document.querySelector(`[data-ship="${shipId}"] details`);
  if (det) det.open = true;
}

export function routeProblem(d, ship) {
  if (d.stops.length < 2) return 'A route needs at least two stops.';
  const H = Ships.HULLS[ship?.hull || 'caravel'];
  if (H?.coastal) {
    for (let i = 0; i < d.stops.length; i++) {
      const a = PORTS.find((p) => p.id === d.stops[i].port), b = PORTS.find((p) => p.id === d.stops[(i + 1) % d.stops.length].port);
      if (a && b && !findPath(a.lon, a.lat, b.lon, b.lat, 1, true)) return `A ${H.name.toLowerCase()} keeps to the coast and cannot sail from ${a.name} to ${b.name}. Choose coastal ports, or give her captain a bigger ship.`;
    }
  }
  for (let i = 0; i < d.stops.length; i++) {
    if (d.stops[i].port === d.stops[(i + 1) % d.stops.length].port) return `Stops ${i + 1} and ${((i + 1) % d.stops.length) + 1} are the same port. Pick another, or remove one.`;
  }
  if (!d.stops.some((st) => st.orders.some((o) => o.act === 'buy'))) return 'Add at least one Buy order somewhere on the route.';
  if (!d.stops.some((st) => st.orders.some((o) => o.act === 'sell'))) return 'Add at least one Sell order, or the captain will never sell his cargo.';
  const total = d.stops.map((st) => st.orders.filter((o) => o.act === 'buy').reduce((n, o) => n + o.pct, 0));
  if (total.some((n) => n > 100)) return 'One stop buys more than 100% of the hold.';
  return null;
}

export function zoomBy(k) {
  cam.scale *= k;
  clampCam();
}

export function initActions() {
  $('panel').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.closest('form')) return; // forms handle their own submit
    if (t.dataset.feedback) { openFeedback(t.dataset.feedback); return; }
    if (t.dataset.menu && menuAction(t.dataset.menu)) return;
    if (t.hasAttribute('data-feedback-close')) { closeFeedback(); return; }
    const pid = S.ship.docked;
    if ((t.dataset.buy || t.dataset.sell) && pid && market.closed(pid)) {
      hint('The port is closed to trade.');
      return;
    }
    if (t.dataset.buy && pid) {
      const g = t.dataset.buy;
      const st = Ships.flagStats(S);
      const free = st.hold - held();
      const max = t.dataset.n === 'max';
      const n = max ? free : +t.dataset.n;
      // "Max" keeps back two weeks of wages so the crew is paid on the way.
      const budget = Math.floor(S.purse - (max ? Math.min(WAGE_RESERVE_DAYS * st.upkeep, Math.max(0, S.purse - market.buyPrice(pid, g))) : 0));
      const doBuy = () => {
        const { bought, cost } = market.buy(pid, g, n, budget, free);
        S.cargo[g] += bought; S.paid[g] += cost; S.purse -= cost;
        Accounts.record(S, { kind: 'purchase', good: g, qty: bought, amount: -cost });
        observe(pid);
      };
      if (n > 1) {
        const q = quote(() => market.buy(pid, g, n, budget, free));
        if (!q.bought) { hint('You cannot afford any more of that.'); return; }
        const good = GOODS.find((x) => x.id === g);
        confirmDialog({
          title: `Buy ${q.bought} ${good.unit} of ${good.name.toLowerCase()}?`,
          body: tradeFacts(q.bought, q.cost, -q.cost, `In the hold after: ${S.cargo[g] + q.bought} ${good.unit}`),
          ok: `Buy for ${q.cost.toLocaleString()} cz`,
          onOk: doBuy,
        });
        return;
      }
      doBuy();
    } else if (t.dataset.sell && pid) {
      const g = t.dataset.sell;
      const n = t.dataset.n === 'all' ? S.cargo[g] : Math.min(+t.dataset.n, S.cargo[g]);
      const doSell = () => {
        const avgCost = S.cargo[g] ? S.paid[g] / S.cargo[g] : 0;
        const { sold, income } = market.sell(pid, g, n);
        S.cargo[g] -= sold; S.paid[g] = Math.max(0, S.paid[g] - avgCost * sold); S.purse += income;
        Accounts.record(S, { kind: 'sale', good: g, qty: sold, amount: income });
        if (!S.cargo[g]) S.paid[g] = 0;
        observe(pid);
        checkMilestones();
      };
      if (n > 1) {
        const q = quote(() => market.sell(pid, g, n));
        const good = GOODS.find((x) => x.id === g);
        const paid = Math.round((S.paid[g] / S.cargo[g]) * n);
        const profit = q.income - paid;
        confirmDialog({
          title: `Sell ${n} ${good.unit} of ${good.name.toLowerCase()}?`,
          body: tradeFacts(n, q.income, q.income, paid ? `Profit on what you paid: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} cz` : ''),
          ok: `Sell for ${q.income.toLocaleString()} cz`,
          onOk: doSell,
        });
        return;
      }
      doSell();
    } else if ((t.hasAttribute('data-repair') || t.hasAttribute('data-careen')) && pid) {
      const beach = t.hasAttribute('data-careen');
      const q = Pirates.repair(S, beach);
      if (q.days) waitInPort(q.days);
      toast(beach ? `Her crew careen the <b>${S.ship.name}</b> on the beach: ${q.days} days and ${q.cost} cz, and she is at ${q.to}%.` : `The shipwrights make the <b>${S.ship.name}</b> sound again: ${q.days} days in the yard, ${q.cost} cz.`, 'port');
      log(`${beach ? 'Careened' : 'Repaired'} the hull: ${q.cost} cz, ${q.days} days.`);
    } else if (t.hasAttribute('data-cloud-create')) {
      startCloudSave();
      return;
    } else if (t.hasAttribute('data-cloud-sync')) {
      Cloud.cloud.status = Cloud.cloud.status === 'conflict' ? 'idle' : Cloud.cloud.status;
      cloudSync(true);
      return;
    } else if (t.hasAttribute('data-cloud-copy')) {
      navigator.clipboard?.writeText(Cloud.cloud.code).then(() => hint('Save code copied.'), () => hint(`Your code: <b>${Cloud.cloud.code}</b>`));
      return;
    } else if (t.hasAttribute('data-cloud-unlink')) {
      confirmDialog({
        title: 'Stop syncing this device?',
        body: `<p>Your voyage stays on this device and in the cloud, but they will no longer stay in step. You can link again with the code <b>${Cloud.cloud.code}</b>.</p>`,
        ok: 'Stop syncing',
        onOk: () => { Cloud.unlink(); renderCloudButton(); },
      });
      return;
    } else if (t.hasAttribute('data-wait') && pid) {
      waitInPort(7);
    } else if (t.dataset.ships) {
      ui.panelMode = S.ship.docked ? 'port' : null;
      renderPanel();
      openShips(t.dataset.ships);
      return;
    } else if (t.dataset.hireHull) {
      ui.hireHull = t.dataset.hireHull;
    } else if (t.dataset.hire) {
      const cap = (S.fleet.candidates?.list || []).find((c) => c.id === +t.dataset.hire);
      const H = Ships.HULLS[ui.hireHull] || Ships.HULLS.caravel;
      if (cap) {
        confirmDialog({
          title: `Buy a ${H.name.toLowerCase()} for Captain ${cap.name}?`,
          body: `<dl class="facts"><dt>${H.name}</dt><dd>${H.price.toLocaleString()} cz</dd><dt>Hold</dt><dd>${Ships.stats({ hull: H.id }).hold}</dd><dt>Running cost</dt><dd>${cap.wage + H.hiredUpkeep} cz a day at sea, half that in port</dd><dt>Purse after</dt><dd>${Math.floor(S.purse - H.price).toLocaleString()} cz</dd></dl><p>Then give him a route between two ports.</p>`,
          ok: `Buy for ${H.price.toLocaleString()} cz`,
          onOk: () => {
            const ship = Fleet.buyShip(S, cap.id, Contracts.perks(S).maxShips, H.id);
            if (ship) { toast(`The <b>${ship.name}</b> is yours, with Captain ${cap.name} in command. Give her a route.`, 'discover'); log(`Bought the ${ship.name}; hired Captain ${cap.name}.`); }
          },
        });
        return;
      }
    } else if (t.dataset.draft) {
      const card = t.closest('[data-ship]');
      const ship = S.fleet.ships.find((x) => x.id === +card.dataset.ship);
      const d = draftFor(ship);
      const i = +(t.closest('[data-stop-i]')?.dataset.stopI ?? -1);
      const j = +(t.closest('[data-order-j]')?.dataset.orderJ ?? -1);
      const act = t.dataset.draft;
      if (act === 'add-stop') {
        const lastPort = d.stops[d.stops.length - 1].port;
        const nextPort = PORTS.find((p) => S.discovered[p.id] && p.id !== lastPort && p.id !== d.stops[0].port)?.id || PORTS.find((p) => S.discovered[p.id] && p.id !== lastPort).id;
        d.stops.push({ port: nextPort, orders: [{ act: 'sell', good: 'all' }] });
      } else if (act === 'del-stop' && d.stops.length > 2) d.stops.splice(i, 1);
      else if (act === 'add-order') d.stops[i].orders.push({ act: 'buy', good: 'best', pct: 50 });
      else if (act === 'del-order') d.stops[i].orders.splice(j, 1);
      else if (act === 'simple') { delete routeDrafts[ship.id]; routeDrafts[ship.id] = Fleet.simpleRoute(d.stops[0].port, d.stops[1].port); }
      renderPanel();
      keepDetailsOpen(ship.id);
      return;
    } else if (t.dataset.route) {
      const ship = S.fleet.ships.find((x) => x.id === +t.dataset.route);
      const d = draftFor(ship);
      const problem = routeProblem(d, ship);
      if (problem) { hint(problem); keepDetailsOpen(ship.id); return; }
      report(Fleet.setRoute(S, market, ship, d));
      delete routeDrafts[ship.id];
      toast(`<b>${ship.name}</b> will run ${routeSummary(ship.route)}`, 'port');
    } else if (t.dataset.halt) {
      const ship = S.fleet.ships.find((x) => x.id === +t.dataset.halt);
      delete routeDrafts[ship.id];
      ship.route = null;
      toast(`<b>${ship.name}</b> will stop at her next port.`);
    } else if (t.dataset.tab) {
      ui.panelMode = t.dataset.tab;
    } else if (t.dataset.accept && pid) {
      const c = Contracts.accept(S, +t.dataset.accept, pid);
      if (c) { toast(`Contract taken: <b>${c.title}</b> by ${fmtDate(c.deadline)}.`, 'port'); log(`Took a contract: ${c.title}.`); }
      else hint(`You can hold at most ${Contracts.MAX_ACTIVE} contracts.`);
    } else if (t.dataset.deliver && pid) {
      const c = S.contracts.active.find((x) => x.id === +t.dataset.deliver);
      if (c && Contracts.canDeliver(S, c)) {
        const g = GOODS.find((x) => x.id === c.good);
        confirmDialog({
          title: `Deliver ${c.qty} ${g.unit} of ${g.name.toLowerCase()}?`,
          body: `<dl class="facts"><dt>Contract pays</dt><dd>${c.reward.toLocaleString()} cz</dd><dt>Purse after</dt><dd>${Math.floor(S.purse + c.reward).toLocaleString()} cz</dd><dt>Left in the hold</dt><dd>${S.cargo[c.good] - c.qty} ${g.unit}</dd></dl>`,
          ok: `Deliver for ${c.reward.toLocaleString()} cz`,
          onOk: () => { const m = Contracts.deliver(S, c); toast(m.html, m.kind); log(m.log); checkMilestones(); },
        });
        return;
      }
    } else if (t.dataset.abandon) {
      const c = S.contracts.active.find((x) => x.id === +t.dataset.abandon);
      if (c) {
        confirmDialog({
          title: 'Abandon this contract?',
          body: `<p><b>${c.title}</b></p><p>${c.patron} will remember it: your standing drops.</p>`,
          ok: 'Abandon',
          onOk: () => { Contracts.abandon(S, c); log(`Abandoned a contract: ${c.title}.`); },
        });
        return;
      }
    } else if (t.dataset.sailto) {
      const p = PORTS.find((x) => x.id === t.dataset.sailto);
      const plan = planCourse(p.lon, p.lat, p.id, false);
      if (plan) { ui.panelMode = null; confirmVoyage(plan); }
      else hint(noPassage());
    } else if (t.hasAttribute('data-prices')) {
      ui.panelMode = 'prices';
    } else if (t.hasAttribute('data-close-prices') || t.hasAttribute('data-close-ledger')) {
      ui.panelMode = S.ship.docked ? 'port' : null;
    } else if (t.hasAttribute('data-close')) {
      ui.panelMode = null;
      if (S.ship.docked) hint('Click anywhere on the chart, or a port, to set your course.');
    } else if (t.hasAttribute('data-reset')) {
      if (confirm('Abandon this voyage and start again from Lisbon in 1451?')) { newGame(); ui.panelMode = 'port'; setSpeed(1); }
    }
    renderPanel();
    save();
  });
  $('panel').addEventListener('input', (e) => { feedbackInput(e); });
  $('panel').addEventListener('submit', (e) => {
    if (e.target.closest('[data-feedback-form]')) { e.preventDefault(); submitFeedback(); return; }
    const form = e.target.closest('[data-cloud-form]');
    if (!form) return;
    e.preventDefault();
    const code = form.elements.code.value.trim();
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 12) { hint('A save code has 12 letters and numbers, like 7KQ2-MX9P-4TRD.'); return; }
    loadFromCloud(code);
  });
  $('panel').addEventListener('change', (e) => {
    if (feedbackInput(e)) return;
    if (e.target.matches('select[data-ledger-who]')) { ui.ledgerWho = e.target.value; renderPanel(); return; }
    if (e.target.matches('[data-notices-all]')) { ui.noticesAll = e.target.checked; renderPanel(); return; }
    const sel = e.target.closest('select[data-f]');
    if (!sel) return;
    const card = sel.closest('[data-ship]');
    const ship = S.fleet.ships.find((x) => x.id === +card.dataset.ship);
    const d = draftFor(ship);
    const st = d.stops[+sel.closest('[data-stop-i]').dataset.stopI];
    const o = sel.closest('[data-order-j]') ? st.orders[+sel.closest('[data-order-j]').dataset.orderJ] : null;
    if (sel.dataset.f === 'port') {
      st.port = sel.value;
      for (const x of st.orders) if (x.act === 'buy' && x.good !== 'best' && !market.sells(st.port, x.good)) x.good = 'best';
    } else if (sel.dataset.f === 'act') {
      o.act = sel.value;
      o.good = o.act === 'sell' ? 'all' : 'best';
      if (o.act === 'buy') o.pct = o.pct || 50; else delete o.pct;
    } else if (sel.dataset.f === 'good') o.good = sel.value;
    else if (sel.dataset.f === 'pct') o.pct = +sel.value;
    renderPanel();
    keepDetailsOpen(ship.id);
  });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  $('btn-fleet').addEventListener('click', () => togglePanel('fleet'));
  $('btn-register').addEventListener('click', () => openShips('register'));
  $('btn-help').addEventListener('click', () => togglePanel('help'));
  $('btn-cloud').addEventListener('click', () => togglePanel('cloud'));
  $('tip-close').addEventListener('click', () => { S.tips.off = true; renderTip(); save(); });
  $('zoom-in').addEventListener('click', () => zoomBy(1.35));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.35));
  $('btn-prices').addEventListener('click', () => togglePanel('prices'));
  $('btn-ledger').addEventListener('click', () => togglePanel('ledger'));
  $('btn-notices').addEventListener('click', () => togglePanel('notices'));
  $('btn-sail').addEventListener('click', () => togglePanel('sail'));
  $('btn-contracts').addEventListener('click', () => togglePanel('contracts'));
  $('btn-wind').addEventListener('click', toggleWind);
  $('btn-ship').addEventListener('click', () => centerOn(S.ship.lon, S.ship.lat));
  $('btn-port').addEventListener('click', () => {
    if (S.ship.docked) { ui.panelMode = 'port'; renderPanel(); } else hint('You can only trade at anchor in a port.');
  });
}

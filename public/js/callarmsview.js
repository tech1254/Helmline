// The crown's call to arms on screen (callarms.js): the box in port, the mark on the chart, and
// the fight at the mark.

import * as Call from './callarms.js';
import { GOODS } from './economy.js';
import { S, ui } from './state.js';
import { planCourse, confirmVoyage, noPassage, fightCorsairs } from './voyage.js';
import { report } from './sim.js';
import { renderPanel, setSpeed } from './panels.js';
import { save } from './save.js';
import { confirmDialog } from './dialog.js';
import { hint } from './notices.js';
import { plog } from './playlog.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const good = (id) => GOODS.find((g) => g.id === id);

// Browser tests see it only when they ask (it starts after the first voyage and adds a box).
export const callOn = () => !(navigator.webdriver && !window.helmlineCall);

export function callBox(pid) {
  if (!callOn() || !Call.active(S) || !S.ship.docked) return '';
  const C = Call.callOf(S), st = Call.stage(S), x = S.call;
  if (x.hidden === st) return `<p class="fine call-min"><button class="link" data-call-show>${C.name}</button>: ${st === 'supply' ? `supplies for ${C.supply.portName}` : C[st].label.toLowerCase()}.</p>`;
  const at = { supply: 0, patrol: 1, raid: 2 }[st];
  const cls = (i) => (i < at ? 'did' : i === at ? 'now' : 'next');
  const S0 = C.supply;
  const wants = Call.wanted(S).map((w) => `${w.got}/${w.qty} ${good(w.good).unit} of ${good(w.good).name.toLowerCase()} (${w.pay} cz each)`).join(', ');
  let act = '';
  if (st === 'supply') {
    act = Call.canDeliver(S, pid)
      ? `<button class="primary" data-call-deliver>Deliver to the crown</button>`
      : pid === S0.port
        ? '<span class="fine">Bring the wheat and wine here: buy them where they are cheap.</span>'
        : `<button class="primary" data-sailto="${S0.port}">Set sail for ${S0.portName}</button>`;
  } else {
    act = `<button class="primary" data-call-sail>Set course for ${C[st].name}</button>`;
  }
  return `<section class="first call" aria-label="${C.name}">
    <div class="first-head"><h3>${C.name}</h3><button class="link" data-call-hide>Later</button></div>
    <ol>
      <li class="${cls(0)}"><span>Supply ${S0.portName}: ${wants}. ${S0.bonus} cz more for the whole of it.</span>${at === 0 ? act : ''}</li>
      <li class="${cls(1)}"><span>${C.patrol.label}. ${at === 1 ? C.patrol.text : ''} Pays ${C.patrol.win} cz.</span>${at === 1 ? act : ''}</li>
      <li class="${cls(2)}"><span>${C.raid.label}. ${at === 2 ? C.raid.text : ''} Pays ${C.raid.win} cz.</span>${at === 2 ? act : ''}</li>
    </ol>
    ${x.paid ? `<p class="fine">The crown has paid you ${fmt(x.paid)} cz so far.</p>` : ''}
  </section>`;
}

// The line under the chart while at sea, so the work is never out of mind.
export function callAtSea() {
  if (!callOn() || !Call.active(S)) return null;
  const m = Call.mark(S);
  if (m) return `${Call.callOf(S)[m.stage].label}: sail to the red mark at ${m.name}.`;
  return null;
}

export function callClick(t) {
  const d = t.dataset;
  if (d.callDeliver !== undefined) {
    const r = Call.deliver(S);
    if (r) { report([r]); plog('call', { stage: 'supply', cz: r.cz, done: !!r.stage }); }
    renderPanel(); save();
    return true;
  }
  if (d.callSail !== undefined) {
    const m = Call.mark(S);
    if (!m) return true;
    const plan = planCourse(m.lon, m.lat, null, false);
    if (plan) { ui.panelMode = null; confirmVoyage(plan); } else hint(noPassage());
    return true;
  }
  if (d.callHide !== undefined) { S.call.hidden = Call.stage(S); renderPanel(); save(); return true; }
  if (d.callShow !== undefined) { S.call.hidden = null; renderPanel(); save(); return true; }
  return false;
}

// At the mark: the crown's fight.
export function openCall(enc) {
  setSpeed(0);
  const C = Call.callOf(S), R = C[enc.call];
  plog('call', { stage: enc.call, met: true });
  if (enc.call === 'patrol') {
    confirmDialog({
      title: `A corsair galley off ${R.name}`,
      body: `<p>There she is: a Barbary galley lying close under the shore, half her oars idle, her crew sleeping off a long night's rowing. She has not seen you. This is what the crown sent you for.</p>
        <dl class="facts"><dt>Take her</dt><dd>${R.win} cz from the crown, and the bounty and her plunder</dd><dt>If she gets away</dt><dd>${R.lose} cz for the work all the same</dd></dl>
        <p class="fine">You have the surprise, and the king's guns on your rails.</p>`,
      ok: 'Attack', cancel: false, kind: 'encounter',
      onOk: () => fightCorsairs(enc),
    });
    return;
  }
  confirmDialog({
    title: R.label,
    body: `<p>${C === Call.CALLS.castile ? 'The Duke\'s galleys' : 'The captain of Ceuta\'s ships'} are in sight, standing in toward ${R.where}. ${R.enemy} come out to meet you: a big one makes straight for your ship.</p>
      <dl class="facts"><dt>A victory</dt><dd>${R.win} cz from the crown, and standing at court</dd><dt>If it goes badly</dt><dd>${R.lose} cz for being there</dd></dl>
      <p class="fine">You have the surprise: the raid has drawn their eyes to the shore.</p>`,
    ok: 'Attack', cancel: false, kind: 'encounter',
    onOk: () => fightCorsairs(enc),
  });
}

// After the fight (voyage.js).
export function callSettled(enc, result) {
  const msgs = Call.settle(S, enc, result);
  if (msgs.length) { report(msgs); plog('call', { stage: enc.call, result, cz: msgs[0].cz || 0 }); }
}

// The red mark on the chart (render.js).
export function drawCall(ctx, toScreen, W, H, RED) {
  if (!callOn() || !S) return;
  const m = Call.mark(S);
  if (!m) return;
  const [sx, sy] = toScreen(m.lon, m.lat);
  if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) return;
  const pulse = 14 + 3 * Math.sin(Date.now() / 300);
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(236,223,192,0.9)';
  ctx.beginPath(); ctx.arc(sx, sy, pulse + 2, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = RED;
  ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, Math.PI * 2); ctx.stroke();
  // crossed swords, simply: two strokes
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(sx - 7, sy - 7); ctx.lineTo(sx + 7, sy + 7); ctx.moveTo(sx + 7, sy - 7); ctx.lineTo(sx - 7, sy + 7); ctx.stroke();
  ctx.font = 'italic 14px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(236,223,192,0.96)';
  const label = Call.callOf(S)[m.stage].label;
  ctx.strokeText(label, sx, sy + pulse + 16);
  ctx.fillStyle = RED; ctx.fillText(label, sx, sy + pulse + 16);
  ctx.restore();
}

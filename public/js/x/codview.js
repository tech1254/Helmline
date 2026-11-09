// The cod fishery on screen (x/cod.js): the Banks marked on the chart once known, the fishing
// station at St John's.

import * as Cod from './cod.js';
import { S } from '../state.js';
import { confirmDialog } from '../dialog.js';
import { report } from '../sim.js';
import { save } from '../save.js';
import { renderPanel } from '../panels.js';
import { toast } from '../notices.js';
import { ctx, toScreen, W, H } from '../view.js';
import { isRevealed } from '../fog.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const RED = '#8b2a1e';

function portBox(pid) {
  if (pid !== 'stjohns' || S.ship.docked !== pid || !Cod.open(S)) return '';
  const st = Cod.ensure(S).station;
  if (!st) return `<p class="harbour">${Cod.STATION.text}</p><div class="row invest"><button data-cod-station ${S.purse >= Cod.STATION.cost ? '' : 'disabled'}>Build a fishing station: ${fmt(Cod.STATION.cost)} cz</button></div>`;
  return `<p class="harbour">Your fishing station has <b>${Math.floor(st.stock)} barrels</b> of dried cod on the flakes.</p><div class="row invest"><button data-cod-load ${st.stock >= 1 ? '' : 'disabled'}>Load the dried cod</button></div>`;
}

function click(t) {
  if (t.dataset.codStation !== undefined) {
    confirmDialog({
      title: 'A fishing station at St John\'s', body: `<p>${Cod.STATION.text} About ${Cod.STATION.catch} barrels a month from May to September, waiting for you on the flakes.</p>`,
      ok: `Build it: ${fmt(Cod.STATION.cost)} cz`, kind: 'trade',
      onOk: () => { const r = Cod.buildStation(S); if (r) report([{ html: r.html, kind: 'discover', log: r.log }]); renderPanel(); save(); },
    });
    return true;
  }
  if (t.dataset.codLoad !== undefined) {
    const n = Cod.loadStation(S);
    if (n) { toast(`You load ${n} barrels of dried cod from your station.`, 'port'); renderPanel(); save(); }
    return true;
  }
  return false;
}

// The Banks, once the fishery is open and the waters are on your chart.
function draw() {
  if (!S || !Cod.open(S)) return;
  const B = Cod.BANKS;
  if (!isRevealed((B.w + B.e) / 2, (B.s + B.n) / 2)) return;
  const [x0, y0] = toScreen(B.w, B.n), [x1, y1] = toScreen(B.e, B.s);
  if (x1 < -40 || y1 < -40 || x0 > W + 40 || y0 > H + 40) return;
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(139,42,30,0.55)';
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
  ctx.font = 'italic 15px "IM Fell English", Georgia, serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(236,223,192,0.9)';
  const label = Cod.inSeason(S) ? 'The Banks (fishing)' : 'The Banks';
  ctx.strokeText(label, (x0 + x1) / 2, (y0 + y1) / 2);
  ctx.fillStyle = RED; ctx.fillText(label, (x0 + x1) / 2, (y0 + y1) / 2);
  ctx.restore();
}

export default { id: 'cod', portBox, click, draw };

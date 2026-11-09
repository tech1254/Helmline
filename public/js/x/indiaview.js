// The Indian Ocean on screen (x/india.js): coasting between the ports of the Indies.

import * as In from './india.js';
import { S, ui } from '../state.js';
import { confirmDialog } from '../dialog.js';
import { advanceTime } from '../sim.js';
import { dock } from '../voyage.js';
import { save } from '../save.js';
import { renderPanel } from '../panels.js';

function portBox(pid) {
  const list = In.coastFrom(S, pid);
  if (!list.length || S.ship.docked !== pid) return '';
  return `<p class="harbour"><b>Along the coast:</b> the ports of the Indies, a few days apart with the monsoon.</p><div class="row invest">${list.map((p) => `<button data-india-coast="${p.id}">${p.name}: ${p.days} days</button>`).join('')}</div>`;
}

// Coast to another port of the Indies: the days pass at sea, then you make port.
export function coast(to) {
  const from = S.ship.docked, d = In.days(from, to);
  S.ship.docked = null;
  for (let i = 0; i < d * 4 && !ui.modal; i++) advanceTime(0.25, true);
  dock(to);
  renderPanel(); save();
}

function click(t) {
  const to = t.dataset.indiaCoast;
  if (!to) return false;
  const p = In.coastFrom(S, S.ship.docked).find((x) => x.id === to);
  if (!p) return true;
  confirmDialog({
    title: `To ${p.name}`, body: `<p>${p.days} days along the coast, out of sight of the chart. Your crew are paid as at sea.</p>`,
    ok: `Sail for ${p.name}`, kind: 'trade', onOk: () => coast(to),
  });
  return true;
}

export default { id: 'india', portBox, click };

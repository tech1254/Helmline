// The silver age on screen (x/silver.js): the crown's escort commission in Seville and Sanlúcar,
// and the fair at Nombre de Dios.

import * as Sv from './silver.js';
import { S } from '../state.js';
import { confirmDialog } from '../dialog.js';
import { report } from '../sim.js';
import { save } from '../save.js';
import { renderPanel } from '../panels.js';
import { fmtDate } from '../util.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const NAMES = { nombrededios: 'Nombre de Dios', havana: 'Havana' };

function portBox(pid) {
  if (S.ship.docked !== pid) return '';
  const bits = [];
  if (pid === 'nombrededios') bits.push(Sv.fairOn(S)
    ? '<p class="banner"><b>The fair is on.</b> The mule trains are down from Panama with the treasure of Peru: gold is cheap, and Castilian cloth, wine and wheat fetch what you ask.</p>'
    : '<p class="harbour">Between fairs Nombre de Dios is a few hundred fevered souls and empty warehouses. The fair comes with the fleet, from January to March.</p>');
  const o = Sv.escortOffer(S, pid);
  if (o) bits.push(`<p class="harbour">The House of Trade needs armed ships to sail with this year's Indies fleet.</p><div class="row invest"><button data-silver-escort>Hear the escort commission</button></div>`);
  const e = Sv.ensure(S).escort;
  if (e && ['seville', 'sanlucar', 'cadiz'].includes(pid)) bits.push(`<p class="harbour">You hold the crown's escort commission for ${e.year}: ${e.stage === 'out' ? `out with the fleet to ${NAMES[e.out]} by ${fmtDate(e.by)}` : `home with the treasure to Sanlúcar by ${fmtDate(e.home)}`}.</p>`);
  return bits.join('');
}

function click(t) {
  if (t.dataset.silverEscort === undefined) return false;
  const o = Sv.escortOffer(S, S.ship.docked);
  if (!o) return true;
  confirmDialog({
    title: `The Indies fleet of ${o.year}`,
    body: `<p>The fleet sails for the Indies this spring, and the crown wants armed ships with it: out to <b>${NAMES[o.out]}</b> by ${fmtDate(o.by)}, and home with the treasure to Sanlúcar by ${fmtDate(o.home)}. The French will be waiting off the Azores and Cape St Vincent.</p><p>The crown pays <b>${fmt(o.pay)} cz</b>, and <b>${fmt(o.bonus)} cz</b> more for keeping the season both ways.</p>`,
    ok: 'Take the commission', kind: 'rumour',
    onOk: () => { const r = Sv.takeEscort(S, S.ship.docked); if (r) report([{ html: `You sail with the Indies fleet: to <b>${NAMES[r.out]}</b> by ${fmtDate(r.by)}. It is on your chart.`, kind: 'discover', log: `Escort commission for ${r.year}.` }]); renderPanel(); save(); },
  });
  return true;
}

export default { id: 'silver', portBox, click };

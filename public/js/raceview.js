// The race on screen (race.js): rumour and legend marks on the chart, the house history, and the
// voyage on from São Brás to find India.

import * as Race from './race.js';
import * as Accounts from './accounts.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { toScreen } from './view.js';
import { planCourse, confirmVoyage } from './voyage.js';
import { report } from './sim.js';
import { save } from './save.js';
import { fmtDate } from './util.js';
import { hint } from './notices.js';
import { yearOf } from './ships.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');

// The rumour or legend under a tap on the chart, if any.
export function markAt(sx, sy, finger = false) {
  let best = null, bd = finger ? 26 : 18;
  for (const m of Race.marks(S)) {
    const [x, y] = toScreen(m.lon, m.lat);
    const d = Math.hypot(x - sx, y - sy);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export function openMark(m) {
  const legend = m.kind === 'legend';
  confirmDialog({
    title: legend ? m.name[0].toUpperCase() + m.name.slice(1) : m.name,
    body: `<p>${m.text}</p>
      <p class="fine">${legend ? 'It is drawn on the old charts, here or hereabouts. Sail there and see what is there.' : 'Where exactly, nobody can say: the mark is the pilots\' best guess. Search the waters round about.'}${Race.raceOf(m.id) ? ` If you chart it before anyone else does, the crown pays for the news and grants your house its trade for ${Race.GRANT_YEARS} years.` : ''}</p>`,
    ok: 'Set a course for it',
    cancel: 'Close',
    kind: 'rumour',
    onOk: () => {
      const plan = planCourse(m.lon, m.lat, null, false);
      if (!plan) { hint('There is no passage there from here.'); return; }
      confirmVoyage(plan);
    },
  });
}

// From São Brás, before da Gama: sail on into the unknown east and find India.
export function indiaBox(pid) {
  if (!Race.canSeekIndia(S, pid)) return '';
  return `<p class="harbour">Beyond São Brás the coast runs north-east, and Moorish traders on the beach speak of rich ports up that coast, and of India across the ocean beyond it.</p><div class="row invest"><button data-seek-india>Seek the way to India</button></div>`;
}
export function seekIndiaClick() {
  confirmDialog({
    title: 'The way to India',
    body: '<p>Your pilots will take the coast north-east past the end of the chart, with the Moorish traders\' word to steer by, and find the way across the ocean to India. Calicut, the pepper port of the Malabar coast, will be on your chart: a passage of months beyond the edge, best made with the monsoon (round the Cape June to August).</p>',
    ok: 'Chart the way to India',
    kind: 'rumour',
    onOk: () => {
      const won = Race.seekIndia(S);
      for (const m of won) if (m.prize) Accounts.record(S, { kind: 'discovery', amount: m.prize, port: 'calicut', text: 'The crown\'s prize for the way to India' });
      report(won.length ? won : [{ html: 'The way to <b>Calicut</b> is on your chart: sail to the chart\'s edge beyond the Cape, and on.', kind: 'discover', log: 'Charted the way to India.' }]);
      save();
    },
  });
}

// The crown's commission to explore, offered in your home port.
export function commissionBox(pid) {
  const R = S.race;
  if (R?.commission && pid === S.ship.docked) {
    const r = Race.raceOf(R.commission.port);
    return `<p class="harbour">You hold the crown's commission to find <b>${r.what}</b>, before ${r.who} does (history says ${yearOf(R.commission.by)}). Its rumour is marked on your chart.</p>`;
  }
  const o = Race.commissionOffer(S, pid);
  if (!o) return '';
  return `<p class="harbour">The crown is looking for a captain to find ${o.what}, before ${o.who} does.</p><div class="row invest"><button data-explore-commission>Hear the commission</button></div>`;
}
export function commissionClick() {
  const pid = S.ship.docked;
  const o = Race.commissionOffer(S, pid);
  if (!o) return;
  confirmDialog({
    title: 'A commission from the crown',
    body: `<p>The crown wants ${o.what} found and charted, and it wants it done by one of its own captains before ${o.who} gets there (history says ${o.byYear}). It pays <b>${fmt(o.stipend)} cz</b> now towards the voyage, and <b>${fmt(o.bonus)} cz</b> on top of the discovery prize if you chart it first.</p><p class="fine">The pilots' word of where to look goes on your chart. If you are beaten to it, the stipend is yours but the crown will remember.</p>`,
    ok: 'Take the commission',
    cancel: 'Decline',
    kind: 'rumour',
    onOk: () => {
      const t = Race.takeCommission(S, pid, true);
      if (t) {
        Accounts.record(S, { kind: 'discovery', amount: t.stipend, port: pid, text: `The crown's stipend to find ${t.what}` });
        report([{ html: `You take the crown's commission to find <b>${t.what}</b>. Its rumour is marked on your chart.`, kind: 'discover', log: `Commissioned to find ${t.what}.` }]);
      }
      save();
    },
    onCancel: () => { Race.takeCommission(S, pid, false); save(); },
  });
}

// The house history: discoveries, and the legends sailed to.
export function historyBox() {
  const h = Race.history(S);
  if (!h.length) return '';
  return `<h3>Your house's history</h3><ul class="help">${h.slice(0, 12).map((e) => `<li>${fmtDate(e.day)}: ${e.text[0].toUpperCase()}${e.text.slice(1)}.</li>`).join('')}</ul>`;
}

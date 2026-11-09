// Expansion: the silver age (Nov 2026). From the 1520s the treasure of Mexico and Peru comes home
// to Seville: Pizarro's ransom of Atahualpa in 1533, the silver mountain of Potosí from 1545.
// Two new ports on the chart: Nombre de Dios, on the Isthmus, where the treasure of Peru comes
// over the mountains by mule train to the fairs; and Havana, where the homeward ships gather.
//   Castile: the crown's escort commissions (sail out with the Indies fleet in spring, home in the
//   autumn), and the fairs at Nombre de Dios (Peruvian gold cheap, Castilian cloth and wine dear).
//   Everyone else: the homeward fleet on the chart each summer from 1535, heavy with treasure and
//   in company; taking one of its ships is piracy unless your crown is at war with Castile.
// Pure rules: no browser modules.

import { addPort } from './registry.js';
import { state } from './index.js';
import { yearOf, dayOfYear } from '../ships.js';
import * as Accounts from '../accounts.js';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const mine = (S) => S.nation || 'portugal';

addPort({ id: 'nombrededios', name: 'Nombre de Dios', lon: -79.5, lat: 9.72, known: false, from: 1519, crown: 'castile',
  blurb: 'A poor, fever-ridden roadstead on the Isthmus, where the mule trains come down from Panama with the treasure of Peru. Empty most of the year; a fair like no other when the fleet is in.' },
{ harbour: { depth: 5, kind: 'an open roadstead behind a reef' }, start: { size: 400, grow: 0.02 },
  market: { k: 0.05, p: { gold: [92, 1], wine: [26], cloth: [28], wheat: [26], salt: [12], copper: [30], sugar: [24], dye: [22], fish: [16] } } });
addPort({ id: 'havana', name: 'Havana', lon: -82.36, lat: 23.22, known: false, from: 1519, crown: 'castile',
  blurb: 'A pocket harbour on the north coast of Cuba, behind a narrow mouth, where the homeward ships gather to ride the current through the Florida straits.' },
{ harbour: { depth: 9, kind: 'a pocket harbour behind narrows' }, start: { size: 600, grow: 0.03 },
  market: { k: 0.04, p: { sugar: [16, 1], dye: [14, 1], wine: [22], cloth: [22], wheat: [20], salt: [10], fish: [12, 1], copper: [26], gold: [104] } } });

export const PORTS = ['nombrededios', 'havana'];
export const ESCORT = { from: 1522, pay: 2500, onTime: 1500, standing: 20 };
export const FLEET_FROM = 1535;

function X(S) { const s = state(S, 'silver'); s.told = s.told || {}; s.taken = s.taken || {}; return s; }
export const ensure = X;

// The fair at Nombre de Dios: when the Peru treasure comes down to meet the fleet, January to March
// in the years after Pizarro's conquest.
export const fairOn = (S) => { const y = yearOf(S.day); return y >= 1534 && S.day >= date(y, 1, 10) && S.day < date(y, 3, 31); };
export function effects(S) {
  if (yearOf(S.day) < 1534) return {};
  return fairOn(S)
    ? { nombrededios: { gold: 0.78, cloth: 1.5, wine: 1.5, wheat: 1.4, copper: 1.3 } }
    : { nombrededios: { gold: 1.25, cloth: 0.85, wine: 0.85 } };
}

// The crown's escort commission, for a Castilian captain of standing: offered at Seville or
// Sanlúcar from March to May; out to Nombre de Dios or Havana by September, home by December.
export function escortOffer(S, pid) {
  const y = yearOf(S.day), x = X(S);
  if (mine(S) !== 'castile' || y < ESCORT.from || x.escort || x.done?.[y]) return null;
  if (!['seville', 'sanlucar', 'cadiz'].includes(pid)) return null;
  if (S.day < date(y, 3, 1) || S.day >= date(y, 6, 1)) return null;
  if ((S.contracts?.standing || 0) < ESCORT.standing) return null;
  return { year: y, out: y >= 1534 ? 'nombrededios' : 'havana', by: date(y, 9, 30), home: date(y, 12, 31), pay: ESCORT.pay, bonus: ESCORT.onTime };
}
export function takeEscort(S, pid) {
  const o = escortOffer(S, pid);
  if (!o) return null;
  X(S).escort = { ...o, stage: 'out' };
  S.discovered = S.discovered || {};
  S.discovered[o.out] = true;
  return o;
}
export function onDock(S, pid) {
  const x = X(S), e = x.escort, msgs = [];
  if (!e) return msgs;
  if (e.stage === 'out' && (pid === e.out || pid === 'havana' || pid === 'nombrededios')) {
    e.stage = 'home'; e.outOnTime = S.day <= e.by;
    msgs.push({ html: `The Indies fleet is safe in ${pid === 'havana' ? 'Havana' : 'Nombre de Dios'}${e.outOnTime ? '' : ', late'}. Now see the homeward ships to Sanlúcar by the end of December.`, kind: 'discover', log: 'Escorted the fleet out.' });
  } else if (e.stage === 'home' && ['sanlucar', 'seville', 'cadiz'].includes(pid)) {
    const on = e.outOnTime && S.day <= e.home;
    const cz = e.pay + (on ? e.bonus : 0);
    S.purse += cz;
    Accounts.record(S, { kind: 'contract', amount: cz, port: pid, text: `Escort of the Indies fleet, ${e.year}` });
    if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + (on ? 6 : 3);
    x.done = { ...(x.done || {}), [e.year]: true };
    x.escort = null;
    x.escorts = (x.escorts || 0) + 1;
    msgs.push({ html: `<b>The Indies fleet is home</b>, its treasure safe in the House of Trade. The crown pays <b>${fmt(cz)} cz</b> for the escort${on ? ', with its thanks for keeping the season' : ''}.`, kind: 'discover', log: `Escort paid: ${cz} cz.` });
  }
  return msgs;
}

// The homeward fleet on the chart (for captains not of Castile): three ships in company from
// Havana to Sanlúcar each summer from 1535.
export function vessels(S) {
  const y = yearOf(S.day);
  if (mine(S) === 'castile' || y < FLEET_FROM) return [];
  const from = date(y, 6, 10), days = 55, out = [];
  if (S.day < from || S.day >= from + days) return out;
  for (let i = 0; i < 3; i++) {
    const key = `convoy:flota${y}:castile:${i}`;
    if (S.war?.convoysTaken?.[key]) continue;
    out.push({ house: 'convoy_castile', name: 'Indies fleet', colour: '#c9a227', i, from: 'havana', to: 'sanlucar', start: from + i * 1.5, days,
      hull: i ? 'nau' : 'carrack', armed: 2, t: Math.max(0, (S.day - from - i * 1.5) / days), key, convoy: true, special: true,
      note: 'A ship of the homeward Indies fleet, deep-laden with the gold and silver of Mexico and Peru, sailing in company with armed ships of the Carrera',
      cargo: [{ good: 'gold', qty: i ? 50 : 90 }, { good: 'dye', qty: 30 }, { good: 'sugar', qty: 20 }] });
  }
  return out;
}

const NEWS = [
  { day: date(1521, 9, 1), text: 'Cortés has taken Tenochtitlan, the city of the Mexica, for the Emperor: a kingdom of gold in the west, beyond the islands.' },
  { day: date(1533, 9, 1), text: 'Pizarro has held the Inca Atahualpa to ransom in Peru, for a room filled with gold and two with silver, and then put him to death. The treasure is coming over the Isthmus to Nombre de Dios: there will be a fair there like no other.' },
  { day: date(1543, 7, 16), text: 'The crown orders that no ship shall sail for the Indies or home from them except in convoy, with armed ships of the Carrera. The fleets gather at Havana for the passage home.' },
  { day: date(1545, 6, 1), text: 'A mountain of silver has been found in Upper Peru, at Potosí. They say there is more silver in it than in all of Europe.' },
  { day: date(1546, 9, 8), text: 'Silver at Zacatecas, in New Spain: a second Potosí. Prices in Seville climb every year with the silver that comes in.' },
];
export function tick(S, dd, ctx = {}) {
  const x = X(S), msgs = [];
  NEWS.forEach((n, i) => {
    if (S.day < n.day || x.told[i]) return;
    x.told[i] = true;
    if (S.day - n.day <= 60) msgs.push({ html: `<b>News:</b> ${n.text}`, kind: 'discover', log: n.text });
  });
  // Castile charts its own ports of the Indies trade
  if (mine(S) === 'castile' && yearOf(S.day) >= 1519) for (const pid of PORTS) if (!S.discovered?.[pid]) { S.discovered[pid] = true; }
  const e = x.escort;
  if (e && S.day > e.home + 30) {
    x.escort = null;
    if (S.contracts) S.contracts.standing = Math.max(0, (S.contracts.standing || 0) - 4);
    msgs.push({ html: `Your escort commission of ${e.year} has lapsed: the fleet came home without you. The crown is displeased.`, kind: 'danger', log: 'Escort commission lapsed.' });
  }
  const y = yearOf(S.day);
  if (mine(S) !== 'castile' && y >= FLEET_FROM && !x.told[`fleet${y}`] && vessels(S).length) {
    x.told[`fleet${y}`] = true;
    msgs.push({ html: `<b>News:</b> the homeward Indies fleet of ${y} has sailed from Havana for Sanlúcar, three ships deep with treasure. Its ships are <b>marked on your chart</b>.`, kind: 'discover', log: `The Indies fleet of ${y} sails.` });
  }
  return msgs;
}

export default { id: 'silver', name: 'The silver age', ports: PORTS, routes: true, tick, onDock, vessels, effects, ensure };

// Expansion: the Indian Ocean (Nov 2026). Calicut was only the first port. Cabral's fleet set up a
// factory at Cochin in 1500; Albuquerque took Goa (1510), Malacca (1511) and Hormuz (1515), and the
// Estado da Índia ran the trade of the whole ocean from them. Once you have reached Calicut, the
// other ports of the coast open as history reaches them, and you coast between them in days:
//   Cochin: the best pepper of the coast and cinnamon from Ceylon (Indian spices), cheaper than Calicut's.
//   Goa: the capital of the Portuguese Indies; indigo, spices, and a market for European goods.
//   Hormuz: the gate of the Persian Gulf; it pays well for spices, and sells indigo.
//   Malacca: the market of the Spice Islands, a month to the east: cloves and nutmeg for little.
// They lie beyond the chart, as Calicut does: the passage out and home is reckoned by the monsoons
// (indies.js), and the ports are drawn only by Calicut's mark at the chart's edge.
// Pure rules: no browser modules.

import { addPort } from './registry.js';
import { state } from './index.js';
import { PORTS as ALL } from '../world.js';
import { yearOf, dayOfYear } from '../ships.js';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const calicut = ALL.find((p) => p.id === 'calicut');

// Where each port lies along the coast, in days of coasting from Hormuz (with the monsoon).
export const COAST = { hormuz: 0, goa: 16, calicut: 22, cochin: 25, malacca: 52 };
export const SITES = {
  cochin: { name: 'Cochin', from: 1500, size: 30000, text: 'Cabral\'s fleet has set up a factory at Cochin, south of Calicut, whose raja is the Zamorin\'s enemy and Portugal\'s friend. The best pepper of the Malabar coast is weighed there.',
    blurb: 'A raja\'s town on the backwaters south of Calicut, Portugal\'s first friend in India. The best pepper of the coast, and cinnamon from Ceylon.',
    p: { spices: [10, 1], pepper: [24], copper: [46], gold: [150], cloth: [36], wine: [42] } },
  goa: { name: 'Goa', from: 1510, size: 50000, text: 'Albuquerque has taken Goa from the Sultan of Bijapur: the capital of the Portuguese Indies, an island city with a fine harbour. Its markets are open to your ships.',
    blurb: 'The capital of the Portuguese Indies, an island city of churches and warehouses. Indigo, spices and Arab horses; a ready market for wine, cloth and copper.',
    p: { dye: [7, 1], spices: [15, 1], pepper: [26], wine: [46], cloth: [40], copper: [44], gold: [145] } },
  malacca: { name: 'Malacca', from: 1511, size: 60000, text: 'Albuquerque has taken Malacca, the market of the Spice Islands, on the strait a month east of India: cloves and nutmeg for almost nothing.',
    blurb: 'The market of the Spice Islands on its strait, a month east of India: Chinese junks, Javanese prahus, and cloves and nutmeg for almost nothing.',
    p: { spices: [6, 1], pepper: [24], gold: [115, 1], cloth: [44], copper: [48], wine: [48] } },
  hormuz: { name: 'Hormuz', from: 1515, size: 40000, text: 'Albuquerque has made the King of Hormuz a vassal of Portugal and built a fortress there: the gate of the Persian Gulf, where the caravans of Persia meet the ships of India.',
    blurb: 'An island of salt and stone at the gate of the Persian Gulf, and one of the richest markets of the world: it pays well for pepper and spices, and sells the indigo of Persia.',
    p: { dye: [8, 1], pepper: [30], spices: [42], copper: [40], gold: [140], cloth: [34], salt: [3, 1] } },
};
for (const [id, s] of Object.entries(SITES)) {
  const p = { ...s.p };
  addPort({ id, name: s.name, lon: calicut.lon, lat: calicut.lat, known: false, from: s.from, beyond: true, via: 'calicut', crown: id === 'cochin' ? null : 'portugal', blurb: s.blurb },
    { harbour: { depth: 8, kind: 'a roadstead off the coast' }, start: { size: s.size, grow: 0.005 }, market: { k: 0.01, p } });
}
export const PORTS = Object.keys(SITES);
export const india = (pid) => pid in COAST;
export const days = (a, b) => Math.max(2, Math.abs(COAST[a] - COAST[b]));

function X(S) { const s = state(S, 'india'); s.told = s.told || {}; return s; }
export const ensure = X;

// The ports along the coast you can coast to from here.
export function coastFrom(S, pid) {
  if (!india(pid) || !S.ship?.inIndies) return [];
  return Object.keys(COAST).filter((id) => id !== pid && S.discovered?.[id]).map((id) => ({ id, name: id === 'calicut' ? 'Calicut' : SITES[id].name, days: days(pid, id) })).sort((a, b) => a.days - b.days);
}

export function tick(S, dd, ctx = {}) {
  const x = X(S), msgs = [];
  if (!S.discovered?.calicut) return msgs;
  for (const [id, s] of Object.entries(SITES)) {
    if (S.discovered[id] || yearOf(S.day) < s.from) continue;
    S.discovered[id] = true;
    if (!x.told[id]) { x.told[id] = true; msgs.push({ html: `<b>News from India:</b> ${s.text} <i>${s.name} is on your chart, by Calicut beyond the Cape.</i>`, kind: 'discover', log: `${s.name} opens in the Indies.` }); }
  }
  if (S.day >= date(1538, 9, 4) && !x.told.diu) { x.told.diu = true; if (S.day - date(1538, 9, 4) < 90) msgs.push({ html: '<b>News from India:</b> a Turkish fleet from Suez and the Sultan of Gujarat have besieged the Portuguese fortress at Diu. It held: the Turks have sailed home. The sea road to India stays Portugal\'s.', kind: 'discover', log: 'The siege of Diu.' }); }
  return msgs;
}

export default { id: 'india', name: 'The Indian Ocean', ports: PORTS, routes: false, tick, ensure };

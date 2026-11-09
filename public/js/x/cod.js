// Expansion: the cod fishery (Nov 2026). Beyond the New Found Land lie the Banks, where the cod
// "run so thick they slow a ship". From 1500 the Portuguese (Corte-Real), then the Bretons, the
// Basques and the men of Bristol and Viana, sent fleets every summer: out in spring with salt,
// fishing the Banks all summer, home in the autumn with the hold full of salted cod for the
// fast days of Catholic Europe.
//   Sail to the Banks (click a point on the chart there) with salt in the hold, May to September,
//   and your crew fish while you lie there: a sack of salt cures three barrels of cod. A fishing
//   station at St John's dries the catch ashore without salt, and its men fish all season for you.
//   Salt cod sells dearest in Lent, in the Iberian and Mediterranean ports.
// Pure rules: no browser modules.

import { state } from './index.js';
import { yearOf, dayOfYear, flagStats } from '../ships.js';
import { monthOf } from '../indies.js';
import * as Accounts from '../accounts.js';
import { GOODS } from '../economy.js';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export const BANKS = { w: -54, e: -48.5, s: 42.5, n: 47.2, name: 'the Banks' };
export const FROM = 1500;
export const SEASON = [4, 5, 6, 7, 8]; // May to September
export const PER_SALT = 3; // barrels of cod a sack of salt cures
export const CATCH = 0.05; // barrels a day, for each barrel of the hold
export const STATION = { cost: 2000, catch: 60, text: 'A stage and drying flakes on the shore at St John\'s, with a shallop and its crew: they fish the inshore grounds all season and dry the catch in the wind, without salt.' };
export const LENT = { lisbon: 1.3, porto: 1.3, lagos: 1.25, seville: 1.35, cadiz: 1.3, sanlucar: 1.3, valencia: 1.4, genoa: 1.4, marseille: 1.35, naples: 1.4, palermo: 1.35, palos: 1.25 };

function X(S) { const c = state(S, 'cod'); c.told = c.told || {}; c.caught = c.caught || 0; return c; }
export const ensure = X;
export const onBanks = (lon, lat) => lon >= BANKS.w && lon <= BANKS.e && lat >= BANKS.s && lat <= BANKS.n;
export const inSeason = (S) => SEASON.includes(monthOf(S.day));
export const open = (S) => yearOf(S.day) >= FROM;
const room = (S) => flagStats(S).hold - GOODS.reduce((n, g) => n + (S.cargo?.[g.id] || 0), 0);

// Fishing: while your ship lies on the Banks in season, with salt, and room in the hold.
export function fishing(S) {
  if (!open(S) || S.ship?.docked || !onBanks(S.ship.lon, S.ship.lat)) return null;
  if (!inSeason(S)) return { why: 'out of season: the fleets fish the Banks from May to September' };
  if (!(S.cargo?.salt > 0)) return { why: 'no salt in the hold to cure the catch' };
  if (room(S) <= 0) return { why: 'the hold is full' };
  return { ok: true };
}
export function fish(S, days) {
  const f = fishing(S);
  if (!f?.ok) return 0;
  // a sack of salt goes into every three barrels, so the hold fills by two-thirds of the catch
  const n = Math.min(flagStats(S).hold * CATCH * days, S.cargo.salt * PER_SALT, room(S) * PER_SALT / (PER_SALT - 1));
  const c = X(S);
  c.frac = (c.frac || 0) + n;
  const whole = Math.floor(c.frac);
  if (!whole) return 0;
  c.frac -= whole;
  c.saltFrac = (c.saltFrac || 0) + whole / PER_SALT;
  const used = Math.min(S.cargo.salt, Math.floor(c.saltFrac));
  c.saltFrac -= used;
  if (used) { S.paid.salt = S.cargo.salt ? (S.paid.salt || 0) * (S.cargo.salt - used) / S.cargo.salt : 0; S.cargo.salt -= used; }
  S.cargo.fish = (S.cargo.fish || 0) + whole;
  S.paid.fish = S.paid.fish || 0;
  c.caught += whole;
  return whole;
}

// The fishing station at St John's.
export const canStation = (S) => open(S) && !X(S).station && S.ship?.docked === 'stjohns' && S.purse >= STATION.cost;
export function buildStation(S) {
  if (!canStation(S)) return null;
  S.purse -= STATION.cost;
  Accounts.record(S, { kind: 'build', amount: -STATION.cost, port: 'stjohns', text: 'A fishing station at St John\'s' });
  X(S).station = { since: S.day, stock: 0 };
  return { html: `Your fishing station at St John's is built. ${STATION.text}`, log: 'Built a fishing station at St John\'s.' };
}
export function loadStation(S) {
  const st = X(S).station;
  if (!st || S.ship?.docked !== 'stjohns') return 0;
  const n = Math.min(Math.floor(st.stock), Math.max(0, room(S)));
  if (n <= 0) return 0;
  st.stock -= n;
  S.cargo.fish = (S.cargo.fish || 0) + n;
  S.paid.fish = S.paid.fish || 0;
  return n;
}

// Lent: salt cod dearest in the Catholic ports, from Ash Wednesday (about mid-February) to Easter.
export const lentOn = (S) => { const y = yearOf(S.day); return S.day >= date(y, 2, 10) && S.day < date(y, 4, 10); };
export function effects(S) {
  if (!open(S) || !lentOn(S)) return {};
  return Object.fromEntries(Object.entries(LENT).map(([p, m]) => [p, { fish: m }]));
}

export function tick(S, dd, ctx = {}) {
  const c = X(S), msgs = [];
  if (!open(S)) return msgs;
  const y = yearOf(S.day);
  if (!c.told.open && S.day >= date(FROM, 5, 1)) {
    c.told.open = true;
    if (S.day - date(FROM, 5, 1) < 120) msgs.push({ html: '<b>News:</b> Gaspar Corte-Real is home from the New Found Land: south and east of it lie banks in the open sea where the cod run so thick they slow a ship. Fishermen from Viana, Brittany and Bristol are already fitting out. Sail to the Banks with salt in summer, and your crew can fill the hold.', kind: 'discover', log: 'The Banks are fished.' });
  }
  // the station's men fish the season
  if (c.station && inSeason(S)) c.station.stock = Math.min(400, c.station.stock + STATION.catch / 30 * dd);
  // your own ship on the Banks
  if (!S.ship?.docked && onBanks(S.ship.lon, S.ship.lat)) {
    const n = fish(S, dd);
    if (n) { c.season = c.season || { year: y, n: 0 }; if (c.season.year !== y) c.season = { year: y, n: 0 }; c.season.n += n; }
    const f = fishing(S);
    const key = `${y}:${f?.why || 'ok'}`;
    if (f && !c.told[key] && (f.ok || c.season?.year === y)) {
      c.told[key] = true;
      msgs.push(f.ok
        ? { html: `Your crew put out the lines on the Banks: the cod come up as fast as they can haul. Each sack of salt cures ${PER_SALT} barrels.`, kind: 'discover', log: 'Fishing the Banks.' }
        : { html: `The fishing is done: ${f.why}. ${c.season?.n ? `${c.season.n} barrels of cod salted this season.` : ''} Salt cod sells best in Lisbon, Seville and the Mediterranean, and dearest in Lent.`, kind: '', log: `Fishing done: ${f.why}.` });
    }
  }
  return msgs;
}

export default { id: 'cod', name: 'The cod fishery', tick, effects, ensure };

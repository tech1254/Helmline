// The race (the design doc, phase 5): the real explorers become rivals, not a calendar. Chart a
// coast before history does and the crown pays a discovery prize, grants your house ten years of
// the trade there (the rival houses hold little sway), and your house history says so: "You beat
// Dias to the Cape by 3 years." Rival houses fund voyages too, and one may beat history (and you)
// to a coast. If nobody does, history happens on its usual date.
//
// Rumours mark the chart: word heard from pilots in port of a coast not yet charted (where
// roughly, never exactly), and the legendary islands of the old charts: Antillia, the Isle of the
// Seven Cities, St Brendan's Isle, the Isle of Brasil. Most are empty sea. Two lead further:
// past Antillia the weed and the birds point west, to the Indies of Columbus; past Brasil the
// Bristol men's cod banks lie far to the west.
// Pure rules: no browser modules.

import { PORTS, distNm } from './world.js';
import { yearOf, dayOfYear } from './ships.js';
import { HISTORY } from './ports.js';
import * as Houses from './houses.js';

const portById = (id) => PORTS.find((p) => p.id === id);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
export const GRANT_YEARS = 10;
const YEAR = 365.25;

// The races: who charted it historically, and when; the crown's prize for beating him.
export const RACES = [
  { port: 'flores', year: 1452, who: 'Diogo de Teive', what: 'Flores and Corvo', prize: 300 },
  { port: 'gambia', year: 1455, who: 'Cadamosto', what: 'the Gambia', prize: 400,
    news: 'Alvise Cadamosto, a Venetian sailing for Prince Henry, is home from a great river beyond the Senegal, the Gambia, where the caravans bring gold.' },
  { port: 'ribeiragrande', year: 1462, who: 'António de Noli', what: 'the Cape Verde islands', prize: 400 },
  { port: 'mina', year: 1471, who: 'João de Santarém', what: 'the Gold Coast', prize: 1500,
    news: 'João de Santarém and Pêro Escobar are home from the coast beyond the Malagueta coast, where the people trade gold dust: the Mina, the mine, they call it.' },
  { port: 'saotome', year: 1471, who: 'Pêro Escobar', what: 'the islands on the line', prize: 600,
    news: 'Pêro Escobar has sighted empty islands out in the gulf, on the line: São Tomé and Príncipe.' },
  { port: 'mpinda', year: 1483, who: 'Diogo Cão', what: 'the Zaire river', prize: 1000 },
  { port: 'saobras', year: 1488, who: 'Bartolomeu Dias', what: 'the Cape', prize: 3000 },
  { port: 'santodomingo', year: 1492, who: 'Columbus', what: 'the Indies in the west', prize: 5000 },
  { port: 'stjohns', year: 1497, who: 'John Cabot', what: 'the New Found Land', prize: 1500 },
  { port: 'calicut', year: 1498, who: 'Vasco da Gama', what: 'India', prize: 6000 },
  { port: 'portoseguro', year: 1500, who: 'Cabral', what: 'the Land of the Holy Cross', prize: 2000 },
];
export const raceOf = (pid) => RACES.find((r) => r.port === pid) || null;
// Where a commission may send you: India and the land of the Holy Cross are their own story.
const COMMISSION_NOT = ['calicut'];
export const COMMISSION_LEAD = 12; // years before history's date the crown starts to look for a captain
export const COMMISSION_STIPEND = 0.25, COMMISSION_BONUS = 1; // of the prize: up front, and on success
export const COMMISSION_STANDING = 25;
export const isRace = (pid) => !!raceOf(pid);

// Where pilots speak of each uncharted coast, from which year, and what they say.
const HEARD = {
  gambia: { at: ['arguin', 'lagos'], text: 'Pilots back from Arguin speak of a great river further south, beyond the Senegal, where the caravans bring gold.' },
  ribeiragrande: { at: ['gambia', 'cantor', 'arguin'], text: 'The Gambia\'s boatmen speak of green islands out to sea off Cape Verde, empty of people.' },
  mina: { at: ['cestos', 'serraleoa'], text: 'On the Malagueta coast they say that further east the people trade gold dust by the measure.' },
  saotome: { at: ['mina', 'cestos'], text: 'Fishermen at the Mina speak of islands out in the gulf, on the line itself, where nobody lives.' },
  mpinda: { at: ['saotome', 'mina'], text: 'A pilot swears that far south the sea runs fresh out of sight of land, from a river greater than any in Africa.' },
  saobras: { at: ['mpinda'], text: 'The Kongo pilots say the coast runs south for ever. A Moorish trader says it turns east at last, at the end of Africa.' },
  portoseguro: { at: ['ribeiragrande', 'saobras', 'saotome'], text: 'Ships swinging wide into the ocean on the way south have seen land birds and floating branches far to the west.' },
  flores: { at: ['angra'], text: 'Azorean fishermen say there are two more islands far to the west of Terceira, where the birds go.' },
};

// The legends of the old charts, and where the Indies and the New Found Land lie beyond them.
export const LEGENDS = {
  brendan: { name: 'St Brendan\'s Isle', lon: -21, lat: 27.9,
    text: 'The island the Irish saint landed on, seen from La Palma on clear evenings and gone by morning. Several captains have sailed for it.',
    found: 'Nothing: open sea where the island ought to be. From the masthead, at sunset, the low clouds to the west look very like land. You are not the first to be fooled.' },
  sevencities: { name: 'the Isle of the Seven Cities', lon: -39.5, lat: 42.6,
    text: 'Seven bishops fled the Moors across the ocean with their flocks and built seven cities on an island in the west. Diogo de Teive went looking for it.',
    found: 'Empty ocean, and a long swell from the north-west. If the seven cities are anywhere, they are not here.', leads: 'flores' },
  antillia: { name: 'Antillia', lon: -46, lat: 27.5,
    text: 'The great island drawn on the Italian charts far out in the western ocean, square as a bishop\'s seal.',
    found: 'No Antillia: only the weed, mile on mile of it, and the trade wind blowing steady from the east. But the birds fly on westward, and the weed has land crabs in it. There is land to the west.', leads: 'west' },
  brasil: { name: 'the Isle of Brasil', lon: -16.5, lat: 51.8,
    text: 'The round island west of Ireland that the Bristol men go looking for every summer. They say it was found once, and lost.',
    found: 'Nothing but grey sea and fog. In Bristol they say the Isle of Brasil lies much further west than the charts show, where the cod run so thick they slow a ship.', leads: 'cod' },
};
// Where a legend leads: a rumour of a real coast, far further on.
const LEADS = {
  west: { port: 'santodomingo', name: 'Land to the west', text: 'Beyond the weed of the Sargasso, the birds and the steady east wind point to land far to the west: islands, perhaps the Indies themselves.' },
  cod: { port: 'stjohns', name: 'The Bristol men\'s land', text: 'Far west of Ireland, the Bristol men say, there is land, and banks where the cod run thick enough to stop a ship.' },
  flores: { port: 'flores', name: 'Islands beyond the Azores', text: 'Flying west from the empty ocean, the birds point to land beyond the Azores.' },
};

// A rumour mark is never exactly on the coast: a seeded offset, up to `spread` degrees.
function offset(id, spread) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = (h % 360) * Math.PI / 180, r = spread * (0.45 + ((h >>> 9) % 100) / 180);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export function ensureRace(S, rand = Math.random) {
  if (S.race) return S.race;
  S.race = { dates: {}, firsts: {}, grants: {}, rumours: {}, legends: {}, history: [], told: {} };
  const R = S.race;
  // Rival houses fund voyages of their own: now and then one beats history to a coast.
  for (const r of RACES) {
    let year = r.year, who = r.who, house = null;
    if (r.port !== 'calicut' && r.year - 3 > yearOf(S.day ?? 0) && rand() < 0.22) {
      const hs = Houses.HOUSES.filter((h) => (!h.nation || h.nation === (S.nation || 'portugal')) && (h.from || 1451) <= r.year - 3);
      const h = hs[Math.floor(rand() * hs.length)];
      if (h) { house = h.id; year = r.year - 1 - Math.floor(rand() * 3); who = `a caravel of the house of ${h.name}`; }
    }
    R.dates[r.port] = { year: Math.max(1452, year), who, house };
  }
  for (const id of Object.keys(LEGENDS)) R.legends[id] = { known: true, found: false };
  return R;
}
// When history (or a rival) charts it, and who.
export function dateOf(S, pid) {
  const r = raceOf(pid);
  if (!r) return null;
  const d = ensureRace(S).dates[pid] || { year: r.year, who: r.who };
  return { ...r, ...d, day: dayOfYear(d.year) + 150 };
}

// You charted a port: if it is a race not yet run, you win it. Returns messages.
export function charted(S, pid) {
  const r = raceOf(pid);
  const R = ensureRace(S);
  delete R.rumours[pid];
  if (!r || R.firsts[pid]) return [];
  const d = dateOf(S, pid);
  if (S.day >= d.day) return [];
  R.firsts[pid] = { by: 'you', day: S.day, ahead: d.year - yearOf(S.day) };
  R.grants[pid] = { by: 'you', until: S.day + GRANT_YEARS * YEAR };
  S.purse += r.prize;
  if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 5;
  const won = [];
  if (R.commission?.port === pid) {
    const bonus = Math.round(r.prize * COMMISSION_BONUS);
    S.purse += bonus;
    if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 5;
    R.commission = null;
    R.commissionsDone = (R.commissionsDone || 0) + 1;
    won.push({ html: `<b>Your commission is fulfilled.</b> The crown pays the reward it promised for ${r.what}: <b>${fmt(bonus)} cz</b> more, and your name is spoken at court.`, kind: 'discover', log: `Commission fulfilled: ${r.what} (${bonus} cz).`, prize: bonus, port: pid });
  }
  R.history.push({ day: S.day, text: `charted ${r.what} at ${portById(pid).name}, ${aheadText(d.year - yearOf(S.day))} ${r.who}` });
  return [{ html: `<b>A discovery!</b> No ${S.nation === 'castile' ? 'Castilian' : 'Portuguese'} ship has been here before: you are the first to chart <b>${r.what}</b>, ${aheadText(d.year - yearOf(S.day))} ${r.who}. The crown pays <b>${fmt(r.prize)} cz</b> for the news and grants your house the trade of ${portById(pid).name} for ${GRANT_YEARS} years.`, kind: 'discover', log: `First to chart ${r.what} (${portById(pid).name}): a prize of ${r.prize} cz and a ${GRANT_YEARS}-year grant.`, prize: r.prize, port: pid }, ...won];
}
const aheadText = (n) => (n <= 0 ? 'ahead of' : n === 1 ? 'a year before' : `${n} years before`);

// How a discovery grant moves a port's trade (houses.js): yours, the rivals hold little sway;
// a rival house's, it holds sway there whether it trades there or not.
export function grant(S, pid) {
  const g = S.race?.grants?.[pid];
  return g && S.day < g.until ? g.by : null;
}

// The crown's commission to explore: offered in your home port to a captain of standing, for the
// next coast history has not yet reached. Half a stipend now, the prize doubled if you chart it
// first; if history gets there before you, the commission lapses.
export function commissionOffer(S, pid) {
  const R = ensureRace(S);
  if (R.commission || (S.contracts?.standing || 0) < COMMISSION_STANDING) return null;
  if (pid !== (S.nation === 'castile' ? 'seville' : 'lisbon') && pid !== 'sanlucar' && pid !== 'lagos') return null;
  if (R.commissionDeclined && S.day - R.commissionDeclined < 3 * YEAR) return null;
  const y = yearOf(S.day);
  const next = RACES.filter((r) => !COMMISSION_NOT.includes(r.port) && !R.firsts[r.port] && !R.told[r.port] && !S.discovered[r.port] && !R.commissioned?.[r.port])
    .map((r) => ({ r, d: dateOf(S, r.port) })).filter(({ d }) => d.day > S.day + YEAR && d.year - y <= COMMISSION_LEAD)
    .sort((a, b) => a.d.day - b.d.day)[0];
  if (!next) return null;
  return { port: next.r.port, what: next.r.what, who: next.r.who, by: next.d.day, byYear: next.d.year, stipend: Math.round(next.r.prize * COMMISSION_STIPEND / 10) * 10, bonus: Math.round(next.r.prize * COMMISSION_BONUS) };
}
export function takeCommission(S, pid, yes) {
  const R = ensureRace(S);
  const o = commissionOffer(S, pid);
  if (!o) return null;
  if (!yes) { R.commissionDeclined = S.day; return null; }
  R.commission = { port: o.port, since: S.day, by: o.by };
  R.commissioned = { ...(R.commissioned || {}), [o.port]: true };
  S.purse += o.stipend;
  if (!R.rumours[o.port]) addRumour(S, o.port, HEARD[o.port]?.text || `The crown's pilots believe ${o.what} lies about here.`, 1.4);
  return o;
}

// Days pass: the races' dates come round. Returns messages.
export function tick(S) {
  const R = ensureRace(S);
  const msgs = [];
  if (R.commission && S.day >= R.commission.by && !R.firsts[R.commission.port]) {
    const r = raceOf(R.commission.port);
    R.commission = null;
    if (S.contracts) S.contracts.standing = Math.max(0, (S.contracts.standing || 0) - 3);
    msgs.push({ html: `Your commission to find ${r.what} has lapsed: ${r.who} got there first. The crown keeps its reward, and remembers.`, kind: 'danger', log: `Commission lapsed: ${r.what}.` });
  }
  for (const r of RACES) {
    const d = dateOf(S, r.port);
    if (S.day < d.day || R.told[r.port]) continue;
    R.told[r.port] = true;
    const first = R.firsts[r.port];
    if (first?.by === 'you') {
      const n = d.year - yearOf(first.day);
      msgs.push({ html: `${d.house ? `A caravel of the house of ${Houses.defOf(d.house).name}` : r.who} reaches ${r.what}, and finds your house there before him. <b>You beat ${d.house ? 'them' : r.who} to ${r.what} by ${n <= 0 ? 'a few months' : n === 1 ? 'a year' : `${n} years`}.</b>`, kind: 'discover', log: `Beat ${d.who} to ${r.what} by ${n} years.` });
      continue;
    }
    if (S.discovered[r.port]) continue;
    // A rival house's caravel got there first: the trade is theirs for a while.
    if (d.house) {
      R.firsts[r.port] = { by: d.house, day: S.day };
      R.grants[r.port] = { by: d.house, until: S.day + GRANT_YEARS * YEAR };
      R.history.push({ day: S.day, text: `the house of ${Houses.defOf(d.house).name} charted ${r.what}, ${r.year - d.year} ${r.year - d.year === 1 ? 'year' : 'years'} before ${r.who}` });
      S.discovered[r.port] = true;
      delete R.rumours[r.port];
      msgs.push({ html: `<b>News:</b> a caravel of the house of <b>${Houses.defOf(d.house).name}</b> is home from ${r.what}, years before anyone looked for it there. ${portById(r.port).name} is on every chart now, and the crown has granted the ${Houses.defOf(d.house).name} its trade for ${GRANT_YEARS} years.`, kind: 'discover', log: `The ${Houses.defOf(d.house).name} charted ${r.what} first.`, opens: r.port, port: r.port });
      continue;
    }
    // History happens on its date: the ports.js entry tells it, if it has one; else the news here.
    const told = HISTORY.some((h) => h.port === r.port && h.opens && h.year <= d.year);
    if (!told && r.news) {
      S.discovered[r.port] = true;
      delete R.rumours[r.port];
      msgs.push({ html: `<b>News:</b> ${r.news}`, kind: 'discover', log: r.news, opens: r.port, port: r.port });
    }
  }
  return msgs;
}

// ---- Rumours --------------------------------------------------------------------------------
// In port, the pilots talk: word of coasts not yet charted near here. Returns messages.
export function hear(S, pid) {
  const R = ensureRace(S);
  const msgs = [];
  for (const [port, h] of Object.entries(HEARD)) {
    if (!h.at.includes(pid) || S.discovered[port] || R.rumours[port] || R.firsts[port]) continue;
    addRumour(S, port, h.text, 1.4);
    msgs.push({ html: `<b>Talk on the quay:</b> ${h.text} <i>A rumour is marked on your chart.</i>`, kind: 'discover', log: `Heard a rumour: ${h.text}` });
  }
  return msgs;
}
function addRumour(S, port, text, spread, name = null) {
  const p = portById(port);
  const [dx, dy] = offset(port, spread);
  S.race.rumours[port] = { lon: p.lon + dx, lat: p.lat + dy, text, name: name || `Rumour: ${raceOf(port)?.what || p.name}` };
}

// Everything to draw on the chart: rumours of ports, and the legends not yet sailed to.
export function marks(S) {
  const R = ensureRace(S);
  const out = [];
  for (const [port, m] of Object.entries(R.rumours)) if (!S.discovered[port]) out.push({ id: port, kind: 'rumour', ...m });
  for (const [id, L] of Object.entries(LEGENDS)) if (R.legends[id]?.known && !R.legends[id].found) out.push({ id, kind: 'legend', lon: L.lon, lat: L.lat, name: L.name, text: L.text });
  return out;
}

// At sea: sailing over a legend's place finds what is (not) there, and where it leads.
export const LEGEND_REACH = 45; // nm
export function searchAt(S, lon, lat) {
  const R = ensureRace(S);
  const msgs = [];
  for (const [id, L] of Object.entries(LEGENDS)) {
    const st = R.legends[id];
    if (!st || st.found || distNm(lon, lat, L.lon, L.lat) > LEGEND_REACH) continue;
    st.found = S.day;
    R.history.push({ day: S.day, text: `sailed to where ${L.name} should be` });
    if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 1;
    let more = '';
    const lead = L.leads && LEADS[L.leads];
    if (lead && !S.discovered[lead.port] && !R.rumours[lead.port]) {
      addRumour(S, lead.port, lead.text, lead.port === 'flores' ? 1 : 3.5, lead.name);
      more = ` <i>${lead.name} is marked on your chart.</i>`;
    }
    msgs.push({ html: `<b>${L.name[0].toUpperCase()}${L.name.slice(1)}:</b> ${L.found}${more}`, kind: 'discover', log: `Searched for ${L.name}: ${L.found}`, legend: id });
  }
  return msgs;
}

// The Indies by the Cape: from São Brás, before da Gama, a voyage on into the unknown east.
export const canSeekIndia = (S, pid) => pid === 'saobras' && !S.discovered.calicut;
export function seekIndia(S) {
  if (S.discovered.calicut) return [];
  S.discovered.calicut = true;
  return charted(S, 'calicut');
}

// The house history, newest first, for the Houses tab.
export const history = (S) => [...ensureRace(S).history].reverse();

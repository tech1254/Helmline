// Expansion: your heir (Nov 2026). The game runs a hundred years, 1451 to 1551; no captain does.
// The founder of your house is twenty-five when the game begins. In middle age a marriage is
// arranged (a merchant's dowry, a noble name, or kinship with a rival house), children are born
// and grow, and at fourteen the eldest is placed: at sea, in the counting house, or at court. In
// old age the house passes to the heir, by your choice or by death; the house goes on, and its
// history remembers each head of it.
// Death and the dangers of childhood come only while you play: time away is only good news.
// Pure rules: no browser modules.

import { state } from './index.js';
import { yearOf, dayOfYear } from '../ships.js';
import * as Houses from '../houses.js';
import * as Accounts from '../accounts.js';

const YEAR = 365.25;
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const NAMES = {
  portugal: { m: ['João', 'Diogo', 'Afonso', 'Fernão', 'Pedro', 'Rui', 'Gonçalo', 'Duarte', 'Álvaro', 'Nuno', 'Martim', 'Vasco'], f: ['Isabel', 'Leonor', 'Beatriz', 'Catarina', 'Inês', 'Filipa', 'Joana', 'Margarida', 'Brites', 'Guiomar'] },
  castile: { m: ['Juan', 'Diego', 'Alonso', 'Fernando', 'Pedro', 'Rodrigo', 'Gonzalo', 'Martín', 'Francisco', 'Hernando', 'Luis', 'Andrés'], f: ['Isabel', 'Leonor', 'Beatriz', 'Catalina', 'Inés', 'Juana', 'María', 'Teresa', 'Mencía', 'Constanza'] },
};
export const MATCH_AGE = 28, CHILD_UNTIL = 42, PLACE_AGE = 14, ADULT = 18, OLD = 58, FRAIL = 68;
export const PLACES = {
  sea: { name: 'at sea', text: 'ships as a ship\'s boy under your best master, and learns the stars, the winds and the coasts', gift: { standing: 5 } },
  counting: { name: 'in the counting house', text: 'keeps the books under your factor, and learns the prices of every port and the art of the bill of exchange', gift: { purse: 3000 } },
  court: { name: 'at court', text: 'serves as a page in the king\'s household, and learns who matters, and how to be heard', gift: { standing: 15 } },
};
export const MATCHES = {
  merchant: { name: 'a merchant\'s daughter', text: 'The daughter of a rich merchant of the city, with a dowry of', dowry: 3000 },
  noble: { name: 'a noble house', text: 'A daughter of a noble house: no dowry worth the name, but the name itself opens doors at court.', standing: 15 },
  rival: { name: 'a rival house', text: 'A daughter of a rival house: the two houses become kin, and kin do not fight.' },
};

const mine = (S) => S.nation || 'portugal';
let seed = 0;
const pick = (arr, k) => arr[Math.abs(k) % arr.length];
function H(S) {
  const h = state(S, 'heir');
  if (!h.head) {
    const k = (S.story?.house || 'Vaz').length + (seed++);
    h.head = { name: pick(NAMES[mine(S)].m, k), born: -25 * YEAR - 40, sex: 'm', place: 'sea', gen: 1 };
    h.spouse = null; h.children = []; h.heads = []; h.told = {}; h.nextKid = 0;
  }
  return h;
}
export const ensure = H;
export const ageOf = (S, p) => Math.floor((S.day - p.born) / YEAR);
export const house = (S) => S.story?.house || (mine(S) === 'castile' ? 'Alcaraz' : 'Vaz');
export const headName = (S) => `${H(S).head.name} ${house(S)}`;
export const living = (S) => H(S).children.filter((c) => !c.died);
export const heirOf = (S) => living(S).filter((c) => ageOf(S, c) >= ADULT).sort((a, b) => a.born - b.born)[0] || null;

// A match, offered once the head of the house is of an age to marry.
export function matchOffer(S) {
  const h = H(S);
  if (h.spouse || ageOf(S, h.head) < MATCH_AGE || h.declined && S.day - h.declined < 2 * YEAR) return null;
  const rivals = Houses.active(S);
  const sw = (m) => (h.head.sex === 'f' ? { ...m, name: m.name.replace('daughter', 'son'), text: m.text.replace(/daughter/g, 'son') } : m);
  return { merchant: sw(MATCHES.merchant), noble: sw(MATCHES.noble), rival: rivals.length ? { ...sw(MATCHES.rival), house: rivals[0], houseName: Houses.defOf(rivals[0]).name } : null };
}
export function marry(S, kind) {
  const h = H(S), o = matchOffer(S);
  if (!o || !o[kind]) return null;
  const k = Math.floor(S.day);
  h.spouse = { name: pick(NAMES[mine(S)][h.head.sex === 'f' ? 'm' : 'f'], k), born: S.day - (ageOf(S, h.head) - 8) * YEAR, kind, day: S.day, house: o[kind].house || null };
  h.heads.push({ day: S.day, text: `${h.head.name} married ${h.spouse.name}${kind === 'rival' ? ` of the house of ${o.rival.houseName}` : kind === 'noble' ? ', of a noble house' : ''}` });
  let line = '';
  if (kind === 'merchant') { S.purse += MATCHES.merchant.dowry; Accounts.record(S, { kind: 'house', amount: MATCHES.merchant.dowry, text: 'The dowry' }); line = `${h.head.sex === 'f' ? 'The marriage settlement' : 'Her dowry'} of <b>${fmt(MATCHES.merchant.dowry)} cz</b> goes into the house.`; }
  if (kind === 'noble' && S.contracts) { S.contracts.standing = (S.contracts.standing || 0) + MATCHES.noble.standing; line = 'The court takes note of the match.'; }
  if (kind === 'rival') { const r = Houses.ensureHouses(S).h[o.rival.house]; if (r) { r.raids = 0; r.kin = true; } line = `The house of ${o.rival.houseName} is kin now: it forgets old grievances.`; }
  return { html: `${h.head.name} ${house(S)} marries ${h.spouse.name}. ${line}`, log: `Married ${h.spouse.name} (${kind}).` };
}
export function decline(S) { H(S).declined = S.day; }

// The eldest child at fourteen, placed where the house needs one.
export function toPlace(S) { return living(S).find((c) => !c.place && ageOf(S, c) >= PLACE_AGE) || null; }
export function place(S, where) {
  const c = toPlace(S), P = PLACES[where];
  if (!c || !P) return null;
  c.place = where;
  return { html: `${c.name} ${P.text}.`, log: `${c.name} placed ${P.name}.` };
}

// Handing the house on, by choice once the head is old, or at death.
export const canHandOver = (S) => ageOf(S, H(S).head) >= OLD && !!heirOf(S);
export function handOver(S, died = false) {
  const h = H(S);
  const next = heirOf(S) || { name: pick(NAMES[mine(S)].m, Math.floor(S.day) + 3), born: S.day - 24 * YEAR, sex: 'm', place: 'counting', nephew: true };
  const old = h.head;
  h.heads.push({ day: S.day, text: `${old.name} ${died ? 'died' : 'handed the house on'}, aged ${ageOf(S, old)}; ${next.name}${next.nephew ? ', a nephew,' : ''} became head of the house` });
  const gift = PLACES[next.place || 'counting'].gift;
  if (gift.purse) { S.purse += gift.purse; Accounts.record(S, { kind: 'house', amount: gift.purse, text: `${next.name}'s savings and partnerships` }); }
  if (gift.standing && S.contracts) S.contracts.standing = (S.contracts.standing || 0) + gift.standing;
  h.head = { name: next.name, born: next.born, sex: next.sex, place: next.place || 'counting', gen: (old.gen || 1) + 1 };
  h.children = h.children.filter((c) => c !== next);
  h.spouse = null; h.declined = null;
  h.past = [...(h.past || []), { name: old.name, born: old.born, died: S.day }];
  // the new head's own family starts afresh; the brothers and sisters stay in the house history
  h.siblings = [...(h.siblings || []), ...h.children.map((c) => c.name)];
  h.children = [];
  if (next.sex === 'f') h.head.sex = 'f';
  const lead = next.sex === 'f' ? 'She' : 'He';
  return { html: `${died ? `<b>${old.name} ${house(S)} is dead</b>, at ${ageOf(S, old)}, after ${Math.round((S.day - Math.max(0, old.born + 25 * YEAR)) / YEAR)} years at the head of the house. ` : `${old.name} ${house(S)}, at ${ageOf(S, old)}, hands the house on. `}<b>${next.name} ${house(S)}</b> is head of the house now. ${lead} was brought up ${PLACES[next.place || 'counting'].name}${gift.purse ? `, and brings ${fmt(gift.purse)} cz of savings and partnerships into the house` : gift.standing ? ', and is known at court' : ''}.`, log: `${next.name} ${house(S)} heads the house.` };
}

export function tick(S, dd, ctx = {}) {
  const h = H(S), msgs = [];
  const rand = ctx.rand || Math.random;
  const y = Math.floor(S.day / YEAR);
  if (h.year === y) return msgs; // once a year
  h.year = y;
  if (ctx.away) return msgs; // births and deaths wait for you
  // children
  if (h.spouse && ageOf(S, h.head.sex === 'f' ? h.head : h.spouse) <= CHILD_UNTIL && living(S).length < 6 && rand() < 0.33) {
    const sex = rand() < 0.5 ? 'm' : 'f';
    const taken = new Set([h.head.name, h.spouse.name, ...living(S).map((c) => c.name)]);
    const pool = NAMES[mine(S)][sex].filter((n) => !taken.has(n));
    const name = pick(pool.length ? pool : NAMES[mine(S)][sex], Math.floor(S.day) + (h.nextKid++) * 7);
    h.children.push({ name, born: S.day, sex });
    msgs.push({ html: `A ${sex === 'm' ? 'son' : 'daughter'} is born to ${h.head.name} and ${h.spouse.name}: <b>${name}</b>.`, kind: 'discover', log: `A ${sex === 'm' ? 'son' : 'daughter'}, ${name}, born.` });
  }
  for (const c of living(S)) if (ageOf(S, c) < 5 && rand() < 0.03) { // childhood was dangerous
    c.died = S.day;
    msgs.push({ html: `${c.name}, ${ageOf(S, c) < 1 ? 'not a year old' : `aged ${ageOf(S, c)}`}, has died of a fever. The house mourns.`, kind: 'danger', log: `${c.name} died in childhood.` });
  }
  const age = ageOf(S, h.head);
  if (!h.spouse && age >= MATCH_AGE && !h.told.match) { h.told.match = true; msgs.push({ html: `${h.head.name} ${house(S)} is ${age}, and the house needs an heir. Matches are being proposed: hear them in ${mine(S) === 'castile' ? 'Seville' : 'Lisbon'}.`, kind: 'discover', log: 'A match is proposed.' }); }
  if (toPlace(S) && !h.told[`place:${toPlace(S).name}`]) { h.told[`place:${toPlace(S).name}`] = true; msgs.push({ html: `${toPlace(S).name} is fourteen: time to be placed, at sea, in the counting house, or at court. Decide in ${mine(S) === 'castile' ? 'Seville' : 'Lisbon'}.`, kind: 'discover', log: `${toPlace(S).name} is fourteen.` }); }
  if (age >= OLD && !h.told[`old:${h.head.name}`]) { h.told[`old:${h.head.name}`] = true; msgs.push({ html: `${h.head.name} ${house(S)} is ${age}. ${heirOf(S) ? `${heirOf(S).name} is grown, and ready to take the house when you choose.` : 'The house has no grown heir yet.'}`, kind: 'discover', log: `${h.head.name} is ${age}.` }); }
  if (age >= FRAIL && rand() < 0.08 + (age - FRAIL) * 0.04) msgs.push(handOver(S, true));
  return msgs;
}

export function family(S) {
  const h = H(S);
  return { head: { ...h.head, age: ageOf(S, h.head) }, spouse: h.spouse && { ...h.spouse, age: ageOf(S, h.spouse) }, children: h.children.map((c) => ({ ...c, age: ageOf(S, c) })), heads: h.heads, past: h.past || [] };
}

export default { id: 'heir', name: 'Your heir', tick, ensure };

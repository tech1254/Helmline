// Your house: what a merchant grown rich spends his fortune on for honour rather than profit.
//
// A Lisbon merchant of the Discoveries bought his way up: a house on the Rua Nova dos
// Mercadores, an estate at Sintra, a chapel where masses are said for his soul, a knighthood of
// the Order of Christ, a place in the King's household, and in the end a commandery of the
// Order. Each brings renown (honra) and some a title; a few cost upkeep for as long as you keep
// them, and the crown takes loans it may not repay. They pay back little or nothing in money:
// they are what the money was for.
//
// All are bought in Lisbon (the House panel there).

import * as Accounts from './accounts.js';
import { yearOf } from './ships.js';

// Titles, highest last. `needs`: what you must hold first.
export const TITLES = [
  { id: 'merchant', name: 'Merchant of Lisbon', renown: 0 },
  { id: 'knight', name: 'Knight of the Order of Christ', renown: 10 },
  { id: 'fidalgo', name: 'Fidalgo of the Royal Household', renown: 40 },
  { id: 'commander', name: 'Commander of the Order of Christ', renown: 100 },
];

// cost in cz; renown gained; upkeep in cz a day for as long as you keep it; from: the year it can
// first be had; standing: least standing needed; needs: other things first; title: the title it
// grants; loan: lent to the crown and (mostly) repaid, as often as the crown owes you for fewer than two.
export const THINGS = [
  { id: 'townhouse', name: 'A house on the Rua Nova', cost: 6000, renown: 5, upkeep: 1,
    text: 'A tall merchant\'s house on the Rua Nova dos Mercadores, the street of the great traders, with a counting room below and your arms over the door.' },
  { id: 'knighthood', name: 'Knighthood of the Order of Christ', cost: 12000, renown: 10, standing: 20, title: 'knight',
    text: 'The habit of the Order of Christ, which pays for Prince Henry\'s voyages. Bought by service and by gifts to the Order.' },
  { id: 'altarpiece', name: 'An altarpiece for the cathedral', cost: 8000, renown: 6,
    text: 'A painted altarpiece from a Flemish workshop for a side chapel of the Sé, with you and your family kneeling at its foot.' },
  { id: 'quinta', name: 'A quinta at Sintra', cost: 25000, renown: 10, upkeep: 3, needs: ['townhouse'],
    text: 'A country estate in the cool green hills of Sintra, near the King\'s summer palace: orchards, a fountain court and a household of servants.' },
  { id: 'chapel', name: 'A family chapel', cost: 40000, renown: 20, needs: ['townhouse'],
    text: 'A chapel of your own in a Lisbon church, endowed for masses to be said for your soul and your family\'s for ever.' },
  { id: 'loan', name: 'A loan to the crown', cost: 30000, renown: 8, loan: true,
    text: 'The King needs money for his wars in Morocco and his fleets. He will repay it out of the crown\'s revenues, with interest, in his own time; kings sometimes forget.' },
  { id: 'fidalgo', name: 'A place in the Royal Household', cost: 50000, renown: 20, standing: 40, needs: ['knighthood'], title: 'fidalgo',
    text: 'Enrolment as a fidalgo of the King\'s household: the right to come to court, a moradia from the crown, and a name the old nobility must answer to.' },
  { id: 'expedition', name: 'Sponsor a voyage of discovery', cost: 20000, renown: 15, from: 1470,
    text: 'Fit out two caravels to sail beyond the last stone pillar on the African coast, for the glory of the crown and your name on the chart.' },
  { id: 'palace', name: 'A palace on the Tagus', cost: 120000, renown: 40, upkeep: 10, from: 1495, needs: ['quinta'],
    text: 'A palace on the river front by the new Ribeira palace of King Manuel, with a loggia over the water to watch the India fleets come in.' },
  { id: 'jeronimos', name: 'A tomb in the Jerónimos', cost: 80000, renown: 30, from: 1502, needs: ['chapel'],
    text: 'A carved tomb in the great new monastery of Belém, built with the pepper money, among the heroes of the Indies.' },
  { id: 'commandery', name: 'A commandery of the Order of Christ', cost: 150000, renown: 40, needs: ['fidalgo'], title: 'commander',
    text: 'A comenda of the Order: lands and church revenues held for life, and the title of commander. The highest honour a man of trade can hope for.' },
];

// Loans: repaid in yearly instalments over this many years, with this much interest, unless the
// crown defaults (each year's instalment may be put off, and in the end some are never paid).
export const LOAN_YEARS = 10;
export const LOAN_INTEREST = 0.04; // a year, on what is still owed
export const LOAN_DEFAULT = 0.2; // the chance each year that the crown pays nothing

export const thing = (id) => THINGS.find((t) => t.id === id);

export function ensureHouse(S) {
  if (!S.house) S.house = { owned: {}, renown: 0, loans: [], upkeepDue: 0 };
  return S.house;
}

export function renown(S) {
  return ensureHouse(S).renown;
}

export function title(S) {
  const H = ensureHouse(S);
  let t = TITLES[0];
  for (const x of THINGS) if (x.title && H.owned[x.id]) t = TITLES.find((y) => y.id === x.title);
  return t;
}

export function upkeep(S) {
  const H = ensureHouse(S);
  return THINGS.reduce((n, t) => n + (H.owned[t.id] && t.upkeep ? t.upkeep : 0), 0);
}

// Whether he can have it now, and if not why not.
export function canHave(S, id) {
  const H = ensureHouse(S);
  const t = thing(id);
  if (!t) return { ok: false, why: '' };
  const have = H.owned[id] || 0;
  if (!t.loan && have >= 1) return { ok: false, why: 'Already yours.' };
  if (t.loan && H.loans.filter((l) => l.owed > 0).length >= 2) return { ok: false, why: 'The crown still owes you for two loans.' };
  if (t.from && yearOf(S.day) < t.from) return { ok: false, why: `Not before ${t.from}.` };
  if (t.standing && (S.contracts?.standing ?? 0) < t.standing) return { ok: false, why: t.standing >= 40 ? 'Only for a captain trusted by the crown.' : 'Only for a captain the crown respects.' };
  for (const n of t.needs || []) if (!H.owned[n]) { const nm = thing(n).name; return { ok: false, why: `First: ${nm[0].toLowerCase()}${nm.slice(1)}.` }; }
  if (S.purse < t.cost) return { ok: false, why: `${t.cost.toLocaleString()} cz.` };
  return { ok: true };
}

// Buy it. Returns a message, or null.
export function acquire(S, id) {
  const c = canHave(S, id);
  if (!c.ok) return null;
  const H = ensureHouse(S);
  const t = thing(id);
  S.purse -= t.cost;
  H.owned[id] = (H.owned[id] || 0) + 1;
  H.renown += t.renown;
  if (t.loan) H.loans.push({ day: S.day, principal: t.cost, owed: t.cost, next: S.day + 365 });
  Accounts.record(S, { kind: 'house', amount: -t.cost, port: 'lisbon', text: t.loan ? 'A loan to the crown' : t.name });
  const was = t.title ? TITLES.find((y) => y.id === t.title) : null;
  return { html: was ? `You are now <b>${was.name}</b>.` : `${t.name}: yours. Renown ${H.renown}.`, kind: 'discover', log: `${t.name} (${t.cost} cz).` };
}

// As days pass: upkeep of houses and servants, and the crown's repayments. Returns news.
export function tick(S, days, rand = Math.random) {
  const H = ensureHouse(S);
  const msgs = [];
  const u = upkeep(S);
  if (u) {
    S.purse -= u * days;
    H.upkeepDue += u * days;
    if (H.upkeepDue >= 60) {
      Accounts.record(S, { kind: 'house', amount: -Math.round(H.upkeepDue), text: 'The upkeep of your house and household' });
      H.upkeepDue = 0;
    }
  }
  for (const l of H.loans) {
    if (l.owed <= 0 || S.day < l.next) continue;
    l.next += 365;
    if (S.day - l.day > 20 * 365) { l.owed = 0; continue; } // after twenty years the crown stops pretending
    if (rand() < LOAN_DEFAULT) {
      msgs.push({ html: 'The crown\'s treasurer regrets that this year\'s repayment of your loan must wait.', kind: '', level: 'routine', log: 'The crown put off repaying your loan.' });
      continue;
    }
    const part = Math.min(l.owed, l.principal / LOAN_YEARS);
    const pay = Math.round(part + l.owed * LOAN_INTEREST);
    l.owed -= part;
    S.purse += pay;
    Accounts.record(S, { kind: 'house', amount: pay, text: 'The crown repays part of your loan, with interest' });
  }
  return msgs;
}

// Finding the way south without the months of searching: two helps, both from the period.
//
// Pilots' directions: in Lagos, Prince Henry's harbour, the old pilots sell the courses they keep
// for the coast already found (Madeira, Arguin, the Gambia; later Serra Leoa and the Mina). Bought,
// the place is marked on your chart as reported; you still find it and chart it yourself.
//
// A commission for discovery: Prince Henry (from 1461, the crown's officers in Lisbon) pays part
// of a voyage of discovery down the coast: money now for the wages, and a reward when you come
// home having charted a new port south of Cape Bojador. Nothing is owed if you fail, but there is
// no second commission for two years.
// Pure rules: no browser here.

import { PORTS } from './world.js';
import { yearOf, dayOfYear } from './ships.js';
import * as Accounts from './accounts.js';

export const DIRECTIONS = [
  { port: 'funchal', price: 40, from: 1451 },
  { port: 'arguin', price: 80, from: 1451 },
  { port: 'gambia', price: 120, from: 1451 },
  { port: 'serraleoa', price: 160, from: 1462 },
  { port: 'cestos', price: 180, from: 1462 },
  { port: 'mina', price: 240, from: 1472 },
];
export const DIRECTIONS_AT = 'lagos';
// where the pilots who know the coast sell their courses: Lagos for Portugal, Palos for Castile
export const pilotsAt = (S) => (S.nation === 'castile' ? 'palos' : DIRECTIONS_AT);

const name = (pid) => PORTS.find((p) => p.id === pid)?.name || pid;

export function ensurePilots(S) {
  if (!S.directions) S.directions = {};
  return S.directions;
}

// The directions on sale here and now: not for ports you have charted or already have courses for.
export function directionsFor(S, pid) {
  if (pid !== pilotsAt(S)) return [];
  const y = yearOf(S.day);
  ensurePilots(S);
  return DIRECTIONS.filter((d) => y >= d.from && !S.discovered[d.port] && !S.directions[d.port]).map((d) => ({ ...d, name: name(d.port) }));
}

export function buyDirections(S, port) {
  const d = directionsFor(S, S.ship.docked).find((x) => x.port === port);
  if (!d || S.purse < d.price) return null;
  S.purse -= d.price;
  S.directions[port] = S.day;
  Accounts.record(S, { kind: 'charts', amount: -d.price, port: S.ship.docked, text: `Pilots' directions for ${d.name}` });
  return d;
}

// Reported places still to be found, for the chart.
export const reported = (S) => Object.keys(S.directions || {}).filter((pid) => !S.discovered[pid]).map((pid) => PORTS.find((p) => p.id === pid)).filter(Boolean);

// ---- The commission ----------------------------------------------------------------------
export const BOJADOR_LAT = 26.1;
export const HENRY_DIES = dayOfYear(1460) + Math.round((Date.UTC(1460, 10, 13) - Date.UTC(1460, 0, 1)) / 86400000); // 13 November 1460
export const COMMISSION = { advance: 150, reward: 250, days: 300, again: 730 };

export function patron(S) {
  if (S.nation === 'castile') return { who: 'the Duke of Medina Sidonia', where: 'sanlucar', name: 'The Duke of Medina Sidonia\'s commission', from: 'Sanlúcar' };
  return S.day < HENRY_DIES
    ? { who: 'Prince Henry', where: 'lagos', name: 'Prince Henry\'s commission', from: 'Sagres' }
    : { who: 'the crown\'s officers', where: 'lisbon', name: 'The crown\'s commission', from: 'the Casa da Guiné' };
}

export function ensureCommission(S) {
  if (!S.commission) S.commission = { active: null, last: null };
  return S.commission;
}

// What is offered where you lie, or null. For a house that has shown it can trade (contracts are
// open to it), with a port south of Bojador still to find.
export function commissionOffer(S) {
  const C = ensureCommission(S);
  const P = patron(S);
  if (!S.ship.docked || S.ship.docked !== P.where || C.active || !S.contracts?.unlocked) return null;
  if (C.last != null && S.day - C.last < COMMISSION.again) return null;
  const y = yearOf(S.day);
  const left = PORTS.filter((p) => p.lat < BOJADOR_LAT && !p.beyond && !S.discovered[p.id] && (!p.from || y >= p.from));
  if (!left.length) return null;
  return { ...P, ...COMMISSION, advance: S.day < HENRY_DIES || S.nation === 'castile' ? COMMISSION.advance : 100 };
}

export function takeCommission(S) {
  const o = commissionOffer(S);
  if (!o) return null;
  const C = ensureCommission(S);
  C.active = { taken: S.day, due: S.day + o.days, reward: o.reward, advance: o.advance, known: Object.keys(S.discovered).filter((k) => S.discovered[k]), found: null, who: o.who };
  C.last = S.day;
  S.purse += o.advance;
  Accounts.record(S, { kind: 'charts', amount: o.advance, port: S.ship.docked, text: `${o.name}: an advance for the voyage` });
  return C.active;
}

// Each day: a new port charted south of Bojador fulfils it; the reward is paid in Lagos or Lisbon.
// Past its day unfulfilled, it lapses. Returns messages.
export function tick(S) {
  const C = ensureCommission(S);
  const a = C.active;
  if (!a) return [];
  if (!a.found) {
    const p = PORTS.find((x) => S.discovered[x.id] && !a.known.includes(x.id) && x.lat < BOJADOR_LAT);
    if (p) {
      a.found = p.id;
      return [{ html: `<b>${p.name}</b> fulfils your commission for discovery. ${a.who[0].toUpperCase() + a.who.slice(1)} will pay ${a.reward} cz when you put in at ${S.nation === 'castile' ? 'Sanlúcar, Seville or Palos' : 'Lagos or Lisbon'}.`, kind: 'discover', log: `Commission fulfilled: ${p.name}.` }];
    }
    if (S.day > a.due) {
      C.active = null;
      return [{ html: 'Your commission for discovery has lapsed with nothing new charted. Nothing is owed, but there will be no other for a while.', kind: 'port', log: 'A commission for discovery lapsed.' }];
    }
    return [];
  }
  if (S.nation === 'castile' ? ['sanlucar', 'seville', 'palos'].includes(S.ship.docked) : S.ship.docked === 'lagos' || S.ship.docked === 'lisbon') {
    S.purse += a.reward;
    Accounts.record(S, { kind: 'charts', amount: a.reward, port: S.ship.docked, text: `Reward for the discovery of ${name(a.found)}` });
    C.active = null;
    C.last = S.day - COMMISSION.again / 2; // a good servant is asked again sooner
    return [{ html: `${a.who[0].toUpperCase() + a.who.slice(1)} pays you <b>${a.reward} cz</b> for the discovery of ${name(a.found)}.`, kind: 'discover', log: `Commission reward: ${a.reward} cz.` }];
  }
  return [];
}

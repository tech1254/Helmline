// Investments ashore, for a captain grown rich: things to spend a fortune on that pay back over
// years, or not at all.
//
//  - A feitoria: a trading post with a factor of your own in a port. Better prices there (he
//    buys before the market hears you are in, and sells when it is dear), and an extra contract
//    on the board. The factor draws wages every day.
//  - Shares in the crown's India fleet (from 1500). The armada sails from Lisbon each March and
//    comes home about sixteen months later, if it comes home: shareholders are paid out of the
//    pepper it brings, many times over in a good year, nothing if it is lost.

import * as Accounts from './accounts.js';
import { PORTS } from './world.js';
import { yearOf } from './ships.js';
import { START_DATE } from './config.js';

export const FEITORIA_STANDING = 20; // Respected: the crown licenses factors to captains it knows
export const FEITORIA_EDGE = 0.08; // prices 8% in your favour, buying and selling
export const FACTOR_WAGE = 1; // cz a day for each factor and his clerks
export const SHARE = 500; // cz a share
export const MAX_SHARES = 40; // in any one fleet
export const FLEETS_FROM = 1500;
const FLEET_SAILS = { month: 2, date: 15 }; // 15 March
const FLEET_AWAY_DAYS = 490; // about sixteen months
// What a fleet brings home, as a multiple of the shares: lost, a poor voyage, a fair one, a rich one.
export const OUTCOMES = [
  { p: 0.12, mult: 0, text: 'The India fleet of {y} is lost: wrecked on the shoals of Mozambique and in the storms off the Cape. Your shares are worth nothing.' },
  { p: 0.2, mult: 1.1, text: 'The India fleet of {y} limps home with half its ships and a thin cargo of pepper. Shareholders are paid back, with a little over.' },
  { p: 0.4, mult: 1.8, text: 'The India fleet of {y} comes home with a good cargo of pepper and cinnamon.' },
  { p: 0.28, mult: 2.8, text: 'The India fleet of {y} comes home rich: pepper, cloves, cinnamon and nutmeg. Lisbon talks of nothing else.' },
];

export function ensureInvest(S) {
  if (!S.invest) S.invest = { feitorias: {}, fleets: [], wagesDue: 0 };
  return S.invest;
}

const dayOf = (year, month, date) => Math.round((Date.UTC(year, month, date) - START_DATE.getTime()) / 86400000);

// ---- Feitorias ------------------------------------------------------------------------------

export function feitoriaCost(S, pid) {
  const size = S.ports?.[pid]?.size || 1000;
  return Math.round((3000 + size * 0.15) / 100) * 100;
}

export function hasFeitoria(S, pid) {
  return !!ensureInvest(S).feitorias[pid];
}

// Whether he may found one here, and if not, why not.
export function canFound(S, pid) {
  if (pid === 'lisbon') return { ok: false, why: 'Lisbon is home: your own house does the work of a factor here.' };
  if (hasFeitoria(S, pid)) return { ok: false, why: 'Your factor is already here.' };
  if ((S.contracts?.standing ?? 0) < FEITORIA_STANDING) return { ok: false, why: 'The crown licenses factors only to captains it respects (standing: Respected).' };
  const cost = feitoriaCost(S, pid);
  if (S.purse < cost) return { ok: false, why: `It would cost ${cost.toLocaleString()} cz.` };
  return { ok: true, cost };
}

export function found(S, pid) {
  const c = canFound(S, pid);
  if (!c.ok) return null;
  S.purse -= c.cost;
  ensureInvest(S).feitorias[pid] = { since: S.day, cost: c.cost };
  const p = PORTS.find((x) => x.id === pid);
  Accounts.record(S, { kind: 'invest', amount: -c.cost, port: pid, text: `A feitoria founded at ${p.name}` });
  return c.cost;
}

// Better prices where his factors are: added to the market's edge for those ports.
export function edges(S) {
  return Object.fromEntries(Object.keys(ensureInvest(S).feitorias).map((pid) => [pid, FEITORIA_EDGE]));
}

// ---- Shares in the India fleet --------------------------------------------------------------

// The fleet that shares bought today go into: this year's if it has not sailed yet, else next year's.
export function nextFleet(S) {
  const y = yearOf(S.day);
  const sails = dayOf(y, FLEET_SAILS.month, FLEET_SAILS.date);
  const year = S.day < sails ? y : y + 1;
  return { year, sails: dayOf(year, FLEET_SAILS.month, FLEET_SAILS.date) };
}

export function fleetsOpen(S) {
  return nextFleet(S).year >= FLEETS_FROM;
}

export function sharesIn(S, year) {
  return ensureInvest(S).fleets.filter((f) => f.year === year).reduce((n, f) => n + f.n, 0);
}

export function buyShares(S, n) {
  const I = ensureInvest(S);
  const f = nextFleet(S);
  n = Math.min(n, MAX_SHARES - sharesIn(S, f.year), Math.floor(S.purse / SHARE));
  if (n <= 0 || !fleetsOpen(S)) return 0;
  S.purse -= n * SHARE;
  I.fleets.push({ year: f.year, n, cost: n * SHARE, due: f.sails + FLEET_AWAY_DAYS });
  Accounts.record(S, { kind: 'invest', amount: -n * SHARE, text: `${n} shares in the India fleet of ${f.year}` });
  return n;
}

// ---- As days pass ---------------------------------------------------------------------------
// The factors' wages, and fleets coming home. Returns news for the game to show.
export function tick(S, days, rand = Math.random) {
  const I = ensureInvest(S);
  const msgs = [];
  const n = Object.keys(I.feitorias).length;
  if (n) {
    const pay = n * FACTOR_WAGE * days;
    S.purse -= pay;
    I.wagesDue += pay;
    if (I.wagesDue >= 60) { // booked about monthly
      Accounts.record(S, { kind: 'invest', amount: -Math.round(I.wagesDue), text: `Your factors' wages (${n} ${n === 1 ? 'feitoria' : 'feitorias'})` });
      I.wagesDue = 0;
    }
  }
  const home = I.fleets.filter((f) => S.day >= f.due);
  if (home.length) {
    I.fleets = I.fleets.filter((f) => S.day < f.due);
    const byYear = {};
    for (const f of home) (byYear[f.year] = byYear[f.year] || []).push(f);
    for (const [year, list] of Object.entries(byYear)) {
      let r = rand(), o = OUTCOMES[OUTCOMES.length - 1];
      for (const x of OUTCOMES) { if (r < x.p) { o = x; break; } r -= x.p; }
      const cost = list.reduce((t, f) => t + f.cost, 0);
      const paid = Math.round(cost * o.mult);
      if (paid) {
        S.purse += paid;
        Accounts.record(S, { kind: 'invest', amount: paid, text: `Paid out on the India fleet of ${year}` });
      }
      const text = o.text.replace('{y}', year);
      msgs.push({ html: `<b>News:</b> ${text} ${paid ? `Your ${cost / SHARE} shares pay <b>${paid.toLocaleString()} cz</b>.` : ''}`, kind: o.mult >= 1.5 ? 'discover' : o.mult ? 'port' : 'alert', level: o.mult ? 'normal' : 'alert', log: `${text} (${paid} cz)` });
    }
  }
  return msgs;
}

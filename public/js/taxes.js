// The crown's cut. A small trader is beneath the notice of the King's officials; a great house is
// not. Each New Year the vedores da fazenda assess the year's gains from trade (sales less
// purchases, contracts, less wages and the boatmen) for you and your captains together, and take
// a share that rises with the size of it, the way the crown took its fifth of the Guinea trade
// and its tenth at the Lisbon customs house. Renown softens them: a knight pays less, a
// commander of the Order much less.

import * as Accounts from './accounts.js';
import { yearOf } from './ships.js';
import { START_DATE } from './config.js';

// Bands of a year's gains and the share of each the crown takes.
export const BANDS = [
  { from: 0, rate: 0 },
  { from: 3000, rate: 0.1 },
  { from: 10000, rate: 0.2 },
  { from: 25000, rate: 0.3 },
];
export const RELIEF_PER_RENOWN = 1 / 200; // 100 renown: half off
export const MAX_RELIEF = 0.6;
const TAXED = ['sale', 'purchase', 'contract', 'contractGoods', 'skim', 'wages', 'boats'];

export function ensureTaxes(S) {
  if (!S.taxes) S.taxes = { year: yearOf(S.day), base: totals(S), paid: 0, last: null };
  return S.taxes;
}

function totals(S) {
  const A = Accounts.ensureAccounts(S);
  const t = Object.fromEntries(TAXED.map((k) => [k, A.totals[k] || 0]));
  for (const e of A.pending) if (TAXED.includes(e.kind)) t[e.kind] += e.amount; // the crown hears of it all
  t.wages -= (A.voyage?.wages || 0) + (S.fleet?.ships || []).reduce((n, x) => n + (x.wagesDue || 0), 0); // wages paid, booked or not
  return t;
}

export const relief = (renown) => Math.min(MAX_RELIEF, (renown || 0) * RELIEF_PER_RENOWN);

// The crown's share of a year's gains, before and after relief.
export function assess(gains, renown) {
  let tax = 0;
  for (let i = 0; i < BANDS.length; i++) {
    const lo = BANDS[i].from, hi = BANDS[i + 1]?.from ?? Infinity;
    if (gains > lo) tax += (Math.min(gains, hi) - lo) * BANDS[i].rate;
  }
  return { gross: Math.round(tax), tax: Math.round(tax * (1 - relief(renown))) };
}

// The gains so far this year, and what the crown would take of them.
export function sofar(S, renown) {
  const T = ensureTaxes(S);
  const now = totals(S);
  const gains = TAXED.reduce((n, k) => n + (now[k] - (T.base[k] || 0)), 0);
  return { gains: Math.round(gains), ...assess(gains, renown) };
}

// Called as days pass: on the first day of a new year, the assessment. Returns news.
export function tick(S, renown) {
  const T = ensureTaxes(S);
  const y = new Date(START_DATE.getTime() + Math.floor(S.day) * 86400000).getUTCFullYear();
  if (y <= T.year) return [];
  const a = sofar(S, renown);
  T.year = y;
  T.base = totals(S);
  T.last = { year: y - 1, gains: a.gains, tax: a.tax, gross: a.gross };
  if (a.tax <= 0) return [];
  S.purse -= a.tax;
  T.paid += a.tax;
  Accounts.record(S, { kind: 'crown', amount: -a.tax, port: 'lisbon', text: `The crown's share of your gains in ${y - 1}` });
  const saved = a.gross - a.tax;
  return [{ html: `<b>The crown's officials</b> assess your gains from trade in ${y - 1} at ${a.gains.toLocaleString()} cz and take <b>${a.tax.toLocaleString()} cz</b>${saved > 0 ? ` (your renown spares you ${saved.toLocaleString()})` : ''}.`, kind: 'port', level: 'normal', log: `Crown's share of ${y - 1}: ${a.tax} cz on gains of ${a.gains} cz.` }];
}

// Wear and repairs: hulls wear at sea and have to be put right, for money and days out of
// service. Pure rules with no browser, so the economy simulator uses them too
// (tests/sim/economy_sim.mjs, change D; tuned 27 Oct 2026).
//
// Hull condition runs 100 (sound) to 0. A ship loses a little every day at sea: slowly in
// Portuguese waters, about two and a half times as fast in the tropics, where weed grows and
// shipworm thrives in the warm salt water; and storms knock off a chunk now and then.
// A worn hull is slower (see Pirates.hullFactor), leaks below 60% (cargo spoils), and below 25%
// she is in danger. A shipyard (Lisbon, Lagos, Funchal) makes her sound again; anywhere else her
// crew can careen her on a beach, cheaper but slower, and only back to 80%.

import * as Ships from './ships.js';

export const YARDS = ['lisbon', 'lagos', 'funchal'];
export const WEAR_PER_DAY = { temperate: 0.08, tropic: 0.2 };
export const TROPIC_LAT = 26;
export const STORM = { perDay: 0.004, min: 5, max: 15 };
export const YARD_COST = 0.003; // share of the hull's price for each point repaired
export const YARD_PTS_PER_DAY = 5;
export const BEACH_COST = 0.4; // of the yard's price per point
export const BEACH_PTS_PER_DAY = 3;
export const BEACH_TO = 80;
export const LEAKS_BELOW = 60;
export const DANGER_BELOW = 25;
// Hired captains put in for repairs on their own: at a shipyard on their route below 70%,
// on a beach below 45%.
export const CAPTAIN_YARD_BELOW = 70;
export const CAPTAIN_BEACH_BELOW = 45;

export function wearPerDay(lat, hullId = null, years = 0) {
  return (lat < TROPIC_LAT ? WEAR_PER_DAY.tropic : WEAR_PER_DAY.temperate) * (hullId ? ageWear(hullId, years) : 1);
}

// ---- Age ------------------------------------------------------------------------------------
// A ship has a serviceable life (ships.js HULLS life; tropical service counts double). Until 70%
// of it is used, a yard makes her fully sound. After that the best any yard can do falls, to 50%
// at the end of her life and 20% at one and a half lives: she leaks, slows and at last founders.
// An old hull also wears faster at sea.
export const SOUND_UNTIL = 0.7;
export function soundCap(hullId, years) {
  const f = Ships.lifeShare(hullId, years);
  if (f <= SOUND_UNTIL) return 100;
  if (f <= 1) return Math.round(100 - 50 * (f - SOUND_UNTIL) / (1 - SOUND_UNTIL));
  return Math.max(20, Math.round(50 - 60 * (f - 1)));
}
export function ageWear(hullId, years) {
  return 1 + 2 * Math.max(0, Ships.lifeShare(hullId, years) - SOUND_UNTIL);
}

// Points lost to storms over a stretch of days at sea (0 most of the time).
export function storms(days, rand = Math.random) {
  let hit = 0;
  const p = STORM.perDay * days;
  if (rand() < p) hit += STORM.min + rand() * (STORM.max - STORM.min);
  return hit;
}

// The share of each cargo lost to a leaking hull over a passage (0 when she is tight).
export function leakShare(pct) {
  return pct < LEAKS_BELOW ? (LEAKS_BELOW - pct) / 200 : 0;
}

const price = (hullId) => (Ships.HULLS[hullId] || Ships.HULLS.caravel).price;

// What the shipyard asks to make her sound: money and days.
// `years`: her years of service, for what an old hull can still be brought back to.
export function yardQuote(hullId, pct, years = 0) {
  const to = soundCap(hullId, years);
  const pts = Math.max(0, to - pct);
  return { pts, cost: Math.ceil(pts * YARD_COST * price(hullId)), days: Math.ceil(pts / YARD_PTS_PER_DAY), to };
}

// Careening on a beach: cheaper, slower, and only back to 80%.
export function beachQuote(hullId, pct, years = 0) {
  const to = Math.min(BEACH_TO, soundCap(hullId, years));
  const pts = Math.max(0, to - pct);
  return { pts, cost: Math.ceil(pts * YARD_COST * BEACH_COST * price(hullId)), days: Math.ceil(pts / BEACH_PTS_PER_DAY), to };
}

// Word once as a ship grows old (70% of her serviceable life: the yards can no longer make her
// fully sound) and once as she passes it. `rec` keeps the flag (the flagship or a hired ship).
export function ageNotice(rec, hullId, years, name, flagship = false) {
  const f = Ships.lifeShare(hullId, years);
  const stage = f >= 1 ? 2 : f >= SOUND_UNTIL ? 1 : 0;
  if (stage <= (rec.ageWarned || 0)) return null;
  rec.ageWarned = stage;
  const cap = soundCap(hullId, years);
  return stage === 2
    ? `${name[0].toUpperCase() + name.slice(1)} is past her serviceable life: no yard can make her better than ${cap}% now, and she will only get worse. ${flagship ? 'The Lisbon yard will build you a new ship and take her in part exchange.' : 'Replace her hull at the Lisbon yard (Fleet), before the sea takes her.'}`
    : `${name[0].toUpperCase() + name.slice(1)} is growing old: ${Math.floor(years)} years of hard service. The yards can no longer make her fully sound (${cap}% at best), and it will only get worse.`;
}

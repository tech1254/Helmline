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

export function wearPerDay(lat) {
  return lat < TROPIC_LAT ? WEAR_PER_DAY.tropic : WEAR_PER_DAY.temperate;
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
export function yardQuote(hullId, pct) {
  const pts = Math.max(0, 100 - pct);
  return { pts, cost: Math.ceil(pts * YARD_COST * price(hullId)), days: Math.ceil(pts / YARD_PTS_PER_DAY), to: 100 };
}

// Careening on a beach: cheaper, slower, and only back to 80%.
export function beachQuote(hullId, pct) {
  const pts = Math.max(0, BEACH_TO - pct);
  return { pts, cost: Math.ceil(pts * YARD_COST * BEACH_COST * price(hullId)), days: Math.ceil(pts / BEACH_PTS_PER_DAY), to: BEACH_TO };
}

// The Indies: the passage beyond the edge of the chart, from the Cape to Calicut and back.
//
// The chart ends south-east of the Cape. A ship bound for Calicut sails off it there and is
// gone for months; one coming home reappears there. The passage is not sailed on the chart: it
// is reckoned by the monsoons, as the India fleets reckoned it. They left Lisbon in March to
// round the Cape by July and cross the Indian Ocean with the south-west monsoon, reaching the
// Malabar coast in September; they left India from December to February, with the north-east
// monsoon behind them. Out of season a ship beats against the monsoon, or lies waiting for it,
// and the longer she is out the more scurvy and storms take from her.

import { START_DATE } from './config.js';

// Days at sea between the edge of the chart and Calicut, by the month she sets out (0 = January).
//                  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
const OUT_DAYS =  [150, 140, 120, 110, 100,  80,  75,  80,  95, 105, 140, 150];
const HOME_DAYS = [ 75,  80,  95, 110, 160, 170, 165, 150, 130, 105,  90,  75];
const SEASON_OUT = [5, 6, 7]; // June to August: with the south-west monsoon
const SEASON_HOME = [11, 0, 1]; // December to February: with the north-east monsoon

export const LOSS_IN_SEASON = 0.02; // a ship lost on one passage, in season
export const LOSS_OUT_OF_SEASON = 0.06;
export const WEAR_PER_DAY = 0.16; // hull points a day: tropical waters, long out of reach of a yard
export const SCURVY_AFTER = 90; // days at sea before scurvy takes hold: extra hands to pay and feed

export function monthOf(day) {
  return new Date(START_DATE.getTime() + Math.floor(day) * 86400000).getUTCMonth();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The passage beyond the chart if she sets out on `day`: 'out' from the Cape to Calicut, 'home'
// from Calicut back to the Cape.
export function passage(day, dir) {
  const m = monthOf(day);
  const days = (dir === 'out' ? OUT_DAYS : HOME_DAYS)[m];
  const inSeason = (dir === 'out' ? SEASON_OUT : SEASON_HOME).includes(m);
  return {
    days, inSeason,
    loss: inSeason ? LOSS_IN_SEASON : LOSS_OUT_OF_SEASON,
    wear: days * WEAR_PER_DAY,
    scurvy: Math.max(0, days - SCURVY_AFTER),
    season: dir === 'out'
      ? (inSeason ? 'with the south-west monsoon behind her' : `out of season: the south-west monsoon blows from June to August, and in ${MONTHS[m]} she must fight the winds of the Indian Ocean`)
      : (inSeason ? 'with the north-east monsoon behind her' : `out of season: ships leave Malabar from December to February, and in ${MONTHS[m]} she must wait out or fight the monsoon`),
  };
}

// What the open ocean does to a ship beyond the ordinary wear of days at sea (which, with spoilage,
// is reckoned as for any passage): storms, and perhaps her loss. `rand` is Math.random, or a seeded
// one in the simulators.
export function hazards(p, rand = Math.random) {
  const storms = Math.floor(p.days / 30 * rand() * 1.2); // a storm every month or so, at worst
  return { hullLoss: storms * (6 + rand() * 8), storms, lost: rand() < p.loss };
}

// Whether a ship should sail now for the Indies (to round the Cape with the south-west monsoon,
// India fleets left Lisbon from February to April) or home from them (December to February).
export function seasonToSail(day, toIndies) {
  const m = monthOf(day);
  return toIndies ? [1, 2, 3].includes(m) : SEASON_HOME.includes(m);
}

// Tunable numbers: the ship, the calendar, rewards, time away and the fog grid.

import { BOUNDS } from './world.js';

// ---- Tunables ---------------------------------------------------------------
export const SAVE_KEY = 'helmline-proto0-v1';
export const DAYS_PER_SEC = 0.4; // at 1x: one in-game year in about 15 minutes of sailing
export const SHIP = { name: 'São Cristóvão', type: 'Caravel', hold: 40, knots: 5, upkeep: 3 };
export const SIGHT = 1.1; // degrees revealed around the ship
export const START_PURSE = 300;
export const CHART_REWARD = 150; // paid by the crown in Lisbon per newly charted land or port
export const MILESTONES = [1000, 2500, 5000, 10000];
export const WAGE_RESERVE = 14 * SHIP.upkeep;
export const START_DATE = new Date(Date.UTC(1451, 2, 1));
// While the player is away, the world moves on at a tenth of normal speed (if he has hired
// captains and his own ship is in port), up to a cap so the calendar can't run off overnight.
export const OFFLINE_RATE = 0.1; // a tenth of normal speed (tune in the playtest pass)
// The first 90 days come at the full offline rate; after that each doubling of the time away
// adds 30 more days, up to OFFLINE_MAX_DAYS. A night or a working day gives about 200 days.
export const OFFLINE_FULL_DAYS = 90;
export const OFFLINE_DAYS_PER_DOUBLING = 30;
export const OFFLINE_MAX_DAYS = 210;
export const STANDING_FADES_AFTER_HOURS = 24;
export const OFFLINE_MIN_SECONDS = 60;

// ---- Fog of war -------------------------------------------------------------
export const FOG_CELL = 0.2;
export const FW = Math.round((BOUNDS.east - BOUNDS.west) / FOG_CELL);
export const FH = Math.round((BOUNDS.north - BOUNDS.south) / FOG_CELL);

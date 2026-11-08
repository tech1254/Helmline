// Saving and loading on this device, and starting a new game.

import { BOUNDS, PORTS, KNOWN_LANDS } from './world.js';
import { GOODS, Market } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Accounts from './accounts.js';
import * as Pirates from './pirates.js';
import * as Taxes from './taxes.js';
import * as Story from './story.js';
import { playlogBegin } from './playlog.js';
import * as Ships from './ships.js';
import * as Ports from './ports.js';
import { NATIONS } from './nations.js';
import { SAVE_KEY, START_PURSE } from './config.js';
import { S, market, setGame } from './state.js';
import { fogToString, initFog, markFogDirty } from './fog.js';
import { centerOn } from './view.js';
import { syncMarket } from './sim.js';
import { observe } from './voyage.js';
import { addNotice } from './notices.js';

export function freshState(nation = 'portugal') {
  const N = NATIONS[nation] || NATIONS.portugal;
  const lis = PORTS.find((p) => p.id === N.start);
  return {
    nation: N.id,
    day: 0,
    purse: START_PURSE,
    cargo: Object.fromEntries(GOODS.map((g) => [g.id, 0])),
    paid: Object.fromEntries(GOODS.map((g) => [g.id, 0])), // total paid for current stock, for average cost
    ship: { lon: lis.lon, lat: lis.lat, heading: 210, route: [], dest: null, docked: N.start, hull: 'barca', name: N.flagship, fit: { ...Ships.DEFAULT_FIT } },
    discovered: Object.fromEntries(PORTS.map((p) => [p.id, p.known || N.known.includes(p.id)])),
    sighted: Object.fromEntries(KNOWN_LANDS.map((g) => [g, true])),
    unpaidCharts: [],
    seen: {},
    trail: [[lis.lon, lis.lat]],
    milestones: [],
    voyages: 0,
    rot: {}, // spoilage building up in the hold, per good
    tips: {},
    hull: 100,
  };
}

// ---- Save / load ------------------------------------------------------------
export function payload() {
  return JSON.stringify({ S, market: market.toJSON(), fog: fogToString(), fogBounds: BOUNDS });
}

export function save() {
  if (S) S.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, payload());
  } catch (e) { /* storage unavailable: play on without saving */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return applySaveData(JSON.parse(raw));
  } catch (e) {
    return false;
  }
}

export function applySaveData(d) {
  try {
    setGame(d.S, new Market(d.market));
    initFog(d.fog, d.fogBounds);
    markFogDirty();
    if (S.contracts && S.contracts.unlocked === undefined) S.contracts.unlocked = true;
    Contracts.ensureContracts(S);
    Events.ensureEvents(S);
    Fleet.ensureFleet(S);
    S.rot = S.rot || {};
    S.tips = S.tips || {};
    Pirates.ensurePirates(S);
    Accounts.ensureAccounts(S);
    Taxes.ensureTaxes(S); // a save from before taxes: the crown's reckoning starts now
    Story.ensureStory(S); // a save from before the story joins it where it is
    Ships.ensureFlagship(S);
    Ports.ensurePorts(S);
    // Ports and goods added since the save was made: the known ports charted, an empty hold for new goods.
    for (const p of PORTS) if (p.known && S.discovered[p.id] == null) S.discovered[p.id] = true;
    S.sighted = S.sighted || {};
    for (const g of KNOWN_LANDS) if (!S.sighted[g]) S.sighted[g] = true; // lands known in 1451, charted since the save
    for (const g of GOODS) { S.cargo[g.id] = S.cargo[g.id] || 0; S.paid[g.id] = S.paid[g.id] || 0; }
    if (S.yard.refunds?.length) {
      const total = S.yard.refunds.reduce((t, x) => t + x, 0);
      addNotice(`The caravela redonda is now a ship of her own at the Lisbon yard, not a re-rigging. The yard has returned the ${total.toLocaleString()} cz you paid down for a square rig.`, 'alert');
      Accounts.record(S, { kind: 'ships', amount: total, text: 'Refund: square rig order (now the caravela redonda)' });
      S.yard.refunds = [];
    }
    syncMarket();
    playlogBegin('load'); // the play log: this game, as it stands when loaded
    return true;
  } catch (e) {
    return false;
  }
}

// quiet: the stand-in game shown behind the intro before a crown is chosen (not logged, not saved).
export function newGame(nation = 'portugal', { quiet = false } = {}) {
  setGame(freshState(nation), new Market());
  const N = NATIONS[S.nation];
  initFog(null);
  // Hearsay from other captains: prices at the known ports, a while ago.
  for (const [pid, ago] of N.hearsay) {
    S.seen[pid] = { day: -ago, prices: market.observe(pid) };
  }
  Contracts.ensureContracts(S);
  Events.ensureEvents(S);
  Fleet.ensureFleet(S);
  Pirates.ensurePirates(S);
  Accounts.ensureAccounts(S);
  Taxes.ensureTaxes(S);
  Story.ensureStory(S, true);
  S.runId = null; if (!quiet) playlogBegin('new'); // a new game: a new run in the play log
  Ships.ensureFlagship(S);
  Ports.ensurePorts(S);
  syncMarket();
  observe(N.start);
  centerOn(...N.view);
  if (!quiet) save();
}

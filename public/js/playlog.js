// The play log: what you do and what happens, sent in batches to the game's server so the game
// can be tested and tuned from real play. Each game has its own id (S.runId) from its first day,
// so every save's story can be read on its own. Switched off in More (Play log); off, nothing
// is kept or sent.
//
// What is logged: every entry in the ledger (sales, purchases, wages, contracts, repairs, ships),
// every notice (what the game tells you: corsairs, captains, news, contracts), setting sail and
// arriving, captains' routes, a new voyage, time away, the story's choices, and a snapshot of the
// game each month (purse, hull, hold, standing, the fleet). No personal details: a random id for
// this browser, and your account name if you are signed in.

import { S } from './state.js';
import * as Cloud from './cloud.js';

const KEY = 'helmline-playlog';
const DEVICE_KEY = 'helmline-device';
const FLUSH_MS = 30000;
const MAX_QUEUE = 2000;
let queue = [];
let device = null;
let lastSnapshot = null;

export function playlogOn() {
  if (typeof navigator !== 'undefined' && navigator.webdriver && !window.helmlineLog) return false; // the tests, unless they ask
  try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return false; }
}
export function setPlaylog(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
  if (!on) queue = [];
}

function deviceId() {
  if (device) return device;
  try {
    device = localStorage.getItem(DEVICE_KEY);
    if (!device) { device = `d${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`; localStorage.setItem(DEVICE_KEY, device); }
  } catch (e) { device = 'd-nostorage'; }
  return device;
}

export function ensureRun(S0 = S) {
  if (S0 && !S0.runId) S0.runId = `r${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  return S0?.runId;
}

// Log one event. `data` must be small and plain.
export function plog(kind, data = {}) {
  if (!S || !playlogOn()) return;
  ensureRun();
  queue.push({ t: Date.now(), day: Math.round(S.day * 100) / 100, ...data, kind }); // the event's kind wins over any field of that name
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

// The game as it stands: enough to follow a career month by month.
export function snapshot() {
  const cargo = Object.fromEntries(Object.entries(S.cargo || {}).filter(([, n]) => n > 0));
  return {
    purse: Math.round(S.purse), hull: Math.round(S.hull ?? 100), ship: S.ship.hull, at: S.ship.docked || null,
    lon: Math.round(S.ship.lon * 100) / 100, lat: Math.round(S.ship.lat * 100) / 100, cargo,
    standing: S.contracts?.standing ?? 0, contracts: (S.contracts?.active || []).map((c) => c.title),
    notoriety: Math.round(S.pirates?.notoriety || 0), renown: S.house?.renown || 0,
    fleet: (S.fleet?.ships || []).map((x) => ({ name: x.name, hull: x.hull, at: x.at, status: x.status, profit: Math.round(x.profit || 0), route: x.route?.stops?.map((st) => st.port) || null, nav: Math.round((x.captain?.nav || 0) * 10) / 10, trade: Math.round((x.captain?.trade || 0) * 10) / 10, wage: x.captain?.wage })),
    totals: Object.fromEntries(Object.entries(S.accounts?.totals || {}).map(([k, v]) => [k, Math.round(v)])),
  };
}

// Called as the game runs: a snapshot each game month.
export function playlogTick() {
  if (!S || !playlogOn()) return;
  if (lastSnapshot == null || S.day - lastSnapshot >= 30) { lastSnapshot = S.day; plog('snapshot', snapshot()); }
}

function batch() {
  if (!queue.length || !S) return null;
  const events = queue.splice(0, 400);
  return JSON.stringify({ device: deviceId(), account: Cloud.account.name || undefined, run: ensureRun(), events });
}

export async function flushPlaylog(beacon = false) {
  if (!playlogOn()) return;
  const body = batch();
  if (!body) return;
  try {
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon('/api/playlog', new Blob([body], { type: 'application/json' })); return; }
    const r = await fetch('/api/playlog', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    if (!r.ok && r.status >= 500) queue.unshift(...JSON.parse(body).events); // try again later
  } catch (e) {
    queue.unshift(...JSON.parse(body).events); // offline: keep them for later
  }
}

export function initPlaylog() {
  setInterval(() => flushPlaylog(), FLUSH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { plog('hidden', snapshot()); flushPlaylog(true); } });
  window.addEventListener('pagehide', () => flushPlaylog(true));
}

// A new game, a loaded one: start its log afresh.
export function playlogBegin(kind) {
  lastSnapshot = null;
  ensureRun();
  plog(kind, snapshot());
}

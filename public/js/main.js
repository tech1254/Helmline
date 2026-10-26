import {
  BOUNDS, COS0, D2R, LANDS, LAND_GROUPS, PORTS, isLand, inBounds, windAt, sailFactor,
  pointOfSail, compassPoint, bearing, distNm, angleDiff, findPath, clearWater,
} from './world.js';
import { GOODS, Market, PORTUGUESE_PORTS } from './economy.js';
import * as Contracts from './contracts.js';
import * as Events from './events.js';
import * as Fleet from './fleet.js';
import * as Cloud from './cloud.js';

// ---- Tunables ---------------------------------------------------------------
const SAVE_KEY = 'helmline-proto0-v1';
const DAYS_PER_SEC = 0.4; // at 1x: one in-game year in about 15 minutes of sailing
const SHIP = { name: 'São Cristóvão', type: 'Caravel', hold: 40, knots: 5, upkeep: 3 };
const SIGHT = 1.1; // degrees revealed around the ship
const START_PURSE = 300;
const CHART_REWARD = 150; // paid by the crown in Lisbon per newly charted land or port
const MILESTONES = [1000, 2500, 5000, 10000];
const WAGE_RESERVE = 14 * SHIP.upkeep;
const START_DATE = new Date(Date.UTC(1451, 2, 1));
// While the player is away, the world moves on at a tenth of normal speed (if he has hired
// captains and his own ship is in port), up to a cap so the calendar can't run off overnight.
const OFFLINE_RATE = 0.1; // a tenth of normal speed (tune in the playtest pass)
// The first 90 days come at the full offline rate; after that each doubling of the time away
// adds 30 more days, up to OFFLINE_MAX_DAYS. A night or a working day gives about 200 days.
const OFFLINE_FULL_DAYS = 90;
const OFFLINE_DAYS_PER_DOUBLING = 30;
const OFFLINE_MAX_DAYS = 210;
const STANDING_FADES_AFTER_HOURS = 24;
const OFFLINE_MIN_SECONDS = 60;

// ---- Fog of war -------------------------------------------------------------
const FOG_CELL = 0.2;
const FW = Math.round((BOUNDS.east - BOUNDS.west) / FOG_CELL);
const FH = Math.round((BOUNDS.north - BOUNDS.south) / FOG_CELL);

// ---- State --------------------------------------------------------------------
let S; // game state
let market;
let fog; // Uint8Array, 1 = unknown
let fogDirty = true;

function freshState() {
  const lis = PORTS[0];
  return {
    day: 0,
    purse: START_PURSE,
    cargo: Object.fromEntries(GOODS.map((g) => [g.id, 0])),
    paid: Object.fromEntries(GOODS.map((g) => [g.id, 0])), // total paid for current stock, for average cost
    ship: { lon: lis.lon, lat: lis.lat, heading: 210, route: [], dest: null, docked: 'lisbon' },
    discovered: Object.fromEntries(PORTS.map((p) => [p.id, p.known])),
    sighted: { iberia: true, africa: true, madeira: true, canaries: true },
    unpaidCharts: [],
    seen: {},
    trail: [[lis.lon, lis.lat]],
    milestones: [],
    voyages: 0,
    rot: {}, // spoilage building up in the hold, per good
    tips: {},
  };
}

function initFog(saved) {
  fog = new Uint8Array(FW * FH).fill(1);
  if (saved) {
    const bin = atob(saved);
    for (let i = 0; i < fog.length && i < bin.length; i++) fog[i] = bin.charCodeAt(i);
    return;
  }
  // Known to Portuguese pilots by 1451: Iberia, Morocco to Cape Bojador, Madeira, the Canaries.
  for (const l of LANDS) {
    if (l.group === 'iberia' || l.group === 'madeira' || l.group === 'canaries') {
      for (const [x, y] of l.pts) revealAt(x, y, l.group === 'iberia' ? 1.4 : 0.9, true);
    }
    if (l.group === 'africa') {
      for (const [x, y] of l.pts) if (y >= 26 && x < 0) revealAt(x, y, 1.4, true);
    }
  }
  // Home waters and the Moroccan coast are known inland too.
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) {
      const x = BOUNDS.west + (i + 0.5) * FOG_CELL, y = BOUNDS.south + (j + 0.5) * FOG_CELL;
      if (x > -10.5 && y > 35.5 && isLand(x, y)) fog[j * FW + i] = 0;
      if (x > -6.5 && y > 34.8) fog[j * FW + i] = 0; // the Strait and the western Mediterranean
      if (x > -14 && y > 27.4 && y <= 35.5 && isLand(x, y)) fog[j * FW + i] = 0;
    }
  }
  // The sea lanes between them.
  const lanes = [[-9.4, 38.6, -16.9, 32.6], [-9.4, 38.6, -13.4, 28.9], [-16.9, 32.6, -13.4, 28.9], [-9.4, 38.6, -8.7, 37.0], [-13.4, 28.9, -14.6, 26.1]];
  for (const [a, b, c, d] of lanes) {
    for (let t = 0; t <= 1; t += 0.02) revealAt(a + (c - a) * t, b + (d - b) * t, 0.8, true);
  }
}

function fogToString() {
  let s = '';
  for (let i = 0; i < fog.length; i += 4096) s += String.fromCharCode.apply(null, fog.subarray(i, i + 4096));
  return btoa(s);
}

function fogIdx(lon, lat) {
  const i = Math.floor((lon - BOUNDS.west) / FOG_CELL), j = Math.floor((lat - BOUNDS.south) / FOG_CELL);
  if (i < 0 || j < 0 || i >= FW || j >= FH) return -1;
  return j * FW + i;
}

function isRevealed(lon, lat) {
  const k = fogIdx(lon, lat);
  return k >= 0 && fog[k] === 0;
}

function revealAt(lon, lat, r, quiet = false) {
  const cl = Math.cos(lat * D2R);
  const i0 = Math.floor((lon - r / cl - BOUNDS.west) / FOG_CELL), i1 = Math.ceil((lon + r / cl - BOUNDS.west) / FOG_CELL);
  const j0 = Math.floor((lat - r - BOUNDS.south) / FOG_CELL), j1 = Math.ceil((lat + r - BOUNDS.south) / FOG_CELL);
  let changed = false;
  for (let j = Math.max(0, j0); j <= Math.min(FH - 1, j1); j++) {
    for (let i = Math.max(0, i0); i <= Math.min(FW - 1, i1); i++) {
      const x = BOUNDS.west + (i + 0.5) * FOG_CELL, y = BOUNDS.south + (j + 0.5) * FOG_CELL;
      if (Math.hypot((x - lon) * cl, y - lat) <= r && fog[j * FW + i]) { fog[j * FW + i] = 0; changed = true; }
    }
  }
  if (changed) fogDirty = true;
  if (quiet || !S) return;
  for (const p of PORTS) {
    if (!S.discovered[p.id] && distNm(lon, lat, p.lon, p.lat) <= r * 55) {
      S.discovered[p.id] = true;
      S.unpaidCharts.push(p.name);
      toast(`New port charted: <b>${p.name}</b>`, 'discover');
      log(`Charted the port of ${p.name}.`);
    }
  }
  for (const l of LANDS) {
    if (S.sighted[l.group]) continue;
    if (l.pts.some(([x, y]) => distNm(lon, lat, x, y) <= r * 55)) {
      S.sighted[l.group] = true;
      const name = LAND_GROUPS[l.group];
      S.unpaidCharts.push(name);
      toast(`Land ho! You have sighted <b>${name}</b>.`, 'discover');
      log(`Sighted ${name}.`);
    }
  }
}

// ---- Save / load ------------------------------------------------------------
function payload() {
  return JSON.stringify({ S, market: market.toJSON(), fog: fogToString() });
}

function save() {
  if (S) S.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, payload());
  } catch (e) { /* storage unavailable: play on without saving */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return applySaveData(JSON.parse(raw));
  } catch (e) {
    return false;
  }
}

// ---- Cloud saves ---------------------------------------------------------------
let lastPushed = null; // the payload last sent, so unchanged games are not re-sent
let cloudBusy = false;
let cloudClock = 0;
let remoteAhead = null; // a newer cloud save found at start-up

async function cloudSync(force = false) {
  if (!Cloud.cloud.code || cloudBusy || !introDone) return;
  if (Cloud.cloud.status === 'conflict' && !force) return;
  const data = payload();
  if (data === lastPushed && !force) return;
  cloudBusy = true;
  try {
    const r = await Cloud.push(data, S.day, force);
    if (r.ok) lastPushed = data;
    else if (r.conflict) showConflict(r.conflict);
  } catch (e) {
    Cloud.markFailed(e);
  } finally {
    cloudBusy = false;
    renderCloudButton();
    if (panelMode === 'cloud') renderPanel();
  }
}

function showConflict(remote) {
  confirmDialog({
    title: 'This voyage moved on another device',
    body: `<dl class="facts">
        <dt>Other device</dt><dd>${fmtDate(remote.day || 0)}, saved ${timeAgo(remote.updatedAt)}</dd>
        <dt>This device</dt><dd>${fmtDate(S.day)}</dd>
      </dl>
      <p>Which voyage do you want to keep? The other one will be replaced.</p>
      <p><button data-modal-action="keep-local">Keep this device's voyage</button></p>`,
    ok: "Load the other device's",
    onOk: () => loadFromCloud(Cloud.cloud.code, true),
    actions: { 'keep-local': () => cloudSync(true) },
  });
}

async function loadFromCloud(code, alreadyConfirmed = false) {
  let r;
  try { r = await Cloud.fetchSave(code); } catch (e) { r = { ok: false, error: 'Could not reach the server.' }; }
  if (!r.ok) { toast(r.status === 404 ? 'No save found for that code. Check it and try again.' : r.error); return; }
  const go = () => {
    const prev = { S, market };
    if (!applySaveData(JSON.parse(r.data))) {
      S = prev.S; market = prev.market;
      toast('That save could not be read.');
      return;
    }
    Cloud.link(code, r.version);
    lastPushed = null;
    const sum = catchUp();
    if (sum) pendingSummary = sum;
    remoteAhead = null;
    save();
    panelMode = S.ship.docked ? 'port' : null;
    centerOn(S.ship.lon, S.ship.lat);
    renderPanel();
    renderCloudButton();
    toast(`Loaded your voyage from the cloud: <b>${fmtDate(S.day)}</b>.`, 'port');
  };
  if (alreadyConfirmed) { go(); return; }
  confirmDialog({
    title: 'Load this cloud save?',
    body: `<dl class="facts"><dt>Cloud save</dt><dd>${fmtDate(r.day || 0)}, saved ${timeAgo(r.updatedAt)}</dd><dt>This device</dt><dd>${fmtDate(S.day)}</dd></dl>
      <p>The voyage on this device will be replaced, and the two devices will stay in sync from now on.</p>`,
    ok: 'Load it',
    onOk: go,
  });
}

async function startCloudSave() {
  try {
    const r = await Cloud.create(payload(), S.day);
    if (!r.ok) { toast(r.error || 'Could not start a cloud save.'); return; }
    lastPushed = payload();
    toast(`Cloud save started. Your code is <b>${r.code}</b>.`, 'discover');
  } catch (e) {
    Cloud.markFailed(e);
    toast('Could not reach the server.');
  }
  renderCloudButton();
  renderPanel();
}

// At start-up: is the cloud copy ahead of this device?
async function checkCloudOnStart() {
  if (!Cloud.cloud.code) return;
  try {
    const r = await Cloud.fetchSave();
    if (!r.ok) { if (r.status === 404) Cloud.markFailed({ message: 'The cloud save no longer exists.' }); renderCloudButton(); return; }
    if (r.version > Cloud.cloud.version) {
      remoteAhead = r;
      if (!introDone) {
        $('intro-cloud').hidden = false;
        $('intro-cloud').textContent = `Continue from the cloud (${fmtDate(r.day || 0)})`;
        $('intro-continue').textContent = 'Continue on this device';
      }
    }
  } catch (e) {
    Cloud.markFailed(e);
  }
  renderCloudButton();
}

function timeAgo(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function renderCloudButton() {
  const b = $('btn-cloud');
  const st = Cloud.cloud.status;
  b.classList.toggle('linked', st === 'idle' || st === 'syncing');
  b.classList.toggle('problem', st === 'error' || st === 'conflict');
  b.title = st === 'off' ? 'Cloud save: off' : st === 'error' ? `Cloud save: ${Cloud.cloud.error}` : st === 'conflict' ? 'Cloud save: played on another device' : `Cloud save: synced ${timeAgo(Cloud.cloud.lastSync)}`;
}

function renderCloud(el) {
  const c = Cloud.cloud;
  const loadForm = `<form class="code-form" data-cloud-form>
      <label for="cloud-code">Save code from another device</label>
      <div class="code-row"><input id="cloud-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20"><button class="primary" type="submit">Load</button></div>
    </form>`;
  let body;
  if (!c.code) {
    body = `<p class="blurb">Keep one voyage in step across your devices. A cloud save gets a code: enter it on your phone or another computer, and both stay in sync.</p>
      <div class="row" style="justify-content:flex-start"><button class="primary" data-cloud-create>Start a cloud save</button></div>
      <h3>Already have a code?</h3>${loadForm}`;
  } else {
    const state = { idle: `Synced ${timeAgo(c.lastSync)}.`, syncing: 'Syncing…', error: `Not synced: ${c.error}`, conflict: 'This voyage was also played on another device.' }[c.status] || '';
    body = `<p class="blurb">This voyage is saved to the cloud. Enter the code on another device to continue there.</p>
      <div class="save-code"><span id="cloud-code-text">${c.code}</span><button data-cloud-copy>Copy</button></div>
      <p class="${c.status === 'error' || c.status === 'conflict' ? 'warn' : 'muted'}">${state}</p>
      <p class="foot">Keep the code private: anyone with it can load or overwrite this voyage. The game syncs about every 30 seconds while you play, and whenever you reach port.</p>
      <div class="row"><button data-cloud-unlink>Stop syncing this device</button><button class="primary" data-cloud-sync>Sync now</button></div>
      <h3>Switch to a different save</h3>${loadForm}`;
  }
  el.innerHTML = `
    <header><h2>Cloud save</h2><button class="close" data-close aria-label="Close">×</button></header>
    ${body}`;
}

// Bring a saved game (from this device or the cloud) into play.
function applySaveData(d) {
  try {
    S = d.S;
    market = new Market(d.market);
    initFog(d.fog);
    fogDirty = true;
    if (S.contracts && S.contracts.unlocked === undefined) S.contracts.unlocked = true;
    Contracts.ensureContracts(S);
    Events.ensureEvents(S);
    Fleet.ensureFleet(S);
    S.rot = S.rot || {};
    S.tips = S.tips || {};
    syncMarket();
    return true;
  } catch (e) {
    return false;
  }
}

function newGame() {
  S = freshState();
  market = new Market();
  initFog(null);
  // Hearsay from other captains: prices at the known ports, a while ago.
  for (const [pid, ago] of [['lagos', 20], ['funchal', 75], ['lanzarote', 110]]) {
    S.seen[pid] = { day: -ago, prices: market.observe(pid) };
  }
  Contracts.ensureContracts(S);
  Events.ensureEvents(S);
  Fleet.ensureFleet(S);
  syncMarket();
  observe('lisbon');
  centerOn(-13, 29, 0.85);
  save();
}

// ---- Canvas & camera --------------------------------------------------------
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const fogCanvas = document.createElement('canvas');
fogCanvas.width = FW;
fogCanvas.height = FH;
const fogCtx = fogCanvas.getContext('2d');
// Soft, high-resolution copy of the fog, rebuilt only when something is revealed.
const FOG_UP = 4;
const fogSoft = document.createElement('canvas');
fogSoft.width = FW * FOG_UP;
fogSoft.height = FH * FOG_UP;
const fogSoftCtx = fogSoft.getContext('2d');
let W = 0, H = 0, DPR = 1;
const cam = { x: -13 * COS0, y: -29, scale: 30 };

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}

function centerOn(lon, lat, fit) {
  cam.x = lon * COS0;
  cam.y = -lat;
  if (fit) cam.scale = Math.max(8, Math.min(W / (18 * COS0), H / 20) * fit * 1.2);
  clampCam();
}

function clampCam() {
  cam.scale = Math.max(Math.min(W / ((BOUNDS.east - BOUNDS.west) * COS0), H / (BOUNDS.north - BOUNDS.south)), Math.min(400, cam.scale));
  const hw = W / 2 / cam.scale, hh = H / 2 / cam.scale;
  const x0 = BOUNDS.west * COS0, x1 = BOUNDS.east * COS0, y0 = -BOUNDS.north, y1 = -BOUNDS.south;
  cam.x = x1 - x0 < 2 * hw ? (x0 + x1) / 2 : Math.max(x0 + hw, Math.min(x1 - hw, cam.x));
  cam.y = y1 - y0 < 2 * hh ? (y0 + y1) / 2 : Math.max(y0 + hh, Math.min(y1 - hh, cam.y));
}

const toScreen = (lon, lat) => [(lon * COS0 - cam.x) * cam.scale + W / 2, (-lat - cam.y) * cam.scale + H / 2];
const toWorld = (sx, sy) => [((sx - W / 2) / cam.scale + cam.x) / COS0, -((sy - H / 2) / cam.scale + cam.y)];

// ---- Rendering --------------------------------------------------------------
const INK = '#4a3622';
const SEA = '#ecdfc0';
const LANDFILL = '#d6bd8a';
const RED = '#a2372b';

function updateFogCanvas() {
  const img = fogCtx.createImageData(FW, FH);
  for (let j = 0; j < FH; j++) {
    for (let i = 0; i < FW; i++) {
      const src = j * FW + i;
      const dst = ((FH - 1 - j) * FW + i) * 4; // flip: north at top
      img.data[dst] = 46; img.data[dst + 1] = 36; img.data[dst + 2] = 27;
      img.data[dst + 3] = fog[src] ? 250 : 0;
    }
  }
  fogCtx.putImageData(img, 0, 0);
  fogSoftCtx.clearRect(0, 0, fogSoft.width, fogSoft.height);
  fogSoftCtx.imageSmoothingEnabled = true;
  fogSoftCtx.filter = `blur(${FOG_UP * 0.9}px)`;
  // draw slightly oversized so the blur doesn't fade the chart's outer edge
  const pad = FOG_UP * 3;
  fogSoftCtx.drawImage(fogCanvas, -pad, -pad, fogSoft.width + 2 * pad, fogSoft.height + 2 * pad);
  fogSoftCtx.filter = 'none';
  fogDirty = false;
}

function pathPoly(pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [sx, sy] = toScreen(x, y);
    i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
  });
  ctx.closePath();
}

function drawRose(lon, lat, r) {
  const [cx, cy] = toScreen(lon, lat);
  ctx.save();
  // rhumb lines
  ctx.strokeStyle = 'rgba(120, 80, 45, 0.13)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a) * 4000, cy - Math.cos(a) * 4000);
    ctx.stroke();
  }
  const R = Math.max(18, r);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const long = i % 2 === 0;
    const len = long ? R : R * 0.62;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a - 0.18) * len * 0.28, cy - Math.cos(a - 0.18) * len * 0.28);
    ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
    ctx.lineTo(cx + Math.sin(a + 0.18) * len * 0.28, cy - Math.cos(a + 0.18) * len * 0.28);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? RED : long ? 'rgba(74,54,34,0.75)' : 'rgba(74,54,34,0.4)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = SEA;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function drawWind() {
  const step = cam.scale > 40 ? 1.5 : cam.scale > 20 ? 2.5 : 4;
  const [w0, n0] = toWorld(0, 0), [e0, s0] = toWorld(W, H);
  ctx.save();
  ctx.strokeStyle = 'rgba(60, 80, 100, 0.35)';
  ctx.lineWidth = 1.2;
  for (let lat = Math.floor(s0 / step) * step; lat <= n0; lat += step) {
    for (let lon = Math.floor(w0 / step) * step; lon <= e0; lon += step) {
      if (!inBounds(lon, lat) || isLand(lon, lat)) continue;
      const w = windAt(lon, lat, S.day);
      const [sx, sy] = toScreen(lon, lat);
      const to = (w.from + 180) * D2R;
      const len = 7 + 9 * w.strength;
      const dx = Math.sin(to) * len, dy = -Math.cos(to) * len;
      ctx.beginPath();
      ctx.moveTo(sx - dx / 2, sy - dy / 2);
      ctx.lineTo(sx + dx / 2, sy + dy / 2);
      const hx = sx + dx / 2, hy = sy + dy / 2, a = Math.atan2(dy, dx);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(a - 0.5) * 4, hy - Math.sin(a - 0.5) * 4);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(a + 0.5) * 4, hy - Math.sin(a + 0.5) * 4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawShip() {
  drawShipAt(S.ship.lon, S.ship.lat, S.ship.heading, '#f7f0de', RED, 1);
}

function drawShipAt(lon, lat, heading, sail, flag, size) {
  const [sx, sy] = toScreen(lon, lat);
  const s = Math.max(0.8, Math.min(1.6, cam.scale / 30)) * size;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(heading * D2R);
  ctx.scale(s, s);
  // hull
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.quadraticCurveTo(6, -2, 4, 9);
  ctx.lineTo(-4, 9);
  ctx.quadraticCurveTo(-6, -2, 0, -11);
  ctx.fillStyle = '#6b4a2b';
  ctx.fill();
  ctx.strokeStyle = '#2d1f12';
  ctx.lineWidth = 1;
  ctx.stroke();
  // lateen sail
  ctx.beginPath();
  ctx.moveTo(-1, -8);
  ctx.quadraticCurveTo(9, -1, 1, 7);
  ctx.closePath();
  ctx.fillStyle = sail;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2, 0, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = flag;
  ctx.fill();
  ctx.restore();
}

function drawFleet() {
  const F = S.fleet;
  if (!F?.ships.length) return;
  ctx.save();
  ctx.font = 'italic 12px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  for (const ship of F.ships) {
    const pos = Fleet.position(S, ship);
    drawShipAt(pos.lon, pos.lat, pos.heading, '#dbe5ee', '#1e3246', 0.85);
    if (cam.scale > 22) {
      const [sx, sy] = toScreen(pos.lon, pos.lat);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(236,223,192,0.9)';
      ctx.strokeText(ship.name, sx, sy + 20);
      ctx.fillStyle = '#1e3246';
      ctx.fillText(ship.name, sx, sy + 20);
    }
  }
  ctx.restore();
}

function render() {
  if (fogDirty) updateFogCanvas();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, W, H);

  drawRose(-24, 27, 0);
  drawRose(-13.5, 37.5, 0);

  // graticule labels at the edges
  ctx.save();
  ctx.strokeStyle = 'rgba(120,80,45,0.18)';
  ctx.fillStyle = 'rgba(74,54,34,0.6)';
  ctx.font = '11px "EB Garamond", Georgia, serif';
  for (let lat = 10; lat <= 42; lat += 5) {
    const [, y] = toScreen(0, lat);
    ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${lat}° N`, 6, y - 3);
  }
  ctx.restore();

  // land
  for (const l of LANDS) {
    pathPoly(l.pts);
    ctx.fillStyle = LANDFILL;
    ctx.fill();
  }
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  for (const l of LANDS) { pathPoly(l.pts); ctx.stroke(); }
  // coastal hatching (inner shadow)
  ctx.strokeStyle = 'rgba(74,54,34,0.18)';
  ctx.lineWidth = 5;
  for (const l of LANDS) { pathPoly(l.pts); ctx.save(); ctx.clip(); ctx.stroke(); ctx.restore(); }
  ctx.restore();

  // the ship's charted track
  if (S.trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(162, 55, 43, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    S.trail.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.lineTo(...toScreen(S.ship.lon, S.ship.lat));
    ctx.stroke();
    ctx.restore();
  }

  if (showWind) drawWind();

  // fog
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const [fx, fy] = toScreen(BOUNDS.west, BOUNDS.north);
  const [fx2, fy2] = toScreen(BOUNDS.east, BOUNDS.south);
  ctx.drawImage(fogSoft, fx, fy, fx2 - fx, fy2 - fy);
  ctx.restore();

  // chart edge
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, fx2 - fx, fy2 - fy);
  ctx.restore();

  // planned course
  if (S.ship.route.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30, 50, 70, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(...toScreen(S.ship.lon, S.ship.lat));
    for (const [x, y] of S.ship.route) ctx.lineTo(...toScreen(x, y));
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey] = toScreen(...S.ship.route[S.ship.route.length - 1]);
    ctx.beginPath();
    ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5);
    ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5);
    ctx.stroke();
    ctx.restore();
  }

  // a course being considered in the confirmation dialog
  if (modal?.preview?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(162, 55, 43, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -performance.now() / 60;
    ctx.beginPath();
    ctx.moveTo(...toScreen(S.ship.lon, S.ship.lat));
    for (const [x, y] of modal.preview) ctx.lineTo(...toScreen(x, y));
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey] = toScreen(...modal.preview[modal.preview.length - 1]);
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ports
  ctx.save();
  ctx.font = 'italic 15px "IM Fell English", Georgia, serif';
  ctx.textBaseline = 'middle';
  const goals = Contracts.targets(S);
  for (const p of PORTS) {
    if (!S.discovered[p.id]) continue;
    const [sx, sy] = toScreen(p.lon, p.lat);
    if (goals.has(p.id)) {
      // a contract waits here: a gold ring that pulses gently
      const r = 11 + 2 * Math.sin(performance.now() / 300);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(154, 106, 18, 0.9)';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, p.id === hoverPort ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f7f0de';
    ctx.stroke();
    const label = p.name;
    const left = p.lon > -10.5;
    const tx = left ? sx + 10 : sx - 10;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(236,223,192,0.9)';
    ctx.strokeText(label, tx, sy);
    ctx.fillStyle = '#3a2716';
    ctx.fillText(label, tx, sy);
  }
  ctx.restore();

  drawFleet();
  drawShip();
}

// ---- Simulation -------------------------------------------------------------
let speed = 1;
let showWind = true;

function shipWind() {
  const w = windAt(S.ship.lon, S.ship.lat, S.day);
  const off = angleDiff(S.ship.heading, w.from);
  const f = sailFactor(off) * (0.45 + 0.55 * w.strength);
  return { w, off, f, knots: SHIP.knots * f };
}

function update(dtSec) {
  const sh = S.ship;
  if (sh.docked || !sh.route.length || speed === 0 || modal) return;
  let days = dtSec * DAYS_PER_SEC * speed;
  while (days > 0 && sh.route.length) {
    const dd = Math.min(0.05, days);
    days -= dd;
    const [tl, ta] = sh.route[0];
    sh.heading = bearing(sh.lon, sh.lat, tl, ta);
    const { f } = shipWind();
    const nm = SHIP.knots * 24 * f * dd;
    const rem = distNm(sh.lon, sh.lat, tl, ta);
    advanceTime(dd, true);
    if (nm >= rem) {
      sh.lon = tl; sh.lat = ta;
      sh.route.shift();
    } else {
      const nlat = sh.lat + (nm * Math.cos(sh.heading * D2R)) / 60;
      const nlon = sh.lon + (nm * Math.sin(sh.heading * D2R)) / (60 * Math.cos(sh.lat * D2R));
      if (isLand(nlon, nlat)) {
        // Shouldn't happen on a planned route; re-plan from here rather than run aground.
        const fix = sh.dest ? replan(sh.dest) : false;
        if (!fix) { sh.route = []; toast('Breakers ahead! The pilot heaves to. Set a new course.'); }
        continue;
      }
      sh.lon = nlon; sh.lat = nlat;
    }
    revealAt(sh.lon, sh.lat, SIGHT);
    const last = S.trail[S.trail.length - 1];
    if (Math.hypot(last[0] - sh.lon, last[1] - sh.lat) > 0.12) {
      S.trail.push([+sh.lon.toFixed(3), +sh.lat.toFixed(3)]);
      if (S.trail.length > 4000) S.trail.splice(0, S.trail.length - 4000);
    }
    if (!sh.route.length) {
      if (sh.dest?.port) dock(sh.dest.port);
      else { sh.dest = null; toast('Arrived at the mark. Awaiting orders.'); save(); }
      break;
    }
  }
}

// Show a batch of messages from the game's systems.
function report(msgs) {
  for (const m of msgs) {
    if (m.log) log(m.log);
    if (offlineBuffer) offlineBuffer.push(m); else toast(m.html, m.kind);
  }
}

// ---- Time away ------------------------------------------------------------------
let offlineBuffer = null; // messages collected while catching up, shown as one summary
let pendingSummary = null;

function catchUp() {
  if (!S) return null;
  const seen = S.lastSeen;
  S.lastSeen = Date.now();
  if (!seen) return null;
  const awaySec = (Date.now() - seen) / 1000;
  if (awaySec < OFFLINE_MIN_SECONDS || !S.fleet?.ships.length || !S.ship.docked) return null;
  const want = awaySec * DAYS_PER_SEC * OFFLINE_RATE;
  const days = offlineDays(want);
  const before = { purse: S.purse, day: S.day, ships: Object.fromEntries(S.fleet.ships.map((x) => [x.id, { trips: x.trips, profit: x.profit, cargo: x.cargo?.paid || 0 }])) };
  // Long absences: captains stray (so they may skim or go ashore during it), and Lisbon's
  // merchants start to forget you.
  const hours = awaySec / 3600;
  const strayed = Fleet.strayWhileAway(S, hours);
  let standingLost = 0;
  if (hours > STANDING_FADES_AFTER_HOURS && S.contracts?.unlocked) {
    standingLost = Math.min(5, Math.floor((hours - STANDING_FADES_AFTER_HOURS) / 12) + 1);
    S.contracts.standing -= standingLost;
    log(`Away too long: standing fell by ${standingLost}.`);
  }
  const paidBefore = S.fleet.wagesPaid || 0; // your own crew is paid off in port; only captains draw pay
  // Contracts wait for the captain: time away never makes one lapse.
  let contractsHeld = 0;
  for (const c of S.contracts?.active || []) {
    if (c.deadline != null) { c.deadline += days; contractsHeld++; }
  }
  offlineBuffer = [];
  let msgs;
  try {
    const steps = Math.max(1, Math.ceil(days * 4));
    for (let i = 0; i < steps; i++) advanceTime(days / steps, false, true);
    observe(S.ship.docked);
    report(Events.hearNews(S, S.ship.docked));
  } finally {
    msgs = offlineBuffer;
    offlineBuffer = null;
  }
  const ships = S.fleet.ships.map((x) => {
    const b = before.ships[x.id] || { trips: 0, profit: 0, cargo: 0 };
    return { name: x.name, trips: x.trips - b.trips, profit: x.profit - b.profit, cargoChange: (x.cargo?.paid || 0) - b.cargo, status: Fleet.statusText(S, x) };
  });
  log(`Away ${awayText(awaySec)}: ${Math.round(days)} days passed; purse ${S.purse - before.purse >= 0 ? '+' : ''}${Math.round(S.purse - before.purse)} cz.`);
  save();
  const wages = (S.fleet.wagesPaid || 0) - paidBefore;
  const sales = ships.reduce((n, x) => n + x.profit, 0);
  const cargo = ships.reduce((n, x) => n + x.cargoChange, 0);
  return { awaySec, days, capped: days >= OFFLINE_MAX_DAYS, slowed: want > OFFLINE_FULL_DAYS, purse: S.purse - before.purse, sales, wages, cargo, ships, msgs, strayed, standingLost, contractsHeld };
}

// Days that pass for a given amount of offline time: full value at first, then tapering.
function offlineDays(want) {
  if (want <= OFFLINE_FULL_DAYS) return want;
  return Math.min(OFFLINE_MAX_DAYS, OFFLINE_FULL_DAYS + OFFLINE_DAYS_PER_DOUBLING * Math.log2(want / OFFLINE_FULL_DAYS));
}

function awayText(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} days`;
}

function showSummary(sum) {
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  const pick = sum.msgs.filter((m) => !/^<b>[^<]+<\/b> at /.test(m.html)).slice(-6); // fleet trades are summed up above
  confirmDialog({
    title: 'While you were away',
    body: `<dl class="facts">
        <dt>Away</dt><dd>${awayText(sum.awaySec)}</dd>
        <dt>Time passed</dt><dd>${Math.round(sum.days)} days, to ${fmtDate(S.day)}</dd>
        <dt>Profit on cargoes sold</dt><dd>${sum.sales >= 0 ? '+' : ''}${Math.round(sum.sales).toLocaleString()} cz</dd>
        <dt>Wages and upkeep</dt><dd>−${Math.round(sum.wages).toLocaleString()} cz</dd>
        ${Math.abs(sum.cargo) >= 1 ? `<dt>${sum.cargo > 0 ? 'Cargo loaded for the next run' : 'Cargo from before, now sold'}</dt><dd>${sum.cargo > 0 ? '−' : '+'}${Math.abs(Math.round(sum.cargo)).toLocaleString()} cz</dd>` : ''}
        <dt>Purse</dt><dd class="${sum.purse < 0 ? 'warn' : ''}">${sum.purse >= 0 ? '+' : ''}${Math.round(sum.purse).toLocaleString()} cz</dd>
      </dl>
      <p class="fine">${sum.capped ? `That is the most that passes in one absence (${OFFLINE_MAX_DAYS} days).` : sum.slowed ? 'After the first few weeks, longer absences add time more slowly.' : 'The world moves at a tenth of its usual pace while you are gone.'}</p>
      ${sum.contractsHeld ? `<p class="fine">Your ${sum.contractsHeld === 1 ? 'contract waited' : `${sum.contractsHeld} contracts waited`} for you: deadlines moved back by ${Math.round(sum.days)} days.</p>` : ''}
      ${sum.strayed.length ? `<p class="warn">Your captains missed you: ${sum.strayed.map((x) => `Captain ${x.captain} is now ${Fleet.loyaltyText(x.after)}`).join('; ')}.</p>` : ''}
      ${sum.standingLost ? `<p class="warn">The merchants of Lisbon are starting to forget you: standing −${sum.standingLost}.</p>` : ''}
      <ul class="help">${sum.ships.map((x) => `<li><b>${x.name}:</b> ${x.trips} ${x.trips === 1 ? 'cargo' : 'cargoes'} sold, ${x.profit >= 0 ? '+' : ''}${x.profit.toLocaleString()} cz. ${x.status}</li>`).join('')}
        ${pick.map((m) => `<li>${strip(m.html)}</li>`).join('')}</ul>`,
    ok: 'Carry on',
    cancel: false,
    kind: 'summary',
    onOk: () => {},
  });
}

// Everything that happens as days pass, at sea or waiting in port.
function advanceTime(dd, atSea, away = false) {
  S.day += dd;
  if (atSea) S.purse -= SHIP.upkeep * dd; // the crew is paid for the voyage; in port they are paid off
  market.tick(dd);
  report(Events.tick(S, dd));
  syncMarket();
  if (atSea) spoil(dd);
  report(Fleet.tick(S, market, dd, !away));
  report(Contracts.checkDeadlines(S));
}

// Events shape prices and close ports; standing earns better prices in Portuguese ports.
function syncMarket() {
  Events.applyToMarket(S, market);
  const edge = Contracts.perks(S).priceEdge;
  market.edge = Object.fromEntries(PORTUGUESE_PORTS.map((p) => [p, edge]));
}

// Perishable cargo slowly spoils at sea, faster in the tropics.
let rotPending = {};
let rotClock = 0;
function spoil(dd) {
  const heat = S.ship.lat < 26 ? 1.6 : 1;
  for (const g of GOODS) {
    const have = S.cargo[g.id];
    if (!have || !g.spoil) continue;
    S.rot[g.id] = (S.rot[g.id] || 0) + have * g.spoil * heat * dd;
    while (S.rot[g.id] >= 1 && S.cargo[g.id] > 0) {
      S.rot[g.id] -= 1;
      S.cargo[g.id] -= 1;
      rotPending[g.id] = (rotPending[g.id] || 0) + 1;
    }
    if (!S.cargo[g.id]) { S.rot[g.id] = 0; S.paid[g.id] = 0; }
  }
  rotClock += dd;
  if (rotClock >= 4) flushRot();
}

function flushRot() {
  rotClock = 0;
  for (const [id, n] of Object.entries(rotPending)) {
    const g = GOODS.find((x) => x.id === id);
    toast(`${n} ${n === 1 ? g.one : g.unit} of ${g.name.toLowerCase()} ${n === 1 ? 'has' : 'have'} ${g.rot}.`);
    log(`${n} ${n === 1 ? g.one : g.unit} of ${g.name.toLowerCase()} spoiled at sea.`);
  }
  rotPending = {};
}

function waitInPort(days) {
  const pid = S.ship.docked;
  if (!pid) return;
  for (let i = 0; i < days * 4; i++) advanceTime(0.25, false);
  observe(pid);
  report(Events.hearNews(S, pid));
  toast(`${days === 7 ? 'A week' : `${days} days`} pass${days === 7 ? 'es' : ''} in ${PORTS.find((p) => p.id === pid).name}.`, 'port');
}

function replan(dest) {
  const path = findPath(S.ship.lon, S.ship.lat, dest.lon, dest.lat);
  if (!path) return false;
  S.ship.route = path;
  return true;
}

// Work out a course to a point (optionally a port), appended to the current one if `append`.
function planCourse(lon, lat, portId, append) {
  const sh = S.ship;
  const keep = append && sh.route.length ? sh.route : [];
  const fromLon = keep.length ? keep[keep.length - 1][0] : sh.lon;
  const fromLat = keep.length ? keep[keep.length - 1][1] : sh.lat;
  const path = findPath(fromLon, fromLat, lon, lat);
  if (!path) return null;
  return { route: keep.concat(path), dest: { lon, lat, port: portId || null } };
}

function setCourse(lon, lat, portId, append) {
  const plan = planCourse(lon, lat, portId, append);
  if (!plan) { toast('The pilot can find no passage there.'); return; }
  applyCourse(plan);
}

function applyCourse(plan) {
  S.ship.route = plan.route;
  S.ship.dest = plan.dest;
  if (S.ship.docked) undock();
}

// Sail the route on paper, with the winds as they stand today, to estimate the passage.
function estimateVoyage(route) {
  let lon = S.ship.lon, lat = S.ship.lat, day = S.day, nm = 0;
  for (const [tl, ta] of route) {
    for (let guard = 0; guard < 20000; guard++) {
      const rem = distNm(lon, lat, tl, ta);
      if (rem < 0.5) break;
      const b = bearing(lon, lat, tl, ta);
      const w = windAt(lon, lat, day);
      const f = sailFactor(angleDiff(b, w.from)) * (0.45 + 0.55 * w.strength);
      const perDay = SHIP.knots * 24 * f;
      const step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(b * D2R)) / 60;
      lon += (step * Math.sin(b * D2R)) / (60 * Math.cos(lat * D2R));
      day += step / perDay;
      nm += step;
    }
    lon = tl; lat = ta;
  }
  const days = day - S.day;
  return { days, nm, cost: Math.ceil(days * SHIP.upkeep) };
}

// Zoom and pan so every point fits on screen, leaving room for the dialog.
function frameView(points) {
  const xs = points.map(([x]) => x * COS0), ys = points.map(([, y]) => -y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const narrow = W < 700;
  const availW = W - (narrow ? 40 : 520), availH = H - (narrow ? 420 : 200);
  cam.scale = Math.min(cam.scale, Math.max(1, Math.min(availW / Math.max(0.5, x1 - x0), Math.max(80, availH) / Math.max(0.5, y1 - y0))));
  cam.x = (x0 + x1) / 2 - (narrow ? 0 : 230 / cam.scale);
  cam.y = (y0 + y1) / 2 + (narrow ? 150 / cam.scale : 0);
  clampCam();
}

function confirmVoyage(plan) {
  frameView([[S.ship.lon, S.ship.lat], ...plan.route]);
  const { days, nm, cost } = estimateVoyage(plan.route);
  const to = plan.dest.port ? PORTS.find((p) => p.id === plan.dest.port).name : 'the mark on the chart';
  const left = Math.floor(S.purse) - cost;
  const d = Math.max(1, Math.round(days));
  confirmDialog({
    title: S.ship.docked || !S.ship.route.length ? `Set sail for ${to}?` : `Change course for ${to}?`,
    body: `<dl class="facts">
        <dt>Passage</dt><dd>about ${d} ${d === 1 ? 'day' : 'days'} · ${Math.round(nm).toLocaleString()} nm</dd>
        <dt>Arrival</dt><dd>around ${fmtDate(S.day + days)}</dd>
        <dt>Wages</dt><dd>${cost.toLocaleString()} cz (${SHIP.upkeep} cz a day)</dd>
        <dt>Purse on arrival</dt><dd class="${left < 0 ? 'warn' : ''}">${left.toLocaleString()} cz</dd>
      </dl>
      ${left < 0 ? '<p class="warn">You cannot cover the wages for this passage. The crew will sail on credit, but sell cargo soon.</p>' : ''}
      <p class="fine">Estimated from today's winds. They shift as you sail.</p>`,
    ok: 'Set sail',
    kind: 'voyage',
    preview: plan.route,
    onOk: () => applyCourse(plan),
  });
}

function dock(portId) {
  const sh = S.ship;
  const p = PORTS.find((x) => x.id === portId);
  sh.docked = portId;
  sh.route = [];
  sh.dest = null;
  sh.lon = p.lon; sh.lat = p.lat;
  S.voyages++;
  observe(portId);
  let msg = `Dropped anchor at <b>${p.name}</b>.`;
  if (portId === 'lisbon' && S.unpaidCharts.length) {
    const reward = S.unpaidCharts.length * CHART_REWARD;
    S.purse += reward;
    msg = `The crown buys your charts of ${S.unpaidCharts.join(', ')} for <b>${reward} cz</b>.`;
    log(`Sold charts to the crown for ${reward} cz.`);
    S.unpaidCharts = [];
  }
  toast(msg, 'port');
  flushRot();
  report(Contracts.onDock(S, portId));
  report(Events.hearNews(S, portId));
  const shut = Events.closure(S, portId);
  if (shut) toast(`<b>${p.name} is closed:</b> ${Events.template(shut).title.toLowerCase()}. You may anchor, but not trade.`, '');
  checkMilestones();
  panelMode = 'port';
  renderPanel();
  save();
  cloudSync();
}

function undock() {
  S.ship.docked = null;
  if (panelMode === 'port') panelMode = null;
  renderPanel();
}

function observe(portId) {
  S.seen[portId] = { day: S.day, prices: market.observe(portId) };
}

function unlockContracts() {
  const m = Contracts.maybeUnlock(S);
  if (!m) return;
  toast(m.html, m.kind);
  log(m.log);
  renderPanel();
  save();
}

function checkMilestones() {
  unlockContracts();
  for (const m of MILESTONES) {
    if (S.purse >= m && !S.milestones.includes(m)) {
      S.milestones.push(m);
      toast(`Your purse passes <b>${m.toLocaleString()} cruzados</b>. The Lisbon merchants take notice.`, 'discover');
      log(`Purse passed ${m.toLocaleString()} cz.`);
    }
  }
}

// ---- Input --------------------------------------------------------------------
let hoverPort = null;
const pointers = new Map();
let drag = null;

let lastPointerType = 'mouse';
function portAt(sx, sy) {
  let best = null, bd = lastPointerType === 'mouse' ? 16 : 30; // fingers need a bigger target
  for (const p of PORTS) {
    if (!S.discovered[p.id]) continue;
    const [px, py] = toScreen(p.lon, p.lat);
    const d = Math.hypot(px - sx, py - sy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  lastPointerType = e.pointerType || 'mouse';
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, camX: cam.x, camY: cam.y, moved: false };
  else drag = { pinch: pinchState(), moved: true };
});

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale: cam.scale, camX: cam.x, camY: cam.y };
}

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (!drag) {
    const p = portAt(e.offsetX, e.offsetY);
    hoverPort = p ? p.id : null;
    canvas.style.cursor = p ? 'pointer' : 'crosshair';
    return;
  }
  if (drag.pinch && pointers.size === 2) {
    const now = pinchState();
    const k = now.d / drag.pinch.d;
    cam.scale = drag.pinch.scale * k;
    cam.x = drag.pinch.camX - (now.cx - drag.pinch.cx) / cam.scale;
    cam.y = drag.pinch.camY - (now.cy - drag.pinch.cy) / cam.scale;
    clampCam();
    return;
  }
  const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
  if (drag.moved && !drag.pinch) {
    cam.x = drag.camX - dx / cam.scale;
    cam.y = drag.camY - dy / cam.scale;
    clampCam();
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (!drag.moved && pointers.size === 0) chartClick(e.offsetX, e.offsetY, e.shiftKey);
  if (pointers.size === 0) drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [lon, lat] = toWorld(e.offsetX, e.offsetY);
  cam.scale *= Math.exp(-e.deltaY * 0.0015);
  clampCam();
  const [sx, sy] = toScreen(lon, lat);
  cam.x += (sx - e.offsetX) / cam.scale;
  cam.y += (sy - e.offsetY) / cam.scale;
  clampCam();
}, { passive: false });

function chartClick(sx, sy, append) {
  if (!introDone) return;
  if (modal) {
    // While a voyage is being considered, clicking elsewhere re-plots it there.
    if (modal.kind !== 'voyage') return;
    closeModal(false);
  }
  const p = portAt(sx, sy);
  if (p) {
    if (S.ship.docked === p.id) { panelMode = 'port'; renderPanel(); return; }
    const plan = planCourse(p.lon, p.lat, p.id, append);
    if (!plan) { toast('The pilot can find no passage there.'); return; }
    confirmVoyage(plan);
    return;
  }
  const [lon, lat] = toWorld(sx, sy);
  if (!inBounds(lon, lat)) { toast('That lies beyond the edge of the chart.'); return; }
  if (isLand(lon, lat)) {
    toast(isRevealed(lon, lat) ? 'That is dry land, captain.' : 'The lookout sees nothing there yet.');
    return;
  }
  const plan = planCourse(lon, lat, null, append);
  if (!plan) { toast('The pilot can find no passage there.'); return; }
  confirmVoyage(plan);
}

window.addEventListener('keydown', (e) => {
  if (modal) {
    if (e.key === 'Escape') closeModal(false);
    if (e.key === 'Enter') { e.preventDefault(); closeModal(true); }
    return;
  }
  if (e.target.closest('input, button') && e.key !== 'Escape') return;
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed === 0 ? lastSpeed : 0); }
  if (e.key === '1') setSpeed(1);
  if (e.key === '2') setSpeed(2);
  if (e.key === '3') setSpeed(4);
  if (e.key === 'l' || e.key === 'L') togglePanel('ledger');
  if (e.key === 'w' || e.key === 'W') toggleWind();
  if (e.key === 'Escape' && panelMode && !S.ship.docked) { panelMode = null; renderPanel(); }
});

// ---- HUD & panels -----------------------------------------------------------
const $ = (id) => document.getElementById(id);
let panelMode = null; // 'port' | 'ledger' | null
let lastSpeed = 1;

function setSpeed(v) {
  if (v) lastSpeed = v;
  speed = v;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === v));
}

function toggleWind() {
  showWind = !showWind;
  $('btn-wind').classList.toggle('on', showWind);
}

function togglePanel(mode) {
  panelMode = panelMode === mode ? (S.ship.docked ? 'port' : null) : mode;
  renderPanel();
}

function fmtDate(day) {
  const d = new Date(START_DATE.getTime() + Math.floor(day) * 86400000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const held = () => GOODS.reduce((n, g) => n + S.cargo[g.id], 0);

function renderHud() {
  $('hud-date').textContent = fmtDate(S.day);
  const purse = Math.floor(S.purse);
  $('hud-purse').textContent = `${purse.toLocaleString()} cz`;
  $('hud-purse').classList.toggle('debt', purse < 0);
  $('hud-hold').textContent = `${held()} / ${SHIP.hold}`;
  const sh = S.ship;
  let status;
  if (sh.docked) {
    status = `At anchor in ${PORTS.find((p) => p.id === sh.docked).name}. Click the chart to set sail.`;
  } else {
    const { w, off, knots } = shipWind();
    const windTxt = `Wind from the ${compassPoint(w.from)}`;
    if (sh.route.length) {
      let nm = 0, lon = sh.lon, lat = sh.lat;
      for (const [x, y] of sh.route) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
      const dest = sh.dest?.port ? PORTS.find((p) => p.id === sh.dest.port).name : 'the mark';
      status = `${windTxt} · heading ${compassPoint(sh.heading)} · ${pointOfSail(off)} · ${knots.toFixed(1)} kn · ${Math.round(nm)} nm to ${dest}`;
    } else {
      status = `${windTxt} · hove to · click the chart to set a course`;
    }
  }
  $('status').textContent = status;
  renderTip();
  const fleetBtn = !fleetUnlocked(), contractsBtn = !S.contracts?.unlocked;
  if ($('btn-fleet').hidden !== fleetBtn) $('btn-fleet').hidden = fleetBtn;
  if ($('btn-contracts').hidden !== contractsBtn) $('btn-contracts').hidden = contractsBtn;
  const n = S.contracts ? S.contracts.active.length : 0;
  const badge = $('contracts-count');
  if (badge.textContent !== String(n)) badge.textContent = n;
  badge.hidden = !n;
}

function priceCell(v) {
  return v == null ? '<span class="muted">—</span>' : `${v}`;
}

function renderPanel() {
  const el = $('panel');
  syncMarket();
  const fleetOpen = fleetUnlocked();
  $('btn-fleet').hidden = !fleetOpen;
  $('btn-fleet').classList.toggle('on', panelMode === 'fleet');
  $('btn-help').classList.toggle('on', panelMode === 'help');
  $('btn-cloud').classList.toggle('on', panelMode === 'cloud');
  if (panelMode === 'fleet' && !fleetOpen) panelMode = S.ship.docked ? 'port' : null;
  $('btn-ledger').classList.toggle('on', panelMode === 'ledger');
  $('btn-port').classList.toggle('on', panelMode === 'port');
  $('btn-sail').classList.toggle('on', panelMode === 'sail');
  $('btn-contracts').classList.toggle('on', panelMode === 'contracts');
  $('btn-contracts').hidden = !S.contracts?.unlocked;
  if (panelMode === 'contracts' && !S.contracts?.unlocked) panelMode = S.ship.docked ? 'port' : null;
  if (!panelMode) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('wide', panelMode === 'ledger');
  if (panelMode === 'port') renderPort(el);
  else if (panelMode === 'sail') renderSail(el);
  else if (panelMode === 'contracts') renderContracts(el);
  else if (panelMode === 'fleet') renderFleet(el);
  else if (panelMode === 'help') renderHelp(el);
  else if (panelMode === 'cloud') renderCloud(el);
  else renderLedger(el);
}

function renderPort(el) {
  const pid = S.ship.docked;
  if (!pid) { panelMode = null; el.hidden = true; return; }
  const p = PORTS.find((x) => x.id === pid);
  observe(pid);
  const free = SHIP.hold - held();
  const shut = Events.closure(S, pid);
  const rows = GOODS.map((g) => {
    const sells = market.sells(pid, g.id) && !shut;
    const buy = sells ? market.buyPrice(pid, g.id) : null;
    const sell = market.sellPrice(pid, g.id);
    const have = S.cargo[g.id];
    const avg = have ? Math.round(S.paid[g.id] / have) : null;
    const best = bestKnownSale(g.id, pid);
    return `<tr>
      <th scope="row">${g.name}<small>${[best ? `best seen: ${best.price} at ${best.name}` : '', g.spoil ? 'perishable' : ''].filter(Boolean).join(' · ')}</small></th>
      <td class="num">${priceCell(buy)}</td>
      <td class="num">${sell}</td>
      <td class="num">${have || '<span class="muted">0</span>'}${avg ? `<small>paid ~${avg}</small>` : ''}</td>
      <td class="acts">
        ${sells ? `<button data-buy="${g.id}" data-n="1" ${buy > S.purse || !free ? 'disabled' : ''}>+1</button><button data-buy="${g.id}" data-n="10" ${buy > S.purse || !free ? 'disabled' : ''}>+10</button><button data-buy="${g.id}" data-n="max" ${buy > S.purse || !free ? 'disabled' : ''}>Max</button>` : ''}
        ${have && !shut ? `<button data-sell="${g.id}" data-n="1">−1</button><button data-sell="${g.id}" data-n="all">All</button>` : ''}
      </td></tr>`;
  }).join('');
  el.innerHTML = `
    ${tabs('port')}
    <header><h2>${p.name}</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">${p.blurb}</p>
    ${shut ? `<p class="banner warn"><b>Closed to trade:</b> ${Events.template(shut).title.toLowerCase()}. Expected to reopen around ${fmtDate(shut.end)}.</p>` : ''}
    <table class="market">
      <thead><tr><th>Good</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Hold</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">Hold ${held()} / ${SHIP.hold} · purse ${Math.floor(S.purse).toLocaleString()} cz · upkeep ${SHIP.upkeep} cz a day at sea.<br>
    Buying pushes the price up; selling pushes it down. Prices recover over a few weeks. <i>Max</i> keeps two weeks of wages in the purse.</p>
    <div class="row"><button data-wait title="Let a week pass: prices recover, news arrives, your fleet sails on. Your crew draws no wages in port; hired captains are still paid.">Wait a week</button><button class="primary" data-tab="sail">Set sail…</button></div>`;
}

function contractCard(c, actions) {
  const g = c.good ? GOODS.find((x) => x.id === c.good) : null;
  const lines = [];
  if (c.kind === 'discover') {
    lines.push(c.text);
    lines.push(c.stage === 'find' ? '<b>Next:</b> find and anchor at an uncharted port.' : `<b>Next:</b> report to Lisbon. You opened trade with ${PORTS.find((p) => p.id === c.found).name}.`);
  } else {
    const src = PORTS.find((p) => p.id === c.source);
    lines.push(`${g.name} can be bought at ${src.name}.`);
    if (c.deadline != null) {
      const left = Math.ceil(c.deadline - S.day);
      lines.push(`<b>Due</b> ${fmtDate(c.deadline)} <span class="${left < 10 ? 'warn' : 'muted'}">(${left} days left)</span> · in your hold: ${S.cargo[c.good]} / ${c.qty}`);
    } else {
      lines.push(`<b>Time allowed:</b> ${c.offeredDays} days`);
    }
  }
  return `<li class="contract">
      <div class="c-head"><span class="c-title">${c.title}</span><span class="c-pay">${c.reward.toLocaleString()} cz</span></div>
      <div class="c-patron">${c.patron}</div>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      ${actions ? `<div class="row">${actions}</div>` : ''}
    </li>`;
}

function perkList(t) {
  const out = [];
  if (t.payMult > 1) out.push(`contracts pay ${Math.round((t.payMult - 1) * 100)}% more`);
  if (t.payMult < 1) out.push(`contracts pay ${Math.round((1 - t.payMult) * 100)}% less`);
  if (t.priceEdge) out.push(`${Math.round(t.priceEdge * 100)}% better prices in Portuguese ports`);
  out.push(`${t.offers} ${t.offers === 1 ? 'offer' : 'offers'} per port`, `up to ${t.maxActive} contracts`);
  if (t.shipyard) out.push('the Lisbon shipyard will sell you a caravel');
  return out.join(', ');
}

function standingBox(C) {
  const t = Contracts.perks(S), next = Contracts.nextTier(S);
  return `<div class="standing">
      <p><b>${t.title}</b> · standing ${C.standing} · ${C.done} completed${C.failed ? `, ${C.failed} failed` : ''}</p>
      <p class="muted">Now: ${perkList(t)}.</p>
      ${next ? `<p class="muted">At ${next.min} standing you become <i>${next.title}</i>: ${perkList(next)}.</p>` : ''}
    </div>`;
}

function renderContracts(el) {
  const C = Contracts.ensureContracts(S);
  const pid = S.ship.docked;
  const active = C.active.map((c) => contractCard(c, [
    Contracts.canDeliver(S, c) && !market.closed(pid) ? `<button class="primary" data-deliver="${c.id}">Deliver</button>` : '',
    c.kind === 'deliver' ? `<button data-abandon="${c.id}">Abandon</button>` : '',
  ].join(''))).join('');
  let offers = '';
  if (pid) {
    const full = C.active.length >= Contracts.maxActive(S);
    const list = Contracts.offersAt(S, market, pid);
    offers = list.length
      ? list.map((o) => contractCard(o, `<button class="primary" data-accept="${o.id}" ${full ? 'disabled' : ''}>Accept</button>`)).join('')
      : '<li class="muted">No work posted here this month. Chart more ports to open new trades.</li>';
  }
  el.innerHTML = `
    ${tabs('contracts')}
    <header><h2>Contracts</h2><button class="close" data-close aria-label="Close">×</button></header>
    ${standingBox(C)}
    <h3>Your contracts</h3>
    <ul class="contracts">${active || '<li class="muted">None at the moment.</li>'}</ul>
    ${pid ? `<h3>Offered at ${PORTS.find((p) => p.id === pid).name}</h3><ul class="contracts">${offers}</ul>
      <p class="foot">You can hold ${Contracts.maxActive(S)} contracts at once. Offers change every month. Missing a deadline costs standing.</p>`
      : '<p class="foot">Visit a port to see the work on offer there.</p>'}`;
}

// A list of charted ports to sail to: easier than tapping a small marker on a phone.
function renderSail(el) {
  const rows = PORTS.filter((p) => S.discovered[p.id] && p.id !== S.ship.docked).map((p) => {
    const plan = planCourse(p.lon, p.lat, p.id, false);
    if (!plan) return null;
    const est = estimateVoyage(plan.route);
    return { p, est };
  }).filter(Boolean).sort((a, b) => a.est.days - b.est.days);
  const list = rows.map(({ p, est }) => `
      <li><button class="dest" data-sailto="${p.id}">
        <span class="name">${p.name}</span>
        <span class="meta">about ${Math.max(1, Math.round(est.days))} ${Math.round(est.days) <= 1 ? 'day' : 'days'} · ${Math.round(est.nm).toLocaleString()} nm · ${est.cost} cz wages</span>
      </button></li>`).join('');
  el.innerHTML = `
    ${tabs('sail')}
    <header><h2>Set a course</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">Pick a charted port, or tap anywhere on the open sea to sail there. Uncharted waters only appear once you sail into them.</p>
    <ul class="dests">${list || '<li class="muted">No other ports charted yet.</li>'}</ul>
    <p class="foot">Times are estimated from today's winds.</p>`;
}

function fleetUnlocked() {
  return !!(S.fleet?.ships.length || (S.contracts?.unlocked && Contracts.perks(S).shipyard));
}

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function portOptions(selected) {
  return PORTS.filter((p) => S.discovered[p.id]).map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.name}</option>`).join('');
}

function goodOptions(portId, selected) {
  const sel = selected === undefined ? 'best' : selected == null ? 'none' : selected; // old routes: null meant nothing
  const opts = GOODS.filter((g) => market.sells(portId, g.id)).map((g) => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${g.name} only</option>`);
  return `<option value="best" ${sel === 'best' ? 'selected' : ''}>Best available (captain's choice)</option>${opts.join('')}<option value="none" ${sel === 'none' ? 'selected' : ''}>Nothing (sail empty)</option>`;
}

function renderFleet(el) {
  const F = Fleet.ensureFleet(S);
  const ships = F.ships.map((ship) => {
    const r = ship.route || {};
    const a = r.a || ship.at, b = r.b || PORTS.find((p) => S.discovered[p.id] && p.id !== a)?.id;
    const last = ship.last ? `Last: sold ${ship.last.qty} ${GOODS.find((g) => g.id === ship.last.good).unit} at ${PORTS.find((p) => p.id === ship.last.at).name} for ${ship.last.income.toLocaleString()} cz (${ship.last.profit >= 0 ? '+' : ''}${ship.last.profit.toLocaleString()}).` : 'No voyages yet.';
    return `<li class="contract" data-ship="${ship.id}">
        <div class="c-head"><span class="c-title">${ship.name}</span><span class="c-pay">${ship.profit >= 0 ? '+' : ''}${ship.profit.toLocaleString()} cz</span></div>
        <div class="c-patron">Captain ${ship.captain.name} · navigation ${stars(ship.captain.nav)} · trade ${stars(ship.captain.trade)} · ${Fleet.dailyCost(ship)} cz a day at sea, half in port · ${Fleet.loyaltyText(ship.captain.loyalty)}</div>
        <p>${Fleet.statusText(S, ship)} ${ship.trips} ${ship.trips === 1 ? 'cargo' : 'cargoes'} sold so far.</p>
        <p class="muted">${last}</p>
        <div class="route">
          <label>Buy at <select data-role="a">${portOptions(a)}</select></label>
          <label>Load <select data-role="ga">${goodOptions(a, ship.route ? r.goodA : undefined)}</select></label>
          <label>Sell at <select data-role="b">${portOptions(b)}</select></label>
          <label>Load <select data-role="gb">${goodOptions(b, ship.route ? r.goodB : undefined)}</select></label>
        </div>
        <div class="row">${ship.route ? `<button data-stop="${ship.id}">Stop at next port</button>` : ''}<button class="primary" data-route="${ship.id}">${ship.route ? 'Change route' : 'Start route'}</button></div>
      </li>`;
  }).join('');
  let yard = '';
  if (Fleet.canBuy(S)) {
    if (S.ship.docked === 'lisbon') {
      yard = `<h3>The Lisbon shipyard</h3>
        <p class="blurb">A caravel like yours costs ${Fleet.SHIP_COST.toLocaleString()} cz. Choose the captain who will sail her.</p>
        <ul class="contracts">${Fleet.candidates(S).map((c) => `<li class="contract">
          <div class="c-head"><span class="c-title">Captain ${c.name}</span><span class="c-pay">${c.wage} cz a day</span></div>
          <p>Navigation ${stars(c.nav)} (faster passages) · Trade ${stars(c.trade)} (better sale prices)</p>
          <div class="row"><button class="primary" data-hire="${c.id}" ${S.purse < Fleet.SHIP_COST ? 'disabled' : ''}>Buy a caravel and hire him</button></div>
        </li>`).join('')}</ul>
        ${S.purse < Fleet.SHIP_COST ? `<p class="foot">You need ${Fleet.SHIP_COST.toLocaleString()} cz in your purse.</p>` : ''}`;
    } else {
      yard = `<p class="foot">The Lisbon shipyard will build you a caravel for ${Fleet.SHIP_COST.toLocaleString()} cz.</p>`;
    }
  }
  el.innerHTML = `
    ${tabs('fleet')}
    <header><h2>Fleet</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">Hired captains sail a route between two ports on their own: they buy with your purse, sell in the same markets, and keep at it until you stop them. Each sale moves prices like yours do.</p>
    ${ships ? `<ul class="contracts">${ships}</ul>` : ''}
    ${yard}
    ${F.ships.length ? `<p class="foot">Your fleet only sails while time passes: at sea, or when you wait in port. Captains never spend the last 150 cz of your purse.</p>
      ${S.ship.docked ? '<div class="row"><button data-wait>Wait a week</button></div>' : ''}` : ''}`;
}

function renderHelp(el) {
  el.innerHTML = `
    <header><h2>How to play</h2><button class="close" data-close aria-label="Close">×</button></header>
    <h3>Sailing</h3>
    <ul class="help">
      <li><b>Set a course:</b> click or tap the sea, a port, or use <i>Sail to…</i>. Shift-click adds a waypoint. You confirm each voyage first.</li>
      <li><b>Wind:</b> the arrows show where it blows. Running before it is fast; beating into it is slow. Coming home from Africa, swing out to sea and catch the westerlies.</li>
      <li><b>Map:</b> drag to pan, scroll, pinch or use + and − to zoom. The locate button finds your ship.</li>
      <li><b>Time:</b> pause or speed up with the buttons, or space and 1, 2, 3. Time only passes at sea, or when you wait in port.</li>
    </ul>
    <h3>Trading</h3>
    <ul class="help">
      <li><b>Prices move</b> as you buy and sell, and recover over weeks. Contracts and events move them too.</li>
      <li><b>The ledger</b> remembers only the prices you have seen, and they go stale. News of events reaches you in port, late for distant places.</li>
      <li><b>Perishables</b> such as wine, dye and pepper slowly spoil at sea, faster in the tropics. Gold and ivory keep.</li>
      <li><b>Charts:</b> the crown pays ${CHART_REWARD} cz for each new port or island group, on your return to Lisbon.</li>
    </ul>
    <h3>Growing</h3>
    <ul class="help">
      <li><b>Contracts</b> open up at 500 cz. Completing them builds standing; missing deadlines costs it.</li>
      <li><b>Standing</b> brings better pay, better prices in Portuguese ports, and the right to buy a second caravel.</li>
      <li><b>Your fleet:</b> a hired captain runs a trade route for you, paid from your purse.</li>
      <li><b>Time away:</b> if you have hired captains and your own ship is in port, the world moves on while you are gone: at a tenth of its usual pace at first, more slowly after a few weeks, up to ${OFFLINE_MAX_DAYS} days. Contract deadlines wait for you. A night's sleep or a working day is safe; stay away longer than ${Fleet.STRAY_AFTER_HOURS} hours and captains start to stray (skimming, then going ashore), and after ${STANDING_FADES_AFTER_HOURS} hours your standing starts to fade.</li>
    </ul>
    <h3>Saving</h3>
    <ul class="help">
      <li><b>On this device</b> your game saves by itself as you play.</li>
      <li><b>Cloud save:</b> tap the cloud button to get a save code. Enter it on another device to continue there; both stay in sync. A green dot means synced, red means it needs attention.</li>
    </ul>
    <p class="foot">Keyboard: space pause · 1 2 3 speed · L ledger · W winds · Esc close.</p>`;
}

// Captain's notes: a gentle nudge through the first voyages, until contracts open up.
function tipText() {
  if (!S.tips || S.tips.off || S.contracts?.unlocked || !introDone || modal) return null;
  const sh = S.ship;
  if (sh.docked) {
    if (held() === 0 && S.voyages === 0) return 'Buy wine or wool cloth here: both sell for close to double in the Canaries and further south.';
    if (held() > 0 && S.voyages === 0) return 'Now set sail: tap Sail to…, or a port on the chart. Lanzarote is an easy first run.';
    if (held() > 0) return 'Sell where the price beats what you paid (shown under Hold). Then load something the next port wants.';
    return 'Open the Ledger: the harbourmaster suggests runs from the prices you have seen.';
  }
  if (S.voyages === 0) return 'The arrows show the wind. Running before it is fast; beating into it is slow.';
  return 'Reach 500 cruzados and Prince Henry will notice you.';
}

function renderTip() {
  const t = tipText();
  const el = $('tip');
  el.hidden = !t;
  if (t && $('tip-text').textContent !== t) $('tip-text').textContent = t;
}

// Market / Ledger tabs, shown while in port so either is one click away.
function tabs(active) {
  if (!S.ship.docked) return '';
  return `<nav class="tabs" role="tablist">
      <button role="tab" data-tab="port" aria-selected="${active === 'port'}" class="${active === 'port' ? 'on' : ''}">Market</button>
      <button role="tab" data-tab="ledger" aria-selected="${active === 'ledger'}" class="${active === 'ledger' ? 'on' : ''}">Ledger</button>
      ${S.contracts?.unlocked ? `<button role="tab" data-tab="contracts" aria-selected="${active === 'contracts'}" class="${active === 'contracts' ? 'on' : ''}">Contracts</button>` : ''}
      ${fleetUnlocked() ? `<button role="tab" data-tab="fleet" aria-selected="${active === 'fleet'}" class="${active === 'fleet' ? 'on' : ''}">Fleet</button>` : ''}
      <button role="tab" data-tab="sail" aria-selected="${active === 'sail'}" class="${active === 'sail' ? 'on' : ''}">Set sail</button>
    </nav>`;
}

function bestKnownSale(good, exceptPort) {
  let best = null;
  for (const [pid, rec] of Object.entries(S.seen)) {
    if (pid === exceptPort) continue;
    const price = rec.prices[good].sell;
    if (!best || price > best.price) best = { price, name: PORTS.find((p) => p.id === pid).name };
  }
  return best;
}

function ageText(day) {
  const d = Math.floor(S.day) - Math.floor(day);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

function suggestions() {
  const out = [];
  const seen = Object.entries(S.seen);
  for (const g of GOODS) {
    for (const [a, ra] of seen) {
      const buy = ra.prices[g.id].buy;
      if (buy == null) continue;
      for (const [b, rb] of seen) {
        if (a === b) continue;
        const sell = rb.prices[g.id].sell;
        const margin = sell - buy;
        if (margin <= 2) continue;
        const pa = PORTS.find((p) => p.id === a), pb = PORTS.find((p) => p.id === b);
        const units = Math.min(SHIP.hold, Math.max(1, Math.floor(Math.max(S.purse, 50) / buy)));
        const profit = Math.round(margin * units * 0.7); // allow for prices moving as you trade
        const nm = distNm(S.ship.lon, S.ship.lat, pa.lon, pa.lat) + distNm(pa.lon, pa.lat, pb.lon, pb.lat);
        const days = Math.max(1, nm / 100);
        const stale = Math.max(S.day - ra.day, S.day - rb.day);
        out.push({ g, pa, pb, buy, sell, units, profit, days, stale, score: (profit - days * SHIP.upkeep) / days, ageA: ra.day, ageB: rb.day });
      }
    }
  }
  return out.filter((s) => s.score > 0).sort((x, y) => y.score - x.score).slice(0, 4);
}

function renderLedger(el) {
  const ports = PORTS.filter((p) => S.seen[p.id]);
  const head = ports.map((p) => {
    const age = S.day - S.seen[p.id].day;
    return `<th class="num ${age > 60 ? 'stale' : ''}">${p.name}<small>${ageText(S.seen[p.id].day)}</small></th>`;
  }).join('');
  const body = GOODS.map((g) => {
    const vals = ports.map((p) => S.seen[p.id].prices[g.id].sell);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const cells = ports.map((p) => {
      const rec = S.seen[p.id].prices[g.id];
      const t = hi > lo ? (rec.sell - lo) / (hi - lo) : 0.5;
      const cls = t > 0.75 ? 'hi' : t < 0.25 ? 'lo' : '';
      const stale = S.day - S.seen[p.id].day > 60 ? 'stale' : '';
      return `<td class="num ${cls} ${stale}">${rec.buy != null ? `<b title="You can buy here">${rec.buy}</b> / ` : ''}${rec.sell}</td>`;
    }).join('');
    return `<tr><th scope="row">${g.name}</th>${cells}</tr>`;
  }).join('');
  const sug = suggestions();
  const sugHtml = sug.length
    ? sug.map((s) => `<li><b>${s.g.name}:</b> buy at ${s.pa.name} (${s.buy}, seen ${ageText(s.ageA)}), sell at ${s.pb.name} (${s.sell}, seen ${ageText(s.ageB)}).
        About <b>+${s.profit.toLocaleString()} cz</b> on ${s.units} ${s.g.unit}, roughly ${Math.round(s.days)} days of sailing.${s.stale > 60 ? ' <em>Old news: prices may have moved.</em>' : ''}</li>`).join('')
    : '<li class="muted">Visit more ports. The ledger can only reason from prices you have seen with your own eyes.</li>';
  el.innerHTML = `
    ${tabs('ledger')}
    <header><h2>Trade ledger</h2><button class="close" data-close-ledger aria-label="Close">×</button></header>
    <p class="blurb">Prices as last seen by your ship. <b>Bold</b> is the price to buy, the other is what they pay you. Entries older than two months are faded.</p>
    <div class="scroll"><table class="ledger"><thead><tr><th>Good</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <h3>News</h3>
    <ul class="news">${Events.knownNews(S).map((n) => `<li><b>${n.t.title}</b> <span class="muted">· ${PORTS.find((p) => p.id === n.port).name} · since ${fmtDate(n.start)}, expected to last until about ${fmtDate(n.end)}</span><br>${n.t.text}</li>`).join('') || '<li class="muted">No news has reached you. Word travels by ship, so you hear it in port.</li>'}</ul>
    <h3>The harbourmaster suggests</h3>
    <ol class="sugg">${sugHtml}</ol>
    <p class="foot">Estimates assume a straight course and calm trading. Winds will change the sailing time.</p>
    <h3>Log</h3>
    <ul class="log">${(S.log || []).slice(-6).reverse().map((l) => `<li><span>${fmtDate(l.day)}</span> ${l.text}</li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul>
    <div class="row"><button data-reset class="danger">Start a new game</button></div>`;
}

// Price a trade without making it: run it, then put the market back as it was.
function quote(fn) {
  const saved = JSON.stringify(market.press);
  const r = fn();
  market.press = JSON.parse(saved);
  return r;
}

function tradeFacts(n, total, purseChange, extra) {
  const each = (total / n).toFixed(1);
  return `<dl class="facts">
      <dt>Total</dt><dd>${total.toLocaleString()} cz (about ${each} each)</dd>
      <dt>Purse after</dt><dd>${Math.floor(S.purse + purseChange).toLocaleString()} cz</dd>
    </dl>
    ${extra ? `<p>${extra}</p>` : ''}
    <p class="fine">Each unit moves the price a little, so the average differs from the listed price.</p>`;
}

function log(text) {
  S.log = S.log || [];
  S.log.push({ day: S.day, text });
  if (S.log.length > 60) S.log.shift();
}

$('panel').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.closest('form')) return; // forms handle their own submit
  const pid = S.ship.docked;
  if ((t.dataset.buy || t.dataset.sell) && pid && market.closed(pid)) {
    toast('The port is closed to trade.');
    return;
  }
  if (t.dataset.buy && pid) {
    const g = t.dataset.buy;
    const free = SHIP.hold - held();
    const max = t.dataset.n === 'max';
    const n = max ? free : +t.dataset.n;
    // "Max" keeps back two weeks of wages so the crew is paid on the way.
    const budget = Math.floor(S.purse - (max ? Math.min(WAGE_RESERVE, Math.max(0, S.purse - market.buyPrice(pid, g))) : 0));
    const doBuy = () => {
      const { bought, cost } = market.buy(pid, g, n, budget, free);
      S.cargo[g] += bought; S.paid[g] += cost; S.purse -= cost;
      observe(pid);
    };
    if (n > 1) {
      const q = quote(() => market.buy(pid, g, n, budget, free));
      if (!q.bought) { toast('You cannot afford any more of that.'); return; }
      const good = GOODS.find((x) => x.id === g);
      confirmDialog({
        title: `Buy ${q.bought} ${good.unit} of ${good.name.toLowerCase()}?`,
        body: tradeFacts(q.bought, q.cost, -q.cost, `In the hold after: ${S.cargo[g] + q.bought} ${good.unit}`),
        ok: `Buy for ${q.cost.toLocaleString()} cz`,
        onOk: doBuy,
      });
      return;
    }
    doBuy();
  } else if (t.dataset.sell && pid) {
    const g = t.dataset.sell;
    const n = t.dataset.n === 'all' ? S.cargo[g] : Math.min(+t.dataset.n, S.cargo[g]);
    const doSell = () => {
      const avgCost = S.cargo[g] ? S.paid[g] / S.cargo[g] : 0;
      const { sold, income } = market.sell(pid, g, n);
      S.cargo[g] -= sold; S.paid[g] = Math.max(0, S.paid[g] - avgCost * sold); S.purse += income;
      if (!S.cargo[g]) S.paid[g] = 0;
      observe(pid);
      checkMilestones();
    };
    if (n > 1) {
      const q = quote(() => market.sell(pid, g, n));
      const good = GOODS.find((x) => x.id === g);
      const paid = Math.round((S.paid[g] / S.cargo[g]) * n);
      const profit = q.income - paid;
      confirmDialog({
        title: `Sell ${n} ${good.unit} of ${good.name.toLowerCase()}?`,
        body: tradeFacts(n, q.income, q.income, paid ? `Profit on what you paid: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} cz` : ''),
        ok: `Sell for ${q.income.toLocaleString()} cz`,
        onOk: doSell,
      });
      return;
    }
    doSell();
  } else if (t.hasAttribute('data-cloud-create')) {
    startCloudSave();
    return;
  } else if (t.hasAttribute('data-cloud-sync')) {
    Cloud.cloud.status = Cloud.cloud.status === 'conflict' ? 'idle' : Cloud.cloud.status;
    cloudSync(true);
    return;
  } else if (t.hasAttribute('data-cloud-copy')) {
    navigator.clipboard?.writeText(Cloud.cloud.code).then(() => toast('Save code copied.'), () => toast(`Your code: <b>${Cloud.cloud.code}</b>`));
    return;
  } else if (t.hasAttribute('data-cloud-unlink')) {
    confirmDialog({
      title: 'Stop syncing this device?',
      body: `<p>Your voyage stays on this device and in the cloud, but they will no longer stay in step. You can link again with the code <b>${Cloud.cloud.code}</b>.</p>`,
      ok: 'Stop syncing',
      onOk: () => { Cloud.unlink(); renderCloudButton(); },
    });
    return;
  } else if (t.hasAttribute('data-wait') && pid) {
    waitInPort(7);
  } else if (t.dataset.hire) {
    const cap = (S.fleet.candidates?.list || []).find((c) => c.id === +t.dataset.hire);
    if (cap) {
      confirmDialog({
        title: `Buy a caravel for Captain ${cap.name}?`,
        body: `<dl class="facts"><dt>Caravel</dt><dd>${Fleet.SHIP_COST.toLocaleString()} cz</dd><dt>Running cost</dt><dd>${cap.wage + Fleet.SHIP_UPKEEP} cz a day at sea, half that in port</dd><dt>Purse after</dt><dd>${Math.floor(S.purse - Fleet.SHIP_COST).toLocaleString()} cz</dd></dl><p>Then give him a route between two ports.</p>`,
        ok: `Buy for ${Fleet.SHIP_COST.toLocaleString()} cz`,
        onOk: () => {
          const ship = Fleet.buyShip(S, cap.id);
          if (ship) { toast(`The <b>${ship.name}</b> is yours, with Captain ${cap.name} in command. Give her a route.`, 'discover'); log(`Bought the ${ship.name}; hired Captain ${cap.name}.`); }
        },
      });
      return;
    }
  } else if (t.dataset.route) {
    const ship = S.fleet.ships.find((x) => x.id === +t.dataset.route);
    const card = t.closest('[data-ship]');
    const v = (role) => card.querySelector(`[data-role="${role}"]`).value;
    const r = { a: v('a'), goodA: v('ga'), b: v('b'), goodB: v('gb') };
    if (r.a === r.b) { toast('Pick two different ports.'); return; }
    if (r.goodA === 'none' && r.goodB === 'none') { toast('Choose a cargo for at least one leg.'); return; }
    report(Fleet.setRoute(S, market, ship, r));
    toast(`<b>${ship.name}</b> will run ${PORTS.find((p) => p.id === r.a).name} – ${PORTS.find((p) => p.id === r.b).name}.`, 'port');
  } else if (t.dataset.stop) {
    const ship = S.fleet.ships.find((x) => x.id === +t.dataset.stop);
    ship.route = null;
    toast(`<b>${ship.name}</b> will stop at her next port.`);
  } else if (t.dataset.tab) {
    panelMode = t.dataset.tab;
  } else if (t.dataset.accept && pid) {
    const c = Contracts.accept(S, +t.dataset.accept, pid);
    if (c) { toast(`Contract taken: <b>${c.title}</b> by ${fmtDate(c.deadline)}.`, 'port'); log(`Took a contract: ${c.title}.`); }
    else toast(`You can hold at most ${Contracts.MAX_ACTIVE} contracts.`);
  } else if (t.dataset.deliver && pid) {
    const c = S.contracts.active.find((x) => x.id === +t.dataset.deliver);
    if (c && Contracts.canDeliver(S, c)) {
      const g = GOODS.find((x) => x.id === c.good);
      confirmDialog({
        title: `Deliver ${c.qty} ${g.unit} of ${g.name.toLowerCase()}?`,
        body: `<dl class="facts"><dt>Contract pays</dt><dd>${c.reward.toLocaleString()} cz</dd><dt>Purse after</dt><dd>${Math.floor(S.purse + c.reward).toLocaleString()} cz</dd><dt>Left in the hold</dt><dd>${S.cargo[c.good] - c.qty} ${g.unit}</dd></dl>`,
        ok: `Deliver for ${c.reward.toLocaleString()} cz`,
        onOk: () => { const m = Contracts.deliver(S, c); toast(m.html, m.kind); log(m.log); checkMilestones(); },
      });
      return;
    }
  } else if (t.dataset.abandon) {
    const c = S.contracts.active.find((x) => x.id === +t.dataset.abandon);
    if (c) {
      confirmDialog({
        title: 'Abandon this contract?',
        body: `<p><b>${c.title}</b></p><p>${c.patron} will remember it: your standing drops.</p>`,
        ok: 'Abandon',
        onOk: () => { Contracts.abandon(S, c); log(`Abandoned a contract: ${c.title}.`); },
      });
      return;
    }
  } else if (t.dataset.sailto) {
    const p = PORTS.find((x) => x.id === t.dataset.sailto);
    const plan = planCourse(p.lon, p.lat, p.id, false);
    if (plan) { panelMode = null; confirmVoyage(plan); }
    else toast('The pilot can find no passage there.');
  } else if (t.hasAttribute('data-ledger')) {
    panelMode = 'ledger';
  } else if (t.hasAttribute('data-close-ledger')) {
    panelMode = S.ship.docked ? 'port' : null;
  } else if (t.hasAttribute('data-close')) {
    panelMode = null;
    if (S.ship.docked) toast('Click anywhere on the chart, or a port, to set your course.');
  } else if (t.hasAttribute('data-reset')) {
    if (confirm('Abandon this voyage and start again from Lisbon in 1451?')) { newGame(); panelMode = 'port'; setSpeed(1); }
  }
  renderPanel();
  save();
});

$('panel').addEventListener('submit', (e) => {
  const form = e.target.closest('[data-cloud-form]');
  if (!form) return;
  e.preventDefault();
  const code = form.elements.code.value.trim();
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 12) { toast('A save code has 12 letters and numbers, like 7KQ2-MX9P-4TRD.'); return; }
  loadFromCloud(code);
});

// Route editor: when a port changes, offer the goods sold there.
$('panel').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-role]');
  if (!sel) return;
  const card = sel.closest('[data-ship]');
  if (sel.dataset.role === 'a') card.querySelector('[data-role="ga"]').innerHTML = goodOptions(sel.value, undefined);
  if (sel.dataset.role === 'b') card.querySelector('[data-role="gb"]').innerHTML = goodOptions(sel.value, undefined);
});

document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
$('btn-fleet').addEventListener('click', () => togglePanel('fleet'));
$('btn-help').addEventListener('click', () => togglePanel('help'));
$('btn-cloud').addEventListener('click', () => togglePanel('cloud'));
$('tip-close').addEventListener('click', () => { S.tips.off = true; renderTip(); save(); });
function zoomBy(k) {
  cam.scale *= k;
  clampCam();
}
$('zoom-in').addEventListener('click', () => zoomBy(1.35));
$('zoom-out').addEventListener('click', () => zoomBy(1 / 1.35));
$('btn-ledger').addEventListener('click', () => togglePanel('ledger'));
$('btn-sail').addEventListener('click', () => togglePanel('sail'));
$('btn-contracts').addEventListener('click', () => togglePanel('contracts'));
$('btn-wind').addEventListener('click', toggleWind);
$('btn-ship').addEventListener('click', () => centerOn(S.ship.lon, S.ship.lat));
$('btn-port').addEventListener('click', () => {
  if (S.ship.docked) { panelMode = 'port'; renderPanel(); } else toast('You can only trade at anchor in a port.');
});

// ---- Confirmation dialog ----------------------------------------------------
let modal = null;
function confirmDialog({ title, body, ok = 'Confirm', onOk, kind = 'trade', preview = null, actions = {}, cancel = true }) {
  modal = { onOk, kind, preview, actions };
  $('modal-cancel').hidden = !cancel;
  $('modal').classList.toggle('aside', kind === 'voyage');
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  $('modal-ok').textContent = ok;
  $('modal').hidden = false;
  $('modal-ok').focus();
}
function closeModal(accept) {
  if (!modal) return;
  const m = modal;
  modal = null;
  $('modal').hidden = true;
  if (accept) m.onOk();
  renderPanel();
  save();
}
$('modal-ok').addEventListener('click', () => closeModal(true));
$('modal-cancel').addEventListener('click', () => closeModal(false));
$('modal-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-modal-action]');
  if (!b || !modal) return;
  const fn = modal.actions?.[b.dataset.modalAction];
  closeModal(false);
  fn?.();
});

let toastTimer;
function toast(html, kind = '') {
  const el = $('toast');
  const item = document.createElement('div');
  item.className = `t ${kind}`;
  item.innerHTML = html;
  el.appendChild(item);
  while (el.children.length > 3) el.firstChild.remove();
  clearTimeout(toastTimer);
  setTimeout(() => item.classList.add('out'), 4200);
  setTimeout(() => item.remove(), 4800);
}

// ---- Intro & loop -----------------------------------------------------------
let introDone = false;
function startIntro(hasSave) {
  $('intro-continue').hidden = !hasSave;
  $('intro-new').textContent = hasSave ? 'New game' : 'Weigh anchor';
  $('intro').hidden = false;
}
$('intro-continue').addEventListener('click', () => beginPlay());
$('intro-cloud').addEventListener('click', () => {
  const r = remoteAhead;
  beginPlay();
  if (r) loadFromCloud(Cloud.cloud.code, true);
});
$('intro-code').addEventListener('click', () => { beginPlay(); panelMode = 'cloud'; renderPanel(); });
$('intro-new').addEventListener('click', () => {
  if ($('intro-continue').hidden === false && !confirm('Start over? Your saved voyage will be lost.')) return;
  newGame();
  beginPlay();
});

function beginPlay() {
  $('intro').hidden = true;
  introDone = true;
  if (S.ship.docked) { panelMode = 'port'; renderPanel(); }
  centerOn(S.ship.lon, S.ship.lat);
  setTimeout(unlockContracts, 600);
  if (startSummary) { pendingSummary = startSummary; startSummary = null; }
}

let last = performance.now();
let saveClock = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (introDone) update(dt);
  if (pendingSummary && !modal && introDone) { const sm = pendingSummary; pendingSummary = null; showSummary(sm); }
  saveClock += dt;
  if (saveClock > 5 && introDone) { saveClock = 0; save(); }
  cloudClock += dt;
  if (cloudClock > 30 && introDone) { cloudClock = 0; cloudSync(); }
  render();
  renderHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { resize(); clampCam(); });
window.addEventListener('beforeunload', () => introDone && save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && introDone) { save(); cloudSync(); }
  if (document.visibilityState === 'visible' && introDone) {
    const sum = catchUp();
    if (sum) { pendingSummary = sum; renderPanel(); }
  }
});

resize();
Cloud.loadMeta();
const hasSave = load();
if (!hasSave) newGame();
if (Cloud.cloud.code && hasSave) lastPushed = null;
renderCloudButton();
checkCloudOnStart();
let startSummary = catchUp();
centerOn(-13, 29, 0.85);
setSpeed(1);
startIntro(hasSave);
requestAnimationFrame(frame);

// Exposed for debugging in the console.
window.helmline = {
  get state() { return S; }, market: () => market, setCourse, setSpeed, screenOf: (lon, lat) => toScreen(lon, lat),
  away: (minutes) => { S.lastSeen = Date.now() - minutes * 60000; const sum = catchUp(); if (sum) pendingSummary = sum; return sum && { days: sum.days, purse: Math.round(sum.purse), capped: sum.capped }; },
  advance: (days) => { for (let i = 0; i < days * 4; i++) advanceTime(0.25, !S.ship.docked); renderPanel(); },
};

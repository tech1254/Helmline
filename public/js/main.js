import {
  BOUNDS, COS0, D2R, LANDS, LAND_GROUPS, PORTS, isLand, inBounds, windAt, sailFactor,
  pointOfSail, compassPoint, bearing, distNm, angleDiff, findPath, clearWater,
} from './world.js';
import { GOODS, Market } from './economy.js';

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
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ S, market: market.toJSON(), fog: fogToString() }));
  } catch (e) { /* storage unavailable: play on without saving */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S = d.S;
    market = new Market(d.market);
    initFog(d.fog);
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
  const [sx, sy] = toScreen(S.ship.lon, S.ship.lat);
  const s = Math.max(0.8, Math.min(1.6, cam.scale / 30));
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(S.ship.heading * D2R);
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
  ctx.fillStyle = '#f7f0de';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2, 0, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
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

  // ports
  ctx.save();
  ctx.font = 'italic 15px "IM Fell English", Georgia, serif';
  ctx.textBaseline = 'middle';
  for (const p of PORTS) {
    if (!S.discovered[p.id]) continue;
    const [sx, sy] = toScreen(p.lon, p.lat);
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
  if (sh.docked || !sh.route.length || speed === 0) return;
  let days = dtSec * DAYS_PER_SEC * speed;
  while (days > 0 && sh.route.length) {
    const dd = Math.min(0.05, days);
    days -= dd;
    const [tl, ta] = sh.route[0];
    sh.heading = bearing(sh.lon, sh.lat, tl, ta);
    const { f } = shipWind();
    const nm = SHIP.knots * 24 * f * dd;
    const rem = distNm(sh.lon, sh.lat, tl, ta);
    S.day += dd;
    S.purse -= SHIP.upkeep * dd;
    market.tick(dd);
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

function replan(dest) {
  const path = findPath(S.ship.lon, S.ship.lat, dest.lon, dest.lat);
  if (!path) return false;
  S.ship.route = path;
  return true;
}

// Plot a course to a point (optionally a port), appended if `append`.
function setCourse(lon, lat, portId, append) {
  const sh = S.ship;
  const fromLon = append && sh.route.length ? sh.route[sh.route.length - 1][0] : sh.lon;
  const fromLat = append && sh.route.length ? sh.route[sh.route.length - 1][1] : sh.lat;
  const path = findPath(fromLon, fromLat, lon, lat);
  if (!path) { toast('The pilot can find no passage there.'); return; }
  sh.route = append ? sh.route.concat(path) : path;
  sh.dest = { lon, lat, port: portId || null };
  if (sh.docked) undock();
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
  checkMilestones();
  panelMode = 'port';
  renderPanel();
  save();
}

function undock() {
  S.ship.docked = null;
  if (panelMode === 'port') panelMode = null;
  renderPanel();
}

function observe(portId) {
  S.seen[portId] = { day: S.day, prices: market.observe(portId) };
}

function checkMilestones() {
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

function portAt(sx, sy) {
  let best = null, bd = 16;
  for (const p of PORTS) {
    if (!S.discovered[p.id]) continue;
    const [px, py] = toScreen(p.lon, p.lat);
    const d = Math.hypot(px - sx, py - sy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
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
  const p = portAt(sx, sy);
  if (p) {
    if (S.ship.docked === p.id) { panelMode = 'port'; renderPanel(); return; }
    setCourse(p.lon, p.lat, p.id, append);
    return;
  }
  const [lon, lat] = toWorld(sx, sy);
  if (!inBounds(lon, lat)) { toast('That lies beyond the edge of the chart.'); return; }
  if (isLand(lon, lat)) {
    toast(isRevealed(lon, lat) ? 'That is dry land, captain.' : 'The lookout sees nothing there yet.');
    return;
  }
  setCourse(lon, lat, null, append);
}

window.addEventListener('keydown', (e) => {
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
}

function priceCell(v) {
  return v == null ? '<span class="muted">—</span>' : `${v}`;
}

function renderPanel() {
  const el = $('panel');
  if (!panelMode) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('wide', panelMode === 'ledger');
  if (panelMode === 'port') renderPort(el);
  else renderLedger(el);
  $('btn-ledger').classList.toggle('on', panelMode === 'ledger');
}

function renderPort(el) {
  const pid = S.ship.docked;
  if (!pid) { panelMode = null; el.hidden = true; return; }
  const p = PORTS.find((x) => x.id === pid);
  observe(pid);
  const free = SHIP.hold - held();
  const rows = GOODS.map((g) => {
    const sells = market.sells(pid, g.id);
    const buy = sells ? market.buyPrice(pid, g.id) : null;
    const sell = market.sellPrice(pid, g.id);
    const have = S.cargo[g.id];
    const avg = have ? Math.round(S.paid[g.id] / have) : null;
    const best = bestKnownSale(g.id, pid);
    return `<tr>
      <th scope="row">${g.name}<small>${best ? `best seen: ${best.price} at ${best.name}` : ''}</small></th>
      <td class="num">${priceCell(buy)}</td>
      <td class="num">${sell}</td>
      <td class="num">${have || '<span class="muted">0</span>'}${avg ? `<small>paid ~${avg}</small>` : ''}</td>
      <td class="acts">
        ${sells ? `<button data-buy="${g.id}" data-n="1" ${buy > S.purse || !free ? 'disabled' : ''}>+1</button><button data-buy="${g.id}" data-n="10" ${buy > S.purse || !free ? 'disabled' : ''}>+10</button><button data-buy="${g.id}" data-n="max" ${buy > S.purse || !free ? 'disabled' : ''}>Max</button>` : ''}
        ${have ? `<button data-sell="${g.id}" data-n="1">−1</button><button data-sell="${g.id}" data-n="all">All</button>` : ''}
      </td></tr>`;
  }).join('');
  el.innerHTML = `
    <header><h2>${p.name}</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="blurb">${p.blurb}</p>
    <table class="market">
      <thead><tr><th>Good</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Hold</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">Hold ${held()} / ${SHIP.hold} · purse ${Math.floor(S.purse).toLocaleString()} cz · upkeep ${SHIP.upkeep} cz a day at sea.<br>
    Buying pushes the price up; selling pushes it down. Prices recover over a few weeks. <i>Max</i> keeps two weeks of wages in the purse.</p>
    <div class="row"><button data-ledger>Open ledger</button><button class="primary" data-close>Set sail</button></div>`;
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
    <header><h2>Trade ledger</h2><button class="close" data-close-ledger aria-label="Close">×</button></header>
    <p class="blurb">Prices as last seen by your ship. <b>Bold</b> is the price to buy, the other is what they pay you. Entries older than two months are faded.</p>
    <div class="scroll"><table class="ledger"><thead><tr><th>Good</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <h3>The harbourmaster suggests</h3>
    <ol class="sugg">${sugHtml}</ol>
    <p class="foot">Estimates assume a straight course and calm trading. Winds will change the sailing time.</p>
    <h3>Log</h3>
    <ul class="log">${(S.log || []).slice(-6).reverse().map((l) => `<li><span>${fmtDate(l.day)}</span> ${l.text}</li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul>
    <div class="row"><button data-reset class="danger">Start a new game</button></div>`;
}

function log(text) {
  S.log = S.log || [];
  S.log.push({ day: S.day, text });
  if (S.log.length > 60) S.log.shift();
}

$('panel').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const pid = S.ship.docked;
  if (t.dataset.buy && pid) {
    const g = t.dataset.buy;
    const free = SHIP.hold - held();
    const max = t.dataset.n === 'max';
    const n = max ? free : +t.dataset.n;
    // "Max" keeps back two weeks of wages so the crew is paid on the way.
    const budget = Math.floor(S.purse - (max ? Math.min(WAGE_RESERVE, Math.max(0, S.purse - market.buyPrice(pid, g))) : 0));
    const { bought, cost } = market.buy(pid, g, n, budget, free);
    S.cargo[g] += bought; S.paid[g] += cost; S.purse -= cost;
    observe(pid);
  } else if (t.dataset.sell && pid) {
    const g = t.dataset.sell;
    const n = t.dataset.n === 'all' ? S.cargo[g] : Math.min(+t.dataset.n, S.cargo[g]);
    const avgCost = S.cargo[g] ? S.paid[g] / S.cargo[g] : 0;
    const { sold, income } = market.sell(pid, g, n);
    S.cargo[g] -= sold; S.paid[g] = Math.max(0, S.paid[g] - avgCost * sold); S.purse += income;
    if (!S.cargo[g]) S.paid[g] = 0;
    observe(pid);
    checkMilestones();
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

document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
$('btn-ledger').addEventListener('click', () => togglePanel('ledger'));
$('btn-wind').addEventListener('click', toggleWind);
$('btn-ship').addEventListener('click', () => centerOn(S.ship.lon, S.ship.lat));
$('btn-port').addEventListener('click', () => {
  if (S.ship.docked) { panelMode = 'port'; renderPanel(); } else toast('You can only trade at anchor in a port.');
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
}

let last = performance.now();
let saveClock = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (introDone) update(dt);
  saveClock += dt;
  if (saveClock > 5 && introDone) { saveClock = 0; save(); }
  render();
  renderHud();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { resize(); clampCam(); });
window.addEventListener('beforeunload', () => introDone && save());

resize();
const hasSave = load();
if (!hasSave) newGame();
centerOn(-13, 29, 0.85);
setSpeed(1);
startIntro(hasSave);
requestAnimationFrame(frame);

// Exposed for debugging in the console.
window.helmline = { get state() { return S; }, market: () => market, setCourse, setSpeed };

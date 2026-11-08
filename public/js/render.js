// Drawing the chart: sea, coasts, winds, fog, courses, ports and ships.

import { BOUNDS, CHART_OUTLINE, D2R, LANDS, PORTS, RIVERS, SHOALS, isLand, inBounds, windAt, isBeyond as isBeyondPort } from './world.js';
import * as Contracts from './contracts.js';
import * as Fleet from './fleet.js';
import * as Houses from './houses.js';
import * as Works from './works.js';
import { findPath, distNm } from './world.js';
import { reported } from './pilots.js';
import { FH, FW } from './config.js';
import { S, ui } from './state.js';
import { FOG_PAD, fogSoft, isRevealed, refreshFog } from './fog.js';
import { DPR, H, W, cam, ctx, toScreen, toWorld } from './view.js';
import { $ } from './util.js';

// ---- Rendering --------------------------------------------------------------
export const INK = '#4a3622';
export const SEA = '#ecdfc0';
export const LANDFILL = '#d6bd8a';
export const RED = '#a2372b';
export const MARGIN = '#d9c9a3';

export function pathPoly(pts) {
  const n = pts.length;
  const P = pts.map(([x, y]) => toScreen(x, y));
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  const tangent = (i) => {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    let tx = (c[0] - a[0]) / 6, ty = (c[1] - a[1]) / 6;
    const lim = 0.4 * Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]));
    const len = Math.hypot(tx, ty);
    if (len > lim && len > 0) { tx *= lim / len; ty *= lim / len; }
    return [tx, ty];
  };
  let t0 = tangent(0);
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], t1 = tangent((i + 1) % n);
    ctx.bezierCurveTo(a[0] + t0[0], a[1] + t0[1], b[0] - t1[0], b[1] - t1[1], b[0], b[1]);
    t0 = t1;
  }
  ctx.closePath();
}

export function drawRose(lon, lat, r) {
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

export function drawWind() {
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

export function drawShip() {
  const sh = S.ship;
  drawShipAt(sh.lon, sh.lat, sh.docked && sh.offshore ? 200 : sh.heading, '#f7f0de', RED, 1);
  // at anchor off a shallow port: her boat rows to and fro while there is cargo to work
  if (sh.docked && sh.offshore) {
    const p = PORTS.find((x) => x.id === sh.docked);
    drawBoats(sh.lon, sh.lat, p.lon, p.lat, !!(sh.boats && sh.boats.moved < sh.boats.total), 0);
  }
}

// A ship's boat between her anchorage and the shore: rowing back and forth while `busy`,
// otherwise lying alongside. `phase` keeps several ships' boats out of step.
export function drawBoats(aLon, aLat, pLon, pLat, busy, phase) {
  const [ax, ay] = toScreen(aLon, aLat), [px, py] = toScreen(pLon, pLat);
  const s = Math.max(0.8, Math.min(1.6, cam.scale / 30));
  // the anchor cable
  ctx.save();
  ctx.strokeStyle = 'rgba(45, 31, 18, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 7 * s, ay + 9 * s); ctx.stroke();
  ctx.setLineDash([]);
  // the boat: out loaded, back light, a short pause at each end
  let t = 0.08, dir = 1;
  if (busy) {
    const c = ((performance.now() / 5200 + phase) % 1);
    const u = c < 0.5 ? c * 2 : (1 - c) * 2; // 0 at the ship, 1 at the shore
    t = Math.min(1, Math.max(0, (u - 0.08) / 0.84));
    dir = c < 0.5 ? 1 : -1;
  }
  const bx = ax + (px - ax) * t, by = ay + (py - ay) * t;
  const ang = Math.atan2(py - ay, px - ax) + (dir < 0 ? Math.PI : 0);
  ctx.translate(bx, by);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.2, 1.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a3d22';
  ctx.fill();
  ctx.strokeStyle = '#2d1f12';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (busy) { // oars
    const sw = Math.sin(performance.now() / 180) * 1.2;
    ctx.beginPath();
    ctx.moveTo(-1 + sw, -1.6); ctx.lineTo(-2 + sw, -4.4);
    ctx.moveTo(-1 + sw, 1.6); ctx.lineTo(-2 + sw, 4.4);
    ctx.stroke();
  }
  ctx.restore();
}

// Rivers, drawn inland as a channel of water (after the land).
export function drawRivers() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of Object.values(RIVERS)) {
    const pts = r.pts.map(([x, y]) => toScreen(x, y));
    const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    line(); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, cam.scale / 9) + 2; ctx.stroke();
    line(); ctx.strokeStyle = SEA; ctx.lineWidth = Math.max(3, cam.scale / 9); ctx.stroke();
  }
  ctx.restore();
}

// Shoals as dotted banks with soundings, as on a portolan (before the land, which covers
// the part of each bank drawn ashore).
export function drawShoals() {
  const zoomed = cam.scale > 18;
  ctx.save();
  for (const sh of SHOALS) {
    ctx.beginPath();
    sh.pts.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.closePath();
    ctx.save();
    ctx.clip();
    // stipple of soundings over the bank
    ctx.fillStyle = 'rgba(74, 54, 34, 0.35)';
    const [x0, y0] = toScreen(Math.min(...sh.pts.map((p) => p[0])), Math.max(...sh.pts.map((p) => p[1])));
    const [x1, y1] = toScreen(Math.max(...sh.pts.map((p) => p[0])), Math.min(...sh.pts.map((p) => p[1])));
    const gap = Math.max(5, cam.scale / 6);
    for (let y = y0; y < y1; y += gap) for (let x = x0 + ((y / gap) % 2) * gap / 2; x < x1; x += gap) ctx.fillRect(x, y, 1.2, 1.2);
    ctx.restore();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(74, 54, 34, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    if (zoomed) {
      const cx = sh.pts.reduce((a, p) => a + p[0], 0) / sh.pts.length - 0.35, cy = sh.pts.reduce((a, p) => a + p[1], 0) / sh.pts.length;
      const [lx, ly] = toScreen(cx, cy);
      ctx.font = `italic ${Math.round(Math.min(16, cam.scale * 0.32))}px "IM Fell English", Georgia, serif`;
      ctx.fillStyle = 'rgba(74, 54, 34, 0.8)';
      ctx.textAlign = 'center';
      ctx.fillText('Baixos', lx, ly);
    }
  }
  ctx.restore();
}
export const drawWaters = () => { drawShoals(); drawRivers(); };

export function drawShipAt(lon, lat, heading, sail, flag, size) {
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

// Corsair galleys: in sight, drawn where they are; seen earlier or heard of in port, a faded mark
// where they were last seen, with how long ago. Old sightings fade out after a fortnight.
// Places the pilots of Lagos gave you courses for, not yet charted: a dashed ring and a name.
export function drawReported() {
  const list = reported(S);
  if (!list.length) return;
  ctx.save();
  ctx.font = 'italic 12px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  for (const p of list) {
    const [sx, sy] = toScreen(p.lon, p.lat);
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f2e3bf';
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f2e3bf';
    ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([]);
    const label = `${p.name}? (pilots' course)`;
    ctx.font = 'italic 14px "IM Fell English", Georgia, serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(30,20,10,0.85)';
    ctx.strokeText(label, sx, sy - 16);
    ctx.fillStyle = '#f2e3bf';
    ctx.fillText(label, sx, sy - 16);
  }
  ctx.restore();
}

export function drawGalleys() {
  const G = S.pirates?.galleys;
  if (!G?.length) return;
  ctx.save();
  ctx.font = 'italic 12px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  for (const g of G) {
    if (g.seen == null) continue;
    const ago = S.day - g.seen;
    if (ago > 15) continue;
    const live = ago < 0.5;
    const lon = live ? g.lon : g.seenLon, lat = live ? g.lat : g.seenLat;
    ctx.globalAlpha = live ? 1 : Math.max(0.35, 0.8 - ago / 25);
    drawShipAt(lon, lat, g.heading, '#7a1c14', '#1a1a1a', g.big ? 1.05 : 0.9);
    const [sx, sy] = toScreen(lon, lat);
    const label = live ? (g.big ? 'Great galley' : 'Corsairs') : `Corsairs, ${Math.max(1, Math.round(ago))} ${Math.round(ago) <= 1 ? 'day' : 'days'} ago`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(236,223,192,0.9)';
    ctx.strokeText(label, sx, sy + 20);
    ctx.fillStyle = '#7a1c14';
    ctx.fillText(label, sx, sy + 20);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawFleet() {
  const F = S.fleet;
  if (!F?.ships.length) return;
  ctx.save();
  ctx.font = 'italic 12px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  for (const ship of F.ships) {
    const pos = Fleet.position(S, ship);
    if (pos.beyond || (ship.at && isBeyondPort(ship.at) && !ship.leg)) continue; // away in the Indies
    drawShipAt(pos.lon, pos.lat, pos.heading, '#dbe5ee', '#1e3246', 0.85);
    if (pos.anchored) drawBoats(pos.lon, pos.lat, pos.port.lon, pos.port.lat, ship.status === 'boats', (ship.id % 7) / 7);
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

// The rival houses' ships at work between their ports (houses.js), in their colours, where the
// chart is known. Their passages follow the sea routes.
const housePaths = new Map();
function pathFor(from, to) {
  const key = `${from}>${to}`;
  if (!housePaths.has(key)) {
    const a = PORTS.find((p) => p.id === from), b = PORTS.find((p) => p.id === to);
    let pts = a && b ? findPath(a.lon, a.lat, b.lon, b.lat, 1, false, false) : null;
    if (a && b && !(pts?.length >= 2)) pts = [[a.lon, a.lat], [b.lon, b.lat]];
    let run = 0;
    const cum = pts ? pts.map((p, i) => (run += i ? distNm(pts[i - 1][0], pts[i - 1][1], p[0], p[1]) : 0)) : [];
    housePaths.set(key, pts && { pts, cum, len: run });
  }
  return housePaths.get(key);
}
export function drawHouses() {
  if (!S?.houses) return;
  ctx.save();
  ctx.font = 'italic 12px "IM Fell English", Georgia, serif';
  ctx.textAlign = 'center';
  for (const v of Houses.vessels(S)) {
    const P = pathFor(v.from, v.to);
    if (!P) continue;
    const at = v.t * P.len;
    let i = 1;
    while (i < P.pts.length - 1 && P.cum[i] < at) i++;
    const [x0, y0] = P.pts[i - 1], [x1, y1] = P.pts[i];
    const seg = P.cum[i] - P.cum[i - 1] || 1, f = Math.max(0, Math.min(1, (at - P.cum[i - 1]) / seg));
    const lon = x0 + (x1 - x0) * f, lat = y0 + (y1 - y0) * f;
    if (!isRevealed(lon, lat)) continue;
    const heading = Math.atan2((x1 - x0) * Math.cos(lat * D2R), y1 - y0) / D2R;
    drawShipAt(lon, lat, heading, '#e9dcc0', v.colour, 0.8);
    if (cam.scale > 22) {
      const [sx, sy] = toScreen(lon, lat);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(236,223,192,0.9)';
      ctx.strokeText(v.name, sx, sy + 19);
      ctx.fillStyle = v.colour;
      ctx.fillText(v.name, sx, sy + 19);
    }
  }
  ctx.restore();
}

// The edge of the chart as a closed path (the parts off the chart left out).
function chartOutline() {
  ctx.beginPath();
  CHART_OUTLINE.forEach(([x, y], i) => { const [sx, sy] = toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
  ctx.closePath();
}

// A port beyond the chart (Calicut): the place where ships sail off the edge for it, marked with
// an arrow and the name of where it leads.
function drawBeyond(p, sx, sy) {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 12, sy);
  ctx.moveTo(sx + 6, sy - 5); ctx.lineTo(sx + 12, sy); ctx.lineTo(sx + 6, sy + 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx - 8, sy, p.id === ui.hoverPort ? 6 : 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'right';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(236,223,192,0.9)';
  const label = `to ${p.name} and the Indies`;
  ctx.strokeText(label, sx - 16, sy);
  ctx.fillStyle = '#3a2716';
  ctx.fillText(label, sx - 16, sy);
  ctx.restore();
}

export function render() {
  refreshFog();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [fx, fy] = toScreen(BOUNDS.west, BOUNDS.north);
  const [fx2, fy2] = toScreen(BOUNDS.east, BOUNDS.south);
  // Beyond the chart's edge: the bare margin of the parchment.
  ctx.fillStyle = MARGIN;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  chartOutline();
  ctx.clip();
  ctx.fillStyle = SEA;
  ctx.fillRect(fx, fy, fx2 - fx, fy2 - fy);

  drawRose(-24, 27, 0);
  drawRose(-13.5, 37.5, 0);
  drawRose(-12, -22, 0);

  // graticule labels at the edges
  ctx.save();
  ctx.strokeStyle = 'rgba(120,80,45,0.18)';
  ctx.fillStyle = 'rgba(74,54,34,0.6)';
  ctx.font = '11px "EB Garamond", Georgia, serif';
  for (let lat = -35; lat <= 40; lat += 5) {
    const [, y] = toScreen(0, lat);
    ctx.setLineDash(lat ? [2, 6] : [8, 4]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(lat ? `${Math.abs(lat)}° ${lat > 0 ? 'N' : 'S'}` : 'The Line', Math.max(fx, 0) + 6, y - 3);
  }
  ctx.restore();

  drawShoals(); // under the land, which hides the part of a bank drawn ashore
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
  drawRivers();
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

  if (ui.showWind) drawWind();

  // fog, drawn with its margin so each cell lands exactly on its square of the chart
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const padX = (fx2 - fx) * FOG_PAD / FW, padY = (fy2 - fy) * FOG_PAD / FH;
  ctx.drawImage(fogSoft, fx - padX, fy - padY, fx2 - fx + 2 * padX, fy2 - fy + 2 * padY);
  ctx.restore(); // end of the chart clip

  // chart edge
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  chartOutline();
  ctx.stroke();
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

  // corsair waters, marked as a period chart would
  if (isRevealed(-9.5, 33.5)) {
    ctx.save();
    const [cx, cy] = toScreen(-11.6, 33.2);
    ctx.font = `italic ${Math.round(Math.max(12, Math.min(20, cam.scale * 0.45)))}px "IM Fell English", Georgia, serif`;
    ctx.fillStyle = 'rgba(162, 55, 43, 0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('Corsairs of Barbary', cx, cy);
    ctx.restore();
  }

  // a course being considered in the confirmation dialog
  if (ui.modal?.preview?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(162, 55, 43, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -performance.now() / 60;
    ctx.beginPath();
    ctx.moveTo(...toScreen(S.ship.lon, S.ship.lat));
    for (const [x, y] of ui.modal.preview) ctx.lineTo(...toScreen(x, y));
    ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey] = toScreen(...ui.modal.preview[ui.modal.preview.length - 1]);
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
    const lead = S.houses && Houses.leader(S, p.id); // who leads this port's trade: a ring in their colour
    if (lead) {
      ctx.beginPath();
      ctx.arc(sx, sy, 8.5, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = lead === 'you' ? '#b8860b' : Houses.defOf(lead).colour;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, p.id === ui.hoverPort ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    // your port works: a small gold block for each finished building, under the port
    const built = S.works ? Works.BUILDING_IDS.filter((id) => Works.has(S, p.id, id)).length : 0;
    for (let k = 0; k < built; k++) {
      ctx.fillStyle = '#b8860b';
      ctx.strokeStyle = 'rgba(58,39,22,0.8)';
      ctx.lineWidth = 1;
      const bx = sx - (built * 6) / 2 + k * 6, by = sy + 9;
      ctx.fillRect(bx, by, 5, 5);
      ctx.strokeRect(bx, by, 5, 5);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#f7f0de';
    ctx.stroke();
    if (p.beyond) { drawBeyond(p, sx, sy); continue; }
    const label = p.name;
    // the label goes east of the port, or west out in the ocean; `label` in world.js PORTS where
    // neighbours crowd (n, s, e, w)
    const side = p.label || (p.lon > -10.5 ? 'e' : 'w');
    const tx = side === 'e' ? sx + 10 : side === 'w' ? sx - 10 : sx;
    const ty = side === 'n' ? sy - 14 : side === 's' ? sy + 14 : sy;
    ctx.textAlign = side === 'e' ? 'left' : side === 'w' ? 'right' : 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(236,223,192,0.9)';
    ctx.strokeText(label, tx, ty);
    ctx.fillStyle = '#3a2716';
    ctx.fillText(label, tx, ty);
  }
  ctx.restore();

  drawReported();
  drawHouses();
  drawFleet();
  drawGalleys();
  drawShip();
}

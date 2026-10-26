// Drawing the chart: sea, coasts, winds, fog, courses, ports and ships.

import { BOUNDS, D2R, LANDS, PORTS, isLand, inBounds, windAt } from './world.js';
import * as Contracts from './contracts.js';
import * as Fleet from './fleet.js';
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
  drawShipAt(S.ship.lon, S.ship.lat, S.ship.heading, '#f7f0de', RED, 1);
}

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

export function drawFleet() {
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

export function render() {
  refreshFog();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [fx, fy] = toScreen(BOUNDS.west, BOUNDS.north);
  const [fx2, fy2] = toScreen(BOUNDS.east, BOUNDS.south);
  // Beyond the chart's edge: the bare margin of the parchment.
  ctx.fillStyle = MARGIN;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fx2 - fx, fy2 - fy);
  ctx.clip();
  ctx.fillStyle = SEA;
  ctx.fillRect(fx, fy, fx2 - fx, fy2 - fy);

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
    ctx.fillText(`${lat}° N`, Math.max(fx, 0) + 6, y - 3);
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
    ctx.beginPath();
    ctx.arc(sx, sy, p.id === ui.hoverPort ? 7 : 5, 0, Math.PI * 2);
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

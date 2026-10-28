// The fog of war: which cells of the chart are known, and the soft image drawn over the map.

import { BOUNDS, OLD_BOUNDS, D2R, LANDS, LAND_GROUPS, PORTS, isLand, distNm, portOpen } from './world.js';
import { yearOf } from './ships.js';
import { FH, FOG_CELL, FW } from './config.js';
import { S } from './state.js';
import { canvas } from './view.js';
import { $ } from './util.js';
import { warmRoutes } from './panels.js';
import { log } from './pricebook.js';
import { toast } from './notices.js';

export let fog; // Uint8Array, 1 = unknown
export let fogDirty = true;
export function initFog(saved, savedBounds) {
  fog = new Uint8Array(FW * FH).fill(1);
  if (saved) {
    const bin = decodeFog(saved);
    const b = savedBounds || OLD_BOUNDS; // saves from before the chart grew have no bounds
    const ow = Math.round((b.east - b.west) / FOG_CELL), oh = Math.round((b.north - b.south) / FOG_CELL);
    if (ow === FW && oh === FH && b.west === BOUNDS.west && b.south === BOUNDS.south) {
      for (let i = 0; i < fog.length && i < bin.length; i++) fog[i] = bin.charCodeAt(i);
    } else {
      // Copy each charted cell of the old chart onto the same place on the new one.
      for (let j = 0; j < oh; j++) {
        for (let i = 0; i < ow; i++) {
          if (bin.charCodeAt(j * ow + i) !== 0) continue;
          const k = fogIdx(b.west + (i + 0.5) * FOG_CELL, b.south + (j + 0.5) * FOG_CELL);
          if (k >= 0) fog[k] = 0;
        }
      }
    }
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

// The fog is saved as runs: 'r:' then the lengths (base 36) of alternating runs of unknown and
// known cells, starting with unknown. The chart is mostly unknown in long stretches, so this is
// a small fraction of the size of the cells themselves. Older saves hold the cells in base64.
// Coasts the crown's pilots chart as history opens a port: the news comes with their charts.
const HISTORY_CHARTS = {
  mpinda: [{ group: 'africa', w: 4.4, s: -7.5, n: 6.5 }],
  saotome: [{ group: 'guinea' }],
  saobras: [{ group: 'africa', w: 8, s: -35, n: -6 }],
  portoseguro: [{ group: 'brazil' }],
  calicut: [{ group: 'africa', w: 17, s: -35, n: -30 }],
};
export function chartFromHistory(portId) {
  for (const c of HISTORY_CHARTS[portId] || []) {
    for (const l of LANDS) {
      if (l.group !== c.group) continue;
      for (const [x, y] of l.pts) if ((c.w == null || x >= c.w) && (c.s == null || y >= c.s) && (c.n == null || y <= c.n)) revealAt(x, y, 1.2, true);
    }
  }
  const p = PORTS.find((q) => q.id === portId);
  if (p) revealAt(p.lon, p.lat, 1.5, true);
}

export function fogToString() {
  const runs = [];
  let v = 1, n = 0;
  for (let i = 0; i < fog.length; i++) {
    const c = fog[i] ? 1 : 0;
    if (c === v) { n++; continue; }
    runs.push(n.toString(36)); v = c; n = 1;
  }
  runs.push(n.toString(36));
  return `r:${runs.join(',')}`;
}

// Back to a string of cell values (as atob gives for older saves).
function decodeFog(saved) {
  if (!saved.startsWith('r:')) return atob(saved);
  const out = [];
  let v = 1;
  for (const r of saved.slice(2).split(',')) { out.push(String.fromCharCode(v).repeat(parseInt(r, 36))); v ^= 1; }
  return out.join('');
}

export function fogIdx(lon, lat) {
  const i = Math.floor((lon - BOUNDS.west) / FOG_CELL), j = Math.floor((lat - BOUNDS.south) / FOG_CELL);
  if (i < 0 || j < 0 || i >= FW || j >= FH) return -1;
  return j * FW + i;
}

export function isRevealed(lon, lat) {
  const k = fogIdx(lon, lat);
  return k >= 0 && fog[k] === 0;
}

export function revealAt(lon, lat, r, quiet = false) {
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
    if (!S.discovered[p.id] && !p.beyond && portOpen(p.id, yearOf(S.day)) && distNm(lon, lat, p.lon, p.lat) <= r * 55) {
      S.discovered[p.id] = true;
      S.unpaidCharts.push(p.name);
      warmRoutes();
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

// The fog, one pixel per cell, with a margin of FOG_PAD cells on every side that repeats
// the edge cells, so the blur does not fade at the chart's border.
export const FOG_PAD = 3;
export const fogCanvas = document.createElement('canvas');
fogCanvas.width = FW + 2 * FOG_PAD;
fogCanvas.height = FH + 2 * FOG_PAD;
export const fogCtx = fogCanvas.getContext('2d');
// Soft, high-resolution copy of the fog, rebuilt only when something is revealed.
export const FOG_UP = 4;
export const fogSoft = document.createElement('canvas');
fogSoft.width = fogCanvas.width * FOG_UP;
fogSoft.height = fogCanvas.height * FOG_UP;
export const fogSoftCtx = fogSoft.getContext('2d');
export function updateFogCanvas() {
  const w = fogCanvas.width, h = fogCanvas.height;
  const img = fogCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const j = Math.min(FH - 1, Math.max(0, FH - 1 - (y - FOG_PAD))); // flip: north at top
    for (let x = 0; x < w; x++) {
      const i = Math.min(FW - 1, Math.max(0, x - FOG_PAD));
      const dst = (y * w + x) * 4;
      img.data[dst] = 46; img.data[dst + 1] = 36; img.data[dst + 2] = 27;
      img.data[dst + 3] = fog[j * FW + i] ? 255 : 0;
    }
  }
  fogCtx.putImageData(img, 0, 0);
  fogSoftCtx.clearRect(0, 0, fogSoft.width, fogSoft.height);
  fogSoftCtx.imageSmoothingEnabled = true;
  fogSoftCtx.filter = `blur(${FOG_UP * 0.9}px)`; // ignored where unsupported: smoothing still softens it
  fogSoftCtx.drawImage(fogCanvas, 0, 0, fogSoft.width, fogSoft.height);
  fogSoftCtx.filter = 'none';
  fogDirty = false;
}

// Coastlines are drawn as smooth curves through their points (Catmull-Rom as Béziers).
// The curve passes through every point, so ports stay on the coast; each handle is kept
// shorter than the segments either side, so sharp capes do not loop or bulge.

export function refreshFog() {
  if (fogDirty) updateFogCanvas();
}

export function markFogDirty() {
  fogDirty = true;
}

// The arrival scene: when your flagship reaches a port, the chart eases in on the harbour and
// fades into a painted view of it, your ship sails in from the left, brails up her sails and
// comes to rest. About five seconds; a tap or a key skips it. Never for hired ships, nor while
// catching up after time away.
//
// Each harbour is a photograph (img/ports, see photos.js) with the ship's photograph cut at her
// waterline sailing in over it. While the photographs load, or for a port without one, the
// harbour is painted in code from six settings (Lisbon has its own) and the ship drawn.

import { PORTS } from './world.js';
import { S, ui } from './state.js';
import { cam, clampCam } from './view.js';
import { COS0 } from './world.js';
import { $, fmtDate } from './util.js';
import { shipImage, ART_BOX } from './shipart.js';
import { portPhoto, shipPhoto, photoImage, gradedShip, PX_PER_M } from './photos.js';
import { CHART_REWARD } from './config.js';
import { releaseToasts } from './notices.js';

const SETTING = { lisbon: 'lisbon', lagos: 'iberia', funchal: 'madeira', lanzarote: 'volcanic', arguin: 'desert', gambia: 'river', serraleoa: 'river', cestos: 'river', mina: 'surf' };
const T_ZOOM = 0.9, T_FADE = 0.5, T_SAIL = 3.6, T_HOLD = 0.9, T_OUT = 0.45;

export const SCENE_MODES = [['all', 'Every port'], ['first', 'First visits only'], ['off', 'Off']];
export function sceneMode() {
  return S.settings?.arrivals || 'all';
}
export function setSceneMode(m) {
  S.settings = S.settings || {};
  S.settings.arrivals = m;
}

// Automated browsers (the test suite) skip the scene unless asked for it.
function enabled(first) {
  const m = sceneMode();
  if (m === 'off' || (m === 'first' && !first)) return false;
  if (navigator.webdriver && !window.helmlineScenes) return false;
  return true;
}

// Called when the flagship sets course for a port: fetch the photographs while she sails.
export function preloadArrival(portId) {
  if (!portId || sceneMode() === 'off') return;
  if (sceneMode() === 'first' && S.called?.[portId]) return;
  photoImage(portPhoto(portId));
  photoImage(shipPhoto(S.ship)?.src);
}

// Called as the ship reaches a port, before dock(). Returns true if the scene will play.
export function startArrival(portId) {
  S.called = S.called || {};
  const first = !S.called[portId];
  S.called[portId] = true;
  if (!enabled(first)) return false;
  const port = PORTS.find((p) => p.id === portId);
  if (!port) return false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  ui.arrival = { portId, port, first, newlyCharted: first && !port.known, held: [], t0: performance.now(), reduced,
    from: { x: cam.x, y: cam.y, scale: cam.scale }, ship: { hull: S.ship.hull, fit: { ...S.ship.fit }, name: S.ship.name } };
  try { run(); } catch (e) { console.error(e); done(); return false; }
  return true;
}

let raf = null;
function run() {
  const A = ui.arrival;
  const el = $('scene');
  el.hidden = false;
  el.className = A.reduced ? 'reduced' : '';
  el.innerHTML = `<canvas></canvas>
    <div class="scene-cap"><p class="kicker">${A.newlyCharted ? 'Newly charted' : A.first ? 'First call' : fmtDate(S.day)}</p><h2>${A.port.name}</h2>
      <p class="line">${A.newlyCharted ? `The <i>${esc(A.ship.name)}</i> drops anchor where no Portuguese chart has been. The crown pays ${CHART_REWARD} cz for it in Lisbon.` : `The <i>${esc(A.ship.name)}</i> comes in to ${A.port.name}.`}</p></div>
    <button class="scene-skip">Tap to skip</button>`;
  document.body.classList.add('scene-open');
  A.canvas = el.querySelector('canvas');
  A.img = shipImage(A.ship, { sea: false });
  A.furled = shipImage(A.ship, { sea: false, furled: true });
  A.painting = photoImage(portPhoto(A.portId));
  A.photo = shipPhoto(A.ship);
  A.photoImg = photoImage(A.photo?.src);
  const skip = () => finish(true);
  el.onclick = skip;
  A.onKey = (e) => { if (!ui.modal) { e.preventDefault(); e.stopImmediatePropagation(); skip(); } };
  window.addEventListener('keydown', A.onKey, { capture: true });
  sizeCanvas();
  A.onResize = () => sizeCanvas();
  window.addEventListener('resize', A.onResize);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function sizeCanvas() {
  const A = ui.arrival;
  if (!A) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  A.w = window.innerWidth; A.h = window.innerHeight; A.dpr = dpr;
  A.canvas.width = Math.round(A.w * dpr); A.canvas.height = Math.round(A.h * dpr);
  A.backdrop = null; A.vignette = null;
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const easeIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function frame(now) {
  if (!ui.arrival) return;
  try { step(now); } catch (e) { console.error(e); done(); } // never leave the game frozen behind the scene
}

function step(now) {
  const A = ui.arrival;
  const t = (now - A.t0) / 1000;
  const el = $('scene');
  // 1. the chart zooms in on the harbour
  if (!A.reduced && t < T_ZOOM + T_FADE) {
    const k = easeIn(Math.min(1, t / T_ZOOM));
    cam.x = A.from.x + (A.port.lon * COS0 - A.from.x) * k;
    cam.y = A.from.y + (-A.port.lat - A.from.y) * k;
    cam.scale = A.from.scale * Math.pow(Math.max(1, 140 / A.from.scale), k);
    clampCam();
  }
  const start = A.reduced ? 0 : T_ZOOM;
  const fadeIn = A.reduced ? 1 : Math.min(1, Math.max(0, (t - start) / T_FADE));
  const sailT = A.reduced ? 1 : Math.max(0, (t - start - T_FADE * 0.4) / T_SAIL);
  const end = A.reduced ? 2.4 : start + T_FADE * 0.4 + T_SAIL + T_HOLD;
  const out = A.closing ? Math.min(1, (now - A.closing) / (T_OUT * 1000)) : Math.max(0, (t - end) / T_OUT);
  el.style.opacity = String(fadeIn * (1 - out));
  el.classList.toggle('cap-on', (A.reduced || t > start + T_FADE + 0.4) && out < 0.6);
  draw(A, t, sailT);
  if (out >= 1) { done(); return; }
  raf = requestAnimationFrame(frame);
}

function finish() {
  const A = ui.arrival;
  if (!A || A.closing) return;
  A.closing = performance.now();
}

function done() {
  const A = ui.arrival;
  if (!A) return;
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', A.onResize);
  window.removeEventListener('keydown', A.onKey, { capture: true });
  // back to the chart, at the zoom the captain had, centred on the port
  cam.x = A.port.lon * COS0; cam.y = -A.port.lat; cam.scale = Math.max(A.from.scale, 30);
  clampCam();
  const el = $('scene');
  el.hidden = true; el.innerHTML = ''; el.style.opacity = '';
  document.body.classList.remove('scene-open');
  ui.arrival = null;
  releaseToasts(A.held);
}

// ---- Painting ---------------------------------------------------------------------------

function draw(A, t, sailT) {
  const c = A.canvas.getContext('2d');
  const { w, h, dpr } = A;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ready = (img) => img && img.complete && img.naturalWidth;
  // a harbour photograph, cover-fitted; the painted harbour until it has loaded
  if (A.usePhoto == null && (t >= (A.reduced ? 0.6 : T_ZOOM) || (ready(A.painting) && ready(A.photoImg))))
    A.usePhoto = !!(ready(A.painting) && (A.photo ? ready(A.photoImg) : true));
  const photo = !!A.usePhoto;
  let s = 1, horizon = h * 0.5, waterY = h * 0.8;
  if (photo) {
    const P = A.painting;
    s = Math.max(w / P.naturalWidth, h / P.naturalHeight);
    const dx = (w - P.naturalWidth * s) / 2, dy = (h - P.naturalHeight * s) / 2;
    c.drawImage(P, dx, dy, P.naturalWidth * s, P.naturalHeight * s);
    s *= P.naturalWidth / 1600; // the photographs' scale is set at 1600 pixels wide
    horizon = dy + P.naturalHeight * (s * 1600 / P.naturalWidth) * 0.5;
    waterY = Math.min(h * 0.86, dy + P.naturalHeight * (s * 1600 / P.naturalWidth) * 0.8);
  } else {
    if (!A.backdrop) A.backdrop = paintBackdrop(A, w, h);
    c.drawImage(A.backdrop, 0, 0, w, h);
  }
  // water: moving glints
  c.save();
  c.globalAlpha = photo ? 0.12 : 0.5;
  c.strokeStyle = '#f6f1e2';
  c.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    const r = (i * 0.6180339) % 1;
    const y = horizon + 8 + Math.pow(r, 1.6) * (h - horizon - 10);
    const len = 12 + 40 * Math.pow(r, 1.3);
    const x = ((i * 137 + t * (10 + 20 * r)) % (w + 100)) - 50;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len / 2, y - 1.5, x + len, y); c.stroke();
  }
  c.restore();
  if (photo && A.photo) { drawPhotoShip(c, A, t, sailT, s, waterY); drawVignette(c, A, w, h); return; }
  // the ship
  const shipH = Math.min(h * 0.62, w * (w < 700 ? 0.8 : 0.5) * ART_BOX.h / ART_BOX.w);
  const shipW = shipH * ART_BOX.w / ART_BOX.h;
  const restX = w * (w < 700 ? 0.5 : 0.44) - shipW / 2;
  const k = ease(Math.min(1, sailT));
  const x = -shipW + (restX + shipW) * k;
  const bob = Math.sin(t * 1.6) * shipH * 0.008 * (1.4 - k * 0.6);
  const y = waterY - shipH * ART_BOX.waterline / ART_BOX.h + bob;
  const tilt = Math.sin(t * 1.3) * 0.012 * (1.3 - k * 0.7);
  const furl = Math.max(0, Math.min(1, (sailT - 0.72) / 0.22)); // sails brailed up as she comes in
  // reflection
  c.save();
  c.globalAlpha = 0.16;
  c.translate(x + shipW / 2, waterY + bob);
  c.scale(1, -0.55);
  c.drawImage(furl > 0.5 ? A.furled : A.img, -shipW / 2, -shipH * ART_BOX.waterline / ART_BOX.h, shipW, shipH);
  c.restore();
  // wake while she moves
  if (k < 0.98) {
    c.save();
    c.strokeStyle = 'rgba(250,246,234,0.7)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const wx = x + shipW * 0.2 - i * 26 - (t * 30) % 26;
      c.beginPath(); c.moveTo(wx, waterY + 4 + i * 2); c.lineTo(wx - 30, waterY + 8 + i * 3); c.stroke();
    }
    c.restore();
  }
  c.save();
  c.translate(x + shipW / 2, y + shipH * ART_BOX.waterline / ART_BOX.h);
  c.rotate(tilt);
  // the furled ship underneath, the ship under sail over her, fading as the sails come in
  const top = -shipH * ART_BOX.waterline / ART_BOX.h;
  if (furl > 0 && ready(A.furled)) c.drawImage(A.furled, -shipW / 2, top, shipW, shipH);
  if (ready(A.img) && furl < 1) { c.globalAlpha = 1 - furl; c.drawImage(A.img, -shipW / 2, top, shipW, shipH); }
  c.restore();
  // waterline foam over the hull
  c.save();
  c.fillStyle = 'rgba(160,185,190,0.55)';
  c.fillRect(x, waterY + 1 + bob, shipW, 3);
  c.restore();
  // gulls
  c.save();
  c.strokeStyle = 'rgba(58,39,22,0.7)';
  c.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const gx = ((i * 211 + t * (22 + i * 6)) % (w + 80)) - 40;
    const gy = h * (0.14 + i * 0.06) + Math.sin(t * 2 + i) * 6;
    const flap = Math.sin(t * 7 + i * 2) * 3;
    c.beginPath(); c.moveTo(gx - 7, gy - flap); c.quadraticCurveTo(gx - 3, gy - 4, gx, gy); c.quadraticCurveTo(gx + 3, gy - 4, gx + 7, gy - flap); c.stroke();
  }
  c.restore();
  if (A.foreground) c.drawImage(A.foreground, 0, 0, w, h);
  c.drawImage(A.grain, 0, 0, w, h);
}

// The ship's photograph: cut at her waterline, so her bottom edge sits on the water. She sails in
// from the left with her sails set and comes to rest; a soft broken reflection below her.
function drawPhotoShip(c, A, t, sailT, s, waterY) {
  const { w } = A;
  const ph = A.photo;
  if (!A.shipLit) A.shipLit = gradedShip(A.photoImg, ph, A.portId); // relit once for this harbour's light
  const img = A.shipLit;
  let shipW = ph.length * PX_PER_M * s;
  shipW = Math.min(shipW, w * 0.92);
  const shipH = shipW * ph.h / ph.w;
  const restX = w * (w < 700 ? 0.5 : 0.42) - shipW / 2;
  const k = ease(Math.min(1, sailT));
  const x = -shipW + (restX + shipW) * k;
  const bob = Math.sin(t * 1.6) * shipH * 0.006 * (1.4 - k * 0.6);
  const tilt = Math.sin(t * 1.3) * 0.008 * (1.3 - k * 0.7);
  // reflection, broken into strips that sway
  c.save();
  const rh = shipH * 0.5, strips = 14;
  for (let i = 0; i < strips; i++) {
    const v0 = i / strips, v1 = (i + 1) / strips;
    c.globalAlpha = 0.22 * (1 - v0) * (0.7 + 0.3 * Math.sin(i * 1.7 + t * 2));
    const sx = Math.sin(i * 0.9 + t * 1.8) * 3;
    // strip i of the reflection shows the ship from her waterline upward
    c.save();
    c.translate(x + sx, waterY + bob + rh * v0);
    c.scale(1, -1);
    c.drawImage(img, 0, ph.h * (1 - v1), ph.w, ph.h * (v1 - v0), 0, -rh * (v1 - v0), shipW, rh * (v1 - v0));
    c.restore();
  }
  c.restore();
  // a shadow along the waterline
  c.save();
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(10,20,25,0.4)'); g.addColorStop(1, 'rgba(10,20,25,0)');
  c.translate(x + shipW / 2, waterY + bob + 2); c.scale(shipW * 0.5, shipH * 0.03);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, 6.29); c.fill();
  c.restore();
  // wake while she moves
  if (k < 0.98) {
    c.save();
    c.strokeStyle = 'rgba(250,246,234,0.45)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const wx = x + shipW * 0.15 - i * 26 - (t * 30) % 26;
      c.beginPath(); c.moveTo(wx, waterY + 3 + i * 2); c.lineTo(wx - 30, waterY + 7 + i * 3); c.stroke();
    }
    c.restore();
  }
  c.save();
  c.translate(x + shipW / 2, waterY + bob);
  c.rotate(tilt);
  c.drawImage(img, -shipW / 2, -shipH, shipW, shipH);
  c.restore();
}

function drawVignette(c, A, w, h) {
  if (!A.vignette) {
    const [cv, v] = layer(w, h);
    const g = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(20,12,5,0)'); g.addColorStop(1, 'rgba(20,12,5,0.3)');
    v.fillStyle = g; v.fillRect(0, 0, w, h);
    A.vignette = cv;
  }
  c.drawImage(A.vignette, 0, 0, w, h);
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
// a soft ridge line: sum of sines, repeatable per seed
function ridge(R, n = 4) {
  const parts = Array.from({ length: n }, () => ({ f: 0.5 + R() * 4, p: R() * 6.28, a: R() }));
  const tot = parts.reduce((s, q) => s + q.a, 0);
  return (u) => parts.reduce((s, q) => s + q.a * Math.sin(u * q.f * 6.28 + q.p), 0) / tot;
}

function layer(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * 1.5); cv.height = Math.round(h * 1.5);
  const c = cv.getContext('2d');
  c.scale(1.5, 1.5);
  return [cv, c];
}

function paintBackdrop(A, w, h) {
  const set = SETTING[A.portId] || 'iberia';
  const [cv, c] = layer(w, h);
  const R = rng(A.portId.length * 7919 + 13);
  const horizon = h * 0.5;
  const tropic = ['river', 'surf', 'desert'].includes(set);
  // sky
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, tropic ? '#7fa9bd' : '#8eb0c2');
  sky.addColorStop(0.65, tropic ? '#e9dcc0' : '#dfe3d6');
  sky.addColorStop(1, tropic ? '#f6e2b6' : '#f2e3c2');
  c.fillStyle = sky; c.fillRect(0, 0, w, horizon + 2);
  const sun = c.createRadialGradient(w * 0.78, h * 0.18, 4, w * 0.78, h * 0.18, h * 0.45);
  sun.addColorStop(0, 'rgba(255,246,220,0.95)'); sun.addColorStop(0.15, 'rgba(255,238,200,0.55)'); sun.addColorStop(1, 'rgba(255,238,200,0)');
  c.fillStyle = sun; c.fillRect(0, 0, w, horizon);
  // clouds
  c.save();
  c.filter = 'blur(6px)';
  for (let i = 0; i < 7; i++) {
    const cx = R() * w, cy = h * (0.06 + R() * 0.24), s = 40 + R() * 90;
    c.fillStyle = `rgba(255,252,244,${0.35 + R() * 0.35})`;
    for (let j = 0; j < 5; j++) { c.beginPath(); c.ellipse(cx + (j - 2) * s * 0.45, cy + (R() - 0.5) * s * 0.2, s * (0.4 + R() * 0.3), s * 0.18, 0, 0, 6.29); c.fill(); }
  }
  c.restore();
  // land, by setting
  const hills = (base, height, colour, seed, blur = 0, x0 = 0, x1 = w) => {
    const f = ridge(rng(seed), 5);
    c.save();
    if (blur) c.filter = `blur(${blur}px)`;
    c.fillStyle = colour;
    c.beginPath(); c.moveTo(x0, base + 2);
    for (let x = x0; x <= x1; x += 6) c.lineTo(x, base - height * (0.55 + 0.45 * f(x / w)) * edge(x, x0, x1));
    c.lineTo(x1, base + 2); c.closePath(); c.fill();
    c.restore();
  };
  const edge = (x, x0, x1) => Math.min(1, (x - x0) / (w * 0.08), (x1 - x) / (w * 0.08));
  const town = (x0, x1, base, slope, n, opts = {}) => {
    const RR = rng(Math.round(x0 + n * 31));
    for (let i = 0; i < n; i++) {
      const u = RR();
      const x = x0 + u * (x1 - x0);
      const y = base - slope(u) - RR() * 6;
      const bw = 6 + RR() * 10, bh = 5 + RR() * 7;
      c.fillStyle = opts.walls || (RR() < 0.75 ? '#f3ecdc' : '#e4c99a');
      c.fillRect(x, y - bh, bw, bh);
      c.fillStyle = opts.roof || (RR() < 0.8 ? '#b4583a' : '#8e4a33');
      if (opts.thatch) { c.beginPath(); c.ellipse(x + bw / 2, y - bh, bw * 0.7, bh * 0.7, 0, Math.PI, 0); c.fill(); }
      else { c.beginPath(); c.moveTo(x - 1, y - bh); c.lineTo(x + bw / 2, y - bh - 3 - RR() * 2); c.lineTo(x + bw + 1, y - bh); c.fill(); }
      c.fillStyle = 'rgba(58,39,22,0.35)'; c.fillRect(x + bw * 0.3, y - bh * 0.6, 1.5, 2.5);
    }
  };
  const tower = (x, base, height, wdt, colour = '#ece2cc') => {
    c.fillStyle = colour; c.fillRect(x, base - height, wdt, height);
    c.fillStyle = 'rgba(58,39,22,0.4)'; c.fillRect(x + wdt * 0.4, base - height * 0.8, wdt * 0.2, height * 0.12);
    for (let i = 0; i < 3; i++) { c.fillStyle = colour; c.fillRect(x + i * wdt / 2.5, base - height - 4, wdt / 4, 4); }
  };
  const palm = (x, base, s, lean = 0.3) => {
    c.strokeStyle = '#5b4630'; c.lineWidth = 2.2 * s / 30;
    const tx = x + lean * s, ty = base - s * 1.4;
    c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + lean * s * 0.2, base - s * 0.8, tx, ty); c.stroke();
    c.fillStyle = '#3e5a30';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * s * 0.5, ty + Math.sin(a) * s * 0.3 - 4, tx + Math.cos(a) * s * 0.75, ty + Math.sin(a) * s * 0.2 + s * 0.25);
      c.quadraticCurveTo(tx + Math.cos(a) * s * 0.4, ty + Math.sin(a) * s * 0.2, tx, ty); c.fill();
    }
  };
  const vh = Math.min(h, w * 0.8); // land heights, so a tall phone screen does not stretch the hills
  const shoreBase = horizon + 4;
  if (set === 'lisbon') {
    hills(shoreBase, vh * 0.16, '#a9b6b0', 11, 2);
    hills(shoreBase, vh * 0.11, '#8f9e8a', 12, 1, w * 0.25, w);
    const hill = (u) => Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * vh * 0.12;
    c.fillStyle = '#9a9a72';
    c.beginPath(); c.moveTo(w * 0.3, shoreBase); for (let u = 0; u <= 1.001; u += 0.02) c.lineTo(w * (0.3 + u * 0.55), shoreBase - hill(u)); c.lineTo(w * 0.85, shoreBase); c.fill();
    town(w * 0.3, w * 0.85, shoreBase, (u) => hill(u) * 0.95, 140);
    // the castle of São Jorge on the hilltop
    const cx = w * 0.56, cy = shoreBase - hill(0.47) - 4;
    c.fillStyle = '#e2d6bc'; c.fillRect(cx - 40, cy - 16, 80, 16);
    for (let i = 0; i < 10; i++) c.fillRect(cx - 40 + i * 8.5, cy - 20, 4.5, 4);
    tower(cx - 46, cy, 30, 12, '#e2d6bc'); tower(cx + 34, cy, 30, 12, '#e2d6bc'); tower(cx - 6, cy, 38, 12, '#e8dcc2');
    tower(w * 0.4, shoreBase - hill(0.18), 26, 7); // a church
    // the riverside wall
    c.fillStyle = '#d9cdb2'; c.fillRect(w * 0.28, shoreBase - 6, w * 0.6, 6);
  } else if (set === 'iberia') {
    hills(shoreBase, vh * 0.09, '#b4b9a3', 21, 2);
    hills(shoreBase, vh * 0.05, '#a3a37c', 22, 1, w * 0.3, w);
    town(w * 0.36, w * 0.9, shoreBase, (u) => Math.sin(u * 3) * 6 + 8, 90);
    c.fillStyle = '#d6c7a6'; c.fillRect(w * 0.34, shoreBase - 9, w * 0.58, 9);
    for (let i = 0; i < 26; i++) c.fillRect(w * 0.34 + i * w * 0.0225, shoreBase - 12, w * 0.011, 3);
    tower(w * 0.52, shoreBase - 9, 28, 10); tower(w * 0.78, shoreBase - 9, 22, 9);
  } else if (set === 'madeira') {
    hills(shoreBase, vh * 0.33, '#6f8a6a', 31, 3);
    hills(shoreBase, vh * 0.22, '#55734d', 32, 1.5, w * 0.1, w);
    c.save(); c.strokeStyle = 'rgba(230,220,180,0.25)'; c.lineWidth = 1;
    for (let i = 1; i < 9; i++) { c.beginPath(); c.moveTo(w * 0.2, shoreBase - i * 9); c.bezierCurveTo(w * 0.4, shoreBase - i * 10 - 6, w * 0.7, shoreBase - i * 8 - 4, w * 0.95, shoreBase - i * 9); c.stroke(); }
    c.restore();
    town(w * 0.35, w * 0.8, shoreBase, (u) => 6 + u * 16, 70);
    tower(w * 0.58, shoreBase - 10, 26, 8);
  } else if (set === 'volcanic') {
    const cone = (x, base, ht, wd, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x - wd, base); c.quadraticCurveTo(x - wd * 0.3, base - ht, x - wd * 0.12, base - ht); c.lineTo(x + wd * 0.12, base - ht); c.quadraticCurveTo(x + wd * 0.3, base - ht, x + wd, base); c.fill(); };
    cone(w * 0.3, shoreBase, vh * 0.13, w * 0.16, '#a07a62'); cone(w * 0.55, shoreBase, vh * 0.18, w * 0.2, '#8d634c'); cone(w * 0.82, shoreBase, vh * 0.11, w * 0.14, '#9d6f55');
    c.fillStyle = '#4a3a33'; c.fillRect(w * 0.15, shoreBase - 6, w * 0.8, 6);
    town(w * 0.45, w * 0.75, shoreBase, () => 6, 26, { roof: '#efe8da' });
  } else if (set === 'desert') {
    c.fillStyle = '#e3cc94'; c.beginPath(); c.moveTo(w * 0.2, shoreBase); c.bezierCurveTo(w * 0.35, shoreBase - 18, w * 0.75, shoreBase - 22, w * 0.98, shoreBase); c.fill();
    c.fillStyle = '#d4b77a'; c.beginPath(); c.moveTo(w * 0.4, shoreBase); c.bezierCurveTo(w * 0.5, shoreBase - 10, w * 0.6, shoreBase - 12, w * 0.7, shoreBase); c.fill();
    // the little stone fort of Arguin
    const fx = w * 0.62, fy = shoreBase - 14;
    c.fillStyle = '#cdbb94'; c.fillRect(fx - 30, fy - 18, 60, 18);
    for (let i = 0; i < 7; i++) c.fillRect(fx - 30 + i * 9.5, fy - 22, 5, 4);
    tower(fx - 36, fy, 30, 12, '#cdbb94');
    c.fillStyle = '#b0261c'; c.fillRect(fx - 31, fy - 44, 1.4, 14); c.fillRect(fx - 29.6, fy - 44, 10, 6);
  } else if (set === 'river') {
    hills(shoreBase, vh * 0.06, '#5d7656', 51, 2);
    c.fillStyle = '#3e5a36';
    for (let i = 0; i < 70; i++) { const x = R() * w; if (x > w * 0.45 && x < w * 0.55) continue; c.beginPath(); c.ellipse(x, shoreBase - 8 - R() * 10, 14 + R() * 18, 10 + R() * 8, 0, 0, 6.29); c.fill(); }
    for (let i = 0; i < 9; i++) palm(w * (0.08 + i * 0.11) + R() * 20, shoreBase - 4, 26 + R() * 14, (R() - 0.5) * 0.6);
    town(w * 0.6, w * 0.85, shoreBase, () => 3, 14, { walls: '#b89a6a', roof: '#8a6a3a', thatch: true });
  } else if (set === 'surf') {
    hills(shoreBase, vh * 0.07, '#5b7553', 61, 2);
    c.fillStyle = '#e7d3a0'; c.fillRect(0, shoreBase - 5, w, 7);
    for (let i = 0; i < 12; i++) palm(w * (0.03 + i * 0.085) + R() * 18, shoreBase - 4, 24 + R() * 16, (R() - 0.5) * 0.7);
    town(w * 0.55, w * 0.8, shoreBase, () => 3, 16, { walls: '#b89a6a', roof: '#8a6a3a', thatch: true });
    if (S && new Date(Date.UTC(1451, 2, 1) + S.day * 864e5).getUTCFullYear() >= 1482) { // São Jorge da Mina, built 1482
      const fx = w * 0.4, fy = shoreBase - 6;
      c.fillStyle = '#efe6d2'; c.fillRect(fx - 34, fy - 20, 68, 20); tower(fx - 40, fy, 32, 12, '#efe6d2'); tower(fx + 30, fy, 26, 10, '#efe6d2');
    }
  }
  // haze over the land
  const haze = c.createLinearGradient(0, horizon - h * 0.2, 0, horizon + 4);
  haze.addColorStop(0, 'rgba(240,230,205,0)'); haze.addColorStop(1, 'rgba(240,230,205,0.35)');
  c.fillStyle = haze; c.fillRect(0, horizon - h * 0.2, w, h * 0.2 + 4);
  // sea
  const sea = c.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, tropic ? '#a8c6c0' : '#a9c1c3');
  sea.addColorStop(0.35, tropic ? '#6f9e9c' : '#7d9ea6');
  sea.addColorStop(1, tropic ? '#3f6f73' : '#4c6f7b');
  c.fillStyle = sea; c.fillRect(0, horizon + 2, w, h - horizon);
  // reflections of the shore
  c.save(); c.globalAlpha = 0.18; c.translate(0, horizon * 2 + 6); c.scale(1, -0.35); c.drawImage(cv, 0, 0, cv.width, cv.height * (horizon + 2) / (h * 1.5), 0, 0, w, horizon + 2); c.restore();
  // wave strokes, painted
  c.save(); c.strokeStyle = 'rgba(36,56,62,0.25)'; c.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const y = horizon + 6 + Math.pow(R(), 1.5) * (h - horizon), x = R() * w, s = 6 + (y - horizon) / h * 40;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + s / 2, y - s * 0.12, x + s, y); c.stroke();
  }
  c.restore();
  A.foreground = paintForeground(set, w, h);
  A.grain = paintGrain(w, h);
  return cv;
}

// A quay or a beach in the foreground, drawn over the ship's stern-side water.
function paintForeground(set, w, h) {
  const [cv, c] = layer(w, h);
  const waterY = h * 0.8;
  const iberian = ['lisbon', 'iberia', 'madeira', 'volcanic'].includes(set);
  if (iberian) {
    const x0 = w * (w < 700 ? 0.9 : 0.74);
    c.fillStyle = '#b8a888';
    c.beginPath(); c.moveTo(x0, waterY - 22); c.lineTo(w, waterY - 26); c.lineTo(w, h); c.lineTo(x0 - 14, h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(58,39,22,0.45)'; c.lineWidth = 1;
    for (let y = waterY - 12; y < h; y += 12) { c.beginPath(); c.moveTo(x0 - (y - waterY + 22) * 0.12, y); c.lineTo(w, y - 3); c.stroke(); }
    for (let i = 0; i < 8; i++) { c.beginPath(); const x = x0 + i * (w - x0) / 7; c.moveTo(x, waterY - 22); c.lineTo(x - 3, waterY - 10); c.stroke(); }
    c.fillStyle = '#3a2716'; c.fillRect(x0 + 18, waterY - 34, 8, 12); // bollard
    c.fillStyle = '#7a5532';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x0 + 60 + i * 20, waterY - 34, 8, 11, 0, 0, 6.29); c.fill(); } // casks
    c.strokeStyle = '#5b4630'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x0 + 22, waterY - 30); c.quadraticCurveTo(x0 - 30, waterY + 6, x0 - 70, waterY - 30); c.stroke(); // a mooring line
  } else {
    c.fillStyle = '#e2cc95';
    c.beginPath(); c.moveTo(w * 0.78, h); c.quadraticCurveTo(w * 0.86, waterY - 6, w, waterY - 14); c.lineTo(w, h); c.fill();
    c.fillStyle = '#5b4630'; // a canoe drawn up on the sand
    c.beginPath(); c.moveTo(w * 0.86, waterY + 18); c.quadraticCurveTo(w * 0.91, waterY + 26, w * 0.97, waterY + 14); c.quadraticCurveTo(w * 0.91, waterY + 20, w * 0.86, waterY + 18); c.fill();
  }
  return cv;
}

function paintGrain(w, h) {
  const [cv, c] = layer(w, h);
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(60,40,15,0)'); g.addColorStop(1, 'rgba(60,40,15,0.35)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const R = rng(99);
  c.fillStyle = 'rgba(90,60,30,0.05)';
  for (let i = 0; i < 2500; i++) c.fillRect(R() * w, R() * h, 1.2, 1.2);
  return cv;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

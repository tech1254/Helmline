// Taking a sight, on screen (rules in navsight.js): a button while a sight can be taken, and the
// sight itself. The star (or the sun) rides up and down as the ship rolls; the player sets the
// instrument's sight with the slider and marks the moment the body sits in the notch. Time stands
// still while the dialog is open.

import * as Sight from './navsight.js';
import { S, ui } from './state.js';
import { distNm } from './world.js';
import { confirmDialog } from './dialog.js';
import { shipWind } from './sim.js';
import { toast } from './notices.js';
import { plog } from './playlog.js';
import { $ } from './util.js';

let clock = 0, raf = null;

function nmLeft() {
  const r = S.ship.route || [];
  let lon = S.ship.lon, lat = S.ship.lat, nm = 0;
  for (const [x, y] of r) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
  return nm;
}

export function sightOffer() {
  if (!S || ui.modal || ui.screen || ui.arrival) return { ok: false };
  return Sight.offer(S, nmLeft(), shipWind().knots);
}

// Called each frame: show the button when a sight can be taken.
export function sightTick(dt) {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  const btn = $('sight-btn');
  if (!btn) return;
  const o = sightOffer();
  btn.hidden = !o.ok;
  if (o.ok) btn.querySelector('span').textContent = o.body.id === 'sun' ? 'Shoot the sun' : 'Take a sight';
}

export function initSight() {
  $('sight-btn')?.addEventListener('click', openSight);
}

export function openSight() {
  const o = sightOffer();
  if (!o.ok) return;
  const tool = Sight.TOOLS[o.tool];
  const alt = o.body.alt;
  const wind = shipWind().w.strength || 0.5;
  const rollAmp = 1.2 + 4.5 * wind; // degrees: the swell rolls the sight up and down
  const start = alt + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 5);
  confirmDialog({
    title: o.body.id === 'sun' ? 'Shoot the sun at noon' : 'Take the height of the Pole Star',
    kind: 'sight',
    ok: null,
    cancel: 'Not now',
    body: `<p class="fine">${tool.how} Set the sight with the slider, then press <b>Mark</b> the moment ${o.body.name} sits in the notch. The ship rolls: wait for her to come up level.</p>
      <canvas id="sight-canvas" width="560" height="300" aria-label="The sky, ${o.body.name}, and your instrument's sight"></canvas>
      <label class="field sight-slider">Height of the sight <input id="sight-angle" type="range" min="0" max="90" step="0.1" value="${start.toFixed(1)}"><output id="sight-read">${start.toFixed(1)}°</output></label>
      <div class="row"><button class="primary" data-modal-action="mark">Mark</button></div>`,
    actions: { mark: () => mark(o, alt) },
  });
  const cv = $('sight-canvas'), ctx = cv.getContext('2d'), input = $('sight-angle'), out = $('sight-read');
  input.addEventListener('input', () => { out.textContent = `${(+input.value).toFixed(1)}°`; });
  const t0 = performance.now();
  const roll = (t) => rollAmp * Math.sin(t / 900) + rollAmp * 0.35 * Math.sin(t / 370 + 1.3);
  ui.sightRoll = () => roll(performance.now() - t0);
  const draw = () => {
    if (!document.body.contains(cv) || $('modal').hidden) { raf = null; return; }
    const t = performance.now() - t0, r = roll(t), arm = +input.value;
    const W = cv.width, H = cv.height, mid = H / 2, scale = 9; // pixels a degree
    const y = (deg) => mid - (deg - arm) * scale; // the sight's notch sits at mid height
    const sun = o.body.id === 'sun';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sun ? '#4f86b8' : '#0b1626'); g.addColorStop(1, sun ? '#a9c9df' : '#24364d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the sea, if the horizon is in view
    const hy = y(0 + r);
    if (hy < H) { ctx.fillStyle = sun ? '#2f5d7a' : '#0a1420'; ctx.fillRect(0, hy, W, H - hy); }
    // degree marks
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px Georgia, serif';
    for (let d = Math.floor(arm - 20); d <= arm + 20; d++) {
      const yy = y(d); if (yy < 0 || yy > H) continue;
      const big = d % 5 === 0;
      ctx.beginPath(); ctx.moveTo(W - (big ? 40 : 28), yy); ctx.lineTo(W - 16, yy); ctx.stroke();
      if (big) ctx.fillText(`${d}°`, W - 72, yy + 4);
    }
    // a few other stars
    if (!sun) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 40; i++) { const sx = (i * 137) % (W - 90), sy = y(alt + ((i * 53) % 30) - 15 + r); if (sy > 0 && sy < hy) ctx.fillRect(sx, sy, 1.5, 1.5); } }
    // the body
    const by = y(alt + r), bx = W * 0.42;
    if (sun) { ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by); ctx.moveTo(bx, by - 9); ctx.lineTo(bx, by + 9); ctx.stroke(); }
    // the sight: a notch at mid height, as wide as the instrument allows
    const tol = Sight.TOOLS[o.tool].tol * scale;
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, mid); ctx.lineTo(bx - 26, mid); ctx.moveTo(bx + 26, mid); ctx.lineTo(W - 90, mid); ctx.stroke();
    ctx.strokeRect(bx - 22, mid - tol, 44, tol * 2);
    ctx.lineWidth = 1;
    raf = requestAnimationFrame(draw);
  };
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function mark(o, alt) {
  const arm = +($('sight-angle')?.value ?? 0);
  const r = ui.sightRoll ? ui.sightRoll() : 0;
  const err = Math.abs(alt + r - arm);
  const g = Sight.grade(err, o.tool);
  const mult = Sight.apply(S, g);
  plog('sight', { body: o.body.id, tool: o.tool, err: Math.round(err * 10) / 10, grade: g });
  const lat = Math.round(S.ship.lat);
  const where = `${Math.abs(lat)}° ${lat >= 0 ? 'north' : 'south'}`;
  if (g === 'miss') toast(`The reading is ${err.toFixed(1)}° out, and your pilot will not trust it. No harm done: the next passage brings another chance.`, '');
  else toast(`${g === 'fine' ? 'A fine sight' : 'A good sight'}: you are about ${where}. With her latitude fixed she holds a truer course: <b>${Math.round((mult - 1) * 100)}% faster</b> for the rest of the passage.`, 'discover');
}

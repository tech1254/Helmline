// The pilot's games at sea, on screen (rules in navsight.js). Buttons appear above the bottom
// controls while one can be played; time stands still while a game is open.
//  - The sight of the Pole Star (by eye or quadrant): set the sight, mark as the ship rolls level.
//  - The astrolabe (the noon sun): keep the light through both sights while it swings, long enough
//    for the pilot to read it; with Zacuto's almanac, then work the latitude from the tables.
//  - The traverse board: peg each course the helmsman calls, one glass after another.
//  - The sounding lead: call "bottom" the moment the lead touches.

import * as Sight from './navsight.js';
import * as Ports from './ports.js';
import * as Ships from './ships.js';
import { S, ui } from './state.js';
import { PORTS, distNm, shoalDepth, DEEP_DRAFT } from './world.js';
import { confirmDialog, closeModal } from './dialog.js';
import { shipWind, loadOf } from './sim.js';
import { toast } from './notices.js';
import { plog } from './playlog.js';
import { $, fmtDate } from './util.js';

let clock = 0, raf = null;
const stopAnim = () => { if (raf) cancelAnimationFrame(raf); raf = null; };

function nmLeft() {
  const r = S.ship.route || [];
  let lon = S.ship.lon, lat = S.ship.lat, nm = 0;
  for (const [x, y] of r) { nm += distNm(lon, lat, x, y); lon = x; lat = y; }
  return nm;
}
const free = () => S && !ui.modal && !ui.screen && !ui.arrival;

// Which games can be played now: [{ id, label }]
export function gamesNow() {
  if (!free() || S.ship.docked || !S.ship.route?.length) return [];
  const nm = nmLeft(), kn = shipWind().knots;
  const out = [];
  const o = Sight.offer(S, nm, kn);
  if (o.ok) out.push({ id: 'sight', label: o.body.id === 'sun' ? 'Shoot the sun' : 'Take a sight' });
  if (Sight.boardOffer(S, nm, kn).ok) out.push({ id: 'board', label: 'Keep the traverse board' });
  const dest = S.ship.dest?.port && PORTS.find((p) => p.id === S.ship.dest.port);
  if (dest) {
    const deep = Ships.isDeep(S.ship.hull) && shoalDepth(dest.lon, dest.lat) <= DEEP_DRAFT;
    const liesOff = deep || Ports.needsBoats(S, dest.id, S.ship.hull, loadOf());
    if (Sight.leadOffer(S, nm, liesOff).ok) out.push({ id: 'lead', label: 'Heave the lead' });
  }
  return out;
}
export const sightOffer = () => { const o = Sight.offer(S, nmLeft(), shipWind().knots); return free() ? o : { ok: false }; };

// Each frame: the buttons.
export function sightTick(dt) {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  const box = $('pilot-games');
  if (!box) return;
  const g = gamesNow();
  const key = g.map((x) => x.id).join(',');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.hidden = !g.length;
  box.innerHTML = g.map((x) => `<button class="sight-btn" data-game="${x.id}"><span>${x.label}</span></button>`).join('');
}

export function initSight() {
  $('pilot-games')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (!b) return;
    const id = b.dataset.game;
    $('pilot-games').dataset.key = ''; $('pilot-games').hidden = true;
    if (id === 'sight') openSight();
    else if (id === 'board') openBoard();
    else if (id === 'lead') openLead();
  });
}

const swell = () => shipWind().w.strength || 0.5;
const done = () => { stopAnim(); if (ui.modal) closeModal(false, true); };

// ---- The sight: the Pole Star (eye, quadrant) or the sun (astrolabe) --------------------------
export function openSight() {
  const o = Sight.offer(S, nmLeft(), shipWind().knots);
  if (!o.ok || !free()) return;
  if (o.body.id === 'sun') return openAstrolabe(o);
  const tool = Sight.TOOLS[o.tool];
  const alt = o.body.alt;
  const rollAmp = 1.2 + 4.5 * swell();
  const start = alt + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 5);
  confirmDialog({
    title: 'Take the height of the Pole Star', kind: 'sight', ok: null, cancel: 'Not now',
    body: `<p class="fine">${tool.how} Set the sight with the slider, then press <b>Mark</b> the moment the Pole Star sits in the notch. The ship rolls: wait for her to come up level.</p>
      <canvas id="sight-canvas" width="560" height="300" aria-label="The night sky, the Pole Star, and your instrument's sight"></canvas>
      <label class="field sight-slider">Height of the sight <input id="sight-angle" type="range" min="0" max="90" step="0.1" value="${start.toFixed(1)}"><output id="sight-read">${start.toFixed(1)}°</output></label>
      <div class="row"><button class="primary" data-modal-action="mark">Mark</button></div>`,
    actions: { mark: () => markStar(o, alt) },
  });
  const cv = $('sight-canvas'), ctx = cv.getContext('2d'), input = $('sight-angle'), out = $('sight-read');
  input.addEventListener('input', () => { out.textContent = `${(+input.value).toFixed(1)}°`; });
  const t0 = performance.now();
  const roll = (t) => rollAmp * Math.sin(t / 900) + rollAmp * 0.35 * Math.sin(t / 370 + 1.3);
  ui.sightRoll = () => roll(performance.now() - t0);
  const draw = () => {
    if (!document.body.contains(cv) || $('modal').hidden) { raf = null; return; }
    const r = roll(performance.now() - t0), arm = +input.value;
    const W = cv.width, H = cv.height, mid = H / 2, scale = 9;
    const y = (deg) => mid - (deg - arm) * scale;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1626'); g.addColorStop(1, '#24364d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const hy = y(0 + r);
    if (hy < H) { ctx.fillStyle = '#0a1420'; ctx.fillRect(0, hy, W, H - hy); }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px Georgia, serif';
    for (let d = Math.floor(arm - 20); d <= arm + 20; d++) {
      const yy = y(d); if (yy < 0 || yy > H) continue;
      const big = d % 5 === 0;
      ctx.beginPath(); ctx.moveTo(W - (big ? 40 : 28), yy); ctx.lineTo(W - 16, yy); ctx.stroke();
      if (big) ctx.fillText(`${d}°`, W - 72, yy + 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) { const sx = (i * 137) % (W - 90), sy = y(alt + ((i * 53) % 30) - 15 + r); if (sy > 0 && sy < hy) ctx.fillRect(sx, sy, 1.5, 1.5); }
    const by = y(alt + r), bx = W * 0.42;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by); ctx.moveTo(bx, by - 9); ctx.lineTo(bx, by + 9); ctx.stroke();
    const tol = Sight.TOOLS[o.tool].tol * scale;
    ctx.strokeStyle = '#e8b04a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(20, mid); ctx.lineTo(bx - 26, mid); ctx.moveTo(bx + 26, mid); ctx.lineTo(W - 90, mid); ctx.stroke();
    ctx.strokeRect(bx - 22, mid - tol, 44, tol * 2);
    ctx.lineWidth = 1;
    raf = requestAnimationFrame(draw);
  };
  stopAnim();
  raf = requestAnimationFrame(draw);
}

function markStar(o, alt) {
  stopAnim();
  const arm = +($('sight-angle')?.value ?? 0);
  const r = ui.sightRoll ? ui.sightRoll() : 0;
  const err = Math.abs(alt + r - arm);
  finishSight(o, Sight.grade(err, o.tool), err);
}

function finishSight(o, g, err) {
  const mult = Sight.apply(S, g);
  plog('sight', { body: o.body.id, tool: o.tool, err: err != null ? Math.round(err * 10) / 10 : undefined, grade: g });
  const lat = Math.round(S.ship.lat);
  const where = `${Math.abs(lat)}° ${lat >= 0 ? 'north' : 'south'}`;
  if (g === 'miss') toast('Your pilot will not trust that reading. No harm done: the next passage brings another chance.', '');
  else toast(`${g === 'fine' ? 'A fine sight' : 'A good sight'}: you are about ${where}. With her latitude fixed she holds a truer course: <b>${Math.round((mult - 1) * 100)}% faster</b> for the rest of the passage.`, 'discover');
}

// ---- The astrolabe: the noon sun ---------------------------------------------------------------
function openAstrolabe(o) {
  const tool = Sight.TOOLS[o.tool];
  const alt = o.body.alt;
  const swayAmp = 3 + 7 * swell(); // degrees the astrolabe swings
  const tol = tool.tol * 1.6;
  const start = Math.max(5, Math.min(89, alt + (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8)));
  confirmDialog({
    title: 'Shoot the sun at noon', kind: 'sight', ok: null, cancel: 'Not now',
    body: `<p class="fine">${tool.how} The bar fills while the light is through and empties while it is off. You have ${Sight.ASTRO_SECONDS} seconds.</p>
      <canvas id="sight-canvas" width="560" height="320" aria-label="The astrolabe swinging, and the sun's light through its sights"></canvas>
      <div class="astro-meter" aria-hidden="true"><i id="astro-fill"></i></div>
      <label class="field sight-slider">The alidade <input id="sight-angle" type="range" min="0" max="90" step="0.1" value="${start.toFixed(1)}"><output id="sight-read">${start.toFixed(1)}°</output></label>`,
    actions: {},
  });
  const cv = $('sight-canvas'), ctx = cv.getContext('2d'), input = $('sight-angle'), out = $('sight-read'), fill = $('astro-fill');
  input.addEventListener('input', () => { out.textContent = `${(+input.value).toFixed(1)}°`; });
  const t0 = performance.now();
  let last = t0, held = 0, finished = false;
  const sway = (t) => swayAmp * Math.sin(t / 1100) + swayAmp * 0.3 * Math.sin(t / 430 + 0.7);
  ui.sightRoll = () => sway(performance.now() - t0);
  ui.sightAlt = alt;
  const draw = (now) => {
    if (finished) return;
    if (!document.body.contains(cv) || $('modal').hidden) { raf = null; return; }
    const t = now - t0, dt = Math.min(0.1, (now - last) / 1000); last = now;
    const s = sway(t), arm = +input.value;
    const aligned = Math.abs(arm + s - alt) <= tol; // the alidade's height in the sky: as set, plus the swing
    held = Math.max(0, held + (aligned ? dt : -0.5 * dt));
    fill.style.width = `${Math.min(100, (held / Sight.HOLD_SECONDS) * 100)}%`;
    const W = cv.width, H = cv.height, cx = W * 0.5, cy = H * 0.5, R = 110;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5b8fbf'); g.addColorStop(1, '#b8d3e6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the sun's rays, coming down at its height
    const a = (-alt) * Math.PI / 180;
    ctx.strokeStyle = 'rgba(255,240,180,0.55)'; ctx.lineWidth = 2;
    for (let k = -3; k <= 3; k++) { const ox = -Math.sin(a) * k * 14, oy = Math.cos(a) * k * 14; ctx.beginPath(); ctx.moveTo(cx + ox - Math.cos(a) * 400, cy + oy - Math.sin(a) * 400); ctx.lineTo(cx + ox + Math.cos(a) * 400, cy + oy + Math.sin(a) * 400); ctx.stroke(); }
    ctx.fillStyle = '#fff3c4'; ctx.shadowColor = '#fff6c8'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140, 16, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    // the astrolabe: a brass ring, swinging, hung from the thumb ring at the top
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-s * Math.PI / 180);
    ctx.strokeStyle = '#7a5a22'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d6a64a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#8a6a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
    ctx.fillStyle = '#d6a64a'; ctx.beginPath(); ctx.arc(0, -R - 14, 9, 0, Math.PI * 2); ctx.fill();
    for (let d = 0; d <= 90; d += 10) { const q = -d * Math.PI / 180; ctx.strokeStyle = '#5a3f12'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(q) * (R - 6), Math.sin(q) * (R - 6)); ctx.lineTo(Math.cos(q) * (R + 4), Math.sin(q) * (R + 4)); ctx.stroke(); }
    // the alidade, at the height set
    const q = -arm * Math.PI / 180;
    ctx.rotate(q);
    ctx.fillStyle = '#b8862c'; ctx.fillRect(-R + 4, -5, 2 * R - 8, 10);
    ctx.fillStyle = '#6b4a14'; ctx.fillRect(-R + 18, -14, 8, 28); ctx.fillRect(R - 26, -14, 8, 28);
    ctx.restore();
    // the light through both sights: a bright spot under the lower sight
    if (aligned) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(-(s + arm) * Math.PI / 180); ctx.fillStyle = '#fffbe0'; ctx.shadowColor = '#fff3b0'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(R - 22, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    const secs = t / 1000;
    if (held >= Sight.HOLD_SECONDS || secs > Sight.ASTRO_SECONDS) {
      finished = true;
      const g2 = Sight.astroGrade(held >= Sight.HOLD_SECONDS ? secs : null);
      done();
      if (g2 !== 'miss' && o.tool === 'almanac') openAlmanac(o, g2);
      else finishSight(o, g2, null);
      return;
    }
    raf = requestAnimationFrame(draw);
  };
  stopAnim();
  raf = requestAnimationFrame(draw);
}

// ---- Zacuto's almanac: the sum ---------------------------------------------------------------
function openAlmanac(o, g) {
  const height = Math.round(o.body.alt * 2) / 2;
  const c = Sight.almanacChoices(S, height);
  const rows = [-3, -2, -1, 0, 1, 2, 3].map((k) => { const d = Sight.declination(S.day + k); return `<tr><td>${fmtDate(S.day + k).replace(/ \d{4}$/, '')}</td><td class="num">${Math.abs(d).toFixed(1)}° ${d >= 0 ? 'N' : 'S'}</td></tr>`; }).join('');
  const sgn = (v) => `${Math.abs(v)}° ${v >= 0 ? 'north' : 'south'}`;
  confirmDialog({
    title: 'Work the latitude', kind: 'sight', ok: null, cancel: false,
    body: `<p class="fine">The sun stood <b>${height}°</b> high at noon, bearing ${c.sunSouth ? 'south' : 'north'}. Find today, ${fmtDate(S.day)}, in Zacuto's table for the sun's declination. With the sun to the ${c.sunSouth ? 'south' : 'north'}, latitude is the declination ${c.sunSouth ? 'plus' : 'less'} (90° − the height).</p>
      <table class="almanac"><thead><tr><th>Day</th><th class="num">Declination</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="fine">Your pilot's sums. Which is right?</p>
      <div class="row">${c.opts.map((x, i) => `<button data-modal-action="o${i}">${sgn(x.v)}</button>`).join('')}</div>`,
    actions: Object.fromEntries(c.opts.map((x, i) => [`o${i}`, () => {
      plog('almanac', { right: x.ok });
      if (x.ok) { finishSight(o, Sight.upgrade(g), null); }
      else { toast('Not quite: that sum used the wrong figure from the table. The sight still counts.', ''); finishSight(o, g, null); }
    }])),
  });
}

// ---- The traverse board ------------------------------------------------------------------------
export function openBoard() {
  if (!Sight.boardOffer(S, nmLeft(), shipWind().knots).ok || !free()) return;
  const calls = Sight.boardCalls(S.ship.heading);
  let i = 0, right = 0, timer = null, t0 = 0;
  const SECS = 6;
  const pegs = Sight.POINTS.map((p, k) => { const a = (k * 22.5 - 90) * Math.PI / 180; return `<button class="peg" data-point="${k}" style="left:${50 + 42 * Math.cos(a)}%;top:${50 + 42 * Math.sin(a)}%" aria-label="${Sight.POINT_NAMES[k]}">${p}</button>`; }).join('');
  confirmDialog({
    title: 'Keep the traverse board', kind: 'sight', ok: null, cancel: 'Not now',
    body: `<p class="fine">Each half-hour glass the helmsman calls the course he has steered, and you peg it on the board. ${Sight.BOARD_CALLS} glasses; peg each before the sand runs out.</p>
      <p class="board-call" id="board-call" aria-live="assertive"></p>
      <div class="glass" aria-hidden="true"><i id="glass-fill"></i></div>
      <div class="board" id="board">${pegs}<span class="board-hub" aria-hidden="true"></span></div>
      <p class="fine" id="board-score"></p>`,
    actions: {},
  });
  const call = $('board-call'), fill = $('glass-fill'), score = $('board-score');
  const next = () => {
    if (i >= calls.length) return end();
    call.innerHTML = `Glass ${i + 1} of ${calls.length}. Helmsman: <b>“${Sight.POINT_NAMES[calls[i]][0].toUpperCase() + Sight.POINT_NAMES[calls[i]].slice(1)}!”</b>`;
    t0 = performance.now();
  };
  const tick = () => {
    if (!document.body.contains(fill) || $('modal').hidden) { raf = null; return; }
    const f = (performance.now() - t0) / (SECS * 1000);
    fill.style.width = `${Math.max(0, 100 - f * 100)}%`;
    if (f >= 1) { i++; score.textContent = `Pegged right: ${right} of ${i}. The sand ran out on that one.`; next(); }
    if (i < calls.length) raf = requestAnimationFrame(tick);
  };
  $('board').addEventListener('click', (e) => {
    const b = e.target.closest('[data-point]');
    if (!b || i >= calls.length) return;
    const ok = +b.dataset.point === calls[i];
    if (ok) right++;
    b.classList.add(ok ? 'pegged' : 'wrong');
    setTimeout(() => b.classList.remove('wrong'), 400);
    i++;
    score.textContent = `Pegged right: ${right} of ${i}.`;
    next();
  });
  ui.boardCalls = calls;
  const end = () => {
    clearTimeout(timer);
    const g = Sight.boardGrade(right);
    const m = Sight.applyBoard(S, g);
    plog('board', { right, of: calls.length, grade: g });
    done();
    if (g === 'miss') toast(`The board is a muddle (${right} of ${calls.length} right): your pilot falls back on his own reckoning. No harm done.`, '');
    else toast(`A ${g === 'fine' ? 'true' : 'fair'} reckoning on the traverse board (${right} of ${calls.length}): she keeps her course better, <b>${Math.round((m - 1) * 100)}% faster</b> for the rest of the passage.`, 'discover');
  };
  next();
  stopAnim();
  raf = requestAnimationFrame(tick);
}

// ---- The sounding lead ------------------------------------------------------------------------
export function openLead() {
  if (!free()) return;
  const dest = PORTS.find((p) => p.id === S.ship.dest?.port);
  if (!dest) return;
  const metres = Math.max(3, Ports.depthOf(S, dest.id) + 1 + Math.random() * 4);
  const bottom = Math.round(metres / 1.83 * 2) / 2; // fathoms (braças)
  const RATE = 1.4; // fathoms paid out a second
  confirmDialog({
    title: 'Heave the lead', kind: 'sight', ok: null, cancel: 'Not now',
    body: `<p class="fine">Coming in to ${dest.name}, where she must lie off. The leadsman swings the lead ahead and lets the line run; it is knotted every fathom. Press <b>Bottom!</b> the moment the lead touches, and your pilot finds the channel to anchor closer.</p>
      <canvas id="sight-canvas" width="560" height="300" aria-label="The lead line running down through the water"></canvas>
      <div class="row"><button class="primary" data-modal-action="bottom">Bottom!</button></div>`,
    actions: { bottom: () => markLead() },
  });
  const cv = $('sight-canvas'), ctx = cv.getContext('2d');
  const t0 = performance.now() + 600; // the cast
  const paid = () => Math.max(0, (performance.now() - t0) / 1000 * RATE);
  ui.leadBottom = bottom; ui.leadPaid = paid;
  const draw = () => {
    if (!document.body.contains(cv) || $('modal').hidden) { raf = null; return; }
    const W = cv.width, H = cv.height, top = 50, fath = (H - top - 20) / (bottom + 3);
    const out = paid(), lead = Math.min(out, bottom);
    ctx.fillStyle = '#c9dbe6'; ctx.fillRect(0, 0, W, top);
    const g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, '#3d6f8c'); g.addColorStop(1, '#173447');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
    // the sea bed, rising toward the shore on the right
    ctx.fillStyle = '#6b5a3c'; ctx.beginPath(); ctx.moveTo(0, top + bottom * fath + 6); ctx.lineTo(W * 0.55, top + bottom * fath); ctx.lineTo(W, top + bottom * fath * 0.55); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    // the ship's side and the line
    ctx.fillStyle = '#3b2b1d'; ctx.fillRect(W * 0.08, top - 34, W * 0.2, 34);
    const lx = W * 0.32;
    ctx.strokeStyle = '#efe3c4'; ctx.lineWidth = 2;
    const slack = Math.max(0, out - bottom);
    ctx.beginPath(); ctx.moveTo(W * 0.28, top - 20);
    ctx.quadraticCurveTo(lx + slack * 14, top + lead * fath * 0.5, lx, top + lead * fath); ctx.stroke();
    // knots every fathom on the line under water
    ctx.fillStyle = '#efe3c4';
    for (let f = 1; f <= lead; f++) ctx.fillRect(lx - 3, top + (lead - f) * fath - 1, 6, 3);
    ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.moveTo(lx - 6, top + lead * fath - 4); ctx.lineTo(lx + 6, top + lead * fath - 4); ctx.lineTo(lx + 4, top + lead * fath + 10); ctx.lineTo(lx - 4, top + lead * fath + 10); ctx.fill();
    ctx.fillStyle = '#1d140c'; ctx.font = '15px Georgia, serif';
    ctx.fillText(`Line out: ${out.toFixed(1)} fathoms`, W * 0.55, 30);
    raf = requestAnimationFrame(draw);
  };
  stopAnim();
  raf = requestAnimationFrame(draw);
}

function markLead() {
  stopAnim();
  const err = Math.abs((ui.leadPaid?.() ?? 0) - ui.leadBottom);
  const g = Sight.leadGrade(err, true);
  const m = Sight.applyLead(S, g);
  plog('lead', { bottom: ui.leadBottom, err: Math.round(err * 10) / 10, grade: g });
  if (g === 'miss') toast(`${err > 1.5 && (ui.leadPaid?.() ?? 0) < ui.leadBottom ? 'Too soon: the lead was still running.' : 'Too late: the line ran slack and the depth is lost.'} No harm done.`, '');
  else toast(`<b>${ui.leadBottom} fathoms</b>, and sand on the tallow: your pilot has the channel. She will anchor closer, and her boats work ${m === 2 ? 'twice as fast' : 'half as fast again'}.`, 'discover');
}

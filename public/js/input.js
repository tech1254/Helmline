// Mouse, touch and keyboard on the chart.

import { PORTS, isLand, inBounds } from './world.js';
import { S, ui } from './state.js';
import { isRevealed } from './fog.js';
import { W, cam, canvas, clampCam, toScreen, toWorld } from './view.js';
import { confirmVoyage, planCourse } from './voyage.js';
import { renderPanel, setSpeed, togglePanel, toggleWind } from './panels.js';
import { passage } from './pricebook.js';
import { closeModal } from './dialog.js';
import { hint } from './notices.js';

// ---- Input --------------------------------------------------------------------
export const pointers = new Map();
export let drag = null;

export let lastPointerType = 'mouse';
export function portAt(sx, sy) {
  let best = null, bd = lastPointerType === 'mouse' ? 16 : 30; // fingers need a bigger target
  for (const p of PORTS) {
    if (!S.discovered[p.id]) continue;
    const [px, py] = toScreen(p.lon, p.lat);
    const d = Math.hypot(px - sx, py - sy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale: cam.scale, camX: cam.x, camY: cam.y };
}

export function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (!drag.moved && pointers.size === 0) chartClick(e.offsetX, e.offsetY, e.shiftKey);
  if (pointers.size === 0) drag = null;
}

export function chartClick(sx, sy, append) {
  if (!ui.introDone) return;
  if (ui.modal) {
    // While a voyage is being considered, clicking elsewhere re-plots it there.
    if (ui.modal.kind !== 'voyage') return;
    closeModal(false);
  }
  const p = portAt(sx, sy);
  if (p) {
    if (S.ship.docked === p.id) { ui.panelMode = 'port'; renderPanel(); return; }
    const plan = planCourse(p.lon, p.lat, p.id, append);
    if (!plan) { hint('The pilot can find no passage there.'); return; }
    confirmVoyage(plan);
    return;
  }
  const [lon, lat] = toWorld(sx, sy);
  if (!inBounds(lon, lat)) { hint('That lies beyond the edge of the chart.'); return; }
  if (isLand(lon, lat)) {
    hint(isRevealed(lon, lat) ? 'That is dry land, captain.' : 'The lookout sees nothing there yet.');
    return;
  }
  const plan = planCourse(lon, lat, null, append);
  if (!plan) { hint('The pilot can find no passage there.'); return; }
  confirmVoyage(plan);
}

export function initInput() {
  canvas.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType || 'mouse';
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, camX: cam.x, camY: cam.y, moved: false };
    else drag = { pinch: pinchState(), moved: true };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (!drag) {
      const p = portAt(e.offsetX, e.offsetY);
      ui.hoverPort = p ? p.id : null;
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
  window.addEventListener('keydown', (e) => {
    if (ui.modal) {
      if (e.key === 'Escape') closeModal(false);
      if (e.key === 'Enter' && !ui.modal.locked) { e.preventDefault(); closeModal(true); }
      return;
    }
    if (e.target.closest('input, textarea, select, button') && e.key !== 'Escape') return;
    if (e.key === ' ') { e.preventDefault(); setSpeed(ui.speed === 0 ? ui.lastSpeed : 0); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(2);
    if (e.key === '3') setSpeed(4);
    if (e.key === 'p' || e.key === 'P') togglePanel('prices');
    if (e.key === 'l' || e.key === 'L') togglePanel('ledger');
    if (e.key === 'n' || e.key === 'N') togglePanel('notices');
    if (e.key === 'w' || e.key === 'W') toggleWind();
    if (e.key === 'Escape' && ui.panelMode && !S.ship.docked) { ui.panelMode = null; renderPanel(); }
  });
}

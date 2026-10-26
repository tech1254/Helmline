// The chart canvas and the camera: zoom, pan and coordinate conversion.

import { BOUNDS, COS0 } from './world.js';

// ---- Canvas & camera --------------------------------------------------------
export const canvas = document.getElementById('chart');
export const ctx = canvas.getContext('2d');
export let W = 0, H = 0, DPR = 1;
export const cam = { x: -13 * COS0, y: -29, scale: 30 };

export function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}

export function centerOn(lon, lat, fit) {
  cam.x = lon * COS0;
  cam.y = -lat;
  if (fit) cam.scale = Math.max(8, Math.min(W / (18 * COS0), H / 20) * fit * 1.2);
  clampCam();
}

export function clampCam() {
  cam.scale = Math.max(Math.min(W / ((BOUNDS.east - BOUNDS.west) * COS0), H / (BOUNDS.north - BOUNDS.south)), Math.min(400, cam.scale));
  const hw = W / 2 / cam.scale, hh = H / 2 / cam.scale;
  const x0 = BOUNDS.west * COS0, x1 = BOUNDS.east * COS0, y0 = -BOUNDS.north, y1 = -BOUNDS.south;
  cam.x = x1 - x0 < 2 * hw ? (x0 + x1) / 2 : Math.max(x0 + hw, Math.min(x1 - hw, cam.x));
  cam.y = y1 - y0 < 2 * hh ? (y0 + y1) / 2 : Math.max(y0 + hh, Math.min(y1 - hh, cam.y));
}

export const toScreen = (lon, lat) => [(lon * COS0 - cam.x) * cam.scale + W / 2, (-lat - cam.y) * cam.scale + H / 2];
export const toWorld = (sx, sy) => [((sx - W / 2) / cam.scale + cam.x) / COS0, -((sy - H / 2) / cam.scale + cam.y)];

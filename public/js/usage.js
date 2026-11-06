// Usage counts: how many people play, where from (itch.io or helmline.app) and for how long. A
// ping when the game opens and one every two minutes while it is played and in view; the server
// keeps one row per browser per day. Only the random id this browser already has for the play
// log, the site that sent the player, and whether it is a phone. Off with the play log (More).

import { api, source } from './api.js';
import { deviceId, playlogOn } from './playlog.js';

const BEAT_MS = 2 * 60 * 1000;
let started = false;

function send(kind) {
  if (!playlogOn() && !(typeof window !== 'undefined' && window.helmlineUsage)) return;
  const { source: src, ref } = source();
  const body = JSON.stringify({ device: deviceId(), kind, source: src, ref, mobile: matchMedia('(pointer: coarse)').matches });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(api('/api/hello'), new Blob([body], { type: 'text/plain' }))) return;
  } catch (e) { /* fall back to fetch */ }
  fetch(api('/api/hello'), { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
}

export function initUsage(isPlaying) {
  if (started) return;
  started = true;
  send('start');
  setInterval(() => { if (document.visibilityState === 'visible' && isPlaying()) send('beat'); }, BEAT_MS);
}

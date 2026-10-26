// Small helpers used across the interface.

import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import { START_DATE } from './config.js';
import { S } from './state.js';

export const $ = (id) => document.getElementById(id);
export function fmtDate(day) {
  const d = new Date(START_DATE.getTime() + Math.floor(day) * 86400000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const held = () => GOODS.reduce((n, g) => n + S.cargo[g.id], 0);
export function timeAgo(ms) {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function ageText(day) {
  const d = Math.floor(S.day) - Math.floor(day);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

// Work out the sea routes between charted ports in the background, one every few
// milliseconds, so the price book and the captains find them ready instead of pausing.
export const portName = (id) => (id ? PORTS.find((p) => p.id === id)?.name || id : 'At sea');
export const cz = (n, sign = true) => {
  const v = Math.round(n);
  return `${sign && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString()} cz`;
};

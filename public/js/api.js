// Where the game's server is. On helmline.app (and when testing locally) the API is on the same
// site; anywhere else, such as itch.io, which serves the game's files from its own hosts, the
// calls go to helmline.app (the server allows those pages).
const host = typeof location !== 'undefined' ? location.hostname : '';
export const API = host.endsWith('helmline.app') || host === 'localhost' || host === '127.0.0.1' || host === '' ? '' : 'https://helmline.app';
export const api = (path) => `${API}${path}`;

// Where the game was opened from: itch.io (its pages, or its file hosts), helmline.app, or else.
export function source() {
  const h = host;
  let framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  const anc = typeof location !== 'undefined' && location.ancestorOrigins && location.ancestorOrigins.length ? location.ancestorOrigins[location.ancestorOrigins.length - 1] : '';
  const ref = (() => { try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { return ''; } })();
  const itch = /(^|\.)itch\.(io|zone)$|hwcdn\.net$/;
  if (itch.test(h) || itch.test(anc.replace(/^https?:\/\//, '')) || (framed && itch.test(ref))) return { source: 'itch', ref: (anc.replace(/^https?:\/\//, '') || ref || h).slice(0, 80) };
  if (h.endsWith('helmline.app')) return { source: 'direct', ref: ref && !ref.endsWith('helmline.app') ? ref.slice(0, 80) : null };
  return { source: 'other', ref: (ref || h).slice(0, 80) || null };
}

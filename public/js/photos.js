// Photographs: the harbours, the ships, the yards and the nau on the stocks (made with
// tools/art, listed in photos-data.js). Ships are cut out and cut at their waterline, so the
// bottom edge of each picture is where she meets the water.
//
// A ship's photograph follows her hull, rig and sails. Paint, cloth, bonnets and the like do not
// change the photograph; the shipwright's plan in the shipyard shows those.

import { PHOTOS } from './photos-data.js';
import { HULLS } from './ships.js';

export const PX_PER_M = 22; // in a harbour photograph 1600 pixels wide, at arrival distance

export function portPhoto(portId) {
  return PHOTOS.ports.includes(portId) ? `img/ports/${portId}.webp` : null;
}
export function yardPhoto(portId) {
  return PHOTOS.yards.includes(portId) ? `img/yards/${portId}.webp` : null;
}
// The nau on the stocks, by how far the building has got (0 to 1).
export function stocksPhoto(p) {
  return `img/stocks/${p < 0.4 ? 'frames' : p < 0.75 ? 'planked' : 'rigged'}.webp`;
}
export function uiTexture(id) {
  return PHOTOS.ui.includes(id) ? `img/ui/${id}.webp` : null;
}

// Images kept once loaded, so a harbour fetched while the ship is at sea is ready when she arrives.
const cache = new Map();
export function photoImage(src) {
  if (!src) return null;
  if (!cache.has(src)) cache.set(src, Object.assign(new Image(), { src, decoding: 'async' }));
  return cache.get(src);
}

export function shipLook(ship) {
  const fit = ship.fit || {};
  const cross = fit.mark === 'cross' ? '-cross' : '';
  if (ship.hull === 'caravel') return `caravel${fit.rig === 'square' ? '-square' : ''}${cross}`;
  if (ship.hull === 'nau') return `nau${cross}`;
  return ship.hull || 'caravel';
}

export function shipPhoto(ship) {
  const id = shipLook(ship);
  const m = PHOTOS.ships[id] || PHOTOS.ships[ship.hull];
  if (!m) return null;
  return { id: PHOTOS.ships[id] ? id : ship.hull, src: `img/ships/${PHOTOS.ships[id] ? id : ship.hull}.webp`, ...m };
}

// The ship afloat, as HTML: her photograph sitting on the water with a soft reflection.
//   harbour: a port id for a photograph behind her (else open water)
//   size: 'hero', 'card' or 'mini'
//   decorative: true where the ship is already named in text beside her (no alt text)
export function shipFigure(ship, { harbour = null, size = 'card', label = '', decorative = false } = {}) {
  const ph = shipPhoto(ship);
  if (!ph) return '';
  const H = HULLS[ship.hull] || HULLS.caravel;
  // bigger hulls look bigger, but every ship fills her frame
  const width = Math.round((size === 'hero' ? 34 : size === 'mini' ? 52 : 46) + ph.length * (size === 'hero' ? 1.5 : 1.4));
  const bg = harbour && portPhoto(harbour);
  const alt = label || `${ship.name ? `The ${ship.name}, ` : ''}${articled(H.name)}`;
  return `<figure class="afloat ${size} ${bg ? 'harbour' : 'sea'}"${bg ? ` style="background-image:url(${bg})"` : ''}>
      <div class="ship-at" style="width:${width}%;aspect-ratio:${ph.w}/${ph.h}">
        <img class="ship" src="${ph.src}" alt="${decorative ? '' : esc(alt)}" width="${ph.w}" height="${ph.h}" decoding="async">
        <img class="reflect" src="${ph.src}" alt="" aria-hidden="true" decoding="async">
      </div>
    </figure>`;
}

export function stocksFigure(p, alt) {
  return `<figure class="stocks"><img src="${stocksPhoto(p)}" alt="${esc(alt)}" decoding="async" loading="lazy"></figure>`;
}

const articled = (n) => `${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n.toLowerCase()}`;
function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

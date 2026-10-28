// Photographs: the harbours, the ships, the yards and the nau on the stocks (made with
// tools/art, listed in photos-data.js). Ships are cut out and cut at their waterline, so the
// bottom edge of each picture is where she meets the water.
//
// A ship's photograph follows her hull, rig and sails. Paint, cloth, bonnets and the like do not
// change the photograph; the shipwright's plan in the shipyard shows those.

import { PHOTOS } from './photos-data.js';
import { HULLS } from './ships.js';
import { shipSVG } from './shipart.js';

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
  if (ship.hull === 'caravel') return `caravel${cross}`;
  if (ship.hull === 'redonda') return `caravel-square${cross}`;
  if (ship.hull === 'largecaravel') return `largecaravel${cross}`;
  if (ship.hull === 'nau') return `nau${cross}`;
  if (ship.hull === 'naudaindia' || ship.hull === 'galeao') return ship.hull; // plain sails only, so far
  return ship.hull || 'caravel';
}

export function shipPhoto(ship) {
  const id = shipLook(ship);
  const m = PHOTOS.ships[id] || PHOTOS.ships[ship.hull];
  if (!m) return null;
  return { id: PHOTOS.ships[id] ? id : ship.hull, src: `img/ships/${PHOTOS.ships[id] ? id : ship.hull}.webp`, ...m };
}

// The ship relit for a harbour: her photograph was lit by a plain warm light; each harbour has its
// own (warm sunset in Lisbon, hazy gold at the Mina, grey cloud at Serra Leoa: PHOTOS.light, set
// by eye in tools/art/picks.json). Her colours are shifted to that light, her shadows take the
// harbour's shadow colour, and a little of the horizon's haze lies over her. Returns a canvas,
// or the image itself where the harbour has no light set or the browser will not read pixels.
const S0 = [250, 244, 226];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const graded = new Map();
export function gradedShip(img, ph, portId) {
  const P = PHOTOS.light?.[portId];
  if (!P || !ph?.hi || !img?.naturalWidth) return img;
  const key = `${ph.id}@${portId}`;
  if (graded.has(key)) return graded.get(key);
  try {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height);
    const px = d.data;
    const k = lum(S0) / lum(P.light);
    const gain = [0, 1, 2].map((i) => (P.light[i] / S0[i]) * k * P.bright);
    const lo = ph.lo.map((v, i) => v * gain[i]);
    const lhi = lum(ph.hi.map((v, i) => v * gain[i])) * 0.6;
    const tint = P.shade.map((v, i) => v - lo[i]);
    const h = P.haze, hz = P.hazeColour, sat = P.sat;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      let r = px[i] * gain[0], g = px[i + 1] * gain[1], b = px[i + 2] * gain[2];
      const t = Math.max(0, 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / lhi);
      r += tint[0] * t; g += tint[1] * t; b += tint[2] * t;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat;
      px[i] = r * (1 - h) + hz[0] * h; px[i + 1] = g * (1 - h) + hz[1] * h; px[i + 2] = b * (1 - h) + hz[2] * h;
    }
    c.putImageData(d, 0, 0);
    graded.set(key, cv);
    return cv;
  } catch (e) {
    console.error(e);
    return img;
  }
}

// The ship afloat, as HTML: her photograph sitting on the water with a soft reflection.
//   harbour: a port id for a photograph behind her (else open water)
//   size: 'hero', 'card' or 'mini'
//   decorative: true where the ship is already named in text beside her (no alt text)
export function shipFigure(ship, { harbour = null, size = 'card', label = '', decorative = false } = {}) {
  const ph = shipPhoto(ship);
  const H = HULLS[ship.hull] || HULLS.caravel;
  if (!ph) return `<figure class="afloat ${size} sea drawn">${shipSVG(ship, { sea: false, crop: 'tight', label: decorative ? '' : (label || undefined) })}</figure>`; // no photograph yet: the drawing
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

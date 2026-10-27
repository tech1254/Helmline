// Ship drawings, in ink and watercolour wash, built from the ship's parts: hull, rig, sails,
// guns, colours. The same drawing is used in the ship register, the shipyard and the port
// arrival scene, so every choice in the yard shows on the ship wherever she appears.
//
//   shipSVG({ hull, fit, name }, { style, stage, sea, crop, width })
//     style: 'colour' (default), 'ink' (wash only, for ships you could buy) or 'pencil' (locked)
//     stage: 0 to 1, a ship on the stocks (keel, frames, planking, masts, rigging); 1 = finished
//     sea:   draw water under her
//     crop:  'fixed' keeps every hull at the same scale (to compare sizes); 'tight' fills the box
// Side view, bow to the right. Units: the waterline is y = WL, the box is 420 wide.

import { HULLS, normalFit } from './ships.js';

const WL = 214;
const INK = '#3a2716';
const BOX_W = 420, BOX_H = 280;
let uid = 0;

const PAINT = { tar: '#3b2b1d', ochre: '#b4823a', redlead: '#93371f' };
const CLOTH = { hemp: '#d6c39a', canvas: '#efe3c4', linen: '#fbf5e6' };
const WOOD = '#7a5532';

// Geometry of each hull: length factor, freeboard, castles, masts.
const SHAPES = {
  barca: { L: 150, free: 18, stern: 12, bow: 8, keel: 14, aft: [0, 0.22, 10], fore: null, masts: [{ at: 0.52, h: 118, rig: 'square', w: 70 }], tumble: 0.9 },
  caravel: { L: 215, free: 20, stern: 20, bow: 10, keel: 18, aft: [0, 0.27, 14], fore: null, masts: null, tumble: 1 },
  barinel: { L: 245, free: 18, stern: 16, bow: 10, keel: 17, aft: [0, 0.22, 12], fore: null, masts: [{ at: 0.58, h: 128, rig: 'square', w: 86 }, { at: 0.26, h: 92, rig: 'lateen', s: 0.55 }], oars: 8, tumble: 1 },
  nau: { L: 300, free: 30, stern: 26, bow: 18, keel: 24, aft: [0, 0.3, 30], fore: [0.8, 1.0, 24], masts: null, tumble: 1.2 },
};

function caravelMasts(fit) {
  if (fit.rig === 'square') {
    return [
      { at: 0.7, h: 120, rig: 'square', w: 78 },
      { at: 0.5, h: 150, rig: 'square', w: 100 },
      { at: 0.22, h: 102, rig: 'lateen', s: 0.6 },
    ];
  }
  return [{ at: 0.55, h: 158, rig: 'lateen', s: 1 }, { at: 0.24, h: 112, rig: 'lateen', s: 0.66 }];
}
const NAU_MASTS = [
  { at: 0.8, h: 118, rig: 'square', w: 88 },
  { at: 0.52, h: 158, rig: 'square', w: 124, top: true },
  { at: 0.25, h: 118, rig: 'lateen', s: 0.6 },
];

// A small, repeatable wobble, so lines look drawn by hand but the same every time.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const f1 = (n) => Math.round(n * 10) / 10;

export function shipSVG(ship, opts = {}) {
  const hull = HULLS[ship?.hull] ? ship.hull : 'caravel';
  const fit = normalFit(hull, ship?.fit);
  const style = opts.style || 'colour';
  const stage = opts.stage ?? 1;
  const id = `sa${++uid}`;
  const R = rng(hull.length * 97 + (fit.rig === 'square' ? 7 : 3));
  const sh = SHAPES[hull];
  const L = sh.L;
  const x0 = (BOX_W - L) / 2 - (sh.masts ? 0 : 6);
  const x1 = x0 + L;
  const masts = hull === 'caravel' ? caravelMasts(fit) : hull === 'nau' ? NAU_MASTS : sh.masts;
  const pencil = style === 'pencil';
  const colour = style === 'colour';
  const ink = pencil ? '#8c7b66' : INK;
  const sw = pencil ? 0.8 : 1.3;
  const out = [];
  const deckY = (t) => WL - sh.free - sh.stern * Math.pow(1 - t, 2.2) - sh.bow * Math.pow(t, 3); // sheer line, t from stern (0) to bow (1)
  const X = (t) => x0 + t * L;

  // --- the sea and the slipway ---
  if (opts.sea && stage >= 1) {
    out.push(`<path d="M0 ${WL + 3} Q 40 ${WL - 1} 80 ${WL + 3} T 160 ${WL + 3} T 240 ${WL + 3} T 320 ${WL + 3} T 420 ${WL + 3} V ${BOX_H} H 0 Z" fill="${pencil ? 'none' : `url(#${id}s)`}" fill-opacity="${colour ? 0.85 : 0.35}" filter="url(#${id}w)"/>`);
    if (!pencil) out.push(`<ellipse cx="${f1((x0 + x1) / 2)}" cy="${WL + 6}" rx="${f1(L * 0.55)}" ry="7" fill="#2c3d44" opacity="${colour ? 0.28 : 0.12}" filter="url(#${id}w)"/>`);
    for (let i = 0; i < 9; i++) {
      const wx = 20 + R() * 380, wy = WL + 12 + R() * 50;
      out.push(`<path d="M${f1(wx)} ${f1(wy)} q 6 -3 12 0 t 12 0" fill="none" stroke="${ink}" stroke-width="0.7" opacity="0.45"/>`);
    }
  } else if (stage < 1) {
    out.push(`<path d="M${x0 - 30} ${WL + sh.keel + 10} L ${x1 + 30} ${WL + sh.keel + 2}" stroke="${ink}" stroke-width="${sw}" opacity="0.7"/>`);
    for (let i = 0; i < 6; i++) {
      const bx = x0 + 10 + i * (L - 20) / 5;
      out.push(`<rect x="${f1(bx - 6)}" y="${f1(WL + sh.keel - 1 + (1 - i / 5) * 8)}" width="12" height="10" fill="${colour ? '#8a6a45' : 'none'}" fill-opacity="0.6" stroke="${ink}" stroke-width="0.8"/>`);
    }
  }

  // --- hull outline ---
  const keelY = WL + sh.keel;
  const stemTopX = x1 + 4, stemTopY = deckY(1) - 2;
  const sternX = x0 - 4 * sh.tumble;
  const hullPath = `M ${f1(sternX)} ${f1(deckY(0))} C ${f1(X(0.3))} ${f1(deckY(0.3))}, ${f1(X(0.7))} ${f1(deckY(0.7))}, ${f1(stemTopX)} ${f1(stemTopY)}
    C ${f1(x1 - 4)} ${f1(WL - 4)}, ${f1(x1 - 18)} ${f1(keelY - 2)}, ${f1(x1 - 40)} ${f1(keelY)}
    L ${f1(x0 + 14)} ${f1(keelY)} L ${f1(x0 + 4)} ${f1(WL - 4)} Z`;

  const showFrames = stage >= 0.2;
  const planked = stage >= 0.45 ? Math.min(1, (stage - 0.45) / 0.25) : 0;
  const hullColour = colour ? PAINT[fit.paint] : '#a08a6a';

  out.push(`<defs>
    <filter id="${id}w" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${hull.length}"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
    <clipPath id="${id}c"><path d="${hullPath}"/></clipPath>
    <clipPath id="${id}p"><rect x="0" y="${f1(keelY - planked * (keelY - deckY(0) + 40))}" width="${BOX_W}" height="${BOX_H}"/></clipPath>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9ea6"/><stop offset="0.5" stop-color="#a9c0c2"/><stop offset="1" stop-color="#cfd9d2" stop-opacity="0.4"/></linearGradient>
    <linearGradient id="${id}k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#5a4020" stop-opacity="0.22"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>
  </defs>`);

  if (stage < 0.2) {
    // the keel, stem and sternpost alone
    out.push(`<path d="M ${f1(x0 + 4)} ${f1(WL - 4)} L ${f1(x0 + 14)} ${f1(keelY)} L ${f1(x1 - 40)} ${f1(keelY)} C ${f1(x1 - 18)} ${f1(keelY - 2)}, ${f1(x1 - 4)} ${f1(WL - 4)}, ${f1(stemTopX)} ${f1(stemTopY)}" fill="none" stroke="${ink}" stroke-width="${sw * 2}" stroke-linecap="round"/>`);
  }
  if (showFrames && planked < 1) {
    for (let i = 1; i < 14; i++) {
      const t = i / 14;
      const x = X(t);
      out.push(`<path d="M ${f1(x)} ${f1(deckY(t))} Q ${f1(x - 3)} ${f1((deckY(t) + keelY) / 2)} ${f1(x + (t - 0.5) * 6)} ${f1(keelY)}" fill="none" stroke="${ink}" stroke-width="${sw}" opacity="0.8"/>`);
    }
    out.push(`<path d="${hullPath}" fill="none" stroke="${ink}" stroke-width="${sw * 0.8}" stroke-dasharray="3 3" opacity="0.6"/>`);
  }
  if (planked > 0) {
    const g = [];
    g.push(`<path d="${hullPath}" fill="${pencil ? 'none' : hullColour}" fill-opacity="${colour ? 0.92 : 0.35}" filter="url(#${id}w)"/>`);
    if (!pencil) g.push(`<path d="${hullPath}" fill="url(#${id}g)"/>`);
    // planks and wales
    for (let k = 1; k <= 5; k++) {
      const off = k * (keelY - deckY(0.5)) / 6;
      g.push(`<path d="M ${f1(sternX)} ${f1(deckY(0) + off * 0.9)} C ${f1(X(0.3))} ${f1(deckY(0.3) + off)}, ${f1(X(0.7))} ${f1(deckY(0.7) + off)}, ${f1(x1)} ${f1(deckY(1) + off * 0.85)}" fill="none" stroke="${ink}" stroke-width="${k === 1 || k === 3 ? sw * 1.2 : sw * 0.5}" opacity="${k === 1 || k === 3 ? 0.9 : 0.45}" clip-path="url(#${id}c)"/>`);
    }
    // a lighter band at the wale when painted
    if (colour && fit.paint !== 'tar') {
      const off = (keelY - deckY(0.5)) / 6;
      g.push(`<path d="M ${f1(sternX)} ${f1(deckY(0) + off)} C ${f1(X(0.3))} ${f1(deckY(0.3) + off)}, ${f1(X(0.7))} ${f1(deckY(0.7) + off)}, ${f1(x1)} ${f1(deckY(1) + off)}" fill="none" stroke="#2c1f13" stroke-width="5" opacity="0.55" clip-path="url(#${id}c)"/>`);
    }
    // bottom below the waterline: pitch and tallow
    g.push(`<path d="M0 ${WL - 1} H ${BOX_W} V ${BOX_H} H 0 Z" fill="${colour ? (fit.hull === 'tallow' ? '#e2d6b4' : '#2b2118') : 'none'}" fill-opacity="${colour ? 0.75 : 0}" clip-path="url(#${id}c)"/>`);
    g.push(`<path d="${hullPath}" fill="none" stroke="${ink}" stroke-width="${sw * 1.4}" stroke-linejoin="round"/>`);
    // castles
    const castle = (a, b, h, label) => {
      const xa = X(a) - (a === 0 ? 4 * sh.tumble : 0), xb = X(b) + (b === 1 ? 4 : 0);
      const ya = deckY(a), yb = deckY(b);
      return `<path d="M ${f1(xa)} ${f1(ya)} L ${f1(xa - (a === 0 ? 3 : 0))} ${f1(ya - h)} L ${f1(xb + (b === 1 ? 6 : 0))} ${f1(yb - h)} L ${f1(xb)} ${f1(yb)} Z" fill="${pencil ? 'none' : hullColour}" fill-opacity="${colour ? 0.95 : 0.3}" stroke="${ink}" stroke-width="${sw}" data-part="${label}"/>
        <path d="M ${f1(xa)} ${f1(ya - h * 0.55)} L ${f1(xb)} ${f1(yb - h * 0.55)}" stroke="${ink}" stroke-width="${sw * 0.6}" opacity="0.6"/>`;
    };
    if (sh.aft) g.push(castle(sh.aft[0], sh.aft[1], sh.aft[2], 'aftcastle'));
    if (sh.fore) g.push(castle(sh.fore[0], sh.fore[1], sh.fore[2], 'forecastle'));
    // rail
    g.push(`<path d="M ${f1(X(sh.aft ? sh.aft[1] : 0))} ${f1(deckY(sh.aft ? sh.aft[1] : 0) - 5)} C ${f1(X(0.45))} ${f1(deckY(0.45) - 5)}, ${f1(X(0.7))} ${f1(deckY(0.7) - 5)}, ${f1(X(sh.fore ? sh.fore[0] : 1))} ${f1(deckY(sh.fore ? sh.fore[0] : 1) - 5)}" fill="none" stroke="${ink}" stroke-width="${sw * 0.7}"/>`);
    // guns
    if (fit.guns === 'bombards') {
      for (let i = 0; i < 6; i++) {
        const t = 0.3 + i * 0.08;
        g.push(`<rect x="${f1(X(t) - 4)}" y="${f1(deckY(t) + 9)}" width="8" height="7" fill="#1d140c" stroke="${ink}" stroke-width="0.6" data-part="gun"/><rect x="${f1(X(t) - 1.5)}" y="${f1(deckY(t) + 11)}" width="5" height="3" fill="#555"/>`);
      }
    }
    if (fit.guns === 'bercos' || fit.guns === 'bombards') {
      for (let i = 0; i < 4; i++) {
        const t = 0.32 + i * 0.12;
        const x = X(t), y = deckY(t) - 6;
        g.push(`<path d="M ${f1(x)} ${f1(y)} v -5 M ${f1(x - 5)} ${f1(y - 7)} L ${f1(x + 6)} ${f1(y - 5)}" stroke="#1d140c" stroke-width="2" stroke-linecap="round" data-part="gun"/>`);
      }
    }
    // stern carving and name board
    if (fit.stern === 'carved') {
      const sx = X(0.02), sy = deckY(0) - (sh.aft ? sh.aft[2] : 0);
      g.push(`<path d="M ${f1(sx)} ${f1(sy + 4)} q 8 6 0 12 q -8 6 0 12 q 8 6 0 12" fill="none" stroke="#c9a23c" stroke-width="2.4" data-part="carving"/>`);
      g.push(`<circle cx="${f1(sx + 4)}" cy="${f1(sy + 3)}" r="3" fill="#d9b44a" stroke="${ink}" stroke-width="0.5"/>`);
      if (ship?.name) {
        const bx = X(0.06), by = deckY(0.1) + 6;
        g.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(L * 0.24)}" height="9" rx="2" fill="#2a1d12" stroke="#c9a23c" stroke-width="1" data-part="nameboard"/><text x="${f1(bx + L * 0.12)}" y="${f1(by + 7)}" text-anchor="middle" font-family="IM Fell English, Georgia, serif" font-size="7" fill="#e8c766">${esc(ship.name)}</text>`);
      }
    }
    // oars
    if (sh.oars) {
      for (let i = 0; i < sh.oars; i++) {
        const t = 0.32 + i * 0.065;
        const x = X(t), y = deckY(t) - 2;
        g.push(`<path d="M ${f1(x)} ${f1(y)} L ${f1(x - 14)} ${f1(WL + 10)}" stroke="${WOOD}" stroke-width="2" stroke-linecap="round" data-part="oar"/><path d="M ${f1(x - 12)} ${f1(WL + 6)} l -4 7" stroke="${WOOD}" stroke-width="4" stroke-linecap="round"/>`);
      }
    }
    out.push(`<g clip-path="url(#${id}p)">${g.join('')}</g>`);
  }

  // --- masts, yards, sails, rigging ---
  if (stage >= 0.7) {
    const rigged = stage >= 0.9;
    const sails = stage >= 1;
    const cloth = colour ? CLOTH[fit.cloth] : pencil ? 'none' : '#efe5cc';
    const back = [];
    const front = [];
    masts.forEach((m, mi) => {
      const t = m.at;
      const mx = X(t), base = deckY(t) - 2;
      const top = base - m.h;
      const rake = m.rig === 'lateen' ? 6 : 2;
      back.push(`<path d="M ${f1(mx)} ${f1(base + 6)} L ${f1(mx + rake)} ${f1(top)}" stroke="${WOOD}" stroke-width="${m.h > 140 ? 4 : 3}" stroke-linecap="round"/><path d="M ${f1(mx)} ${f1(base + 6)} L ${f1(mx + rake)} ${f1(top)}" stroke="${ink}" stroke-width="${sw * 0.6}" opacity="0.7" data-part="mast"/>`);
      if (m.top) back.push(`<path d="M ${f1(mx + rake - 7)} ${f1(top + 24)} h 14 l -2 7 h -10 z" fill="${colour ? WOOD : 'none'}" stroke="${ink}" stroke-width="${sw * 0.7}"/>`);
      if (!rigged) return;
      // shrouds and stays
      for (let k = -1; k <= 1; k += 2) {
        for (let j = 0; j < 3; j++) back.push(`<path d="M ${f1(mx + rake * 0.9)} ${f1(top + 10)} L ${f1(mx + k * (6 + j * 5))} ${f1(base - 4)}" stroke="${ink}" stroke-width="0.5" opacity="0.6"/>`);
      }
      if (mi === 0) back.push(`<path d="M ${f1(mx + rake)} ${f1(top + 4)} L ${f1(x1 + 6)} ${f1(deckY(1) - (sh.fore ? sh.fore[2] : 4))}" stroke="${ink}" stroke-width="0.6" opacity="0.7"/>`);
      if (m.rig === 'square') {
        const w = m.w * (hull === 'nau' ? 1 : 1);
        const yy = top + 18;
        const footY = yy + m.h * 0.5;
        front.push(`<path d="M ${f1(mx - w / 2)} ${f1(yy)} L ${f1(mx + w / 2)} ${f1(yy)}" stroke="${WOOD}" stroke-width="3" stroke-linecap="round" data-part="yard"/>`);
        if (sails) {
          const sail = `M ${f1(mx - w / 2)} ${f1(yy)} L ${f1(mx + w / 2)} ${f1(yy)} Q ${f1(mx + w / 2 + 7)} ${f1((yy + footY) / 2)} ${f1(mx + w / 2 - 2)} ${f1(footY)} Q ${f1(mx)} ${f1(footY + 9)} ${f1(mx - w / 2 + 2)} ${f1(footY)} Q ${f1(mx - w / 2 - 7)} ${f1((yy + footY) / 2)} ${f1(mx - w / 2)} ${f1(yy)} Z`;
          front.push(sailShape(sail, cloth, ink, sw, colour, pencil, id, 'sail'));
          for (let k = 1; k <= 3; k++) front.push(`<path d="M ${f1(mx - w / 2 + k * w / 4)} ${f1(yy + 2)} Q ${f1(mx - w / 2 + k * w / 4 + 2)} ${f1((yy + footY) / 2)} ${f1(mx - w / 2 + k * w / 4)} ${f1(footY + 3)}" stroke="${ink}" stroke-width="0.4" opacity="0.35" fill="none"/>`);
          if (fit.area === 'bonnets') {
            const by = footY + 3;
            front.push(`<path d="M ${f1(mx - w / 2 + 3)} ${f1(by)} Q ${f1(mx)} ${f1(by + 9)} ${f1(mx + w / 2 - 3)} ${f1(by)} L ${f1(mx + w / 2 - 5)} ${f1(by + 12)} Q ${f1(mx)} ${f1(by + 21)} ${f1(mx - w / 2 + 5)} ${f1(by + 12)} Z" fill="${cloth}" fill-opacity="${colour ? 0.95 : 0.4}" stroke="${ink}" stroke-width="${sw * 0.8}" data-part="bonnet"/>`);
            front.push(`<path d="M ${f1(mx - w / 2 + 4)} ${f1(by + 1)} Q ${f1(mx)} ${f1(by + 10)} ${f1(mx + w / 2 - 4)} ${f1(by + 1)}" stroke="${ink}" stroke-width="0.7" stroke-dasharray="2 2" fill="none"/>`);
          }
          if (mi === masts.findIndex((q) => q.rig === 'square' && (q.w === Math.max(...masts.filter((z) => z.rig === 'square').map((z) => z.w))))) {
            front.push(markOn(fit.mark, mx, (yy + footY) / 2 + 2, Math.min(w, m.h * 0.5) * 0.42, colour, pencil));
          }
          if (m.top) {
            const ty = top + 2, tf = top + 22, tw = w * 0.55;
            front.push(`<path d="M ${f1(mx - tw / 2 + rake)} ${f1(ty)} L ${f1(mx + tw / 2 + rake)} ${f1(ty)}" stroke="${WOOD}" stroke-width="2.4"/>`);
            front.push(sailShape(`M ${f1(mx - tw / 2 + rake)} ${f1(ty)} L ${f1(mx + tw / 2 + rake)} ${f1(ty)} Q ${f1(mx + tw / 2 + 4)} ${f1((ty + tf) / 2)} ${f1(mx + w * 0.38)} ${f1(tf)} L ${f1(mx - w * 0.38)} ${f1(tf)} Q ${f1(mx - tw / 2 - 4)} ${f1((ty + tf) / 2)} ${f1(mx - tw / 2 + rake)} ${f1(ty)} Z`, cloth, ink, sw, colour, pencil, id, 'topsail'));
          }
        }
      } else {
        // lateen: a long yard slung from the masthead, low end forward
        const s = m.s;
        const ax = mx + L * 0.3 * s, ay = base - 8 * s;
        const bx = mx - L * 0.22 * s, by = top - 14 * s;
        const cx = mx - L * 0.12 * s, cy = base - 6;
        front.push(`<path d="M ${f1(ax)} ${f1(ay)} L ${f1(bx)} ${f1(by)}" stroke="${WOOD}" stroke-width="${s > 0.8 ? 3 : 2.4}" stroke-linecap="round" data-part="yard"/>`);
        if (sails) {
          const sail = `M ${f1(ax)} ${f1(ay)} L ${f1(bx)} ${f1(by)} Q ${f1(bx - 4)} ${f1((by + cy) / 2 + 12)} ${f1(cx)} ${f1(cy)} Q ${f1((cx + ax) / 2)} ${f1(cy + 6)} ${f1(ax)} ${f1(ay)} Z`;
          front.push(sailShape(sail, cloth, ink, sw, colour, pencil, id, 'sail'));
          for (let k = 1; k <= 3; k++) {
            const px = ax + (bx - ax) * k / 4, py = ay + (by - ay) * k / 4;
            front.push(`<path d="M ${f1(px)} ${f1(py)} L ${f1(cx + (px - cx) * 0.08)} ${f1(cy - 3)}" stroke="${ink}" stroke-width="0.4" opacity="0.3"/>`);
          }
          if (fit.area === 'bonnets') {
            front.push(`<path d="M ${f1(cx)} ${f1(cy)} Q ${f1((cx + ax) / 2)} ${f1(cy + 6)} ${f1(ax)} ${f1(ay)} L ${f1(ax - 4)} ${f1(ay + 9)} Q ${f1((cx + ax) / 2)} ${f1(cy + 15)} ${f1(cx + 2)} ${f1(cy + 8)} Z" fill="${cloth}" fill-opacity="${colour ? 0.95 : 0.4}" stroke="${ink}" stroke-width="${sw * 0.8}" data-part="bonnet"/>`);
          }
          if (mi === masts.findIndex((q) => q.rig === 'lateen') && !masts.some((q) => q.rig === 'square')) {
            front.push(markOn(fit.mark, (ax + bx + cx) / 3 - 4, (ay + by + cy) / 3 + 6, 15 * s + 6, colour, pencil));
          }
        }
      }
      // pennants at the mastheads
      if (sails && fit.flags === 'streamers') front.push(streamer(mx + rake, top, 26 + m.h * 0.18, colour, ink, R));
    });
    // spritsail and bowsprit
    if (fit.tack === 'sprit' || hull === 'nau') {
      const bx = x1 + 2, by = deckY(1) - (sh.fore ? sh.fore[2] * 0.6 : 4);
      const ex = bx + 46, ey = by - 26;
      back.push(`<path d="M ${f1(bx - 10)} ${f1(by + 3)} L ${f1(ex)} ${f1(ey)}" stroke="${WOOD}" stroke-width="2.6" stroke-linecap="round" data-part="bowsprit"/>`);
      if (sails && fit.tack === 'sprit') {
        front.push(`<path d="M ${f1(ex - 18)} ${f1(ey + 6)} h 26" stroke="${WOOD}" stroke-width="2"/>`);
        front.push(sailShape(`M ${f1(ex - 18)} ${f1(ey + 6)} h 26 q 3 12 -2 22 q -11 4 -22 0 q -5 -10 -2 -22 Z`, cloth, ink, sw, colour, pencil, id, 'spritsail'));
      }
      if (sails && fit.tack === 'sprit' && hull !== 'nau') {
        // a small extra mizzen (bonaventure) right aft
        const mx = X(0.06), base = deckY(0.06) - (sh.aft ? sh.aft[2] : 0);
        back.push(`<path d="M ${f1(mx)} ${f1(base)} L ${f1(mx + 3)} ${f1(base - 52)}" stroke="${WOOD}" stroke-width="2.2"/>`);
        front.push(sailShape(`M ${f1(mx + 16)} ${f1(base - 6)} L ${f1(mx - 12)} ${f1(base - 58)} Q ${f1(mx - 10)} ${f1(base - 26)} ${f1(mx - 4)} ${f1(base - 4)} Z`, cloth, ink, sw, colour, pencil, id, 'bonaventure'));
      }
    }
    // ensign at the stern
    if (sails) {
      const fx = X(0.01), fy = deckY(0) - (sh.aft ? sh.aft[2] : 0) - 2;
      back.push(`<path d="M ${f1(fx)} ${f1(fy)} V ${f1(fy - 30)}" stroke="${WOOD}" stroke-width="1.6"/>`);
      front.push(ensign(fx, fy - 30, colour, pencil, ink));
    }
    out.push(back.join(''), front.join(''));
  }

  const view = opts.crop === 'tight' ? tightBox(hull, x0, x1) : `0 0 ${BOX_W} ${BOX_H}`;
  const label = opts.label ?? `${ship?.name ? `${ship.name}, ` : ''}${HULLS[hull].name.toLowerCase()}`;
  return `<svg class="ship-art ${style}" viewBox="${view}" ${opts.width ? `width="${opts.width}"` : ''} role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" data-hull="${hull}" data-stage="${stage}">${out.join('')}</svg>`;
}

function tightBox(hull, x0, x1) {
  const top = { barca: 70, caravel: 22, barinel: 52, nau: 8 }[hull];
  const left = Math.max(0, x0 - 40), right = Math.min(BOX_W, x1 + 70);
  return `${f1(left)} ${top} ${f1(right - left)} ${BOX_H - top - 20}`;
}

function sailShape(d, cloth, ink, sw, colour, pencil, id, part) {
  return `<path d="${d}" fill="${cloth}" fill-opacity="${colour ? 0.96 : pencil ? 0 : 0.6}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round" ${pencil ? 'stroke-dasharray="4 2"' : ''} data-part="${part}"/>
    ${colour ? `<path d="${d}" fill="url(#${id}k)"/>` : ''}`;
}

// The cross of the Order of Christ, or family arms, on the mainsail.
function markOn(mark, cx, cy, r, colour, pencil) {
  if (mark === 'cross') {
    const red = colour ? '#b0261c' : pencil ? 'none' : '#9a6a5a';
    const a = r, b = r * 0.32;
    return `<g data-part="cross"><path d="M ${f1(cx - b)} ${f1(cy - a)} L ${f1(cx + b)} ${f1(cy - a)} L ${f1(cx + b * 0.45)} ${f1(cy - b)} L ${f1(cx + a)} ${f1(cy - b)} L ${f1(cx + a)} ${f1(cy + b)} L ${f1(cx + b * 0.45)} ${f1(cy + b)} L ${f1(cx + b)} ${f1(cy + a)} L ${f1(cx - b)} ${f1(cy + a)} L ${f1(cx - b * 0.45)} ${f1(cy + b)} L ${f1(cx - a)} ${f1(cy + b)} L ${f1(cx - a)} ${f1(cy - b)} L ${f1(cx - b * 0.45)} ${f1(cy - b)} Z" fill="${red}" stroke="${INK}" stroke-width="0.6"/>
      <path d="M ${f1(cx)} ${f1(cy - a * 0.7)} V ${f1(cy + a * 0.7)} M ${f1(cx - a * 0.7)} ${f1(cy)} H ${f1(cx + a * 0.7)}" stroke="#fbf5e6" stroke-width="${f1(Math.max(1.2, r * 0.12))}"/></g>`;
  }
  if (mark === 'arms') {
    const w = r * 1.2, h = r * 1.45;
    return `<g data-part="arms"><path d="M ${f1(cx - w / 2)} ${f1(cy - h / 2)} H ${f1(cx + w / 2)} V ${f1(cy)} Q ${f1(cx + w / 2)} ${f1(cy + h / 2)} ${f1(cx)} ${f1(cy + h / 2)} Q ${f1(cx - w / 2)} ${f1(cy + h / 2)} ${f1(cx - w / 2)} ${f1(cy)} Z" fill="${colour ? '#24407a' : 'none'}" stroke="${INK}" stroke-width="0.8"/>
      <path d="M ${f1(cx - w / 2)} ${f1(cy + h * 0.15)} L ${f1(cx)} ${f1(cy - h * 0.25)} L ${f1(cx + w / 2)} ${f1(cy + h * 0.15)}" fill="none" stroke="${colour ? '#d9b44a' : INK}" stroke-width="${f1(Math.max(1.4, r * 0.18))}"/></g>`;
  }
  return '';
}

function streamer(x, y, len, colour, ink, R) {
  const c = colour ? (R() < 0.5 ? '#b0261c' : '#24407a') : 'none';
  const w = 3 + R() * 1.5;
  return `<path d="M ${f1(x)} ${f1(y)} q ${f1(len * 0.3)} -6 ${f1(len * 0.55)} -1 t ${f1(len * 0.45)} -3 l -${f1(len * 0.5)} ${f1(w + 3)} q -${f1(len * 0.3)} 2 -${f1(len * 0.5)} ${f1(w - 2)} Z" fill="${c}" stroke="${ink}" stroke-width="0.6" data-part="streamer"/>`;
}

function ensign(x, y, colour, pencil, ink) {
  const fill = colour ? '#fbf5e6' : 'none';
  return `<g data-part="ensign"><path d="M ${f1(x)} ${f1(y)} q -8 -3 -16 0 t -14 0 v 14 q 7 -3 14 0 t 16 0 Z" fill="${fill}" stroke="${ink}" stroke-width="0.7"/>
    ${colour ? `<rect x="${f1(x - 19)}" y="${f1(y + 2)}" width="8" height="9" rx="1.5" fill="#b0261c"/><rect x="${f1(x - 17.5)}" y="${f1(y + 3.5)}" width="5" height="6" fill="#fbf5e6"/><circle cx="${f1(x - 15)}" cy="${f1(y + 6.5)}" r="1.4" fill="#24407a"/>` : ''}</g>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The drawing as an image, for painting into a canvas (the arrival scene). Cached per look.
const imgCache = new Map();
export function shipImage(ship, opts = {}) {
  const key = JSON.stringify([ship.hull, ship.fit, ship.name, opts]);
  if (imgCache.has(key)) return imgCache.get(key);
  const svg = shipSVG(ship, { ...opts, crop: 'fixed', label: '' }).replace('<svg ', `<svg width="${BOX_W * 2}" height="${BOX_H * 2}" `);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (imgCache.size > 40) imgCache.clear();
  imgCache.set(key, img);
  return img;
}
export const ART_BOX = { w: BOX_W, h: BOX_H, waterline: WL };

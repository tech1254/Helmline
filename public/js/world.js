// Geography, ports and winds for Prototype 0: the eastern Atlantic, 1450s.
// Coordinates are [longitude, latitude] in degrees. Coastlines are hand-simplified.

export const BOUNDS = { west: -32, east: 4, south: 2, north: 44 };
// The chart before the Gulf of Guinea was added, for reading older saves.
export const OLD_BOUNDS = { west: -32, east: 0, south: 8, north: 44 };
export const D2R = Math.PI / 180;
// Equirectangular projection centred near the Canaries.
export const COS0 = Math.cos(28 * D2R);

function islet(cx, cy, rx, ry, rot = 0, seed = 7, n = 16) {
  let s = seed * 9973 + 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 0.84 + rnd() * 0.28;
    const x = Math.cos(a) * rx * j;
    const y = Math.sin(a) * ry * j;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

const IBERIA = [
  [-5.35, 36.15], [-5.6, 36.08], [-6.0, 36.2], [-6.3, 36.55], [-6.4, 36.8], [-6.9, 37.15],
  [-7.4, 37.18], [-7.9, 36.98], [-8.6, 37.1], [-8.99, 37.02], [-8.8, 37.4], [-8.85, 37.95],
  [-8.78, 38.3], [-9.2, 38.42], [-9.3, 38.66], [-9.42, 38.7], [-9.5, 38.78], [-9.42, 39.0],
  [-9.4, 39.36], [-9.07, 39.6], [-8.9, 40.15], [-8.75, 40.7], [-8.68, 41.2], [-8.85, 41.7],
  [-8.9, 42.1], [-9.05, 42.5], [-9.3, 42.9], [-9.2, 43.2], [-8.3, 43.6], [-7.7, 43.75],
  [-6.0, 43.6], [-4.0, 43.45], [-1.8, 43.4], [-1.5, 43.5], [-1.3, 44.5], [1.0, 44.5],
  [4.5, 44.5], [4.5, 43.45], [3.6, 43.5], [3.0, 43.1], [3.2, 42.3], [3.2, 41.9], [2.2, 41.35], [1.0, 41.05], [0.0, 40.0], [-0.3, 39.4], [0.1, 38.8], [-0.5, 38.3], [-0.8, 37.6],
  [-1.6, 37.3], [-2.1, 36.73], [-2.9, 36.75], [-4.4, 36.7], [-5.0, 36.45],
];

const AFRICA = [
  [-5.3, 35.84], [-5.6, 35.66], [-5.9, 35.7], [-6.2, 35.2], [-6.6, 34.6], [-7.0, 33.95], [-7.6, 33.6],
  [-8.5, 33.25], [-9.25, 32.55], [-9.75, 31.5], [-9.85, 30.6], [-9.6, 30.4], [-9.85, 29.9],
  [-10.2, 29.35], [-11.1, 28.7], [-12.2, 28.1], [-12.95, 27.95], [-13.4, 27.6], [-14.0, 26.8],
  [-14.5, 26.15], [-14.9, 25.3], [-15.6, 24.3], [-16.0, 23.6], [-16.35, 22.5], [-16.9, 21.9],
  [-17.05, 21.0], [-16.9, 20.75], [-16.5, 20.2], [-16.25, 19.6], [-16.5, 19.35], [-16.3, 18.8],
  [-16.05, 18.0], [-16.2, 17.0], [-16.5, 16.0], [-16.8, 15.3], [-17.18, 14.9], [-17.53, 14.75],
  [-17.1, 14.55], [-16.9, 14.1], [-16.8, 13.6], [-16.65, 13.45], [-16.75, 13.0], [-16.75, 12.4],
  [-16.5, 12.1], [-16.0, 11.8], [-15.4, 11.3], [-15.0, 10.8], [-14.6, 10.2], [-14.0, 9.7],
  [-13.3, 9.0], [-13.1, 8.3], [-12.9, 7.9],
  // Sierra Leone to the Gulf of Guinea
  [-12.5, 7.45], [-11.9, 7.0], [-11.4, 6.75], [-10.8, 6.35], [-10.3, 6.0], [-9.6, 5.5], [-9.0, 5.05],
  [-8.3, 4.6], [-7.7, 4.37], [-7.0, 4.4], [-6.0, 4.65], [-5.0, 5.1], [-4.0, 5.25], [-3.2, 5.1],
  [-2.5, 4.9], [-2.0, 4.75], [-1.4, 5.05], [-0.5, 5.4], [0.5, 5.75], [1.2, 6.1], [2.3, 6.35],
  [3.4, 6.4], [4.5, 6.2], [4.5, 36.8], [2.0, 36.5],
  [0.5, 35.9], [-1.2, 35.3], [-2.2, 35.1], [-3.5, 35.2], [-4.6, 35.2],
];

export const LANDS = [
  { group: 'iberia', pts: IBERIA },
  { group: 'africa', pts: AFRICA },
  { group: 'madeira', pts: islet(-16.95, 32.75, 0.3, 0.1, 0, 1) },
  { group: 'madeira', pts: islet(-16.33, 33.07, 0.08, 0.05, 0, 2) },
  { group: 'canaries', pts: islet(-17.86, 28.68, 0.11, 0.2, 0, 3) },
  { group: 'canaries', pts: islet(-18.0, 27.73, 0.14, 0.08, 0.3, 4) },
  { group: 'canaries', pts: islet(-17.23, 28.1, 0.1, 0.09, 0, 5) },
  { group: 'canaries', pts: islet(-16.6, 28.27, 0.36, 0.16, 0.45, 6) },
  { group: 'canaries', pts: islet(-15.6, 27.95, 0.22, 0.2, 0, 7) },
  { group: 'canaries', pts: islet(-14.05, 28.4, 0.17, 0.45, 0.6, 8) },
  { group: 'canaries', pts: islet(-13.65, 29.05, 0.11, 0.28, 0.6, 9) },
  { group: 'capeverde', pts: islet(-25.15, 17.05, 0.2, 0.11, 0.3, 10) },
  { group: 'capeverde', pts: islet(-24.95, 16.85, 0.1, 0.07, 0, 11) },
  { group: 'capeverde', pts: islet(-24.3, 16.6, 0.22, 0.06, -0.2, 12) },
  { group: 'capeverde', pts: islet(-22.93, 16.73, 0.06, 0.14, 0, 13) },
  { group: 'capeverde', pts: islet(-22.8, 16.1, 0.17, 0.15, 0, 14) },
  { group: 'capeverde', pts: islet(-23.17, 15.22, 0.1, 0.1, 0, 15) },
  { group: 'capeverde', pts: islet(-23.62, 15.08, 0.14, 0.27, 0, 16) },
  { group: 'capeverde', pts: islet(-24.38, 14.93, 0.12, 0.12, 0, 17) },
  { group: 'capeverde', pts: islet(-24.7, 14.85, 0.05, 0.05, 0, 18) },
  { group: 'azores', pts: islet(-31.2, 39.45, 0.09, 0.12, 0, 19) },
  { group: 'azores', pts: islet(-28.0, 39.05, 0.06, 0.05, 0, 20) },
  { group: 'azores', pts: islet(-27.2, 38.72, 0.16, 0.09, 0, 21) },
  { group: 'azores', pts: islet(-28.0, 38.65, 0.27, 0.05, -0.3, 22) },
  { group: 'azores', pts: islet(-28.7, 38.58, 0.1, 0.07, 0, 23) },
  { group: 'azores', pts: islet(-28.3, 38.47, 0.23, 0.07, -0.1, 24) },
  { group: 'azores', pts: islet(-25.5, 37.78, 0.4, 0.08, 0.05, 25) },
  { group: 'azores', pts: islet(-25.1, 36.97, 0.08, 0.06, 0, 26) },
  { group: 'iberia', pts: islet(2.95, 39.6, 0.4, 0.22, 0.2, 27) },
  { group: 'iberia', pts: islet(4.1, 39.95, 0.2, 0.08, 0.2, 28) },
  { group: 'iberia', pts: islet(1.42, 38.98, 0.16, 0.12, 0.6, 29) },
];

export const LAND_GROUPS = {
  iberia: 'Iberia',
  africa: 'the African coast',
  madeira: 'Madeira',
  canaries: 'the Canary Islands',
  capeverde: 'the Cape Verde Islands',
  azores: 'the Azores',
};

for (const l of LANDS) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of l.pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  l.bbox = { w, e, s, n };
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isLand(lon, lat) {
  for (const l of LANDS) {
    const b = l.bbox;
    if (lon < b.w || lon > b.e || lat < b.s || lat > b.n) continue;
    if (inPoly(lon, lat, l.pts)) return true;
  }
  return false;
}

export function inBounds(lon, lat) {
  return lon > BOUNDS.west && lon < BOUNDS.east && lat > BOUNDS.south && lat < BOUNDS.north;
}

export const PORTS = [
  { id: 'lisbon', name: 'Lisbon', lon: -9.36, lat: 38.6, known: true,
    blurb: 'Home port. Merchants here pay well for anything from the south, and the crown rewards new charts.' },
  { id: 'porto', name: 'Porto', lon: -8.68, lat: 41.15, known: true,
    blurb: 'The granite city on the Douro. Cheap northern wine and English cloth; pays well for sugar and spices.' },
  { id: 'lagos', name: 'Lagos', lon: -8.67, lat: 37.03, known: true,
    blurb: "Prince Henry's harbour on the Algarve. Wine and cloth are cheap here." },
  { id: 'cadiz', name: 'Cádiz', lon: -6.3, lat: 36.53, known: true,
    blurb: 'Castile\'s island port, with the Seville trade behind it. Salt from the pans is cheap; gold and spices fetch the best prices on the coast.' },
  { id: 'ceuta', name: 'Ceuta', lon: -5.32, lat: 35.86, known: true,
    blurb: 'Portugal\'s fortress across the Strait since 1415. The garrison pays dearly for wheat, wine and cloth.' },
  { id: 'safi', name: 'Safi', lon: -9.38, lat: 32.3, known: true,
    blurb: 'A Moroccan port where Portuguese merchants buy wheat and the striped Moorish cloth the traders of Arguin want for their gold.' },
  { id: 'funchal', name: 'Funchal', lon: -16.9, lat: 32.6, known: true,
    blurb: 'Madeira. The new cane fields make sugar cheap.' },
  { id: 'lanzarote', name: 'Lanzarote', lon: -13.38, lat: 28.92, known: true,
    blurb: 'A Canary outpost. Islanders gather orchil lichen for red dye.' },
  { id: 'arguin', name: 'Arguin', lon: -16.95, lat: 20.5, known: false,
    blurb: 'An island trading post in a shallow bay. Saharan gold reaches the coast here.' },
  { id: 'gambia', name: 'Gambia River', lon: -16.85, lat: 13.45, known: false,
    blurb: 'Mandinka traders at the river mouth deal in ivory, pepper and gold.' },
  { id: 'serraleoa', name: 'Serra Leoa', lon: -13.45, lat: 8.55, known: false,
    blurb: 'A great harbour under the Lion Mountains. The Temne trade ivory and pepper for cloth.' },
  { id: 'cestos', name: 'Rio dos Cestos', lon: -9.75, lat: 5.3, known: false,
    blurb: 'The Grain Coast, named for the melegueta pepper its people sell cheaply by the basket.' },
  { id: 'mina', name: 'Costa da Mina', lon: -1.4, lat: 4.85, known: false,
    blurb: 'The Gold Coast. Akan traders bring gold dust down from the forests and pay richly for cloth.' },
  { id: 'cantor', name: 'Cantor', lon: -14.9, lat: 13.66, known: false, river: 'gambia',
    blurb: 'A Mandinka market town far up the Gambia, where caravans from the gold country meet the river. Only a shallow ship can come this far.' },
];

// ---- Harbours ------------------------------------------------------------------------
// Depth at the berth, in metres, at the mean of the year. A ship that draws more anchors
// offshore and works her cargo with boats (see ports.js). `seasonal`: a river bar or channel
// that rises in the rains (July to October) and falls in the dry season.
export const HARBOURS = {
  lisbon: { depth: 9, kind: 'the deep anchorage of the Tagus' },
  porto: { depth: 3.2, kind: 'a harbour behind the Douro bar' },
  lagos: { depth: 5, kind: 'a sheltered bay' },
  cadiz: { depth: 7, kind: 'a deep bay' },
  ceuta: { depth: 6, kind: 'a deep harbour under the fortress' },
  safi: { depth: 3.5, kind: 'an open roadstead off the beach' },
  funchal: { depth: 4.5, kind: 'an open roadstead under the town' },
  lanzarote: { depth: 3.4, kind: 'a harbour inside the reef' },
  arguin: { depth: 2.6, kind: 'an island behind the Arguin banks' },
  gambia: { depth: 2.6, kind: 'a river mouth with a bar', seasonal: true },
  serraleoa: { depth: 10, kind: 'a great natural harbour' },
  cestos: { depth: 2.2, kind: 'a river mouth with a shallow bar', seasonal: true },
  mina: { depth: 2.8, kind: 'a surf beach with the anchorage offshore' },
  cantor: { depth: 2.0, kind: 'a river town, far upstream', seasonal: true },
};
for (const p of PORTS) Object.assign(p, HARBOURS[p.id] || { depth: 5 });

// ---- Shoals --------------------------------------------------------------------------
// Banks too shallow for a deep-draught ship. Ships that draw more than DEEP_DRAFT when laden
// plan their courses round them, and anchor outside them (see anchorage()).
export const DEEP_DRAFT = 3;
export const SHOALS = [
  { id: 'arguin', name: 'the Arguin banks', depth: 3,
    pts: [[-15.8, 21.15], [-16.85, 21.1], [-17.25, 20.9], [-17.45, 20.55], [-17.4, 20.15], [-17.15, 19.85], [-16.85, 19.5], [-16.6, 19.3], [-15.8, 19.3]] },
];
// Depth of the shoal water at a point, or Infinity where there is no shoal.
export function shoalDepth(lon, lat) {
  let d = Infinity;
  for (const sh of SHOALS) if (inPoly(lon, lat, sh.pts)) d = Math.min(d, sh.depth);
  return d;
}

// ---- Rivers --------------------------------------------------------------------------
// A river runs inland from its mouth port to a port upstream. Ships go up by the tide, by
// towing and by sweeps, so the passage takes no account of the wind (RIVER_KNOTS), and only a
// ship that draws less than the channel (the upstream port's depth) can go.
export const RIVER_KNOTS = 2.4;
export const RIVERS = {
  gambia: { name: 'the Gambia', mouth: 'gambia', port: 'cantor',
    pts: [[-16.85, 13.45], [-16.62, 13.43], [-16.38, 13.36], [-16.08, 13.34], [-15.82, 13.43], [-15.55, 13.56], [-15.32, 13.68], [-15.1, 13.65], [-14.9, 13.66]] },
};
export const riverOf = (portId) => Object.values(RIVERS).find((r) => r.port === portId) || null;
const samePt = (a, b) => Math.abs(a[0] - b[0]) < 0.0005 && Math.abs(a[1] - b[1]) < 0.0005;
function riverPortAt(lon, lat) {
  return PORTS.find((p) => p.river && samePt([p.lon, p.lat], [lon, lat])) || null;
}
// The river legs from the mouth up to the port (flagged with a third element 1), or back down.
function riverLegs(r, upstream) {
  const pts = upstream ? r.pts.slice(1) : r.pts.slice(0, -1).reverse();
  return pts.map(([x, y]) => [x, y, 1]);
}
export const isRiverLeg = (pt) => pt?.[2] === 1;

// Nautical miles between two points (flat-earth approximation, fine at this scale).
export function distNm(aLon, aLat, bLon, bLat) {
  const midLat = ((aLat + bLat) / 2) * D2R;
  const dx = (bLon - aLon) * Math.cos(midLat);
  const dy = bLat - aLat;
  return 60 * Math.hypot(dx, dy);
}

// Compass bearing in degrees, 0 = north, 90 = east.
export function bearing(aLon, aLat, bLon, bLat) {
  const midLat = ((aLat + bLat) / 2) * D2R;
  const dx = (bLon - aLon) * Math.cos(midLat);
  const dy = bLat - aLat;
  return (Math.atan2(dx, dy) / D2R + 360) % 360;
}

export function angleDiff(a, b) {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d; // 0..180
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Prevailing winds of the 1450s Atlantic, simplified:
// north-east trades south of ~30°N, Portuguese northerlies along the Iberian coast,
// westerlies out at sea north of the Azores latitude. Returns where the wind blows FROM.
export function windAt(lon, lat, day) {
  const north = 1 - smooth(33, 28, lat); // 1 north of the trades
  const guinea = smooth(9.5, 5, lat); // 1 in the Gulf of Guinea
  const trade = (1 - north) * (1 - guinea); // 1 in the trades
  const coastal = smooth(-16, -11, lon); // 1 near Iberia/Morocco
  const tradeFrom = 50 - 32 * smooth(-24, -15, lon); // NNE near Africa, NE offshore
  const zones = [
    { from: tradeFrom, w: trade, s: 1.0 },
    { from: 352, w: north * coastal, s: 0.85 },
    { from: 278, w: north * (1 - coastal) * smooth(33, 38, lat), s: 1.0 },
    { from: 15, w: north * (1 - coastal) * (1 - smooth(33, 38, lat)), s: 0.55 }, // lighter northerlies
    { from: 220, w: guinea, s: 0.5 }, // Gulf of Guinea: light south-westerlies, calms offshore
  ];
  let vx = 0, vy = 0;
  for (const z of zones) {
    const wob = 10 * Math.sin(day * 0.23 + lon * 0.31) + 7 * Math.sin(day * 0.57 + lat * 0.41);
    const a = (z.from + wob) * D2R;
    vx += Math.sin(a) * z.w * z.s;
    vy += Math.cos(a) * z.w * z.s;
  }
  const strength = Math.min(1, Math.hypot(vx, vy)) * (0.9 + 0.1 * Math.sin(day * 0.4 + lon));
  const from = (Math.atan2(vx, vy) / D2R + 360) % 360;
  return { from, strength };
}

// Caravel sailing performance by angle off the wind (0 = straight into it).
const POLAR = [[0, 0.24], [40, 0.27], [50, 0.5], [65, 0.78], [90, 0.95], [115, 1.0], [140, 0.95], [165, 0.85], [180, 0.8]];

export function sailFactor(offWind) {
  for (let i = 1; i < POLAR.length; i++) {
    const [a1, f1] = POLAR[i];
    const [a0, f0] = POLAR[i - 1];
    if (offWind <= a1) return f0 + ((offWind - a0) / (a1 - a0)) * (f1 - f0);
  }
  return POLAR[POLAR.length - 1][1];
}

export function pointOfSail(offWind) {
  if (offWind < 45) return 'Beating to windward';
  if (offWind < 75) return 'Close-hauled';
  if (offWind < 110) return 'Beam reach';
  if (offWind < 150) return 'Broad reach';
  return 'Running before the wind';
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassPoint(deg) {
  return POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// ---- Sea-route pathfinding -------------------------------------------------
// A coarse grid over the chart. Courses are planned for the least sailing time, not the
// shortest distance: each step is costed by the caravel's speed on that heading in the
// prevailing wind there. So a passage home from Guinea swings out to sea to cross the
// trades on a reach and ride the westerlies in (the volta do mar), and a course straight
// into the wind is planned as tacks where that is quicker.
export const NAV_CELL = 0.2;
const NW = Math.round((BOUNDS.east - BOUNDS.west) / NAV_CELL);
const NH = Math.round((BOUNDS.north - BOUNDS.south) / NAV_CELL);
let navGrid = null;

function cellCenter(i, j) {
  return [BOUNDS.west + (i + 0.5) * NAV_CELL, BOUNDS.south + (j + 0.5) * NAV_CELL];
}

function getNavGrid() {
  if (navGrid) return navGrid;
  navGrid = new Uint8Array(NW * NH);
  for (let j = 0; j < NH; j++) {
    for (let i = 0; i < NW; i++) {
      const [x, y] = cellCenter(i, j);
      const q = NAV_CELL * 0.45;
      navGrid[j * NW + i] = isLand(x, y) || isLand(x - q, y - q) || isLand(x + q, y - q) || isLand(x - q, y + q) || isLand(x + q, y + q) ? 1 : 0;
    }
  }
  return navGrid;
}

// True if a straight course between two points stays off the land, with a small margin.
export function clearWater(aLon, aLat, bLon, bLat, margin = 0.03) {
  const len = Math.hypot(bLon - aLon, bLat - aLat);
  const steps = Math.ceil(len / 0.02);
  const nx = len ? -(bLat - aLat) / len * margin : 0, ny = len ? (bLon - aLon) / len * margin : 0;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = aLon + (bLon - aLon) * t, y = aLat + (bLat - aLat) * t;
    if (isLand(x, y) || isLand(x + nx, y + ny) || isLand(x - nx, y - ny)) return false;
  }
  return true;
}

// How far each sea cell lies from the nearest land, in nautical miles (for coastal ships).
export const COASTAL_NM = 60; // a barca keeps within this of the shore
let landDist = null;
function getLandDist() {
  if (landDist) return landDist;
  const g = getNavGrid();
  landDist = new Float32Array(NW * NH).fill(Infinity);
  const heap = [];
  const push = (n, d) => { heap.push([d, n]); let c = heap.length - 1; while (c > 0) { const q = (c - 1) >> 1; if (heap[q][0] <= heap[c][0]) break; [heap[q], heap[c]] = [heap[c], heap[q]]; c = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  for (let n = 0; n < NW * NH; n++) if (g[n]) { landDist[n] = 0; push(n, 0); }
  while (heap.length) {
    const [d, n] = pop();
    if (d > landDist[n]) continue;
    const i = n % NW, j = Math.floor(n / NW);
    const cl = Math.cos((BOUNDS.south + (j + 0.5) * NAV_CELL) * D2R);
    for (const [di, dj] of STEPS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NW || nj >= NH) continue;
      const m = nj * NW + ni, nd = d + 60 * NAV_CELL * Math.hypot(di * cl, dj);
      if (nd < landDist[m]) { landDist[m] = nd; push(m, nd); }
    }
  }
  return landDist;
}
// Nautical miles from this point to the nearest land (to the nearest grid cell's worth).
export function offshoreNm(lon, lat) {
  const i = Math.floor((lon - BOUNDS.west) / NAV_CELL), j = Math.floor((lat - BOUNDS.south) / NAV_CELL);
  if (i < 0 || j < 0 || i >= NW || j >= NH) return Infinity;
  return getLandDist()[j * NW + i];
}
// True if a straight course keeps within reach of the shore all the way.
function inshore(aLon, aLat, bLon, bLat, limit) {
  const steps = Math.ceil(Math.hypot(bLon - aLon, bLat - aLat) / (NAV_CELL / 2));
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    if (offshoreNm(aLon + (bLon - aLon) * t, aLat + (bLat - aLat) * t) > limit) return false;
  }
  return true;
}

// Shoal depth for each grid cell (Infinity where there is none).
let shoalGrid = null;
function getShoalGrid() {
  if (shoalGrid) return shoalGrid;
  shoalGrid = new Float32Array(NW * NH).fill(Infinity);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const [x, y] = cellCenter(i, j);
    shoalGrid[j * NW + i] = shoalDepth(x, y);
  }
  return shoalGrid;
}
// True if a straight course stays out of water shallower than minDepth.
function clearOfShoals(aLon, aLat, bLon, bLat, minDepth) {
  if (!minDepth) return true;
  const steps = Math.ceil(Math.hypot(bLon - aLon, bLat - aLat) / 0.05);
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    if (shoalDepth(aLon + (bLon - aLon) * t, aLat + (bLat - aLat) * t) < minDepth) return false;
  }
  return true;
}

function nearestSeaCell(lon, lat, minDepth = 0) {
  const g = getNavGrid();
  const sg = minDepth ? getShoalGrid() : null;
  const ci = Math.floor((lon - BOUNDS.west) / NAV_CELL), cj = Math.floor((lat - BOUNDS.south) / NAV_CELL);
  for (let r = 0; r < 6; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NW || j >= NH || g[j * NW + i] || (sg && sg[j * NW + i] < minDepth)) continue;
      const [x, y] = cellCenter(i, j);
      const d = Math.hypot(x - lon, y - lat);
      if (d < bd && clearWater(lon, lat, x, y)) { bd = d; best = j * NW + i; }
    }
    if (best !== null) return best;
  }
  return null;
}

// Routes between the same two points never change, so remember recent ones. Routes between
// ports, for every level of skill, come ready-made in data/routes.json (see loadRoutes).
const pathCache = new Map();
const PATH_CACHE_MAX = 300;
const portRoutes = new Map();
export const ROUTE_SKILLS = [0, 0.25, 0.5, 0.75, 1];

export function routeKey(aLon, aLat, bLon, bLat, skill) {
  return `${aLon.toFixed(3)},${aLat.toFixed(3)}>${bLon.toFixed(3)},${bLat.toFixed(3)}@${skill}`;
}

// Take the ready-made routes (the object in data/routes.json).
export function loadRoutes(table) {
  for (const [k, r] of Object.entries(table?.routes || {})) portRoutes.set(k, r);
  return portRoutes.size;
}

// Returns a list of [lon, lat] waypoints from a to b (excluding a), or null if no route.
// `skill` is the navigator's grasp of the winds, 0 to 1: a master (1) plans for the least
// sailing time, a novice (0) for the shortest distance, hugging the coast; between the two,
// the winds count for less.
// `coastal`: a ship that must keep within COASTAL_NM of land (a barca).
// `deep`: a ship that draws more than DEEP_DRAFT, which keeps off the shoals.
// A river port is reached through its river's mouth; river legs carry a third element, 1.
export function findPath(aLon, aLat, bLon, bLat, skill = 1, coastal = false, deep = false) {
  const ra = riverPortAt(aLon, aLat), rb = riverPortAt(bLon, bLat);
  if (ra || rb) {
    if (ra && rb) return ra === rb ? [] : null; // no river joins another
    if (rb) {
      const r = riverOf(rb.id), m = PORTS.find((p) => p.id === r.mouth);
      const sea = samePt([aLon, aLat], [m.lon, m.lat]) ? [] : findPath(aLon, aLat, m.lon, m.lat, skill, coastal, deep);
      return sea && [...sea, ...riverLegs(r, true)];
    }
    const r = riverOf(ra.id), m = PORTS.find((p) => p.id === r.mouth);
    const sea = samePt([bLon, bLat], [m.lon, m.lat]) ? [] : findPath(m.lon, m.lat, bLon, bLat, skill, coastal, deep);
    return sea && [...riverLegs(r, false), ...sea];
  }
  skill = Math.round(Math.min(1, Math.max(0, skill)) * 4) / 4;
  const key = routeKey(aLon, aLat, bLon, bLat, skill) + (coastal ? 'c' : '') + (deep ? 'd' : '');
  const hit = !coastal && !deep && portRoutes.has(key) ? portRoutes.get(key) : pathCache.get(key);
  if (hit !== undefined) return hit && hit.map((pt) => [pt[0], pt[1]]);
  const route = computePath(aLon, aLat, bLon, bLat, skill, coastal ? COASTAL_NM : 0, deep ? DEEP_DRAFT + 0.01 : 0);
  if (pathCache.size >= PATH_CACHE_MAX) pathCache.delete(pathCache.keys().next().value);
  pathCache.set(key, route);
  return route && route.map((pt) => [pt[0], pt[1]]);
}

// Where a ship anchors off a port when she draws too much to come in: the nearest open water
// a little offshore, and for a deep ship outside any shoal. Remembered per port.
const anchorCache = new Map();
export function anchorage(portId, deep = false) {
  const key = portId + (deep ? 'd' : '');
  if (anchorCache.has(key)) return anchorCache.get(key);
  const p = PORTS.find((x) => x.id === portId);
  let found = null;
  for (let r = 0.12; r <= 1.6 && !found; r += 0.04) {
    let best = null;
    for (let a = 0; a < 360; a += 10) {
      const x = p.lon + (r * Math.sin(a * D2R)) / Math.cos(p.lat * D2R), y = p.lat + r * Math.cos(a * D2R);
      if (isLand(x, y) || (deep && shoalDepth(x, y) <= DEEP_DRAFT)) continue;
      if (!clearWater(p.lon, p.lat, x, y)) continue;
      const room = offshoreNm(x, y);
      if (!best || room > best.room) best = { lon: +x.toFixed(4), lat: +y.toFixed(4), room };
    }
    found = best;
  }
  const out = found ? { lon: found.lon, lat: found.lat, nm: distNm(p.lon, p.lat, found.lon, found.lat) } : { lon: p.lon, lat: p.lat, nm: 0 };
  anchorCache.set(key, out);
  return out;
}

// Where a ship's course to a port ends: the port, or for a deep ship at a port inside a shoal
// (Arguin), her anchorage outside it.
export function berth(portId, deep = false) {
  const p = PORTS.find((x) => x.id === portId);
  if (deep && shoalDepth(p.lon, p.lat) <= DEEP_DRAFT) return anchorage(portId, true);
  return { lon: p.lon, lat: p.lat, nm: 0 };
}

// Plan a route afresh, ignoring every cache (for building and checking data/routes.json).
export function planRoute(aLon, aLat, bLon, bLat, skill = 1) {
  return computePath(aLon, aLat, bLon, bLat, skill);
}

// The prevailing wind in each grid cell: the wind averaged over a spread of days (the daily
// wobble cancels out). Speed is a share of the best a caravel can make.
let meanWind = null;
function getMeanWind() {
  if (meanWind) return meanWind;
  const from = new Float32Array(NW * NH), push = new Float32Array(NW * NH);
  const DAYS = [0, 5.5, 11, 16.5, 23, 31, 44, 57];
  for (let j = 0; j < NH; j++) {
    for (let i = 0; i < NW; i++) {
      const [x, y] = cellCenter(i, j);
      let vx = 0, vy = 0, st = 0;
      for (const d of DAYS) {
        const w = windAt(x, y, d);
        vx += Math.sin(w.from * D2R); vy += Math.cos(w.from * D2R); st += w.strength;
      }
      const n = j * NW + i;
      from[n] = (Math.atan2(vx, vy) / D2R + 360) % 360;
      push[n] = 0.45 + 0.55 * st / DAYS.length; // as the ship's speed uses strength
    }
  }
  meanWind = { from, push };
  return meanWind;
}

function cellOf(lon, lat) {
  const i = Math.min(NW - 1, Math.max(0, Math.floor((lon - BOUNDS.west) / NAV_CELL)));
  const j = Math.min(NH - 1, Math.max(0, Math.floor((lat - BOUNDS.south) / NAV_CELL)));
  return j * NW + i;
}

// Speed (share of the best) heading `deg` in the prevailing wind of cell n.
function speedIn(n, deg) {
  const W = getMeanWind();
  return Math.max(0.05, sailFactor(angleDiff(deg, W.from[n])) * W.push[n]);
}

// Time (in degrees of latitude at full speed) to sail straight from a to b, as a navigator of
// the given skill reckons it: speed counts for less the less he knows the winds.
function legTime(a, b, skill = 1) {
  const nm = distNm(a[0], a[1], b[0], b[1]);
  if (nm < 1e-6) return 0;
  const deg = bearing(a[0], a[1], b[0], b[1]);
  const pieces = Math.max(1, Math.ceil(nm / 12));
  let t = 0;
  for (let p = 0; p < pieces; p++) {
    const f = (p + 0.5) / pieces;
    t += nm / 60 / pieces / Math.pow(speedIn(cellOf(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), deg), skill);
  }
  return t;
}

const STEPS = [];
for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) STEPS.push([di, dj]);

function computePath(aLon, aLat, bLon, bLat, skill = 1, maxOff = 0, minDepth = 0) {
  // A short hop in clear water goes straight.
  if (distNm(aLon, aLat, bLon, bLat) < 90 && clearWater(aLon, aLat, bLon, bLat) && (!maxOff || inshore(aLon, aLat, bLon, bLat, maxOff)) && clearOfShoals(aLon, aLat, bLon, bLat, minDepth)) return [[bLon, bLat]];
  const g = getNavGrid();
  const off = maxOff ? getLandDist() : null;
  const sg = minDepth ? getShoalGrid() : null;
  const W = getMeanWind();
  const start = nearestSeaCell(aLon, aLat, minDepth), goal = nearestSeaCell(bLon, bLat, minDepth);
  if (start === null || goal === null) return null;
  const gi = goal % NW, gj = Math.floor(goal / NW);
  const cost = new Float64Array(NW * NH).fill(Infinity); // double precision: float rounding on long routes can loop the path
  const from = new Int32Array(NW * NH).fill(-1);
  const heap = [];
  const push = (n, f) => {
    heap.push([f, n]);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
      }
    }
    return top;
  };
  // Never more than the true time: the distance left, at the best speed the winds allow.
  let best = 0;
  for (let n = 0; n < W.push.length; n++) if (W.push[n] > best) best = W.push[n];
  const h = (n) => {
    const i = n % NW, j = Math.floor(n / NW);
    const cl = Math.cos((BOUNDS.south + j * NAV_CELL) * D2R);
    return Math.hypot((i - gi) * cl, j - gj) * NAV_CELL / Math.pow(best, skill);
  };
  // Each of the eight steps has a fixed heading; its cost is distance over speed there.
  const dirs = STEPS.map(([di, dj]) => ({ di, dj, deg: (Math.atan2(di, dj) / D2R + 360) % 360 }));
  const closed = new Uint8Array(NW * NH);
  cost[start] = 0;
  push(start, h(start));
  while (heap.length) {
    const [, n] = pop();
    if (closed[n]) continue;
    closed[n] = 1;
    if (n === goal) break;
    const i = n % NW, j = Math.floor(n / NW);
    const cl = Math.cos((BOUNDS.south + (j + 0.5) * NAV_CELL) * D2R);
    for (const { di, dj, deg } of dirs) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NW || nj >= NH) continue;
      const m = nj * NW + ni;
      if (g[m] || closed[m] || (off && off[m] > maxOff) || (sg && sg[m] < minDepth)) continue;
      if (di && dj && (g[j * NW + ni] || g[nj * NW + i])) continue; // no corner cutting
      // the true heading of this step, allowing for the narrower degrees of longitude
      const hd = (Math.atan2(di * cl, dj) / D2R + 360) % 360;
      const c = cost[n] + Math.hypot(di * cl, dj) * NAV_CELL / Math.pow((speedIn(n, hd) + speedIn(m, hd)) / 2, skill);
      if (c < cost[m]) { cost[m] = c; from[m] = n; push(m, c + h(m)); }
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const cells = [];
  for (let n = goal; n !== -1; n = from[n]) cells.push(cellCenter(n % NW, Math.floor(n / NW)));
  cells.reverse();
  const pts = [[aLon, aLat], ...cells, [bLon, bLat]];
  // Time along the planned track to each point, for judging shortcuts.
  const along = [0];
  for (let q = 1; q < pts.length; q++) along.push(along[q - 1] + legTime(pts[q - 1], pts[q], skill));
  // String-pull: from each point, reach as far along the track as a straight course stays in
  // clear water and is no slower than following the track. Grow the reach in doubling steps,
  // then narrow it down.
  const ok = (a, b) => b === a + 1 || (legTime(pts[a], pts[b], skill) <= (along[b] - along[a]) * 1.005 &&
    clearWater(pts[a][0], pts[a][1], pts[b][0], pts[b][1]) && (!maxOff || inshore(pts[a][0], pts[a][1], pts[b][0], pts[b][1], maxOff)) &&
    clearOfShoals(pts[a][0], pts[a][1], pts[b][0], pts[b][1], minDepth));
  const last = pts.length - 1;
  const out = [];
  let k = 0;
  while (k < last) {
    let lo = k + 1, hi = null, step = 1;
    while (lo < last) {
      const m = Math.min(last, lo + step);
      if (ok(k, m)) { lo = m; step *= 2; } else { hi = m; break; }
    }
    while (hi !== null && hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ok(k, mid)) lo = mid; else hi = mid;
    }
    out.push(pts[lo]);
    k = lo;
  }
  return out;
}

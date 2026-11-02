// The pilot's work at sea, as small games: a bonus for the player. The navigation gear fitted to
// the ship works on its own all the time (ships.js: storms do less harm, a truer course). On a
// passage the player may also do the pilot's work himself, each once a passage; a good result
// helps for the rest of it, and a miss costs nothing. Pure rules: no browser here (sightview.js).
//
//  - The sight: the height of the Pole Star by eye or with the quadrant (from 1460), or, with the
//    astrolabe (1485), the noon sun, which serves south of the line where the Pole Star has set.
//    With Zacuto's almanac (1496) the pilot then works the latitude from the sun's declination:
//    the right sum turns a good sight into a fine one. A fixed latitude: a truer course, faster.
//  - The traverse board: peg the course the helmsman calls each half-hour glass, for a true
//    reckoning between sights. Any year, and a little faster.
//  - The sounding lead: coming in to a shallow harbour where she must lie off, heave the lead and
//    find the channel: she anchors closer, and her boats work the cargo faster.

export const MIN_DAYS_OUT = 8; // the sight: once she is this many days out of port
export const MIN_DAYS_LEFT = 6; // and has at least this many days still to run
export const BOOST = { fine: 1.1, good: 1.05 }; // the sight, for the rest of the passage
export const STAR_LOWEST = 3; // the Pole Star is lost in the haze below this height (degrees)
export const BOARD_OUT = 3, BOARD_LEFT = 4; // the traverse board: 3 days out, 4 to go
export const BOARD_BOOST = { fine: 1.05, good: 1.03 };
export const BOARD_CALLS = 6;
export const LEAD_NM = 60; // the lead: within this many miles of a harbour she must lie off
export const LEAD_RATE = { fine: 2, good: 1.5 }; // her boats work this much faster there

// The pilot's means, by the ship's navigation fitting. `tol`: degrees off that still read as a
// fine sight (twice it, a good one). `sun`: takes the noon sun with the astrolabe.
export const TOOLS = {
  dead: { name: 'by eye and hand', tol: 1.1, sun: false, how: 'There is no instrument aboard: your pilot reckons the height of the Pole Star by eye, a hand\'s breadth at a time.' },
  quadrant: { name: 'the quadrant', tol: 1.4, sun: false, how: 'Sight the Pole Star along the quadrant\'s edge; the plumb line marks the degrees.' },
  astrolabe: { name: 'the astrolabe', tol: 1.7, sun: true, how: 'The astrolabe hangs from your thumb and swings with the ship. Turn the alidade so the sun\'s light falls through both its sights, and hold it there while the pilot reads the scale.' },
  almanac: { name: 'astrolabe and almanac', tol: 2.1, sun: true, how: 'The astrolabe hangs from your thumb and swings with the ship. Turn the alidade so the sun\'s light falls through both its sights, and hold it there; then Zacuto\'s tables give the sun\'s declination for the day.' },
};

export const toolOf = (S) => TOOLS[S.ship?.fit?.nav] ? S.ship.fit.nav : 'dead';

// The sun's declination on a day of the game (degrees), near enough for a pilot's table.
export function declination(day) {
  const doy = (Math.floor(day) + 59) % 365; // the game begins on 1 March
  return 23.44 * Math.sin((2 * Math.PI / 365) * (doy - 80));
}

// What there is to sight: with an astrolabe, the noon sun; otherwise the Pole Star, if it is up.
export function body(S) {
  const lat = S.ship.lat;
  const tool = TOOLS[toolOf(S)];
  if (tool.sun) { const alt = 90 - Math.abs(lat - declination(S.day)); return { id: 'sun', name: 'the noon sun', alt }; }
  if (lat >= STAR_LOWEST + 2) return { id: 'star', name: 'the Pole Star', alt: lat };
  return null;
}

export function daysLeft(nmLeft, knots) {
  return knots > 0.1 ? nmLeft / (knots * 24) : Infinity;
}

const atSea = (S) => !S.ship.docked && S.ship.route?.length && S.ship.passage;

// The sight: can one be taken now?
export function offer(S, nmLeft, knots) {
  const P = S.ship.passage;
  if (!atSea(S)) return { ok: false, why: 'at sea only' };
  if (P.sighted) return { ok: false, why: 'one sight a passage' };
  if (S.day - P.start < MIN_DAYS_OUT) return { ok: false, why: `once she is ${MIN_DAYS_OUT} days out` };
  if (daysLeft(nmLeft, knots) < MIN_DAYS_LEFT) return { ok: false, why: 'too near the end of the passage' };
  const b = body(S);
  if (!b) return { ok: false, why: 'the Pole Star has set: an astrolabe can take the sun' };
  return { ok: true, body: b, tool: toolOf(S) };
}

export function grade(err, toolId) {
  const t = TOOLS[toolId] || TOOLS.dead;
  return err <= t.tol ? 'fine' : err <= 2 * t.tol ? 'good' : 'miss';
}

// The astrolabe: how long the light was held through both sights, out of the time allowed.
export const HOLD_SECONDS = 3; // the pilot needs this long to read the scale
export const ASTRO_SECONDS = 15; // the time allowed
export function astroGrade(seconds) { return seconds == null ? 'miss' : seconds <= 7 ? 'fine' : seconds <= ASTRO_SECONDS ? 'good' : 'miss'; }

// The almanac: the latitude from the sun's height at noon and its declination. North of the sun,
// the sun bears south: latitude = declination + (90 - height). South of it, the other way.
export function latFrom(height, dec, sunSouth) {
  return sunSouth ? dec + (90 - height) : dec - (90 - height);
}
// Three sums the pilot might make: the right one, one with yesterday's declination, one with
// the declination's sign turned. Shuffled.
export function almanacChoices(S, height, rand = Math.random) {
  const dec = declination(S.day), sunSouth = S.ship.lat >= dec;
  const right = latFrom(height, dec, sunSouth);
  const opts = [
    { v: right, ok: true },
    { v: latFrom(height, declination(S.day - 6), sunSouth), ok: false },
    { v: latFrom(height, -dec, sunSouth), ok: false },
  ].map((o) => ({ ...o, v: Math.round(o.v * 2) / 2 }));
  // keep them apart
  if (Math.abs(opts[1].v - opts[0].v) < 1) opts[1].v = opts[0].v + (rand() < 0.5 ? -2 : 2);
  if (Math.abs(opts[2].v - opts[0].v) < 1) opts[2].v = opts[0].v + (opts[1].v > opts[0].v ? -3 : 3);
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { dec, sunSouth, opts };
}
export const upgrade = (g) => (g === 'good' ? 'fine' : g);

// ---- The passage -----------------------------------------------------------------------------
export function beginPassage(S) { S.ship.passage = { start: S.day, sighted: false, mult: 1, board: null, boardMult: 1, lead: null }; }
export function endPassage(S) { S.ship.passage = null; }

export function apply(S, g) {
  const mult = BOOST[g] || 1;
  if (!S.ship.passage) beginPassage(S);
  Object.assign(S.ship.passage, { sighted: true, mult, grade: g, day: S.day });
  return mult;
}

// All the help now in force (1 when none).
export const boost = (S) => (S.ship?.passage && !S.ship.docked ? (S.ship.passage.mult || 1) * (S.ship.passage.boardMult || 1) : 1);

// ---- The traverse board ----------------------------------------------------------------------
export const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const POINT_NAMES = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
export const pointOf = (heading) => Math.round((((heading % 360) + 360) % 360) / 22.5) % 16;

export function boardOffer(S, nmLeft, knots) {
  const P = S.ship.passage;
  if (!atSea(S)) return { ok: false };
  if (P.board) return { ok: false, why: 'one board a passage' };
  if (S.day - P.start < BOARD_OUT) return { ok: false, why: `once she is ${BOARD_OUT} days out` };
  if (daysLeft(nmLeft, knots) < BOARD_LEFT) return { ok: false, why: 'too near the end of the passage' };
  return { ok: true };
}
// The helmsman's calls for a watch: her heading, wandering a point or two as the wind shifts.
export function boardCalls(heading, n = BOARD_CALLS, rand = Math.random) {
  const p0 = pointOf(heading);
  return Array.from({ length: n }, () => (p0 + [-2, -1, -1, 0, 0, 0, 1, 1, 2][Math.floor(rand() * 9)] + 16) % 16);
}
export function boardGrade(right, n = BOARD_CALLS) { return right >= n ? 'fine' : right >= n - 2 ? 'good' : 'miss'; }
export function applyBoard(S, g) {
  if (!S.ship.passage) beginPassage(S);
  S.ship.passage.board = g;
  S.ship.passage.boardMult = BOARD_BOOST[g] || 1;
  return S.ship.passage.boardMult;
}

// ---- The sounding lead -----------------------------------------------------------------------
// Offered within LEAD_NM of the harbour she is making for, if she must lie off it (`liesOff`, from
// the port rules), once a passage.
export function leadOffer(S, nmToPort, liesOff) {
  const P = S.ship.passage;
  if (!atSea(S) || !S.ship.dest?.port) return { ok: false };
  if (P.lead) return { ok: false, why: 'sounded already' };
  if (nmToPort > LEAD_NM || !liesOff) return { ok: false };
  return { ok: true };
}
export function leadGrade(errFathoms, readRight) {
  if (errFathoms > 1.5) return 'miss';
  return errFathoms <= 0.6 && readRight ? 'fine' : 'good';
}
export function applyLead(S, g) {
  if (!S.ship.passage) beginPassage(S);
  S.ship.passage.lead = g;
  return LEAD_RATE[g] || 1;
}
// At anchor: how much faster her boats work, from the sounding on the way in.
export const leadRate = (S) => LEAD_RATE[S.ship.passage?.lead] || 1;

// Taking a sight: a bonus for the player at sea. The navigation gear fitted to the ship works on its
// own all the time (ships.js: storms do less harm, a truer course). On a long passage the player may
// also take a sight himself, once a passage, of the Pole Star or (with an astrolabe) the noon sun:
// a good reading fixes the latitude and the ship holds her course truer, a little faster, for the
// rest of the passage. A miss costs nothing. Pure rules: no browser here (sightview.js shows it).
//
// The Pole Star stands as high above the horizon as the ship is north of the equator, and sinks
// out of sight a little north of the line; south of it only the sun will do, and that needs the
// astrolabe and the tables of its declination (from 1485).

export const MIN_DAYS_OUT = 8; // offered once she is this many days out of port
export const MIN_DAYS_LEFT = 6; // and has at least this many days still to run
export const BOOST = { fine: 1.1, good: 1.05 }; // for the rest of the passage
export const STAR_LOWEST = 3; // the Pole Star is lost in the haze below this height (degrees)

// The pilot's means, by the ship's navigation fitting. `tol`: degrees off that still read as a
// fine sight (twice it, a good one). `sun`: can take the noon sun.
export const TOOLS = {
  dead: { name: 'by eye and hand', tol: 1.1, sun: false, how: 'There is no instrument aboard: your pilot reckons the height of the Pole Star by eye, a hand\'s breadth at a time.' },
  quadrant: { name: 'the quadrant', tol: 1.4, sun: false, how: 'Sight the Pole Star along the quadrant\'s edge; the plumb line marks the degrees.' },
  astrolabe: { name: 'the astrolabe', tol: 1.7, sun: true, how: 'Hang the astrolabe from your thumb and turn the alidade until the light falls through both sights.' },
  almanac: { name: 'astrolabe and almanac', tol: 2.1, sun: true, how: 'Zacuto\'s tables give the sun\'s declination for the day; the astrolabe does the rest.' },
};

export const toolOf = (S) => TOOLS[S.ship?.fit?.nav] ? S.ship.fit.nav : 'dead';

// The sun's declination on a day of the year (degrees), near enough for a pilot's table.
export function declination(day) {
  const doy = (day + 59) % 365; // the game begins on 1 March
  return 23.44 * Math.sin((2 * Math.PI / 365) * (doy - 80));
}

// What there is to sight from here: the Pole Star, or the noon sun, or nothing.
export function body(S) {
  const lat = S.ship.lat;
  const tool = TOOLS[toolOf(S)];
  if (lat >= STAR_LOWEST + 2) return { id: 'star', name: 'the Pole Star', alt: lat };
  if (tool.sun) { const alt = 90 - Math.abs(lat - declination(S.day)); return { id: 'sun', name: 'the noon sun', alt }; }
  return null;
}

// Days still to run on this passage, from the distance left and the speed now.
export function daysLeft(nmLeft, knots) {
  return knots > 0.1 ? nmLeft / (knots * 24) : Infinity;
}

// Can a sight be taken now? { ok, why }
export function offer(S, nmLeft, knots) {
  const P = S.ship.passage;
  if (S.ship.docked || !S.ship.route?.length || !P) return { ok: false, why: 'at sea only' };
  if (P.sighted) return { ok: false, why: 'one sight a passage' };
  if (S.day - P.start < MIN_DAYS_OUT) return { ok: false, why: `once she is ${MIN_DAYS_OUT} days out` };
  if (daysLeft(nmLeft, knots) < MIN_DAYS_LEFT) return { ok: false, why: 'too near the end of the passage' };
  const b = body(S);
  if (!b) return { ok: false, why: 'the Pole Star has set: an astrolabe can take the sun' };
  return { ok: true, body: b, tool: toolOf(S) };
}

// How far off the reading was, in degrees, gives the grade.
export function grade(err, toolId) {
  const t = TOOLS[toolId] || TOOLS.dead;
  return err <= t.tol ? 'fine' : err <= 2 * t.tol ? 'good' : 'miss';
}

// A passage begins when she leaves port (voyage.js): one sight in it.
export function beginPassage(S) { S.ship.passage = { start: S.day, sighted: false, mult: 1 }; }
export function endPassage(S) { S.ship.passage = null; }

// Record the sight and its help, for the rest of the passage. Returns the boost (1 for a miss).
export function apply(S, g) {
  const mult = BOOST[g] || 1;
  if (!S.ship.passage) beginPassage(S);
  Object.assign(S.ship.passage, { sighted: true, mult, grade: g, day: S.day });
  return mult;
}

// The help now in force (1 when none).
export const boost = (S) => (S.ship?.passage && !S.ship.docked ? S.ship.passage.mult || 1 : 1);

// Passage times between ports: plots each course with the game's own pathfinder, then
// sails it through the winds exactly as the game does (5 knots, the caravel's polar),
// averaged over several start days.   node tests/sim/passages.mjs
import { PORTS, findPath, windAt, sailFactor, angleDiff, bearing, distNm, D2R } from '../../public/js/world.js';

const KNOTS = 5;
export function sail(route, a, day0) {
  let [lon, lat] = [a.lon, a.lat], day = day0, nm = 0;
  for (const [tl, ta] of route) {
    for (let guard = 0; guard < 40000; guard++) {
      const rem = distNm(lon, lat, tl, ta);
      if (rem < 0.5) break;
      const br = bearing(lon, lat, tl, ta);
      const w = windAt(lon, lat, day);
      const perDay = KNOTS * 24 * sailFactor(angleDiff(br, w.from)) * (0.45 + 0.55 * w.strength);
      const step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(br * D2R)) / 60;
      lon += (step * Math.sin(br * D2R)) / (60 * Math.cos(lat * D2R));
      day += step / perDay;
      nm += step;
    }
    lon = tl; lat = ta;
  }
  return { days: day - day0, nm };
}

const P = (id) => PORTS.find((p) => p.id === id);
export const PAIRS = [['mina', 'lisbon'], ['lisbon', 'mina'], ['gambia', 'lisbon'], ['lisbon', 'gambia'], ['arguin', 'lisbon'], ['lanzarote', 'lisbon'],
  ['lisbon', 'lanzarote'], ['funchal', 'lisbon'], ['cestos', 'lisbon'], ['serraleoa', 'lisbon'], ['lagos', 'lanzarote'], ['gambia', 'arguin']];

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = performance.now();
  for (const [x, y] of PAIRS) {
    const a = P(x), b = P(y);
    const t = performance.now();
    const route = findPath(a.lon, a.lat, b.lon, b.lat);
    const ms = performance.now() - t;
    let d = 0, nm = 0;
    for (const day of [0, 37, 91, 150, 222]) { const r = sail(route, a, day); d += r.days / 5; nm += r.nm / 5; }
    const far = Math.min(...route.map(([lo]) => lo));
    console.log(`${(a.name + ' → ' + b.name).padEnd(32)} ${d.toFixed(1).padStart(5)} days ${Math.round(nm).toString().padStart(5)} nm  ${route.length} legs, west to ${far.toFixed(1)}°  (${ms.toFixed(0)} ms)`);
  }
  console.log(`total ${(performance.now() - t0).toFixed(0)} ms`);
}

// By navigator skill: node tests/sim/passages.mjs --skill
if (process.argv.includes('--skill')) {
  console.log('\nBy the captain\'s navigation (stars):');
  for (const [x, y] of [['mina', 'lisbon'], ['gambia', 'lisbon'], ['arguin', 'lisbon'], ['lanzarote', 'lisbon']]) {
    const a = P(x), b = P(y);
    const row = [1, 2, 3, 4, 5].map((nav) => {
      const route = findPath(a.lon, a.lat, b.lon, b.lat, (nav - 1) / 4);
      let d = 0;
      for (const day of [0, 37, 91, 150, 222]) d += sail(route, a, day).days / 5;
      return `${'★'.repeat(nav).padEnd(5)} ${d.toFixed(0).padStart(3)} d`;
    });
    console.log(`  ${(a.name + ' → ' + b.name).padEnd(30)} ${row.join('   ')}`);
  }
}

// Checks public/data/routes.json against what the pathfinder plans now. Exits 1 if any
// route differs: then run node tests/tools/build_routes.mjs and commit the new file.
//   node tests/tools/check_routes.mjs             # every route (several minutes)
//   node tests/tools/check_routes.mjs --sample 8  # every route's key, and one route in 8 replanned
import { readFileSync } from 'node:fs';
import { PORTS, planRoute, ROUTE_SKILLS, routeKey } from '../../public/js/world.js';

const table = JSON.parse(readFileSync(new URL('../../public/data/routes.json', import.meta.url), 'utf8')).routes;
const si = process.argv.indexOf('--sample');
const SAMPLE = si > 0 ? Number(process.argv[si + 1]) : 1;
let bad = 0, n = 0, k = 0;
const keys = new Set();
for (const a of PORTS) for (const b of PORTS) {
  if (a.river || b.river) continue; // river ports are reached through their mouths
  if (a === b) continue;
  for (const skill of ROUTE_SKILLS) for (const coastal of [false, true]) {
    const key = routeKey(a.lon, a.lat, b.lon, b.lat, skill) + (coastal ? 'c' : '');
    keys.add(key);
    if (!(key in table)) { bad++; if (bad <= 5) console.log('missing:', key); continue; }
    if (k++ % SAMPLE) continue;
    n++;
    const want = planRoute(a.lon, a.lat, b.lon, b.lat, skill, coastal);
    const got = table[key];
    const same = JSON.stringify(want && want.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])) === JSON.stringify(got);
    if (!same) { bad++; if (bad <= 5) console.log('differs:', key); }
  }
}
for (const key of Object.keys(table)) if (!keys.has(key)) { bad++; if (bad <= 5) console.log('no longer wanted:', key); }
console.log(`${keys.size} routes listed, ${n} replanned and compared, ${bad} out of date`);
console.log(`ERRORS ${bad ? `['${bad} routes in data/routes.json are out of date: run node tests/tools/build_routes.mjs']` : '[]'}`);
process.exit(bad ? 1 : 0);

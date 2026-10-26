// Checks public/data/routes.json against what the pathfinder plans now. Exits 1 if any
// route differs: then run node tests/tools/build_routes.mjs and commit the new file.
import { readFileSync } from 'node:fs';
import { PORTS, planRoute, ROUTE_SKILLS, routeKey } from '../../public/js/world.js';

const table = JSON.parse(readFileSync(new URL('../../public/data/routes.json', import.meta.url), 'utf8')).routes;
let bad = 0, n = 0;
for (const a of PORTS) for (const b of PORTS) {
  if (a === b) continue;
  for (const skill of ROUTE_SKILLS) {
    n++;
    const key = routeKey(a.lon, a.lat, b.lon, b.lat, skill);
    const want = planRoute(a.lon, a.lat, b.lon, b.lat, skill);
    const got = table[key];
    const same = JSON.stringify(want && want.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])) === JSON.stringify(got);
    if (!same) { bad++; if (bad <= 5) console.log('differs:', key); }
  }
}
console.log(`${n} routes checked, ${bad} out of date`);
console.log(`ERRORS ${bad ? `['${bad} routes in data/routes.json are out of date: run node tests/tools/build_routes.mjs']` : '[]'}`);
process.exit(bad ? 1 : 0);

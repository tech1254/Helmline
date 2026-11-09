// Checks public/data/routes.json against what the pathfinder plans now. Exits 1 if any
// route differs: then run node tests/tools/build_routes.mjs and commit the new file.
//   node tests/tools/check_routes.mjs             # every route (several minutes)
//   node tests/tools/check_routes.mjs --sample 8  # every route's key, and one route in 8 replanned
import { readFileSync, existsSync } from 'node:fs';
import * as X from '../../public/js/x/index.js'; // the expansions' ports, and their own route files
import { PORTS, planRoute, ROUTE_SKILLS, routeKey } from '../../public/js/world.js';

// The core routes, and each expansion's routes to its own ports (data/routes-<id>.json). A route
// between two expansions' ports is planned as needed, so it is not required here.
const table = JSON.parse(readFileSync(new URL('../../public/data/routes.json', import.meta.url), 'utf8')).routes;
const owner = {}; // port id -> the expansion that adds it
for (const x of X.RULES) for (const p of x.ports || []) owner[p] = x.id;
for (const f of X.routeFiles()) { const u = new URL(`../../public/${f}`, import.meta.url); if (existsSync(u)) Object.assign(table, JSON.parse(readFileSync(u, 'utf8')).routes); }
const si = process.argv.indexOf('--sample');
const SAMPLE = si > 0 ? Number(process.argv[si + 1]) : 1;
let bad = 0, n = 0, k = 0;
const keys = new Set();
for (const a of PORTS) for (const b of PORTS) {
  if (a.river || b.river) continue; // river ports are reached through their mouths
  if (a === b) continue;
  if (owner[a.id] && owner[b.id] && owner[a.id] !== owner[b.id]) continue; // two expansions' ports
  if (a.lon === b.lon && a.lat === b.lat) continue; // two ports in one place (beyond the chart)
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

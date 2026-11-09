// The sea routes to an expansion's own ports, into public/data/routes-<id>.json: between each of
// its ports and every core port, and among its own ports (x/index.js). Run after adding a port:
//   node tests/tools/build_routes_x.mjs colonies
import { writeFileSync } from 'node:fs';
import * as X from '../../public/js/x/index.js';
import { PORTS, planRoute, ROUTE_SKILLS, routeKey } from '../../public/js/world.js';

const id = process.argv[2];
const x = X.RULES.find((r) => r.id === id);
if (!x) { console.log(`no expansion ${id}: ${X.RULES.map((r) => r.id).join(', ')}`); process.exit(1); }
const owner = {};
for (const r of X.RULES) for (const p of r.ports || []) owner[p] = r.id;
const mine = new Set(x.ports || []);
const routes = {};
const t0 = performance.now();
for (const a of PORTS) for (const b of PORTS) {
  if (a.river || b.river || a === b) continue;
  if (!mine.has(a.id) && !mine.has(b.id)) continue; // core to core: data/routes.json
  if (a.lon === b.lon && a.lat === b.lat) continue; // two ports in one place (beyond the chart)
  if ((owner[a.id] && owner[a.id] !== id) || (owner[b.id] && owner[b.id] !== id)) continue; // another expansion's
  for (const skill of ROUTE_SKILLS) for (const coastal of [false, true]) {
    const r = planRoute(a.lon, a.lat, b.lon, b.lat, skill, coastal);
    routes[routeKey(a.lon, a.lat, b.lon, b.lat, skill) + (coastal ? 'c' : '')] = r && r.map(([px, py]) => [+px.toFixed(4), +py.toFixed(4)]);
  }
}
const out = JSON.stringify({ built: new Date().toISOString().slice(0, 10), routes });
writeFileSync(new URL(`../../public/data/routes-${id}.json`, import.meta.url), out);
console.log(`${id}: ${Object.keys(routes).length} routes, ${(out.length / 1024).toFixed(1)} KB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);

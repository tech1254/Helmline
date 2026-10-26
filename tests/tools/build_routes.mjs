// Precompute every port-to-port sea route, for each level of navigator skill, into
// public/data/routes.json, so the game never has to plan them while you play.
// Run after changing the coastline, the ports, the winds or the pathfinder:
//   node tests/tools/build_routes.mjs
// tests/test_routes_file.py fails if the file no longer matches what the planner makes.
import { writeFileSync } from 'node:fs';
import { PORTS, planRoute, ROUTE_SKILLS, routeKey } from '../../public/js/world.js';

const routes = {};
const t0 = performance.now();
for (const a of PORTS) for (const b of PORTS) {
  if (a === b) continue;
  for (const skill of ROUTE_SKILLS) {
    const r = planRoute(a.lon, a.lat, b.lon, b.lat, skill);
    routes[routeKey(a.lon, a.lat, b.lon, b.lat, skill)] = r && r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
  }
}
const out = JSON.stringify({ built: new Date().toISOString().slice(0, 10), routes });
writeFileSync(new URL('../../public/data/routes.json', import.meta.url), out);
console.log(`${Object.keys(routes).length} routes, ${(out.length / 1024).toFixed(1)} KB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);

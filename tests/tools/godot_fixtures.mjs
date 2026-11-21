// Reference results from the browser game's rules, for the Godot edition's parity tests
// (godot/tests/test_parity.gd). node tests/tools/godot_fixtures.mjs
import { writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const js = (m) => import(root + 'public/js/' + m);
const E = await js('economy.js'), Sh = await js('ships.js'), U = await js('util.js'), W = await js('world.js');
const fx = {};
// calendar
fx.calendar = [0, 1, 30, 305, 306, 1000, 4567.8, 20000, 36000].map((d) => ({ day: d, year: Sh.yearOf(d), date: U.fmtDate(d) }));
fx.dayOfYear = [1451, 1452, 1460, 1500, 1551].map((y) => ({ year: y, day: Sh.dayOfYear(y) }));
// market: no drift, a scripted run of trades
const m = new E.Market({});
for (const p of Object.keys(m.drift)) for (const g of Object.keys(m.drift[p])) m.drift[p][g] = 0;
m.drift.lisbon.wine = 0.1; m.drift.ceuta.wheat = -0.05;
const steps = [];
const look = (port) => steps.push({ look: port, prices: m.observe(port) });
look('lisbon'); look('ceuta'); look('cantor'); look('calicut');
steps.push({ buy: ['lisbon', 'wine', 20, 300, 25], res: m.buy('lisbon', 'wine', 20, 300, 25) });
look('lisbon');
steps.push({ sell: ['ceuta', 'wheat', 12], res: m.sell('ceuta', 'wheat', 12) });
steps.push({ sell: ['lisbon', 'gold', 5], res: m.sell('lisbon', 'gold', 5) });
steps.push({ sell: ['calicut', 'copper', 30], res: m.sell('calicut', 'copper', 30) });
look('ceuta'); look('lisbon');
fx.market = steps;
fx.marketDrift = { lisbon: { wine: 0.1 }, ceuta: { wheat: -0.05 } };
// ship stats across hulls and fits
const fits = [{}, { guns: 'bercos', crew: 'crossbows' }, { cloth: 'linen', area: 'bonnets', stow: 'extra' }, { hull: 'built', sheath: 'lead', pumps: 'chain' }];
fx.ships = [];
for (const hull of Object.keys(Sh.HULLS)) for (const fit of fits) fx.ships.push({ hull, fit, stats: Sh.stats({ hull, fit }) });
// distances
fx.dist = [['lisbon', 'ceuta'], ['lisbon', 'cantor'], ['seville', 'calicut']].map(([a, b]) => { const A = W.PORTS.find((p) => p.id === a), B = W.PORTS.find((p) => p.id === b); return { a, b, nm: W.distNm(A.lon, A.lat, B.lon, B.lat) }; });
// routes between ports from the ready-made table, rivers included
const { readFileSync } = await import('node:fs');
W.loadRoutes(JSON.parse(readFileSync(root + 'public/data/routes.json')));
const P = (id) => W.PORTS.find((p) => p.id === id);
fx.routes = [];
for (const [a, b] of [['lisbon', 'ceuta'], ['lisbon', 'cantor'], ['seville', 'lisbon'], ['lagos', 'seville'], ['seville', 'cantor'], ['palos', 'antwerp'], ['lisbon', 'calicut'], ['cadiz', 'funchal']])
  for (const skill of [0, 0.5, 1]) for (const coastal of [false, true]) {
    const r = W.findPath(P(a).lon, P(a).lat, P(b).lon, P(b).lat, skill, coastal);
    fx.routes.push({ a, b, skill, coastal, route: r });
  }
// winds, sailing speeds, and passages
fx.wind = [];
for (const [lon, lat] of [[-9.4, 38.6], [-20, 30], [-30, 15], [-15, 5], [-5, 36], [10, -20], [-40, -35], [-60, 20], [0, 50]])
  for (const day of [0, 37.5, 400]) fx.wind.push({ lon, lat, day, w: W.windAt(lon, lat, day) });
fx.sail = [0, 30, 45, 60, 89, 100, 130, 160, 180].map((off) => ({ off, f: W.sailFactor(off) }));
fx.knots = [];
for (const hull of ['barca', 'caravel', 'nau', 'galley']) for (const off of [20, 70, 100, 150]) {
  const st = Sh.stats({ hull, fit: {} }); fx.knots.push({ hull, off, f: 0.7, k: Sh.knotsAt(st, off, 0.7, 0.9) });
}
const Vy = { estimate: (st, route, lon, lat, day) => {
  let nm = 0, hot = 0, d = day; const hf = 1;
  for (const pt of route) { const [tl, ta] = pt;
    for (let g = 0; g < 20000; g++) { const rem = W.distNm(lon, lat, tl, ta); if (rem < 0.5) break;
      const b = W.bearing(lon, lat, tl, ta), w = W.windAt(lon, lat, d), off = W.angleDiff(b, w.from), f = W.sailFactor(off) * (0.45 + 0.55 * w.strength);
      const perDay = (W.isRiverLeg(pt) ? W.RIVER_KNOTS * hf : Sh.knotsAt(st, off, f, hf)) * 24, step = Math.min(perDay * 0.1, rem);
      lat += (step * Math.cos(b * W.D2R)) / 60; lon += (step * Math.sin(b * W.D2R)) / (60 * Math.cos(lat * W.D2R)); d += step / perDay; if (lat < 26) hot += step / perDay; nm += step; }
    lon = tl; lat = ta; }
  return { days: d - day, nm, hot, cost: Math.ceil((d - day) * st.upkeep) }; } };
fx.passages = [];
for (const [a, b, hull] of [['lisbon', 'ceuta', 'barca'], ['lisbon', 'cantor', 'caravel'], ['seville', 'lisbon', 'caravel'], ['lagos', 'funchal', 'nau']]) {
  const st = Sh.stats({ hull, fit: {} }), A = P(a), B = P(b);
  const r = W.findPath(A.lon, A.lat, B.lon, B.lat, 0.5, !!Sh.HULLS[hull].coastal);
  fx.passages.push({ a, b, hull, day: 12.3, route: r, est: Vy.estimate(st, r, A.lon, A.lat, 12.3) });
}
writeFileSync(root + 'godot/tests/fixtures.json', JSON.stringify(fx));
console.log('fixtures', Object.keys(fx).map((k) => `${k}:${fx[k].length ?? ''}`).join(' '));

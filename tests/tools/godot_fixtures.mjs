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
writeFileSync(root + 'godot/tests/fixtures.json', JSON.stringify(fx));
console.log('fixtures', Object.keys(fx).map((k) => `${k}:${fx[k].length ?? ''}`).join(' '));

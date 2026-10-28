// Rules for ports, seasons and draft (no browser): run by tests/test_ports_rules.py.
import * as Ports from '../../public/js/ports.js';
import * as Ships from '../../public/js/ships.js';
import { PORTS, anchorage, berth, findPath, shoalDepth, DEEP_DRAFT } from '../../public/js/world.js';

const errs = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) errs.push(what); };
const S = { day: 0 };
Ports.ensurePorts(S);
const market = { vol: {}, closed: () => false };
const until = (year) => { const end = Ships.dayOfYear(year); while (S.day < end) { const dd = Math.min(10, end - S.day); S.day += dd; Ports.grow(S, dd, market); } };

// History and works
check(Ports.depthOf(S, 'mina') === 2.8, 'Costa da Mina: 2.8 m before the castle');
until(1481);
const lagos81 = S.ports.lagos.size;
until(1483);
check(Ports.depthOf(S, 'mina') === 4.4, 'Costa da Mina: 4.4 m once the castle pier is built (1482)');
check(S.ports.lagos.size < lagos81, 'Lagos shrinks when the Casa da Guiné leaves for Lisbon (1482)');
until(1490);
check(S.ports.funchal.works === true && Ports.depthOf(S, 'funchal') === 5.5, 'Funchal builds its mole in the 1480s (4.5 m to 5.5 m)');
check(Ports.tierOf(S.ports.funchal.size) === 'city', 'Funchal is a city by 1490');
check(Ports.depthScale(S, 'funchal') < 0.85 && Ports.depthScale(S, 'ceuta') >= 1, 'a growing port deepens its market; a shrinking one does not');
check(Ports.depthOf(S, 'arguin') === 2.6, 'the Arguin banks never change');

// Seasons on the river bars
const sep = Ships.dayOfYear(1490) + 257, mar = Ships.dayOfYear(1490) + 75;
check(Ports.depthOf(S, 'gambia', sep) > Ports.depthOf(S, 'gambia', mar) + 0.9, 'the Gambia bar is about a metre deeper in the rains than in the dry season');
check(Ports.depthOf(S, 'lisbon', sep) === Ports.depthOf(S, 'lisbon', mar), 'Lisbon does not change with the seasons');
S.day = mar;
check(Ports.needsBoats(S, 'cestos', 'caravel', 1) && !Ports.needsBoats(S, 'cestos', 'caravel', 0), 'Rio dos Cestos in the dry season: a laden caravel needs boats, a light one does not');
S.day = sep;
check(!Ports.needsBoats(S, 'cestos', 'caravel', 1), 'Rio dos Cestos in the rains: a laden caravel comes in');
check(Ports.canGoUpriver(S, 'cantor', 'barca', 1), 'a laden barca goes up to Cantor');
check(!Ports.canGoUpriver(S, 'cantor', 'nau', 0), 'a nau never goes up to Cantor');
S.day = mar;
check(!Ports.canGoUpriver(S, 'cantor', 'caravel', 1) && Ports.canGoUpriver(S, 'cantor', 'caravel', 0), 'in the dry season a caravel goes up to Cantor only light');

// Draft and shoals
check(Ships.isDeep('nau') && !Ships.isDeep('redonda'), 'only the nau is deep enough to keep off the banks');
const a = PORTS.find((p) => p.id === 'lisbon'), b = berth('arguin', true);
check(shoalDepth(b.lon, b.lat) > DEEP_DRAFT, "a deep ship's berth at Arguin is outside the banks");
const r = findPath(a.lon, a.lat, b.lon, b.lat, 1, false, true);
let worst = Infinity, lon = a.lon, lat = a.lat;
for (const [x, y] of r) { for (let t = 0; t <= 1; t += 0.01) worst = Math.min(worst, shoalDepth(lon + (x - lon) * t, lat + (y - lat) * t)); lon = x; lat = y; }
check(worst > DEEP_DRAFT, 'a deep course from Lisbon to Arguin never crosses the banks');
const w = Ports.boatWork('arguin', 'nau', 120, true);
check(w.days > 10 && w.fee === 120, `a nau's boats need ${w.days.toFixed(0)} days and 120 cz for 120 units at Arguin (26 miles out)`);
const g = Ports.boatWork('gambia', 'redonda', 65);
check(g.days < 5, `a caravela redonda's boats work 65 units at the Gambia in ${g.days.toFixed(1)} days`);
console.log(`ERRORS ${errs.length ? JSON.stringify(errs) : '[]'}`);
process.exit(errs.length ? 1 : 0);

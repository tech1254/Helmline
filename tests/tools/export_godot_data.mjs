// Exports the game's data tables from the JavaScript rules to JSON for the Godot edition
// (godot/data). Run after any change to a table: node tests/tools/export_godot_data.mjs
import { writeFileSync, copyFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const js = (m) => import(root + 'public/js/' + m);
const E = await js('economy.js'), W = await js('world.js'), Sh = await js('ships.js');
const out = (name, data) => { writeFileSync(root + 'godot/data/' + name, JSON.stringify(data)); console.log(name, JSON.stringify(data).length); };
// the economy's hidden constants, read back from a fresh market
const m = new E.Market({});
const k = Object.fromEntries(['lisbon', 'cantor', 'calicut'].map((p) => [p, { base: E.MARKETS[p].k, gold: m.k(p, 'gold'), spices: m.k(p, 'spices'), wine: m.k(p, 'wine') }]));
out('goods.json', E.GOODS);
out('markets.json', { markets: E.MARKETS, portuguese: E.PORTUGUESE_PORTS, depth: k.lisbon.wine / k.lisbon.base, goldK: k.lisbon.gold / k.lisbon.wine, spiceK: k.lisbon.spices / k.lisbon.wine, spread: 0.07, pressureDays: 30, driftDays: 60, driftVol: 0.045 });
out('ports.json', W.PORTS);
out('world.json', { bounds: W.BOUNDS, chartOutline: W.CHART_OUTLINE, offChart: W.OFF_CHART, lands: W.LANDS, landGroups: W.LAND_GROUPS, knownLands: W.KNOWN_LANDS, harbours: W.HARBOURS, shoals: W.SHOALS, rivers: W.RIVERS, deepDraft: W.DEEP_DRAFT, coastalNm: W.COASTAL_NM, routeSkills: W.ROUTE_SKILLS });
out('ships.json', { hulls: Sh.HULLS, order: Sh.HULL_ORDER, groups: Sh.GROUPS, defaultFit: Sh.DEFAULT_FIT, tiers: { known: Sh.KNOWN, respected: Sh.RESPECTED, trusted: Sh.TRUSTED }, priceRise: Sh.PRICE_RISE });
copyFileSync(root + 'public/data/routes.json', root + 'godot/data/routes.json');
console.log('routes.json copied');

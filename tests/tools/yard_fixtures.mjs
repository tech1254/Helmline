// Reference shipyard answers from the browser game's rules, for godot/tests/test_shipyard.gd.
// node tests/tools/yard_fixtures.mjs
import { writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const Sh = await import(root + 'public/js/ships.js');
const out = { avail: [], quotes: [], values: [], prices: [] };
const S0 = (nation, year, extra = {}) => ({ nation, day: Sh.dayOfYear(year) + 40, purse: 5000, hull: 100, ship: { hull: 'caravel', fit: { ...Sh.DEFAULT_FIT }, docked: nation === 'castile' ? 'seville' : 'lisbon', built: Sh.dayOfYear(year) - 2 * 365, tropic: 30 }, yard: { orders: [], built: 0 }, ...extra });
for (const nation of ['portugal', 'castile']) for (const year of [1451, 1470, 1485, 1500, 1520]) for (const standing of [null, 25]) {
  const S = S0(nation, year, standing == null ? {} : { contracts: { unlocked: true, standing } });
  for (const id of Object.keys(Sh.HULLS)) out.avail.push({ nation, year, standing, thing: 'HULL:' + id, r: Sh.availability(S, Sh.HULLS[id]) });
  for (const g of Sh.GROUPS) for (const c of g.choices) out.avail.push({ nation, year, standing, thing: g.id + ':' + c.id, r: Sh.availability(S, c) });
}
// quotes: a few refits on a few hulls, in a few years
const drafts = [{ guns: 'bercos' }, { cloth: 'linen', area: 'bonnets', crew: 'crossbows' }, { guns: 'falcons', hull: 'built' }, { sheath: 'lead', pumps: 'chain', paint: 'red' }, { guns: 'bombards', stern: 'carved', mark: 'cross' }];
for (const hull of ['barca', 'caravel', 'nau', 'largecaravel']) for (const year of [1451, 1480, 1500]) for (const d of drafts) {
  const S = S0('portugal', year, { contracts: { unlocked: true, standing: 25 } });
  S.ship.hull = hull; S.ship.fit = Sh.normalFit(hull, {});
  const fit = { ...S.ship.fit, ...d };
  const q = Sh.quoteFit(S, fit);
  out.quotes.push({ hull, year, draft: d, q: q.error ? { error: q.error } : { cost: q.cost, days: q.days, down: q.down, lines: q.lines.map((l) => [l.g.id, l.c.id, l.price, !!l.order]) } });
}
for (const hull of Object.keys(Sh.HULLS)) for (const years of [0, 4, 9, 14, 25]) for (const rep of [0, 120]) out.values.push({ hull, years, rep, v: Sh.hullValue(hull, years, rep) });
for (const hull of Object.keys(Sh.HULLS)) for (const g of Sh.GROUPS) for (const c of g.choices) out.prices.push({ hull, g: g.id, c: c.id, p: Sh.priceFor(hull, c) });
writeFileSync(root + 'godot/tests/yard_fixtures.json', JSON.stringify(out));
console.log(out.avail.length, 'availability,', out.quotes.length, 'quotes,', out.values.length, 'values,', out.prices.length, 'prices');

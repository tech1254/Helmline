// Ships: hulls, the shipyard's options, and what they do to a ship's sailing, hold and fighting.
// Pure rules with no browser, so the fleet simulator can use them too.
//
// A ship is described by { hull, fit }: hull is a key of HULLS, fit maps each option group to
// the chosen choice. The player's flagship keeps these on S.ship (with S.ship.name); hired ships
// keep a hull only, in the default fit.

import { START_DATE } from './config.js';

// Standing needed, by tier (see contracts.js TIERS).
export const KNOWN = 5, RESPECTED = 20, TRUSTED = 40;
export const TIER_NAMES = { 0: 'anyone', 5: 'Known on the quays', 20: 'Respected', 40: 'Trusted by the crown' };

// Tuned 27 Oct 2026 with tests/sim/fleet_sim.mjs --hulls: as hired ships the barinel and nau earn about
// what a caravel does on Africa routes, since market depth caps any hold (open for the tuning pass).
// orderYear: may be ordered from this year (a third paid down); year: delivered or bought outright.
export const HULLS = {
  barca: {
    id: 'barca', name: 'Barca', year: 1451, standing: KNOWN, price: 1050, hold: 25, knots: 4.5, up: 0.75, down: 1,
    upkeep: 2, hiredUpkeep: 1, scale: 0.5, size: 0.8,
    blurb: 'A small, single-masted coaster with a square sail. Cheap to buy and run; a short-route ship for a captain.',
  },
  caravel: {
    id: 'caravel', name: 'Caravel', year: 1451, standing: KNOWN, price: 1950, hold: 40, knots: 5, up: 1, down: 1,
    upkeep: 3, hiredUpkeep: 1, scale: 1, size: 1,
    blurb: 'Two lateen masts and a shallow draft. The best ship afloat for beating home against the trade winds.',
  },
  barinel: {
    id: 'barinel', name: 'Barinel', year: 1451, standing: KNOWN, price: 2850, hold: 60, knots: 4.8, up: 0.9, down: 1,
    upkeep: 4, hiredUpkeep: 1, scale: 1.3, size: 1.15, oars: 2,
    blurb: 'A broad oared sailing ship. Sweeps keep her moving at about 2 knots in a calm, as in the Gulf of Guinea.',
  },
  nau: {
    id: 'nau', name: 'Nau', year: 1480, orderYear: 1470, standing: TRUSTED, price: 7800, hold: 120, knots: 5.5, up: 0.75, down: 1.1,
    upkeep: 6, hiredUpkeep: 2, scale: 2, size: 1.45, fight: 0.1, shy: 0.8,
    blurb: 'A great carrack with high castles fore and aft. A huge hold and room for bombards; slow to windward. Galleys think twice before taking her on.',
  },
};
export const HULL_ORDER = ['barca', 'caravel', 'barinel', 'nau'];
// Hull prices above, and refits, are 30% dearer than first set (economy change C, 27 Oct 2026):
// close to what ships cost per ton in the period, and enough to make buying one a decision.
export const PRICE_RISE = 1.3;

// Option groups. Each choice may change: knots (a factor), up (a factor), down, upAdd, hold (factor),
// holdAdd, offWind (factor beyond 75° off the wind), wage (cz a day), fight (odds added), spoil (factor).
// price is for a caravel (scaled by the hull), days in the yard, standing and year needed.
export const GROUPS = [
  {
    id: 'rig', name: 'Rig', tab: 'rig', hulls: ['caravel'],
    choices: [
      { id: 'lateen', name: 'Lateen', note: 'Two triangular sails: superb close to the wind.' },
      { id: 'square', name: 'Square rig, lateen mizzen', note: 'Square sails on the foremast and main: fast with the wind behind, a little slower into it.',
        up: 0.9, down: 1.15, holdAdd: 15, price: 600, days: 10, standing: RESPECTED, year: 1480, orderYear: 1470 },
    ],
  },
  {
    id: 'cloth', name: 'Sailcloth', tab: 'rig',
    choices: [
      { id: 'hemp', name: 'Coarse hemp', note: 'Heavy and baggy.', knots: 0.97 },
      { id: 'canvas', name: 'Breton canvas', note: 'Good canvas from Olonne: the standard.' },
      { id: 'linen', name: 'Fine linen', note: 'Light, close-woven sails that hold their shape.', knots: 1.04, price: 450, days: 2 },
    ],
  },
  {
    id: 'area', name: 'Sail area', tab: 'rig',
    choices: [
      { id: 'regular', name: 'Regular' },
      { id: 'bonnets', name: 'Bonnets laced on', note: 'Extra strips of canvas laced to the foot of the sails in fair weather. More hands to work them.', offWind: 1.08, wage: 1, price: 250, days: 2 },
    ],
  },
  {
    id: 'tack', name: 'Tacking', tab: 'rig',
    choices: [
      { id: 'none', name: 'As built' },
      { id: 'sprit', name: 'Spritsail and extra mizzen', note: 'Small sails at bow and stern to balance her as she comes about.', upAdd: 0.08, price: 300, days: 3 },
    ],
  },
  {
    id: 'hull', name: 'Hull', tab: 'hull',
    choices: [
      { id: 'built', name: 'As built' },
      { id: 'tallow', name: 'Careened and tallowed', note: 'Hauled down, scraped of weed and coated with tallow and pitch. Lasts about six months.', knots: 1.05, price: 300, days: 3 },
    ],
  },
  {
    id: 'stow', name: 'Stowage', tab: 'hull',
    choices: [
      { id: 'standard', name: 'Standard' },
      { id: 'extra', name: 'Extra stowage', note: 'A new orlop deck and better racking below.', hold: 1.15, price: 400, days: 4, standing: KNOWN },
    ],
  },
  {
    id: 'guns', name: 'Guns', tab: 'arms',
    choices: [
      { id: 'none', name: 'None' },
      { id: 'bercos', name: 'Swivel guns (berços)', note: 'Light breech-loaders on the rails.', fight: 0.08, price: 500, days: 3, standing: KNOWN },
      { id: 'bombards', name: 'Bombards', note: 'Heavy guns on the main deck. Only a nau can carry them.', fight: 0.15, price: 1200, days: 5, standing: TRUSTED, hulls: ['nau'] },
    ],
  },
  {
    id: 'stores', name: 'Stores', tab: 'arms',
    choices: [
      { id: 'ordinary', name: 'Ordinary casks' },
      { id: 'casks', name: 'Better casks and dunnage', note: 'Tight cooperage, and cargo kept off the wet bilge.', spoil: 0.6, price: 350, days: 2 },
    ],
  },
  {
    id: 'paint', name: 'Hull colour', tab: 'colours', cosmetic: true,
    choices: [
      { id: 'tar', name: 'Tar black' },
      { id: 'ochre', name: 'Ochre', days: 1 },
      { id: 'redlead', name: 'Red lead', days: 1 },
    ],
  },
  {
    id: 'mark', name: 'Sails', tab: 'colours', cosmetic: true,
    choices: [
      { id: 'plain', name: 'Plain' },
      { id: 'cross', name: 'Cross of the Order of Christ', standing: RESPECTED, days: 1 },
      { id: 'arms', name: 'Your family arms', days: 1 },
    ],
  },
  {
    id: 'flags', name: 'Pennants', tab: 'colours', cosmetic: true,
    choices: [
      { id: 'none', name: 'Ensign only' },
      { id: 'streamers', name: 'Long streamers at every masthead', days: 1 },
    ],
  },
  {
    id: 'stern', name: 'Stern', tab: 'colours', cosmetic: true,
    choices: [
      { id: 'plain', name: 'Plain' },
      { id: 'carved', name: 'Carved and gilded, with a name board', standing: TRUSTED, days: 2 },
    ],
  },
];
export const TABS = [['hull', 'Hull'], ['rig', 'Rig and sails'], ['arms', 'Arms and stores'], ['colours', 'Colours']];

export const DEFAULT_FIT = Object.fromEntries(GROUPS.map((g) => [g.id, g.choices[g.id === 'cloth' ? 1 : 0].id]));

export const group = (id) => GROUPS.find((g) => g.id === id);
export const choice = (gid, cid) => group(gid)?.choices.find((c) => c.id === cid);
export const hullOf = (ship) => HULLS[ship?.hull] || HULLS.caravel;

// Groups that apply to a hull, and the choices it can take.
export function groupsFor(hullId) {
  return GROUPS.filter((g) => !g.hulls || g.hulls.includes(hullId));
}
export function choicesFor(g, hullId) {
  return g.choices.filter((c) => !c.hulls || c.hulls.includes(hullId));
}

export function normalFit(hullId, fit) {
  const out = {};
  for (const g of GROUPS) {
    const ok = choicesFor(g, hullId);
    const want = fit?.[g.id];
    out[g.id] = (groupsFor(hullId).includes(g) && ok.some((c) => c.id === want)) ? want : DEFAULT_FIT[g.id];
  }
  return out;
}

// The sailing figures for a hull in a fit.
export function stats(ship) {
  const h = hullOf(ship);
  const fit = normalFit(h.id, ship?.fit);
  const st = { hull: h.id, name: h.name, knots: h.knots, up: h.up, down: h.down, offWind: 1, hold: h.hold, upkeep: h.upkeep,
    hiredUpkeep: h.hiredUpkeep, oars: h.oars || 0, fight: h.fight || 0, spoil: 1, shy: h.shy || 1 };
  let holdFactor = 1, holdAdd = 0, upAdd = 0;
  for (const g of groupsFor(h.id)) {
    const c = choice(g.id, fit[g.id]);
    if (!c) continue;
    if (c.knots) st.knots *= c.knots;
    if (c.up) st.up *= c.up;
    if (c.down) st.down *= c.down;
    if (c.upAdd) upAdd += c.upAdd;
    if (c.offWind) st.offWind *= c.offWind;
    if (c.hold) holdFactor *= c.hold;
    if (c.holdAdd) holdAdd += c.holdAdd;
    if (c.wage) st.upkeep += c.wage;
    if (c.fight) st.fight += c.fight;
    if (c.spoil) st.spoil *= c.spoil;
  }
  st.up += upAdd;
  st.hold = Math.round((h.hold + holdAdd) * holdFactor);
  return st;
}

// How a ship's speed on a point of sailing compares with the caravel's (whose courses are planned).
export function pointMult(st, offWind) {
  let m;
  if (offWind <= 60) m = st.up;
  else if (offWind < 90) m = st.up + (1 - st.up) * (offWind - 60) / 30;
  else if (offWind <= 110) m = 1;
  else if (offWind < 140) m = 1 + (st.down - 1) * (offWind - 110) / 30;
  else m = st.down;
  if (offWind > 75) m *= st.offWind;
  return m;
}

// Speed in knots. f = the caravel's sail factor in this wind (sailFactor × wind strength).
export function knotsAt(st, offWind, f, hullFactor = 1) {
  const k = st.knots * hullFactor * f * pointMult(st, offWind);
  return st.oars ? Math.max(k, st.oars * hullFactor) : k;
}

// ---- Calendar, standing, prices -------------------------------------------------------

export function yearOf(day) {
  return new Date(START_DATE.getTime() + Math.floor(day) * 86400000).getUTCFullYear();
}
export function dayOfYear(year) {
  return Math.ceil((Date.UTC(year, 0, 1) - START_DATE.getTime()) / 86400000);
}

export function standingOf(S) {
  return S.contracts?.unlocked ? (S.contracts.standing ?? 0) : -Infinity;
}

export function priceFor(hullId, c) {
  return Math.round((c.price || 0) * PRICE_RISE * HULLS[hullId].scale / 10) * 10;
}

// Whether a hull or option can be had now: 'yes', 'order' (may be ordered, delivered later),
// or 'no', with the reason.
export function availability(S, thing) {
  const year = yearOf(S.day);
  const need = thing.standing || 0;
  if (need && standingOf(S) < need) return { ok: 'no', why: `needs standing: ${TIER_NAMES[need]}` };
  if (thing.year && year < thing.year) {
    if (thing.orderYear && year >= thing.orderYear) return { ok: 'order', why: `can be ordered now for delivery in ${thing.year}` };
    return { ok: 'no', why: thing.orderYear ? `can be ordered from ${thing.orderYear}, delivered in ${thing.year}` : `from ${thing.year}` };
  }
  return { ok: 'yes', why: '' };
}

// ---- The flagship ------------------------------------------------------------------------

export const FLAGSHIP_NAME = 'São Cristóvão';

export function ensureFlagship(S) {
  const sh = S.ship;
  if (!sh.hull || !HULLS[sh.hull]) sh.hull = 'caravel';
  sh.name = String(sh.name || FLAGSHIP_NAME).replace(/[<>]/g, '').slice(0, 40) || FLAGSHIP_NAME;
  sh.fit = normalFit(sh.hull, sh.fit);
  if (!S.yard) S.yard = { orders: [], built: 0 };
  if (!S.called) S.called = Object.fromEntries(Object.keys(S.seen || {}).filter((p) => (S.seen[p].day ?? -1) >= 0).map((p) => [p, true]));
  if (sh.docked) S.called[sh.docked] = true;
  return sh;
}

export const flagStats = (S) => stats(S.ship);

// What a set of changes from the current fit costs, and the days in the yard.
export function quoteFit(S, fit) {
  const sh = S.ship;
  const lines = [];
  let cost = 0, days = 0, ordered = [];
  for (const g of groupsFor(sh.hull)) {
    if (fit[g.id] === sh.fit[g.id]) continue;
    const c = choice(g.id, fit[g.id]);
    const av = availability(S, c);
    const price = priceFor(sh.hull, c);
    if (av.ok === 'no') return { error: `${c.name}: ${av.why}.` };
    if (av.ok === 'order') { ordered.push({ group: g.id, choice: c.id, price }); lines.push({ g, c, price, order: true }); continue; }
    cost += price;
    days = Math.max(days, c.days || 0);
    lines.push({ g, c, price });
  }
  // the yard works on several things at once, but each extra job adds a day
  if (lines.filter((l) => !l.order).length > 1) days += lines.filter((l) => !l.order).length - 1;
  const down = ordered.reduce((n, o) => n + Math.round(o.price / 3), 0);
  return { lines, cost, days, ordered, down };
}

// Apply a refit that has been paid for. Ordered items are kept for later.
export function applyFit(S, fit, q) {
  const sh = S.ship;
  for (const l of q.lines) if (!l.order) sh.fit[l.g.id] = l.c.id;
  if (q.lines.some((l) => !l.order && l.g.id === 'hull' && l.c.id === 'tallow')) sh.tallowDay = S.day;
  for (const o of q.ordered) {
    S.yard.orders.push({ kind: 'fit', group: o.group, choice: o.choice, price: o.price, paid: Math.round(o.price / 3), due: dayOfYear(choice(o.group, o.choice).year), placed: S.day });
  }
}

// Part exchange for the flagship: half her hull price, less unrepaired damage.
export function tradeInValue(S, repairCost) {
  return Math.max(0, Math.round(HULLS[S.ship.hull].price / 2 - repairCost));
}

// Replace the flagship with a new hull. Fittings are not carried over, except her colours.
export function tradeUp(S, hullId, name) {
  const sh = S.ship;
  const keep = Object.fromEntries(GROUPS.filter((g) => g.cosmetic).map((g) => [g.id, sh.fit[g.id]]));
  sh.hull = hullId;
  sh.fit = normalFit(hullId, keep);
  if (name) sh.name = name;
  S.hull = 100;
  S.hullWarned = 0;
  S.yard.built = (S.yard.built || 0) + 1;
}

export function orderHull(S, hullId, name) {
  const h = HULLS[hullId];
  const paid = Math.round(h.price / 3);
  S.yard.orders.push({ kind: 'hull', hull: hullId, name: name || null, price: h.price, paid, due: dayOfYear(h.year), placed: S.day });
  return paid;
}

// Orders whose day has come (delivered at the Lisbon yard).
export const ready = (S) => (S.yard?.orders || []).filter((o) => S.day >= o.due);
export const pending = (S) => (S.yard?.orders || []).filter((o) => S.day < o.due);
export const hasOrder = (S, kind, id) => (S.yard?.orders || []).some((o) => o.kind === kind && (o.hull === id || o.choice === id));

// How far along an order is, 0 to 1.
export function progress(S, o) {
  return Math.max(0, Math.min(1, (S.day - o.placed) / Math.max(1, o.due - o.placed)));
}
export function stageText(p) {
  if (p >= 1) return 'ready for delivery';
  if (p < 0.2) return 'the keel is laid';
  if (p < 0.45) return 'her frames are up';
  if (p < 0.7) return 'she is being planked';
  if (p < 0.9) return 'her masts are stepped';
  return 'she is being rigged';
}

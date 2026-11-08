import * as Works from './works.js';
import * as Accounts from './accounts.js';
import * as Lending from './lending.js';
// Barbary corsairs: the first danger at sea.
// Corsair galleys from the Moroccan coast raided shipping and the Algarve in the 1450s.
// In their waters the captain may be challenged: run, fight or pay tribute.
// How he answers shapes his name at sea: fighting builds notoriety (more corsairs come
// looking for him), avoiding fights builds caution (the seas around him grow calmer).

import { GOODS, PORTUGUESE_PORTS } from './economy.js';
import * as Ships from './ships.js';
import * as Wear from './wear.js';
import * as Callings from './callings.js';
import { isLand, distNm } from './world.js';

const ZONES = [
  // [west, east, south, north, danger]
  { w: -12.5, e: -5.2, s: 29.5, n: 36.2, d: 1.0, name: 'the Barbary coast' },
  { w: -10.2, e: -6.0, s: 36.0, n: 37.6, d: 0.6, name: 'the Algarve' },
  { w: -18.5, e: -12.8, s: 27.2, n: 29.8, d: 0.45, name: 'the Canaries' },
];

const BASE_CHANCE = 0.035; // per day in the most dangerous waters
const COOLDOWN_DAYS = 12;
// A name at sea fades when it is not renewed: notoriety and caution halve in about five years.
const NAME_HALF_LIFE_DAYS = 5 * 365;
export const REPAIR_PORTS = Wear.YARDS;
// The crown pays a bounty for every corsair galley taken, at any Portuguese port.
export const BOUNTY = { galley: 150, big: 300 };
// What a Barbary galley carries home: coin, and goods taken from other ships and the Algarve coast.
const PLUNDER_GOODS = ['wine', 'cloth', 'wheat', 'alquices', 'sugar', 'dye'];

export function ensurePirates(S) {
  if (!S.pirates) S.pirates = { notoriety: 0, caution: 0, cooldown: 0, encounters: 0, won: 0, lost: 0, fled: 0, paid: 0 };
  const P = S.pirates;
  if (P.plundered == null) { P.plundered = 0; P.bounty = 0; P.bountyPaid = 0; }
  if (S.hull == null) S.hull = 100;
  return S.pirates;
}

export function danger(lon, lat) {
  let d = 0, where = null;
  for (const z of ZONES) {
    if (lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n && z.d > d) { d = z.d; where = z.name; }
  }
  return { d, where };
}

// How strongly the corsairs are drawn to this captain.
export function attention(S) {
  const P = ensurePirates(S);
  return Math.min(2.5, Math.max(0.3, 1 + P.notoriety / 25 - P.caution / 40));
}

export function hullFactor(S) {
  return 0.6 + 0.4 * (S.hull ?? 100) / 100; // a battered hull sails slower
}

// How tempting the ship is as a prize: corsairs hunt rich ships, and hardly trouble a poor coaster.
// By what she is worth to take (her cargo at cost, and the purse aboard): a quarter as tempting
// at a new trader's 500 cz, in full from PRIZE_FULL.
export const PRIZE_FULL = 3000;
export function prize(S) {
  const cargo = Object.values(S.paid || {}).reduce((t, x) => t + (x || 0), 0);
  return Math.min(1, Math.max(0.15, (Math.max(0, S.purse) + cargo) / PRIZE_FULL));
}
// Corsairs want the cargo, not to sink the ship: one fight leaves a sound hull just above leaking,
// and takes at most a little more from one that is already worn that far.
export const SPARED_HULL = Wear.LEAKS_BELOW + 2;
export function battered(hull, dmg) {
  if (hull > SPARED_HULL) return Math.max(SPARED_HULL, hull - dmg);
  return Math.max(10, hull - Math.min(dmg, 5));
}
// What the corsairs leave a captain they have beaten: enough to get home and start again.
export const LEAVE_PURSE = 150;

// Called as days pass at sea. Returns an encounter, or null.
export function roll(S, days, lon, lat) {
  const P = ensurePirates(S);
  const fade = Math.exp(-days * Math.LN2 / NAME_HALF_LIFE_DAYS);
  P.notoriety *= fade;
  P.caution *= fade;
  P.cooldown = Math.max(0, P.cooldown - days);
  if (P.cooldown > 0) return null;
  const { d, where } = danger(lon, lat);
  if (!d) return null;
  // galleys think twice about a big ship, and hardly bother with a poor little coaster
  const st = S.ship?.hull ? Ships.flagStats(S) : { shy: 1, lure: 1 };
  const chance = 1 - Math.exp(-BASE_CHANCE * d * attention(S) * st.shy * (st.lure ?? 1) * prize(S) * Works.corsairDamp(S, lon, lat) * days); // your forts keep them off
  if (Math.random() > chance) return null;
  P.cooldown = COOLDOWN_DAYS;
  P.encounters++;
  const big = Math.random() < 0.25 + P.notoriety / 200; // notorious captains draw bigger galleys
  return { where, big, strength: big ? 1.35 : 1 };
}

// ---- Galleys at sea, to be hunted -----------------------------------------------------------------
// Now and then a galley puts out from the Barbary coast and cruises its waters for a few weeks.
// You see her when she is within your lookout's sight, and hear in port of any seen nearby; sail
// onto her and you choose whether to attack. Hunted, she is taken by surprise: better odds, and
// no tribute to be paid.
export const GALLEYS = {
  max: 3,
  perDay: 0.02, // the chance a day, in the most dangerous waters, that one puts to sea
  life: [20, 45], // days at sea
  nmPerDay: 40, // cruising
  sightNm: 45, // the lookout's sight, from the masthead
  contactNm: 8, // close enough to engage
  reportNm: 300, // heard of in a port this far away
  surprise: 0.12, // added to the odds when you hunt her
};
const rand = (a, b) => a + Math.random() * (b - a);

export function galleys(S) {
  const P = ensurePirates(S);
  if (!P.galleys) P.galleys = [];
  if (P.galleyId == null) P.galleyId = 1;
  return P.galleys;
}

// Days pass: galleys put to sea, cruise, and go home. `day` is the game day.
const CALM = 1e5; // a cooldown this long means calm seas (the tests set it): no galleys either
export function tickGalleys(S, days) {
  const G = galleys(S);
  const P = S.pirates;
  if (P.cooldown > CALM) return;
  for (let i = G.length - 1; i >= 0; i--) if (S.day > G[i].until) G.splice(i, 1);
  for (const z of ZONES) {
    if (G.length >= GALLEYS.max) break;
    if (Math.random() > 1 - Math.exp(-GALLEYS.perDay * z.d * days)) continue;
    for (let k = 0; k < 20; k++) { // a point at sea in the zone
      const lon = rand(z.w, z.e), lat = rand(z.s, z.n);
      if (isLand(lon, lat)) continue;
      G.push({ id: P.galleyId++, lon, lat, heading: rand(0, 360), big: Math.random() < 0.25 + P.notoriety / 200, zone: z.name, until: S.day + rand(...GALLEYS.life), seen: null });
      break;
    }
  }
  for (const g of G) {
    const z = ZONES.find((x) => x.name === g.zone) || ZONES[0];
    g.heading = (g.heading + rand(-35, 35) * Math.min(1, days) + 360) % 360;
    const nm = GALLEYS.nmPerDay * days;
    for (let tries = 0; tries < 6; tries++) {
      const r = g.heading * Math.PI / 180;
      const lat = g.lat + (nm * Math.cos(r)) / 60, lon = g.lon + (nm * Math.sin(r)) / (60 * Math.cos(g.lat * Math.PI / 180));
      if (lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n && !isLand(lon, lat)) { g.lon = lon; g.lat = lat; break; }
      g.heading = (g.heading + rand(90, 270)) % 360; // the coast, or the edge of her waters: turn away
    }
  }
}

// From the ship at sea: galleys within sight are seen (and their place noted).
export function lookout(S, lon, lat) {
  const seen = [];
  for (const g of galleys(S)) {
    const inSight = distNm(lon, lat, g.lon, g.lat) <= GALLEYS.sightNm;
    if (inSight) {
      if (!g.inSight) seen.push(g); // she comes into sight (even one you heard of in port)
      g.seen = S.day; g.seenLon = g.lon; g.seenLat = g.lat;
    }
    g.inSight = inSight;
  }
  return seen;
}

// In port: word of galleys seen within a few days' sail. Returns those newly reported.
export function portReports(S, port) {
  const out = [];
  for (const g of galleys(S)) {
    if (distNm(port.lon, port.lat, g.lon, g.lat) > GALLEYS.reportNm) continue;
    if (g.reported != null && S.day - g.reported < 5) continue;
    const fresh = g.seen == null || S.day - g.seen > 1;
    g.reported = S.day;
    if (fresh) { g.seen = S.day - 1; g.seenLon = g.lon; g.seenLat = g.lat; out.push(g); }
  }
  return out;
}

// Close enough to engage? Returns an encounter you have hunted down, or null.
export function contact(S, lon, lat) {
  if (S.pirates.cooldown > CALM) return null;
  for (const g of galleys(S)) {
    if (g.passed && S.day < g.passed) continue; // you let her go just now
    if (distNm(lon, lat, g.lon, g.lat) <= GALLEYS.contactNm) {
      return { where: g.zone, big: g.big, strength: g.big ? 1.35 : 1, hunted: true, galley: g.id };
    }
  }
  return null;
}

// After a hunt: a galley beaten (or that beat you) goes home; one let go keeps clear a while.
export function endHunt(S, enc, outcome) {
  const G = galleys(S);
  const i = G.findIndex((g) => g.id === enc.galley);
  if (i < 0) return;
  if (outcome === 'pass') { G[i].passed = S.day + 3; return; }
  G.splice(i, 1);
}

// Odds the captain is shown, from the ship's speed through the water and his record.
export function odds(S, enc, knots) {
  const P = ensurePirates(S);
  const run = clamp(0.25 + 0.11 * knots - (enc.big ? 0.1 : 0), 0.12, 0.88);
  const guns = S.ship?.hull ? Ships.flagStats(S).fight : 0;
  const fight = clamp((0.5 + 0.03 * Math.min(P.won, 6)) * (S.hull / 100 * 0.4 + 0.6) / enc.strength + guns + (enc.hunted ? GALLEYS.surprise : 0) + Callings.perk(S, 'fight'), 0.15, 0.92);
  return { run, fight };
}

export function tribute(S, enc) {
  return Math.round(Math.max(30, Math.min(600, S.purse * (enc.big ? 0.25 : 0.15))));
}

// Resolve the captain's choice. `cargo` and `paid` are the player's hold, changed in place.
export function resolve(S, enc, choice, knots) {
  const P = ensurePirates(S);
  const o = odds(S, enc, knots);
  const out = { lines: [], kind: '' };
  if (choice === 'pay') {
    const t = tribute(S, enc);
    S.purse -= t;
    Accounts.record(S, { kind: 'corsairs', amount: -t, port: null, text: `Tribute to corsairs off ${enc.where}` });
    P.caution += 3;
    P.paid++;
    out.lines.push(`You pay the corsairs ${t} cz to go in peace.`);
    out.kind = '';
    return out;
  }
  if (choice === 'run') {
    if (Math.random() < o.run) {
      P.caution += 2;
      P.fled++;
      out.lines.push('You crowd on sail and the galley falls astern. You have escaped.');
      out.kind = 'port';
      return out;
    }
    const r = fight(S, enc, o.fight * 0.85, true); // caught tired and off guard
    return { ...r, lines: ['The galley runs you down. There is no escape: you must fight.', ...r.lines] };
  }
  return fight(S, enc, o.fight);
}

// `forced`: he tried to run and was caught. Beating them off then makes less of a name than
// choosing to fight, and being beaten makes none at all.
function fight(S, enc, p, forced = false) {
  const P = ensurePirates(S);
  const lines = [];
  let kind;
  if (Math.random() < p) {
    const dmg = Math.round(5 + Math.random() * 12);
    S.hull = battered(S.hull, dmg);
    P.notoriety += forced ? 0 : 1;
    P.won++;
    lines.push(`Your crew beats off the corsairs. ${enc.big ? 'The great galley' : 'The galley'} lies alongside, her rowers beaten. Your hull is damaged (${Math.round(S.hull)}%).`);
    kind = 'discover';
    return { kind, lines, spoils: spoilsOf(enc) };
  } else {
    const guard = S.ship?.hull ? Ships.flagStats(S).guard || 0 : 0; // boarding nets keep some of it
    const share = (0.3 + Math.random() * 0.3) * (1 - guard);
    const lostGoods = [];
    let lostValue = 0;
    for (const [g, n] of Object.entries(S.cargo)) {
      const take = Math.round(n * share);
      if (take > 0) {
        lostValue += (S.paid[g] || 0) * take / n;
        S.paid[g] = n - take ? S.paid[g] * (n - take) / n : 0;
        S.cargo[g] = n - take;
        const good = GOODS.find((x) => x.id === g);
        lostGoods.push(`${take} ${take === 1 ? good.one : good.unit} of ${good.name.toLowerCase()}`);
      }
    }
    const cash = Math.round(Math.min(300, Math.max(0, S.purse - LEAVE_PURSE) * 0.2) * (1 - guard));
    const dmg = Math.round(20 + Math.random() * 15);
    S.purse -= cash;
    Accounts.record(S, { kind: 'corsairs', amount: -cash, port: null, text: `Seized by corsairs off ${enc.where}` });
    S.hull = battered(S.hull, dmg);
    P.notoriety += forced ? 0 : 2;
    P.lost++;
    lines.push(`The corsairs board you and strip the ship: ${lostGoods.length ? lostGoods.join(', ') : 'no cargo'}${cash ? ` and ${cash} cz` : ''}. The hull is badly damaged (${Math.round(S.hull)}%).`);
    const off = Lending.seaLoss(S, lostValue + cash, S.ship?.lat ?? 90);
    if (off) lines.push(`Your sea loan bears the loss: ${off.toLocaleString()} cz comes off what you owe.`);
    kind = '';
  }
  return { kind, lines };
}

// What a beaten galley has aboard: coin, a goods or two, and the crown's bounty for taking her.
function spoilsOf(enc) {
  const m = enc.strength;
  const goods = [];
  const pool = [...PLUNDER_GOODS];
  for (let n = Math.random() < 0.5 ? 1 : 2; n > 0; n--) {
    const g = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    goods.push({ good: g, qty: Math.round((4 + Math.random() * 8) * m) });
  }
  return { cash: Math.round((60 + Math.random() * 140) * m), goods, bounty: enc.big ? BOUNTY.big : BOUNTY.galley };
}

// After a win the captain chooses: plunder the galley (her coin and goods, and the crown's
// bounty, but a fearsome name), or let her limp home. `free` is the room left in his hold.
export function plunder(S, enc, spoils, take, free = Infinity) {
  const P = ensurePirates(S);
  // a privateer's name and crew get more out of a prize (callings.js)
  spoils = { ...spoils, cash: Math.round(spoils.cash * Callings.perk(S, 'plunder')), bounty: Math.round(spoils.bounty * Callings.perk(S, 'bounty')) };
  const lines = [];
  if (!take) {
    P.caution += 1;
    lines.push('You let the galley limp home. Word gets round that you are not one to hunt corsairs.');
    return { kind: 'port', lines };
  }
  P.notoriety += 3;
  P.plundered++;
  S.purse += spoils.cash;
  Accounts.record(S, { kind: 'corsairs', amount: spoils.cash, port: null, text: `Plunder from a corsair galley off ${enc.where}` });
  const took = [];
  let room = Math.max(0, free);
  for (const { good: g, qty } of spoils.goods) {
    const n = Math.min(qty, room);
    if (n <= 0) continue;
    room -= n;
    S.cargo[g] = (S.cargo[g] || 0) + n; // taken, not bought: nothing added to what was paid
    S.paid[g] = S.paid[g] || 0;
    const gd = GOODS.find((x) => x.id === g);
    took.push(`${n} ${n === 1 ? gd.one : gd.unit} of ${gd.name.toLowerCase()}`);
  }
  P.bounty += spoils.bounty;
  lines.push(`You strip the galley: ${spoils.cash} cz${took.length ? ` and ${took.join(', ')}` : ''}${took.length < spoils.goods.length ? ' (your hold could take no more)' : ''}. The crown will pay ${spoils.bounty} cz for her at any Portuguese port.`);
  return { kind: 'discover', lines };
}

// The crown's bounty for corsairs taken, paid out in a Portuguese port. Returns a message or null.
export function collectBounty(S, portId) {
  const P = ensurePirates(S);
  if (!P.bounty || !PORTUGUESE_PORTS.includes(portId)) return null;
  const amount = P.bounty;
  P.bounty = 0;
  P.bountyPaid += amount;
  S.purse += amount;
  Accounts.record(S, { kind: 'bounty', amount, port: portId, text: 'The crown\'s bounty for corsair galleys taken' });
  return { html: `The crown pays you <b>${amount.toLocaleString()} cz</b> in bounty for the corsair galleys you have taken.`, kind: 'discover', log: `Corsair bounty: ${amount} cz.` };
}

// What the shipyard asks to make your flagship sound (wear.js).
export function repairCost(S) {
  return Wear.yardQuote(S.ship?.hull, S.hull ?? 100, Ships.serviceYears(S.ship, S.day)).cost;
}

// Pay for a repair, in the yard or on a beach. The days it takes are spent by the caller.
export function repair(S, beach = false) {
  const yrs = Ships.serviceYears(S.ship, S.day);
  const q = beach ? Wear.beachQuote(S.ship?.hull, S.hull ?? 100, yrs) : Wear.yardQuote(S.ship?.hull, S.hull ?? 100, yrs);
  S.purse -= q.cost;
  Accounts.record(S, { kind: 'repairs', amount: -q.cost, text: beach ? 'Careened on the beach' : 'Hull repaired in the shipyard' });
  S.hull = Math.max(S.hull ?? 100, q.to);
  S.hullWarned = 0;
  return q;
}

export function reputationText(S) {
  const P = ensurePirates(S);
  const a = attention(S);
  const mood = a >= 1.6 ? 'Corsairs hunt for your sails.' : a >= 1.15 ? 'Corsairs know your name.' : a <= 0.6 ? 'Corsairs rarely trouble you.' : 'Corsairs pay you no special mind.';
  return `${mood} Notoriety ${Math.round(P.notoriety)}, caution ${Math.round(P.caution)}. Fights won ${P.won}, lost ${P.lost}; galleys plundered ${P.plundered || 0}; escapes ${P.fled}; tributes paid ${P.paid}.${P.bounty ? ` The crown owes you ${P.bounty} cz in bounty.` : ''}`;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

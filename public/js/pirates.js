import * as Accounts from './accounts.js';
// Barbary corsairs: the first danger at sea.
// Corsair galleys from the Moroccan coast raided shipping and the Algarve in the 1450s.
// In their waters the captain may be challenged: run, fight or pay tribute.
// How he answers shapes his name at sea: fighting builds notoriety (more corsairs come
// looking for him), avoiding fights builds caution (the seas around him grow calmer).

import { GOODS, PORTUGUESE_PORTS } from './economy.js';
import * as Ships from './ships.js';
import * as Wear from './wear.js';

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
  const chance = 1 - Math.exp(-BASE_CHANCE * d * attention(S) * st.shy * (st.lure ?? 1) * days);
  if (Math.random() > chance) return null;
  P.cooldown = COOLDOWN_DAYS;
  P.encounters++;
  const big = Math.random() < 0.25 + P.notoriety / 200; // notorious captains draw bigger galleys
  return { where, big, strength: big ? 1.35 : 1 };
}

// Odds the captain is shown, from the ship's speed through the water and his record.
export function odds(S, enc, knots) {
  const P = ensurePirates(S);
  const run = clamp(0.25 + 0.11 * knots - (enc.big ? 0.1 : 0), 0.12, 0.88);
  const guns = S.ship?.hull ? Ships.flagStats(S).fight : 0;
  const fight = clamp((0.5 + 0.03 * Math.min(P.won, 6)) * (S.hull / 100 * 0.4 + 0.6) / enc.strength + guns, 0.15, 0.9);
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
    S.hull = Math.max(10, S.hull - dmg);
    P.notoriety += forced ? 0 : 1;
    P.won++;
    lines.push(`Your crew beats off the corsairs. ${enc.big ? 'The great galley' : 'The galley'} lies alongside, her rowers beaten. Your hull is damaged (${Math.round(S.hull)}%).`);
    kind = 'discover';
    return { kind, lines, spoils: spoilsOf(enc) };
  } else {
    const guard = S.ship?.hull ? Ships.flagStats(S).guard || 0 : 0; // boarding nets keep some of it
    const share = (0.3 + Math.random() * 0.3) * (1 - guard);
    const lostGoods = [];
    for (const [g, n] of Object.entries(S.cargo)) {
      const take = Math.round(n * share);
      if (take > 0) {
        S.paid[g] = n - take ? S.paid[g] * (n - take) / n : 0;
        S.cargo[g] = n - take;
        const good = GOODS.find((x) => x.id === g);
        lostGoods.push(`${take} ${take === 1 ? good.one : good.unit} of ${good.name.toLowerCase()}`);
      }
    }
    const cash = Math.round(Math.min(300, Math.max(0, S.purse) * 0.2) * (1 - guard));
    const dmg = Math.round(20 + Math.random() * 15);
    S.purse -= cash;
    Accounts.record(S, { kind: 'corsairs', amount: -cash, port: null, text: `Seized by corsairs off ${enc.where}` });
    S.hull = Math.max(10, S.hull - dmg);
    P.notoriety += forced ? 0 : 2;
    P.lost++;
    lines.push(`The corsairs board you and strip the ship: ${lostGoods.length ? lostGoods.join(', ') : 'no cargo'}${cash ? ` and ${cash} cz` : ''}. The hull is badly damaged (${Math.round(S.hull)}%).`);
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
  return Wear.yardQuote(S.ship?.hull, S.hull ?? 100).cost;
}

// Pay for a repair, in the yard or on a beach. The days it takes are spent by the caller.
export function repair(S, beach = false) {
  const q = beach ? Wear.beachQuote(S.ship?.hull, S.hull ?? 100) : Wear.yardQuote(S.ship?.hull, S.hull ?? 100);
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

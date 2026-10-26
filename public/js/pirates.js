import * as Accounts from './accounts.js';
// Barbary corsairs: the first danger at sea.
// Corsair galleys from the Moroccan coast raided shipping and the Algarve in the 1450s.
// In their waters the captain may be challenged: run, fight or pay tribute.
// How he answers shapes his name at sea: fighting builds notoriety (more corsairs come
// looking for him), avoiding fights builds caution (the seas around him grow calmer).

import { GOODS } from './economy.js';

const ZONES = [
  // [west, east, south, north, danger]
  { w: -12.5, e: -5.2, s: 29.5, n: 36.2, d: 1.0, name: 'the Barbary coast' },
  { w: -10.2, e: -6.0, s: 36.0, n: 37.6, d: 0.6, name: 'the Algarve' },
  { w: -18.5, e: -12.8, s: 27.2, n: 29.8, d: 0.45, name: 'the Canaries' },
];

const BASE_CHANCE = 0.035; // per day in the most dangerous waters
const COOLDOWN_DAYS = 12;
export const REPAIR_PORTS = ['lisbon', 'lagos', 'funchal'];
export const REPAIR_COST_PER_POINT = 4;

export function ensurePirates(S) {
  if (!S.pirates) S.pirates = { notoriety: 0, caution: 0, cooldown: 0, encounters: 0, won: 0, lost: 0, fled: 0, paid: 0 };
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
  P.cooldown = Math.max(0, P.cooldown - days);
  if (P.cooldown > 0) return null;
  const { d, where } = danger(lon, lat);
  if (!d) return null;
  const chance = 1 - Math.exp(-BASE_CHANCE * d * attention(S) * days);
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
  const fight = clamp((0.5 + 0.03 * Math.min(P.won, 6)) * (S.hull / 100 * 0.4 + 0.6) / enc.strength, 0.15, 0.8);
  return { run, fight };
}

export function tribute(S, enc) {
  return Math.round(Math.max(60, Math.min(600, S.purse * (enc.big ? 0.3 : 0.2))));
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
    const r = fight(S, enc, o.fight * 0.85); // caught tired and off guard
    return { kind: r.kind, lines: ['The galley runs you down. There is no escape: you must fight.', ...r.lines] };
  }
  return fight(S, enc, o.fight);
}

function fight(S, enc, p) {
  const P = ensurePirates(S);
  const lines = [];
  let kind;
  if (Math.random() < p) {
    const loot = Math.round((80 + Math.random() * 170) * enc.strength);
    const dmg = Math.round(5 + Math.random() * 12);
    S.purse += loot;
    Accounts.record(S, { kind: 'corsairs', amount: loot, port: null, text: `Taken from a corsair galley off ${enc.where}` });
    S.hull = Math.max(10, S.hull - dmg);
    P.notoriety += 4;
    P.won++;
    lines.push(`Your crew beats off the corsairs and takes ${loot} cz from their galley. The hull is damaged (${S.hull}%).`);
    kind = 'discover';
  } else {
    const share = 0.3 + Math.random() * 0.3;
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
    const cash = Math.round(Math.min(300, Math.max(0, S.purse) * 0.2));
    const dmg = Math.round(20 + Math.random() * 15);
    S.purse -= cash;
    Accounts.record(S, { kind: 'corsairs', amount: -cash, port: null, text: `Seized by corsairs off ${enc.where}` });
    S.hull = Math.max(10, S.hull - dmg);
    P.notoriety += 2;
    P.lost++;
    lines.push(`The corsairs board you and strip the ship: ${lostGoods.length ? lostGoods.join(', ') : 'no cargo'}${cash ? ` and ${cash} cz` : ''}. The hull is badly damaged (${S.hull}%).`);
    kind = '';
  }
  return { kind, lines };
}

export function repairCost(S) {
  return Math.ceil((100 - (S.hull ?? 100)) * REPAIR_COST_PER_POINT);
}

export function repair(S) {
  const cost = repairCost(S);
  S.purse -= cost;
  Accounts.record(S, { kind: 'repairs', amount: -cost, text: 'Hull repaired' });
  S.hull = 100;
  return cost;
}

export function reputationText(S) {
  const P = ensurePirates(S);
  const a = attention(S);
  const mood = a >= 1.6 ? 'Corsairs hunt for your sails.' : a >= 1.15 ? 'Corsairs know your name.' : a <= 0.6 ? 'Corsairs rarely trouble you.' : 'Corsairs pay you no special mind.';
  return `${mood} Notoriety ${P.notoriety}, caution ${P.caution}. Fights won ${P.won}, lost ${P.lost}; escapes ${P.fled}; tributes paid ${P.paid}.`;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

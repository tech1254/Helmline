// Hunting the rival houses' ships (the design doc, phase 4). Their ships sail real passages on
// the chart (houses.js). Tap one to see her flag, her size, how well armed she looks and what she
// is likely carrying; order a chase and your ship steers to cut her off. Speed, wind and distance
// decide whether you catch her before she makes port. Alongside, you fight (fight.js); if she is
// yours, you choose: her cargo into your hold, the ship herself sent in with a prize crew, a
// ransom from her house, or a toll to let her go (the least infamy). Whether that is
// privateering or piracy is the law's business (law.js).
// Pure rules: no browser modules.

import * as Houses from './houses.js';
import * as Law from './law.js';
import * as War from './war.js';
import * as Fight from './fight.js';
import { HULLS } from './ships.js';
import { GOODS, MARKETS } from './economy.js';
import { PORTS, distNm } from './world.js';

export const CONTACT_NM = 10; // close enough to fight
export const CHASE_DAYS = 12; // she is given up after this long
const portById = (id) => PORTS.find((p) => p.id === id);
const goodById = (id) => GOODS.find((g) => g.id === id);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const HOLD = { caravel: 40, nau: 110, carrack: 140, merchantman: 90 };
const SHIP_SHARE = 0.4; // what a taken hull is worth as a prize, of a new one's price

// A seeded random for a vessel, so she shows the same cargo each time she is looked at.
function seeded(key) {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// What she carries: the goods cheapest where she loaded, for where she is bound.
export function cargoOf(v) {
  if (v.cargo) return v.cargo.map((c) => ({ ...c, value: Math.round(c.qty * (MARKETS[v.to]?.p[c.good]?.[0] || 20)) }));
  const rand = seeded(v.key || `${v.house}${v.from}${v.to}${v.start}`);
  const from = MARKETS[v.from]?.p, to = MARKETS[v.to]?.p;
  if (!from || !to) return [];
  const goods = Object.keys(from).filter((g) => g !== 'gold' && to[g] && goodById(g)).sort((a, b) => from[a][0] / to[a][0] - from[b][0] / to[b][0]);
  const hold = Math.round((HOLD[v.hull] || 80) * (0.5 + rand() * 0.4));
  const picks = goods.slice(0, rand() < 0.5 ? 1 : 2);
  const out = [];
  let left = hold;
  picks.forEach((g, k) => {
    const qty = k === picks.length - 1 ? left : Math.round(hold * (0.5 + rand() * 0.25));
    left -= qty;
    if (qty > 0) out.push({ good: g, qty, value: Math.round(qty * to[g][0]) });
  });
  return out;
}

// Everything the screen shows about a rival ship, and what the law says about taking her.
export function preyInfo(S, v) {
  const d = Houses.defOf(v.house);
  const crown = Law.houseCrown(S, v.house);
  const cargo = cargoOf(v);
  const shipValue = Math.round((HULLS[v.hull]?.price || 3000) * SHIP_SHARE);
  const cargoValue = cargo.reduce((t, c) => t + c.value, 0);
  return {
    key: v.key, house: v.house, houseName: d?.name || v.name, convoy: !!v.convoy, note: v.note || null, of: d?.of, colour: v.colour, crown, special: !!v.special,
    crownName: crown ? Law.CROWNS[crown].name : null, adj: crown ? Law.CROWNS[crown].adj : '',
    hull: v.hull, hullName: v.special ? (v.house === 'treasure' ? 'carrack' : 'flagship') : Fight.FOES[v.hull]?.name || HULLS[v.hull]?.name?.toLowerCase() || v.hull, armed: v.armed || 0,
    from: v.from, to: v.to, cargo, cargoValue, shipValue, value: shipValue + cargoValue,
    law: Law.lawful(S, crown, v.lat), enemy: War.atWarWith(S, crown),
  };
}
export const armedText = (n) => (n >= 2 ? 'She sails in company with an armed escort, soldiers on her decks.' : n === 1 ? 'She carries soldiers and guns: her house has been raided before.' : 'She looks lightly armed.');

// ---- The chase ------------------------------------------------------------------------------
export function startChase(S, v) {
  S.chase = { key: v.key, house: v.house, since: S.day, steered: -1 };
}
export function endChase(S) { S.chase = null; }
// The ship being chased, where she is now; null if she is gone.
export function quarry(S) {
  if (!S.chase) return null;
  return Houses.positions(S).find((v) => v.key === S.chase.key) || null;
}
// Where to steer to cut her off: where she will be when you get there (a few guesses).
export function intercept(S, v, knots) {
  let at = v;
  for (let k = 0; k < 4; k++) {
    const days = distNm(S.ship.lon, S.ship.lat, at.lon, at.lat) / Math.max(1, knots * 24);
    at = Houses.vesselAt(v, S.day + days) || at;
  }
  return [at.lon, at.lat];
}
// Each moment of a chase: { contact } when you are on her, { lost } when she is gone.
export function tickChase(S) {
  if (!S.chase) return null;
  const v = quarry(S);
  if (!v) {
    const left = Houses.vessels(S).find((x) => `${x.house}:${x.i}` === S.chase.key.split(':').slice(0, 2).join(':'));
    endChase(S);
    return { lost: left ? `She has made port at ${portById(left.from)?.name || 'her port'} before you could catch her.` : 'She is gone.' };
  }
  if (S.day - S.chase.since > CHASE_DAYS) { endChase(S); return { lost: 'You have lost her: after so many days the lookout cannot pick her out.' }; }
  if (distNm(S.ship.lon, S.ship.lat, v.lon, v.lat) <= CONTACT_NM) return { contact: v };
  return null;
}

// The fight against her (fight.js): you have run her down, so she is within gunshot.
export function engage(S, v) {
  const info = preyInfo(S, v);
  const F = Fight.start(S, 'attack', Fight.foeSide(v.hull, v.armed, `${info.houseName} ${info.hullName}`), { range: Fight.CLOSE });
  return { F, info };
}

// ---- Spoils ---------------------------------------------------------------------------------
// After she is taken. how: 'cargo' (into your hold, as much as it holds), 'prize' (sent in with a
// prize crew, to sell at a prize court or a haven), 'ransom' (her house pays now), 'toll' (a
// payment to let her go). `free` is the room in your hold. Returns { lines, cz }.
export const RANSOM = 0.4, TOLL = 0.12;
export function spoils(S, info, how, free = 0) {
  const lines = [];
  let cz = 0, taken = 0;
  const lawful = info.law.ok;
  if (how === 'cargo') {
    let room = Math.max(0, free);
    const got = [];
    for (const c of info.cargo) {
      const n = Math.min(c.qty, room);
      if (n <= 0) continue;
      room -= n;
      S.cargo[c.good] = (S.cargo[c.good] || 0) + n;
      S.paid[c.good] = S.paid[c.good] || 0; // taken, not bought
      taken += c.value * n / c.qty;
      const g = goodById(c.good);
      got.push(`${n} ${n === 1 ? g.one : g.unit} of ${g.name.toLowerCase()}`);
    }
    lines.push(got.length ? `You take ${got.join(' and ')} into your hold${taken < info.cargoValue - 1 ? '; there is no room for the rest' : ''}, and let her go.` : 'Your hold has no room: you take nothing and let her go.');
  } else if (how === 'prize') {
    const p = Law.addPrize(S, { name: `the ${info.houseName} ${info.hullName}`, hull: info.hull, value: info.value, lawful, crown: info.crown, house: info.house, war: info.enemy });
    if (!p) return spoils(S, info, 'cargo', free);
    taken = info.value;
    lines.push(`A prize crew takes ${p.name} in. ${lawful ? 'Sell her at a prize court, any port of your crown: the crown takes its fifth.' : 'No court will condemn her: she must be sold at a haven (Salé, Algiers) for what the fences pay.'}`);
  } else if (how === 'ransom') {
    cz = Math.round(info.value * RANSOM / 10) * 10;
    taken = cz * 1.2;
    lines.push(`The house of ${info.houseName} pays ${fmt(cz)} cz for its ship and cargo, through its factor. You let her go.`);
  } else {
    cz = Math.round(info.value * TOLL / 10) * 10;
    taken = cz;
    lines.push(`Her master pays you ${fmt(cz)} cz to be let go on her way.`);
  }
  S.purse += cz;
  if (info.house === 'guineafleet') War.ensureWar(S).guineaTaken = S.day; // history's prize, taken once
  else if (info.convoy) { const W = War.ensureWar(S); W.convoysTaken = { ...(W.convoysTaken || {}), [info.key]: S.day }; }
  else if (info.house === 'treasure') { const W = War.ensureWar(S); W.treasureTaken = { ...(W.treasureTaken || {}), [info.key.split(':')[1]]: S.day }; }
  else Houses.raided(S, info.house, taken, how === 'prize', info.key);
  Law.prizeTaken(S);
  const L = Law.ensureLaw(S);
  L.byHouse = L.byHouse || {};
  L.byHouse[info.house] = (L.byHouse[info.house] || 0) + 1;
  if (S.pirates) S.pirates.notoriety = (S.pirates.notoriety || 0) + (how === 'toll' ? 1 : 2);
  if (lawful) {
    if (info.enemy) { War.serve(S); lines.push('Your crown counts it as service in the war.'); }
    if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 1;
  } else {
    // taking a ship of the other crown of Iberia in the 1490s provokes the crisis of 1493 (war.js)
    if (['portugal', 'castile'].includes(info.crown) && info.crown !== (S.nation || 'portugal') && S.day >= War.WARS[0].to + 3600) War.ensureWar(S).provoked = true;
    const n = Law.piracy(S, info.crown, how === 'cargo' || how === 'prize' ? 'taken' : how);
    lines.push(`This is piracy: ${Law.CROWNS[info.crown].name} will remember it (infamy +${n}).`);
  }
  return { lines, cz, taken };
}

// After she gets away, or your boarders are beaten off: her house arms its ships, a little.
export function escaped(S, info) {
  const h = Houses.ensureHouses(S).h[info.house];
  if (h) h.raids = (h.raids || 0) + 0.5;
  if (!info.law.ok) Law.piracy(S, info.crown, 'toll', true); // she will tell of it in port
}

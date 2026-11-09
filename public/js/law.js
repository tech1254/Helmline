// The law of the sea (the design doc, phase 4): whether taking a ship is privateering or piracy.
// Corsairs are fair game for anyone. A ship of a crown you are at war with is lawful prize under
// a letter of marque; so, from 1455, is a foreign interloper on the Guinea coast to a Portuguese
// captain licensed by the crown (Romanus Pontifex gave Portugal the coast south of Bojador).
// Anything else is piracy. A lawful prize is sold openly at a prize court (any port of your own
// crown) and the crown takes its fifth; a pirate's prize is fenced at a haven (Salé, Algiers, or
// your own cove on Fuerteventura) for much less. Piracy makes you infamous with the victim's
// crown: past a point its ports are shut to you and its hunters come looking. A pardon, bought
// at that crown's court, clears your name; service in a war makes it cheaper. A pirate's crew
// sails on shares, not wages: keep the prizes coming, or they grow restless and mutiny.
// Pure rules: no browser modules.

import { PORTS, distNm } from './world.js';
import { yearOf, dayOfYear } from './ships.js';
import * as War from './war.js';
import * as Callings from './callings.js';
import * as Works from './works.js';
import * as Houses from './houses.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const portById = (id) => PORTS.find((p) => p.id === id);

export const CROWNS = {
  portugal: { id: 'portugal', name: 'Portugal', adj: 'Portuguese', court: 'lisbon' },
  castile: { id: 'castile', name: 'Castile and Aragon', adj: 'Castilian', court: 'seville' },
  england: { id: 'england', name: 'England', adj: 'English', court: 'bristol' },
  burgundy: { id: 'burgundy', name: 'Burgundy', adj: 'Flemish', court: 'bruges' },
  genoa: { id: 'genoa', name: 'Genoa', adj: 'Genoese', court: 'genoa' },
  france: { id: 'france', name: 'France', adj: 'French', court: 'marseille' },
  naples: { id: 'naples', name: 'Naples', adj: 'Neapolitan', court: 'naples' },
};
const PORT_CROWN = {
  lisbon: 'portugal', porto: 'portugal', lagos: 'portugal', funchal: 'portugal', ceuta: 'portugal', arguin: 'portugal',
  saotome: 'portugal', angra: 'portugal', flores: 'portugal', ribeiragrande: 'portugal', mina: 'portugal', portoseguro: 'portugal',
  cadiz: 'castile', sanlucar: 'castile', palos: 'castile', seville: 'castile', lanzarote: 'castile', gomera: 'castile', santacruz: 'castile',
  valencia: 'castile', santodomingo: 'castile',
  bruges: 'burgundy', antwerp: 'burgundy', bristol: 'england', galway: 'england', genoa: 'genoa', marseille: 'france', naples: 'naples', palermo: 'castile',
};
// History moves ports between crowns (the Italian Wars): Charles VIII held Naples from February
// to July 1495; Louis XII took Genoa in 1499 and held it to 1528; Naples was Spain's from 1504.
const d8 = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
export const DATED_CROWNS = [
  { pid: 'naples', crown: 'france', from: d8(1495, 2, 22), to: d8(1495, 7, 7) },
  { pid: 'genoa', crown: 'france', from: d8(1499, 10, 1), to: d8(1528, 9, 12) },
  { pid: 'naples', crown: 'castile', from: d8(1504, 1, 1), to: Infinity },
];
// A treaty may also move a port to another crown (war.js, the War of the Line): S.law.crowns.
export function crownOf(pid, S = null) {
  if (S?.law?.crowns?.[pid]) return S.law.crowns[pid];
  if (S) for (const d of DATED_CROWNS) if (d.pid === pid && S.day >= d.from && S.day < d.to) return d.crown;
  return PORT_CROWN[pid] || null;
}
// A house sails under its home city's flag: the Salvago's Genoa is French from 1499.
export const houseCrown = (S, id) => id?.startsWith('convoy_') ? id.slice(7) : (HOUSE_CROWN[id] === 'genoa' ? crownOf('genoa', S) : HOUSE_CROWN[id]) || null;
export const HAVENS = ['sale', 'algiers', 'cove'];
export const isHaven = (pid) => HAVENS.includes(pid);
export const COVE = 'cove';
// The rival houses sail under these flags (houses.js).
export const HOUSE_CROWN = { guineafleet: 'castile', treasure: 'castile', salvago: 'genoa', santangel: 'castile', gomes: 'portugal', marchionni: 'portugal', thorne: 'england', schetz: 'burgundy' };

export const FRENCH_FROM = 1521; // Jean Fleury takes Cortés's treasure off Cape St Vincent in 1523
const FRENCH_ZONES = [
  { w: -32, e: -24, s: 36, n: 40.5, d: 1, name: 'the Azores' },
  { w: -12, e: -7, s: 36, n: 44, d: 1, name: 'the Portuguese coast' },
  { w: -19, e: -12.5, s: 27, n: 30, d: 0.6, name: 'the Canaries' },
  { w: -8, e: -5.5, s: 35.5, n: 37.5, d: 0.8, name: 'Cape St Vincent' },
];
export const FRENCH_BOUNTY = 300;

export const WANTED = 6; // infamy at which a crown's hunters come looking
export const CLOSED = 12; // and its ports are shut to you
const HALF_LIFE = 3 * 365; // infamy fades by half in three years
export const PRIZE_CUT = 0.2; // the crown's fifth at a prize court
export const FENCE = 0.55; // what a haven pays for a prize
export const OWN_HAVEN = 0.8; // what your own haven (the cove, with its stockade) pays
export const MAX_PRIZES = 2; // prize crews you can spare
export const LICENCE_PRICE = 400;
export const LICENCE_STANDING = 15;
export const GUINEA_LAT = 26.1; // Cape Bojador
const GUINEA_FROM = 1455;

export function ensureLaw(S) {
  if (!S.law) S.law = { infamy: {}, prizes: [], licence: false, shares: false, dry: 0, grumbled: false, taken: 0, pirated: 0, fenced: 0, condemned: 0, pardons: 0, cooldown: 0, nextPrize: 1 };
  return S.law;
}
const mine = (S) => S.nation || 'portugal';
export const infamy = (S, crown) => ensureLaw(S).infamy[crown] || 0;
export const totalInfamy = (S) => Object.values(ensureLaw(S).infamy).reduce((t, v) => t + v, 0);
export const isPirate = (S) => totalInfamy(S) >= WANTED;

// Why you cannot trade in a port, if you cannot: at war with its crown, or wanted there.
export function closedTo(S, pid) {
  const c = crownOf(pid, S);
  if (!c) return null;
  if (War.atWarWith(S, c)) return { why: 'war', text: `${CROWNS[c].name} is at war with your crown: no merchant here will deal with you, and the harbour master will not let you work cargo.` };
  if (infamy(S, c) >= CLOSED) return { why: 'wanted', text: `Your name is known here as a pirate. No merchant of ${CROWNS[c].name} will deal with you until you have bought the king's pardon${CROWNS[c].court ? ` at ${portById(CROWNS[c].court).name}` : ''}.` };
  return null;
}

// Do you have the crown's licence for Guinea? A privateer has it; others buy it at court.
export const licensed = (S) => mine(S) === 'portugal' && (ensureLaw(S).licence || Callings.callingOf(S) === 'privateer');
export const canBuyLicence = (S) => mine(S) === 'portugal' && !licensed(S) && yearOf(S.day) >= GUINEA_FROM;

// Is taking a ship of `crown` (null for corsairs) at (lon, lat) lawful, and why.
export function lawful(S, crown, lat) {
  if (!crown) return { ok: true, text: 'Corsairs are fair game for any Christian captain.' };
  if (War.atWarWith(S, crown)) {
    if (War.hasMarque(S, crown)) return { ok: true, war: true, text: `Lawful prize under your letter of marque against ${CROWNS[crown].adj} shipping.` };
    return { ok: false, war: true, text: `Your crown is at war with ${CROWNS[crown].name}, but you carry no letter of marque: without one, this is piracy.` };
  }
  if (crown !== mine(S) && mine(S) === 'portugal' && lat < GUINEA_LAT && yearOf(S.day) >= GUINEA_FROM) {
    if (licensed(S)) return { ok: true, text: 'An interloper on the Guinea coast: lawful prize under the crown\'s licence.' };
    return { ok: false, text: 'An interloper on the Guinea coast, but you carry no licence from the crown to take her: without one, this is piracy.' };
  }
  if (crown === mine(S)) return { ok: false, own: true, text: `She sails under your own king's flag. Taking her is piracy, and ${CROWNS[crown].name} will hang you for it.` };
  return { ok: false, text: `${CROWNS[crown].name} is at peace with your crown: taking her is piracy.` };
}

// Piracy against a crown's ship: `how` is 'taken' (cargo or the ship), 'ransom' or 'toll'.
export function piracy(S, crown, how, attempt = false) {
  const L = ensureLaw(S);
  const n = how === 'toll' ? 3 : how === 'ransom' ? 5 : 8;
  L.infamy[crown] = (L.infamy[crown] || 0) + n;
  if (crown !== mine(S)) L.infamy[mine(S)] = (L.infamy[mine(S)] || 0) + Math.round(n / 3); // your own king disowns you
  else L.infamy[crown] += 2;
  if (attempt) return n; // an attack that failed: infamy, but no prize to share
  L.pirated++;
  if (!L.shares) { L.shares = true; L.dry = 0; }
  return n;
}

// ---- Prizes ------------------------------------------------------------------------------------
// A prize sent in with a prize crew: { id, name, hull, value, lawful, crown, house, war }.
export function addPrize(S, p) {
  const L = ensureLaw(S);
  if (L.prizes.length >= MAX_PRIZES) return null;
  const prize = { id: L.nextPrize++, day: S.day, ...p };
  L.prizes.push(prize);
  return prize;
}
export const canSendPrize = (S) => ensureLaw(S).prizes.length < MAX_PRIZES;

// What each prize fetches here, if it can be sold here: a prize court for lawful prizes, a haven
// for any. [{ prize, price, cut, court }]
export function prizeOffers(S, pid) {
  const L = ensureLaw(S);
  const out = [];
  const court = crownOf(pid, S) === mine(S) && !closedTo(S, pid);
  const haven = isHaven(pid);
  const ownHaven = pid === COVE && Works.has(S, COVE, 'stockade');
  for (const p of L.prizes) {
    if (court && p.lawful) out.push({ prize: p, price: Math.round(p.value * (1 - PRIZE_CUT)), cut: Math.round(p.value * PRIZE_CUT), court: true });
    else if (haven) out.push({ prize: p, price: Math.round(p.value * (ownHaven ? OWN_HAVEN : FENCE)), cut: 0, court: false });
  }
  return out;
}
export function sellPrize(S, pid, id) {
  const o = prizeOffers(S, pid).find((x) => x.prize.id === id);
  if (!o) return null;
  const L = ensureLaw(S);
  L.prizes = L.prizes.filter((p) => p.id !== id);
  S.purse += o.price;
  if (o.court) { L.condemned++; if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 2; } else L.fenced++;
  return o;
}

// ---- The crown's hunters and the enemy's warships ----------------------------------------------
// At sea in the waters of a crown that wants you, its hunters may find you; in a war, the
// enemy's warships cruise the contested waters. Returns an encounter or null.
const COOLDOWN = 15;
export function hunters(S, days, lon, lat, rand = Math.random) {
  const L = ensureLaw(S);
  L.cooldown = Math.max(0, (L.cooldown || 0) - days);
  if (L.cooldown > 0 || (S.pirates?.cooldown ?? 0) > 1e5) return null;
  // the crown's justice: near its ports
  let best = null;
  for (const [c, n] of Object.entries(L.infamy)) {
    if (n < WANTED) continue;
    const near = PORTS.some((p) => crownOf(p.id, S) === c && distNm(lon, lat, p.lon, p.lat) < 350);
    if (!near) continue;
    const chance = Math.min(0.045, 0.006 * n / WANTED);
    if (!best || chance > best.chance) best = { crown: c, chance };
  }
  if (best && rand() < 1 - Math.exp(-best.chance * days)) {
    L.cooldown = COOLDOWN;
    const armed = Math.min(2, Math.floor(infamy(S, best.crown) / 15));
    return { kind: 'hunter', crown: best.crown, armed, where: CROWNS[best.crown].name };
  }
  // a house you have raided sends an armed ship after you in its own waters
  for (const id of Houses.active(S)) {
    const h = Houses.ensureHouses(S).h[id];
    if ((h.raids || 0) < 2) continue;
    const d = Houses.defOf(id);
    if (!d.ports.some((pid) => { const p = portById(pid); return p && distNm(lon, lat, p.lon, p.lat) < 250; })) continue;
    if (rand() < 1 - Math.exp(-Math.min(0.02, 0.004 * h.raids) * days)) {
      L.cooldown = COOLDOWN;
      return { kind: 'reprisal', house: id, crown: houseCrown(S, id), armed: Math.min(2, h.armed || 1), where: d.name };
    }
  }
  // A neutral carrying for the French: the League's galleys stop and search ships bound that way.
  const carrying = (S.contracts?.active || []).find((c) => c.contraband && (S.cargo?.[c.good] || 0) > 0);
  if (carrying && War.neutralIn(S).some((w) => w.waters.some((z) => lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n)) && rand() < 1 - Math.exp(-0.02 * days)) {
    L.cooldown = COOLDOWN;
    return { kind: 'search', crown: 'castile', contract: carrying.id, good: carrying.good, where: 'the western Mediterranean' };
  }
  // French corsairs (from 1521): heavy armed ships cruising the Atlantic approaches for anyone's
  // cargo, the Portuguese most of all. Driving one off is the crown's business: it pays.
  const fz = FRENCH_ZONES.find((z) => yearOf(S.day) >= FRENCH_FROM && lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n);
  if (fz && !War.atWarWith(S, 'france') && rand() < 1 - Math.exp(-0.006 * fz.d * (mine(S) === 'portugal' && yearOf(S.day) < 1540 ? 1.5 : 1) * days)) {
    L.cooldown = COOLDOWN;
    return { kind: 'frenchcorsair', crown: null, armed: rand() < 0.4 ? 1 : 0, where: fz.name };
  }
  if (War.inWarWaters(S, lon, lat) && rand() < 1 - Math.exp(-0.012 * days)) {
    L.cooldown = COOLDOWN;
    const e = War.enemyHere(S, lon, lat);
    return { kind: 'warship', crown: e, armed: rand() < 0.3 ? 1 : 0, where: CROWNS[e].name };
  }
  return null;
}

// Taken by the crown's hunters: the prizes are lost, a fine is paid, and the name is half
// cleared (the court has had its due).
export function arrested(S, crown) {
  const L = ensureLaw(S);
  const fine = Math.round(Math.max(0, S.purse) * 0.3);
  S.purse -= fine;
  const lost = L.prizes.length;
  L.prizes = [];
  L.infamy[crown] = Math.round(infamy(S, crown) / 2);
  return { fine, lost };
}
// The prizes are retaken when you are beaten.
export function losePrizes(S) {
  const L = ensureLaw(S);
  const n = L.prizes.length;
  L.prizes = [];
  return n;
}

// ---- The pardon --------------------------------------------------------------------------------
// Bought at the crown's court: scaled by infamy, cheaper for service in its wars.
export function pardonPrice(S, crown) {
  const n = infamy(S, crown);
  if (n < 1) return null;
  const served = crown === mine(S) ? War.service(S) : 0;
  return Math.max(200, Math.round(n * 150 * (1 - Math.min(0.6, served * 0.08)) / 50) * 50);
}
// Pardons that can be bought in this port (its crown's court).
export function pardonsHere(S, pid) {
  return Object.keys(ensureLaw(S).infamy).filter((c) => CROWNS[c]?.court === pid && infamy(S, c) >= 1).map((c) => ({ crown: c, price: pardonPrice(S, c) }));
}
export function buyPardon(S, crown) {
  const price = pardonPrice(S, crown);
  if (price == null || S.purse < price) return null;
  const L = ensureLaw(S);
  S.purse -= price;
  L.infamy[crown] = 0;
  L.pardons++;
  if (totalInfamy(S) < 1) { L.shares = false; L.dry = 0; }
  return price;
}

export function buyLicence(S) {
  if (!canBuyLicence(S) || S.purse < LICENCE_PRICE || (S.contracts?.standing ?? 0) < LICENCE_STANDING) return false;
  S.purse -= LICENCE_PRICE;
  ensureLaw(S).licence = true;
  return true;
}

// ---- Days pass ---------------------------------------------------------------------------------
// Infamy fades; a pirate crew on shares counts the days at sea without a prize. Returns messages,
// and { mutiny } when the crew rises.
export const GRUMBLE_DAYS = 80, MUTINY_DAYS = 140;
export function tick(S, days, atSea) {
  const L = ensureLaw(S);
  const fade = Math.exp(-days * Math.LN2 / HALF_LIFE);
  for (const c of Object.keys(L.infamy)) { L.infamy[c] *= fade; if (L.infamy[c] < 0.3) delete L.infamy[c]; }
  const msgs = [];
  if (L.shares && atSea) {
    L.dry += days;
    if (L.dry >= GRUMBLE_DAYS && !L.grumbled) {
      L.grumbled = true;
      msgs.push({ html: `Your crew sail on shares, and there has been no prize for ${Math.round(L.dry)} days at sea. <b>They are growing restless.</b> Take a ship soon, or pay them something.`, kind: 'danger', log: 'The crew grow restless for want of a prize.' });
    }
    if (L.dry >= MUTINY_DAYS) msgs.push({ html: '', mutiny: true });
  }
  return msgs;
}
// A prize keeps a crew on shares happy; so does a run ashore at a haven.
export function prizeTaken(S) { const L = ensureLaw(S); L.dry = 0; L.grumbled = false; L.taken++; }
export function ashore(S, pid) {
  const L = ensureLaw(S);
  if (!L.shares || !isHaven(pid)) return;
  L.dry = pid === COVE && Works.has(S, COVE, 'stockade') ? 0 : L.dry / 2;
  if (L.dry < GRUMBLE_DAYS) L.grumbled = false;
}
// What the mutineers demand.
export const mutinyDemand = (S) => Math.max(150, Math.round(Math.max(0, S.purse) * 0.15 / 10) * 10);
export function payMutineers(S) {
  const L = ensureLaw(S);
  const d = Math.min(mutinyDemand(S), Math.max(0, S.purse));
  S.purse -= d;
  L.dry = 40; L.grumbled = false;
  return d;
}
export function refuseMutineers(S) {
  const L = ensureLaw(S);
  L.dry = 0; L.grumbled = false;
  L.walkOff = true; // half of them walk off at the next port
}

// For the Houses tab: your name with each crown.
export function nameText(S) {
  const L = ensureLaw(S);
  const parts = Object.entries(L.infamy).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${CROWNS[c].name} ${Math.round(n)}${n >= CLOSED ? ' (ports shut)' : n >= WANTED ? ' (wanted)' : ''}`);
  return parts.length ? `Infamy: ${parts.join(', ')}.` : 'No crown holds anything against you.';
}

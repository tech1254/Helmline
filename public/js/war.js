// Wars between the crowns (the design doc, phase 4). History supplies them: the War of the
// Castilian Succession, 1475-1479, was a naval war over the Guinea trade, fought from Mina to the
// Canaries, and the Treaty of Alcaçovas ended it: the Canaries to Castile, Guinea and the Atlantic
// islands to Portugal. In a war the enemy's ports are shut to you, the crown grants letters of
// marque against the enemy's shipping, enemy warships cruise the contested waters, and service
// in the war is rewarded at the peace (and buys a pardon cheaper: law.js).
// Pure rules: no browser modules.

import { dayOfYear, yearOf } from './ships.js';
import { PORTS } from './world.js';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export const WARS = [
  {
    id: 'succession', name: 'the War of the Castilian Succession', sides: ['portugal', 'castile'],
    from: date(1475, 5, 10), to: date(1479, 9, 4), peace: 'the Treaty of Alcaçovas',
    // where the enemy's warships cruise: the Guinea coast, the Canaries, the Algarve and Andalusia
    waters: [{ w: -26, e: 2, s: 0, n: 26 }, { w: -19, e: -12.5, s: 27, n: 30 }, { w: -10.5, e: -5.5, s: 35.5, n: 38 }],
    start: {
      portugal: 'King Afonso has married his niece Joanna and claimed the crown of Castile. Isabella\'s Castile is the enemy: its ports are shut to you, and the king grants letters of marque against Castilian shipping, from the Guinea coast to the Canaries.',
      castile: 'King Afonso of Portugal has invaded Castile to claim its crown for his niece Joanna. Portugal is the enemy: its ports are shut to you, and Queen Isabella grants letters of marque against Portuguese shipping, and licences to trade in Guinea in spite of the Portuguese.',
    },
    end: {
      portugal: 'Peace at Alcaçovas. Castile gives up all claim to Guinea, the Gold Coast, Madeira, the Azores and Cape Verde; Portugal gives up the Canaries. The Castilian ports open to you again.',
      castile: 'Peace at Alcaçovas. Castile keeps the Canaries; Portugal keeps Guinea, the Gold Coast and the Atlantic islands, and Castilian ships are barred from them. The Portuguese ports open to you again.',
    },
  },
];
export const SERVICE_REWARD = 500; // cz the crown pays at the peace, for each action in its service
export const SERVICE_CAP = 12;

export function ensureWar(S) {
  if (!S.war) S.war = { told: {}, service: {}, marque: null, offer: null, peace: {} };
  return S.war;
}

// The war going on today, if any.
export function current(S) {
  for (const w of WARS) if (S.day >= w.from && S.day < w.to) return w;
  return null;
}
const mine = (S) => S.nation || 'portugal';
export function enemyOf(S) {
  const w = current(S);
  if (!w || !w.sides.includes(mine(S))) return null;
  return w.sides.find((x) => x !== mine(S));
}
export const atWarWith = (S, crown) => !!crown && enemyOf(S) === crown;
export const hasMarque = (S) => { const w = current(S); return !!(w && ensureWar(S).marque === w.id); };

// In the waters the enemy's warships cruise?
export function inWarWaters(S, lon, lat) {
  const w = current(S);
  if (!w || !enemyOf(S)) return false;
  return w.waters.some((z) => lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n);
}

// Service in the current war: fights won and prizes taken against the enemy.
export function serve(S, n = 1) {
  const w = current(S);
  if (!w) return 0;
  const W = ensureWar(S);
  W.service[w.id] = (W.service[w.id] || 0) + n;
  return W.service[w.id];
}
export const service = (S) => Object.values(ensureWar(S).service).reduce((t, v) => t + v, 0);

// Days pass: a war begins (and the crown offers a letter of marque) or ends at the peace,
// with the crown's thanks for service. Returns messages; S.war.offer is set when a letter of
// marque is offered, for the screen to ask.
export function tick(S) {
  const W = ensureWar(S);
  const msgs = [];
  for (const w of WARS) {
    if (!w.sides.includes(mine(S))) continue;
    if (S.day >= w.from && !W.told[w.id]) {
      W.told[w.id] = true;
      if (S.day < w.to) {
        W.offer = w.id;
        msgs.push({ html: `<b>War!</b> ${w.start[mine(S)]}`, kind: 'danger', log: `War: ${w.name} begins.`, war: w.id });
      }
    }
    if (S.day >= w.to && !W.peace[w.id]) {
      W.peace[w.id] = true;
      if (W.marque === w.id) W.marque = null;
      if (W.offer === w.id) W.offer = null;
      if (!W.told[w.id]) { W.told[w.id] = true; continue; } // a game begun after it
      const n = Math.min(SERVICE_CAP, W.service[w.id] || 0);
      let thanks = '', reward = 0;
      if (n > 0) {
        const cz = n * SERVICE_REWARD;
        S.purse += cz;
        if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 2 * n;
        thanks = ` The crown remembers your part in the war: <b>${fmt(cz)} cz</b> and more standing at court.`;
        reward = cz;
      }
      msgs.push({ html: `<b>Peace.</b> ${w.end[mine(S)]}${thanks}`, kind: 'discover', log: `Peace: ${w.peace}.${n ? ` Rewarded for service (${n}).` : ''}`, peace: w.id, reward });
    }
  }
  return msgs;
}

// Take (or decline) the letter of marque on offer.
export function takeMarque(S, yes) {
  const W = ensureWar(S);
  const w = current(S);
  if (w && W.offer === w.id && yes) W.marque = w.id;
  W.offer = null;
  return W.marque;
}

// The enemy's ports, shut in wartime.
export function enemyPorts(S, crownOf) {
  const e = enemyOf(S);
  return e ? PORTS.filter((p) => crownOf(p.id) === e).map((p) => p.id) : [];
}

// The years to 1475, for the time skip (timeskip.js).
export const FIRST_WAR = WARS[0];
export const warYear = () => yearOf(FIRST_WAR.from);

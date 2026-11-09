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
// The War of the Line (history bent): in 1493 João II claimed Columbus's discoveries under the
// Treaty of Alcaçovas and fitted out a fleet; the Treaty of Tordesillas settled it without a war.
// Here it is a war if Portugal charted the Indies in the west first, or if you have taken ships
// of the other crown since 1490; otherwise the crisis passes. Service in it moves the Line.
WARS.push({
  id: 'line', name: 'the War of the Line', sides: ['portugal', 'castile'],
  from: date(1493, 6, 1), to: date(1495, 6, 7), peace: 'the Treaty of Tordesillas',
  if: (S) => {
    const f = S.race?.firsts?.santodomingo?.by;
    return (f === 'you' && (S.nation || 'portugal') === 'portugal') || f === 'gomes' || f === 'marchionni' || !!S.war?.provoked;
  },
  averted: {
    portugal: 'King João claims the Indies of Columbus under the Treaty of Alcaçovas, and Almeida\'s fleet fits out in Lisbon; but the envoys talk instead of the guns. There will be no war: the crowns will divide the unknown world by treaty.',
    castile: 'King João of Portugal claims the Admiral\'s Indies for himself and fits out a fleet; but the envoys talk instead of the guns. There will be no war: the crowns will divide the unknown world by treaty.',
  },
  waters: [{ w: -26, e: 2, s: 0, n: 26 }, { w: -19, e: -12.5, s: 27, n: 30 }, { w: -10.5, e: -5.5, s: 35.5, n: 38 }, { w: -75, e: -26, s: 10, n: 30 }],
  start: {
    portugal: 'The Indies in the west are Portugal\'s by the Treaty of Alcaçovas, King João says, and Castile will not give them up. Castile is the enemy again: its ports are shut to you, and the king grants letters of marque against Castilian shipping, from the Canaries to the islands in the west.',
    castile: 'King João claims the Indies in the west under the Treaty of Alcaçovas and sends Almeida\'s fleet to take them. Portugal is the enemy again: its ports are shut to you, and the Catholic Monarchs grant letters of marque against Portuguese shipping.',
  },
  end: {
    portugal: 'Peace at Tordesillas: the crowns divide the unknown world along a line from pole to pole.',
    castile: 'Peace at Tordesillas: the crowns divide the unknown world along a line from pole to pole.',
  },
  // Where the Line is drawn, by your service: the ports that change crown.
  settle(S, n) {
    const me = S.nation || 'portugal';
    const set = (pid, c) => { S.law = S.law || {}; S.law.crowns = { ...(S.law.crowns || {}), [pid]: c }; };
    if (me === 'portugal' && n >= 10) { set('santodomingo', 'portugal'); return 'The Line is drawn far to the west, beyond the islands of the Indies: <b>Santo Domingo is a Portuguese port</b>, and the land in the south-west is Portugal\'s when it is found.'; }
    if (me === 'portugal' && n >= 5) { if (S.discovered) S.discovered.portoseguro = true; return 'The Line is drawn 500 leagues west of the Cape Verdes: the great land in the south-west is Portugal\'s, and the crown sends you its charts: <b>Porto Seguro</b> is on your chart.'; }
    if (me === 'castile' && n >= 5) { set('portoseguro', 'castile'); return 'The Line is drawn only 250 leagues west of the Cape Verdes: the land in the south-west, when it is found, is Castile\'s. <b>Porto Seguro will be a Castilian port.</b>'; }
    return 'The Line is drawn 370 leagues west of the Cape Verde islands, as the envoys wanted.';
  },
});

// The conquest of Tenerife, 1494-96: Castile's last campaign in the Canaries, fought on land. For
// the sea game it is the crown's supply contracts out of Seville, Sanlúcar and Cádiz, and wheat
// dear at La Gomera; the news follows the campaign. Service is rewarded with land on the island.
export const CAMPAIGNS = [{
  id: 'tenerife', crown: 'castile', name: 'the conquest of Tenerife',
  from: date(1494, 4, 1), to: date(1496, 9, 29),
  ports: ['seville', 'sanlucar', 'cadiz'], to_port: 'gomera', goods: ['wheat', 'wine', 'cloth'],
  effects: { gomera: { wheat: 1.8, wine: 1.35, cloth: 1.3 }, lanzarote: { wheat: 1.3 } },
  beats: [
    { day: date(1494, 4, 1), text: 'Alonso Fernández de Lugo raises an army to conquer Tenerife, the last of the Canaries still free, for the Catholic Monarchs. The crown wants wheat, wine and cloth carried to La Gomera for his men.' },
    { day: date(1494, 6, 1), text: 'Disaster in the ravine of Acentejo: the Guanches of Tenerife have cut Lugo\'s army to pieces. He is back at La Gomera, raising another. Wheat is dearer than ever there.' },
    { day: date(1494, 11, 20), text: 'Lugo has beaten the Guanches on the plain of Aguere, on Tenerife. The campaign goes on.' },
    { day: date(1496, 9, 29), text: 'The last kings of Tenerife have surrendered to Lugo. The Canaries are all Castile\'s, and a town is laid out at Santa Cruz.' },
  ],
}];
export const activeCampaign = (S) => CAMPAIGNS.find((c) => S.day >= c.from && S.day < c.to) || null;
// Price effects of a campaign on (events.js folds them in).
export function campaignEffects(S) {
  const c = activeCampaign(S);
  return c ? c.effects : null;
}
// A campaign contract delivered.
export function campaignServe(S, id) {
  const W = ensureWar(S);
  W.campaign = W.campaign || {};
  W.campaign[id] = (W.campaign[id] || 0) + 1;
}
function campaignTick(S, msgs) {
  const W = ensureWar(S);
  W.beats = W.beats || {};
  for (const c of CAMPAIGNS) c.beats.forEach((b, i) => {
    const k = `${c.id}:${i}`;
    if (S.day < b.day || W.beats[k]) return;
    W.beats[k] = true;
    if (S.day - b.day > 60) return; // long past (a game begun after it)
    msgs.push({ html: `<b>News:</b> ${b.text}`, kind: i === 1 ? 'danger' : 'discover', log: b.text, campaign: c.id });
    if (i === c.beats.length - 1 && (W.campaign?.[c.id] || 0) >= 2 && mine(S) === c.crown) {
      const n = W.campaign[c.id];
      const cz = 300 * Math.min(n, 8);
      S.purse += cz;
      if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 2 * Math.min(n, 8);
      W.grantLand = true; // a trading post on Tenerife, granted (timeskip, works)
      msgs.push({ html: `For your ${n} cargoes to the army the crown pays <b>${fmt(cz)} cz</b> and grants your house land on Tenerife: <b>a trading post at Santa Cruz</b>, yours without cost.`, kind: 'discover', log: `Rewarded for Tenerife (${n} cargoes): ${cz} cz and a post at Santa Cruz.`, reward: cz, grantPost: 'santacruz' });
    }
  });
}

export const SERVICE_REWARD = 500; // cz the crown pays at the peace, for each action in its service
export const SERVICE_CAP = 12;

export function ensureWar(S) {
  if (!S.war) S.war = { told: {}, service: {}, marque: null, offer: null, peace: {} };
  return S.war;
}

// The war going on today, if any.
export function current(S) {
  for (const w of WARS) if (S.day >= w.from && S.day < w.to && !S.war?.averted?.[w.id]) return w;
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
      if (w.if && !w.if(S)) { // the crisis passes
        W.averted = { ...(W.averted || {}), [w.id]: true }; W.peace[w.id] = true;
        if (S.day < w.to) msgs.push({ html: `<b>News:</b> ${w.averted[mine(S)]}`, kind: 'discover', log: `${w.name}: averted.` });
        continue;
      }
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
      const terms = w.settle ? ` ${w.settle(S, W.service[w.id] || 0)}` : '';
      msgs.push({ html: `<b>Peace.</b> ${w.end[mine(S)]}${terms}${thanks}`, kind: 'discover', log: `Peace: ${w.peace}.${n ? ` Rewarded for service (${n}).` : ''}`, peace: w.id, reward });
    }
  }
  campaignTick(S, msgs);
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

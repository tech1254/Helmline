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
  reward: { per: 300, cap: 8, min: 2, post: 'santacruz', text: (n, cz) => `For your ${n} cargoes to the army the crown pays <b>${fmt(cz)} cz</b> and grants your house land on Tenerife: <b>a trading post at Santa Cruz</b>, yours without cost.` },
}];

// The Italian Wars: France against Aragon and Castile (and the Aragonese kings of Naples), in
// Italy and at sea in the western Mediterranean. Castile fights; Portugal stays neutral and sells
// to both sides, at the risk of having cargo for the enemy seized by either side's warships.
const ITALY_WATERS = [{ w: -1.5, e: 16.6, s: 36.6, n: 44.6 }];
const italyWar = (id, from, to, peace, start, end) => ({
  id, name: id === 'italy1' ? 'the war for Naples' : 'the second war for Naples', sides: [['france'], ['castile', 'naples']],
  from, to, peace, waters: ITALY_WATERS, start: { castile: start }, end: { castile: end },
});
WARS.push(
  italyWar('italy1', date(1495, 3, 31), date(1497, 11, 24), 'the truce of 1497',
    'King Charles VIII of France has marched the length of Italy and taken Naples from its Aragonese king. Ferdinand of Aragon has joined the Holy League against him: France is the enemy. Its ports are shut to you, French galleys cruise the western Mediterranean, and the Catholic Monarchs grant letters of marque against French shipping.',
    'A truce with France. Naples is back in Aragonese hands; Marseille opens to you again.'),
  italyWar('italy2', date(1502, 7, 1), date(1504, 3, 31), 'the Treaty of Lyon',
    'France and Spain agreed to share the Kingdom of Naples, and have fallen out over the share. It is war with France again, in Italy and at sea, and Genoa, French since 1499, is the enemy\'s port.',
    'Peace at Lyon: the Kingdom of Naples is Spain\'s. The French ports open to you again.'),
);
const leagueBeats1 = [
  { day: date(1494, 9, 3), text: 'King Charles VIII of France has crossed the Alps with an army and a train of bronze cannon, to claim the Kingdom of Naples.' },
  { day: date(1495, 2, 22), text: 'Charles VIII has entered Naples without a fight; its Aragonese king has fled to Sicily. Wheat is dear all down the Tyrrhenian coast.' },
  { day: date(1495, 7, 7), text: 'The French have fought their way home at Fornovo, and King Ferrandino is back in Naples. Gonzalo de Córdoba lands in Calabria with a Spanish army.' },
  { day: date(1496, 7, 20), text: 'The last French army in the kingdom has surrendered at Atella.' },
  { day: date(1497, 11, 24), text: 'France and Spain agree a truce. The war for Naples is over, for now.' },
];
const leagueBeats2 = [
  { day: date(1499, 10, 1), text: 'King Louis XII of France has taken Milan, and Genoa has given itself to him: the Genoese, and the Salvago with them, sail under French protection now.' },
  { day: date(1502, 7, 1), text: 'France and Spain are at war over the Kingdom of Naples they agreed to share.' },
  { day: date(1503, 4, 28), text: 'Gonzalo de Córdoba has routed the French at Cerignola: Spanish arquebuses against French horse. He is in Naples.' },
  { day: date(1503, 12, 29), text: 'Gonzalo has crossed the Garigliano in the winter rain and broken the French army.' },
  { day: date(1504, 1, 1), text: 'Gaeta has surrendered: the Kingdom of Naples is Spain\'s.' },
];
const neutral = (S) => mine(S) === 'portugal';
CAMPAIGNS.push(
  { id: 'league1', name: 'the Holy League\'s army in Naples', from: date(1495, 3, 31), to: date(1497, 11, 24),
    for: (S) => true, patron: 'The League\'s purveyors', title: 'For the League\'s army in Naples',
    ports: ['palermo', 'valencia', 'cadiz', 'lisbon'], to_port: 'naples', goods: ['wheat', 'wine', 'cloth'],
    effects: { naples: { wheat: 1.6, wine: 1.2, cloth: 1.3 }, genoa: { wheat: 1.3 }, marseille: { wheat: 1.4 }, valencia: { wheat: 1.2 } },
    beats: leagueBeats1, reward: { per: 250, cap: 8, min: 2, crown: 'castile', text: (n, cz) => `The Catholic Monarchs thank you for ${n} cargoes to the army in Naples: <b>${fmt(cz)} cz</b>.` } },
  { id: 'france1', name: 'the French king\'s army', from: date(1495, 3, 31), to: date(1497, 11, 24),
    for: neutral, patron: 'The French king\'s victuallers', title: 'For the French king\'s galleys', contraband: true,
    ports: ['lisbon', 'porto', 'lagos'], to_port: 'marseille', goods: ['wheat', 'cloth', 'salt'], effects: {}, beats: [] },
  { id: 'league2', name: 'Gonzalo de Córdoba\'s army', from: date(1502, 7, 1), to: date(1504, 1, 1),
    for: (S) => true, patron: 'Gonzalo de Córdoba\'s purveyors', title: 'For the Spanish army in Naples',
    ports: ['palermo', 'valencia', 'cadiz', 'lisbon'], to_port: 'naples', goods: ['wheat', 'wine', 'cloth'],
    effects: { naples: { wheat: 1.7, wine: 1.25, cloth: 1.3 }, genoa: { wheat: 1.35 }, marseille: { wheat: 1.4 } },
    beats: leagueBeats2, reward: { per: 250, cap: 8, min: 2, crown: 'castile', text: (n, cz) => `The crown thanks you for ${n} cargoes to Gonzalo's army: <b>${fmt(cz)} cz</b>.` } },
  { id: 'france2', name: 'the French army in Naples', from: date(1502, 7, 1), to: date(1504, 1, 1),
    for: neutral, patron: 'The French king\'s victuallers', title: 'For the French at Genoa', contraband: true,
    ports: ['lisbon', 'porto', 'lagos'], to_port: 'genoa', goods: ['wheat', 'cloth', 'salt'], effects: {}, beats: [] },
);
// The campaigns on today, and the ones you may take contracts for.
export const activeCampaigns = (S) => CAMPAIGNS.filter((c) => S.day >= c.from && S.day < c.to);
export const activeCampaign = (S) => activeCampaigns(S)[0] || null;
export const campaignFor = (S, c) => (c.for ? c.for(S) : mine(S) === c.crown);
// Price effects of the campaigns on (events.js folds them in).
export function campaignEffects(S) {
  const out = {};
  for (const c of activeCampaigns(S)) for (const [port, goods] of Object.entries(c.effects || {})) {
    out[port] = out[port] || {};
    for (const [g, m] of Object.entries(goods)) out[port][g] = (out[port][g] || 1) * m;
  }
  return out;
}
// A campaign contract delivered: counted, and service if your crown is at war.
export function campaignServe(S, id) {
  const W = ensureWar(S);
  W.campaign = W.campaign || {};
  W.campaign[id] = (W.campaign[id] || 0) + 1;
  if (id.startsWith('league') && atWarWith(S, 'france')) serve(S);
}
function campaignTick(S, msgs) {
  const W = ensureWar(S);
  W.beats = W.beats || {};
  for (const c of CAMPAIGNS) c.beats.forEach((b, i) => {
    const k = `${c.id}:${i}`;
    if (S.day < b.day || W.beats[k]) return;
    W.beats[k] = true;
    if (S.day - b.day > 60) return; // long past (a game begun after it)
    msgs.push({ html: `<b>News:</b> ${b.text}`, kind: /Disaster|taken Naples|entered Naples/.test(b.text) ? 'danger' : 'discover', log: b.text, campaign: c.id });
    const R = c.reward;
    const n = W.campaign?.[c.id] || 0;
    if (i === c.beats.length - 1 && R && n >= R.min && mine(S) === (R.crown || c.crown)) {
      const cz = R.per * Math.min(n, R.cap);
      S.purse += cz;
      if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 2 * Math.min(n, R.cap);
      msgs.push({ html: R.text(n, cz), kind: 'discover', log: `Rewarded for ${c.name} (${n} cargoes): ${cz} cz.`, reward: cz, grantPost: R.post || null });
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
// A war's sides are crowns, or lists of crowns (allies): which side a crown is on, or -1.
const sideOf = (w, c) => w.sides.findIndex((x) => (Array.isArray(x) ? x.includes(c) : x === c));
const others = (w, c) => { const i = sideOf(w, c); if (i < 0) return []; const o = w.sides[1 - i]; return Array.isArray(o) ? o : [o]; };
const mine = (S) => S.nation || 'portugal';
const live = (S, w) => S.day >= w.from && S.day < w.to && !S.war?.averted?.[w.id];
// Every war going on today; the ones your crown is in.
export const enemyIn = (S, w) => others(w, mine(S))[0] || null;
export const activeWars = (S) => WARS.filter((w) => live(S, w));
export const yourWars = (S) => activeWars(S).filter((w) => sideOf(w, mine(S)) >= 0);
// The war your crown is in today, if any (the first, if two overlap).
export function current(S) {
  return yourWars(S)[0] || null;
}
export function enemyOf(S) {
  const w = current(S);
  return w ? others(w, mine(S))[0] : null;
}
export const atWarWith = (S, crown) => !!crown && yourWars(S).some((w) => others(w, mine(S)).includes(crown));
const marques = (S) => { const W = ensureWar(S); W.marques = W.marques || {}; if (W.marque) W.marques[W.marque] = true; return W.marques; };
// A letter of marque against this crown's shipping (or against any enemy, without a crown).
export const hasMarque = (S, crown = null) => yourWars(S).some((w) => marques(S)[w.id] && (!crown || others(w, mine(S)).includes(crown)));
// Neutral while others fight (the Italian Wars, for Portugal): wars on, none of them yours.
export const neutralIn = (S) => activeWars(S).filter((w) => sideOf(w, mine(S)) < 0);

// In the waters the enemy's warships cruise?
export function inWarWaters(S, lon, lat) {
  return yourWars(S).some((w) => w.waters.some((z) => lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n));
}
// Which enemy cruises these waters.
export function enemyHere(S, lon, lat) {
  const w = yourWars(S).find((x) => x.waters.some((z) => lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n));
  return w ? others(w, mine(S))[0] : null;
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
    if (sideOf(w, mine(S)) < 0) continue;
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
      if (W.marques) delete W.marques[w.id];
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
  if (W.offer && yes && yourWars(S).some((w) => w.id === W.offer)) { W.marque = W.offer; marques(S)[W.offer] = true; }
  W.offer = null;
  return W.marque;
}

// The enemy's ports, shut in wartime.
export function enemyPorts(S, crownOf) {
  return PORTS.filter((p) => atWarWith(S, crownOf(p.id, S))).map((p) => p.id);
}

// The years to 1475, for the time skip (timeskip.js).
export const FIRST_WAR = WARS[0];
export const warYear = () => yearOf(FIRST_WAR.from);

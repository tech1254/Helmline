// Market events: harvests, plagues, blockades and gluts that move prices or close a port
// for a few weeks. News travels by ship: you hear of an event when you are in a port,
// once enough days have passed for word to reach it.

import { PORTS, distNm } from './world.js';

const CHANCE_PER_DAY = 1 / 24; // about one new event every three to four weeks
const MAX_ACTIVE = 2;
const NEWS_NM_PER_DAY = 110; // how fast word travels between ports
const COOLDOWN_DAYS = 90; // the same kind of event will not repeat sooner than this

// effects: { port: { good: price multiplier } }. close: ports that will not trade.
export const TEMPLATES = [
  { id: 'cane_blight', port: 'funchal', days: [50, 80], title: 'Cane blight in Madeira',
    text: 'Rot has struck the cane fields. Sugar is scarce and dear in Funchal.',
    effects: { funchal: { sugar: 2.0 } } },
  { id: 'algarve_vintage', port: 'lagos', days: [40, 70], title: 'A bumper vintage in the Algarve',
    text: 'The vineyards have outdone themselves. Wine is cheap in Lagos and Lisbon.',
    effects: { lagos: { wine: 0.55 }, lisbon: { wine: 0.75 } } },
  { id: 'lagos_plague', port: 'lagos', days: [25, 45], title: 'Plague in Lagos',
    text: 'The town is under quarantine. No ship may trade there until it lifts.',
    close: ['lagos'] },
  { id: 'great_caravan', port: 'arguin', days: [30, 50], title: 'A great caravan reaches Arguin',
    text: 'Camels from the Sahara have brought gold in plenty. It is cheaper than usual at Arguin.',
    effects: { arguin: { gold: 0.65 } } },
  { id: 'venetian_pepper', port: 'lisbon', days: [40, 60], title: 'Venetian pepper floods Lisbon',
    text: 'A Venetian convoy has sold its pepper cheap. Prices in Lisbon and Lagos have fallen.',
    effects: { lisbon: { pepper: 0.6 }, lagos: { pepper: 0.7 } } },
  { id: 'royal_wedding', port: 'lisbon', days: [30, 50], title: 'A royal wedding in Lisbon',
    text: 'The court is buying fine cloth, gold and sugar for the celebrations.',
    effects: { lisbon: { cloth: 1.45, gold: 1.3, sugar: 1.25 } } },
  { id: 'castile_blockade', port: 'lanzarote', days: [30, 60], title: 'Castilian ships blockade Lanzarote',
    text: 'Castile presses its claim to the Canaries. Lanzarote is closed to Portuguese trade.',
    close: ['lanzarote'] },
  { id: 'river_war', port: 'gambia', days: [40, 70], title: 'War upriver on the Gambia',
    text: 'Fighting inland has cut the trade routes. Ivory, pepper and gold are scarce at the river mouth.',
    effects: { gambia: { ivory: 1.7, pepper: 1.5, gold: 1.4 } } },
  { id: 'orchil_harvest', port: 'lanzarote', days: [30, 50], title: 'A rich orchil harvest',
    text: 'The islanders have gathered more lichen than they can sell. Dye is cheap on Lanzarote.',
    effects: { lanzarote: { dye: 0.6 } } },
  { id: 'akan_gold', port: 'mina', days: [30, 50], title: 'Gold floods the Mina coast',
    text: 'The Akan have brought down a season of gold dust. It is cheaper than usual on the Costa da Mina.',
    effects: { mina: { gold: 0.7 } } },
  { id: 'grain_fever', port: 'cestos', days: [20, 40], title: 'Fever on the Grain Coast',
    text: 'Sickness has struck the coast villages. No one will come out to trade until it passes.',
    close: ['cestos'] },
  { id: 'arguin_fair', port: 'arguin', days: [30, 50], title: 'Traders crowd Arguin',
    text: 'Desert merchants have come down to the coast in numbers. They pay well for cloth and wine.',
    effects: { arguin: { cloth: 1.5, wine: 1.3 } } },
  { id: 'ceuta_siege', port: 'ceuta', days: [30, 60], title: 'The Moors besiege Ceuta',
    text: 'An army from Fez is camped before the walls. The garrison will pay almost anything for wheat and wine.',
    effects: { ceuta: { wheat: 2.0, wine: 1.5 } } },
  { id: 'safi_harvest', port: 'safi', days: [40, 70], title: 'A great harvest in the Doukkala',
    text: 'The plains behind Safi have brought in a huge crop. Wheat is cheap in Safi.',
    effects: { safi: { wheat: 0.55 } } },
  { id: 'cadiz_fleet', port: 'cadiz', days: [30, 50], title: 'A Genoese fleet at Cádiz',
    text: 'Genoese merchants are buying for the Mediterranean. Gold, ivory and sugar fetch more than ever in Cádiz.',
    effects: { cadiz: { gold: 1.25, ivory: 1.3, sugar: 1.3 } } },
  { id: 'douro_flood', port: 'porto', days: [25, 45], title: 'The Douro in flood',
    text: 'The river has burst its banks and the quays of Porto are under water. No ship can trade there until it falls.',
    close: ['porto'] },
];

const T = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
const portName = (id) => PORTS.find((p) => p.id === id).name;

export function ensureEvents(S) {
  if (!S.events) S.events = { active: [], past: [], nextId: 1, clock: 0 };
  return S.events;
}

export function template(e) {
  return T[e.tid];
}

// Advance time. Starts and ends events; returns messages for the game to show.
export function tick(S, days) {
  const E = ensureEvents(S);
  const msgs = [];
  for (const e of [...E.active]) {
    if (S.day >= e.end) {
      E.active = E.active.filter((x) => x !== e);
      E.past.push({ tid: e.tid, end: e.end, heard: e.heard });
      if (E.past.length > 12) E.past.shift();
      if (S.ship.docked === e.port) msgs.push({ html: `${template(e).close ? 'The port is open again' : 'Trade returns to normal'} in <b>${portName(e.port)}</b>.`, kind: 'port' });
    }
  }
  E.clock += days;
  while (E.clock >= 1) {
    E.clock -= 1;
    if (E.active.length >= MAX_ACTIVE || Math.random() > CHANCE_PER_DAY) continue;
    const busy = new Set(E.active.map((e) => e.port));
    const options = TEMPLATES.filter((t) =>
      S.discovered[t.port] && !busy.has(t.port) &&
      !E.past.some((p) => p.tid === t.id && S.day - p.end < COOLDOWN_DAYS));
    if (!options.length) continue;
    const t = options[Math.floor(Math.random() * options.length)];
    const len = t.days[0] + Math.floor(Math.random() * (t.days[1] - t.days[0]));
    const e = { id: E.nextId++, tid: t.id, port: t.port, start: S.day, end: S.day + len, heard: false };
    E.active.push(e);
    if (S.ship.docked === t.port) {
      e.heard = true;
      msgs.push(newsMessage(e));
    }
  }
  return msgs;
}

function newsMessage(e) {
  const t = template(e);
  return { html: `<b>News:</b> ${t.title}. ${t.text}`, kind: 'discover', log: `News: ${t.title}.` };
}

// When the captain drops anchor, gather whatever news has reached this port.
export function hearNews(S, portId) {
  const E = ensureEvents(S);
  const here = PORTS.find((p) => p.id === portId);
  const msgs = [];
  for (const e of E.active) {
    if (e.heard) continue;
    const there = PORTS.find((p) => p.id === e.port);
    const lag = portId === e.port ? 0 : distNm(here.lon, here.lat, there.lon, there.lat) / NEWS_NM_PER_DAY;
    if (S.day >= e.start + lag) {
      e.heard = true;
      msgs.push(newsMessage(e));
    }
  }
  return msgs;
}

// Push the active events into the market's prices and closures.
export function applyToMarket(S, market) {
  const E = ensureEvents(S);
  market.effects = {};
  market.closedPorts = new Set();
  for (const e of E.active) {
    const t = template(e);
    for (const [port, goods] of Object.entries(t.effects || {})) {
      market.effects[port] = market.effects[port] || {};
      for (const [g, m] of Object.entries(goods)) market.effects[port][g] = (market.effects[port][g] || 1) * m;
    }
    for (const port of t.close || []) market.closedPorts.add(port);
  }
}

// What the captain knows: news heard, newest first.
export function knownNews(S) {
  const E = ensureEvents(S);
  return E.active.filter((e) => e.heard).sort((a, b) => b.start - a.start).map((e) => ({ ...e, t: template(e) }));
}

export function closure(S, portId) {
  const E = ensureEvents(S);
  return E.active.find((e) => (template(e).close || []).includes(portId)) || null;
}

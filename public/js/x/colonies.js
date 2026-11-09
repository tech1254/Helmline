// Expansion: settling the New World (Nov 2026). The crowns grant charters to settle: Castile's on
// Hispaniola, Cuba and the Main from 1502, Portugal's captaincies on the Brazil coast from 1534,
// when King João III divided the coast among private men to settle at their own cost (most failed;
// Pernambuco grew rich on sugar). Seek a charter in your home port, sail to the site, land the
// settlers, and keep the colony fed through its first years. It grows from a camp to a village,
// a town and a port, produces sugar, brazilwood, dyes and a little gold, and pays its dues.
//
// What it costs to keep: provisions (wheat you land, or your factor ships at a price), and the
// risks: fever, storms, French interlopers on the Brazil coast, and the people whose land it is.
// Their goodwill is kept with trade goods (cloth) and lost by neglect; the colony's history
// is told plainly (the planters of the other captaincies seized Tupi labour and bought Africans
// at São Tomé), but labour is never something the game sells you.
// Pure rules: no browser modules.

import { addPort } from './registry.js';
import { state } from './index.js';
import { yearOf, dayOfYear } from '../ships.js';
import { GOODS, MARKETS } from '../economy.js';
import * as Accounts from '../accounts.js';

Accounts.KINDS.colony = 'Colonies';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const goodName = (g) => GOODS.find((x) => x.id === g)?.name.toLowerCase() || g;

// The sites: real places, with the year their crown would first grant a charter there.
export const SITES = {
  // Portugal: the captaincies of 1534
  olinda: { name: 'Olinda', lon: -34.8, lat: -8.02, crown: 'portugal', from: 1534, region: 'the captaincy of Pernambuco', people: 'the Caeté and the Potiguara',
    produce: { sugar: 2.2, brazilwood: 1.6 }, french: true, depth: 4, kind: 'a river mouth behind the reef',
    blurb: 'A hill above the river mouth behind the reef, the best sugar land on the coast: the captaincy of Pernambuco.' },
  salvador: { name: 'Vila Velha', lon: -38.4, lat: -13.0, crown: 'portugal', from: 1534, region: 'the captaincy of Bahia', people: 'the Tupinambá',
    produce: { sugar: 1.8, brazilwood: 1.2 }, french: true, depth: 8, kind: 'a great bay',
    blurb: 'The Bay of All Saints: a sheltered sea inside the point, room for a fleet, and a village of Tupinambá on the shore.' },
  ilheus: { name: 'Ilhéus', lon: -38.98, lat: -14.79, crown: 'portugal', from: 1534, region: 'the captaincy of Ilhéus', people: 'the Tupiniquim',
    produce: { sugar: 1.4, brazilwood: 1.8 }, french: true, depth: 4, kind: 'a river mouth sheltered by islets',
    blurb: 'A river mouth sheltered by islets, forest down to the beach: brazilwood country.' },
  vitoria: { name: 'Vitória', lon: -40.2, lat: -20.32, crown: 'portugal', from: 1535, region: 'the captaincy of Espírito Santo', people: 'the Goitacá and the Tupiniquim',
    produce: { sugar: 1.3, brazilwood: 1.4 }, french: true, depth: 5, kind: 'an island in a bay',
    blurb: 'An island in a bay below green mountains: the captaincy of Espírito Santo.' },
  // Castile: the islands and the Main
  puertoplata: { name: 'Puerto Plata', lon: -70.69, lat: 19.85, crown: 'castile', from: 1502, region: 'the north coast of Hispaniola', people: 'the Taíno',
    produce: { sugar: 1.4, gold: 0.25, dye: 0.6 }, depth: 5, kind: 'a bay under a silver-clouded mountain',
    blurb: 'A bay on the north coast of Hispaniola, under a mountain whose clouds shine like silver: the Admiral named it.' },
  santiagocuba: { name: 'Santiago de Cuba', lon: -75.83, lat: 19.85, crown: 'castile', from: 1515, region: 'the south coast of Cuba', people: 'the Taíno',
    produce: { sugar: 1.2, gold: 0.2, dye: 0.8 }, depth: 7, kind: 'a deep bay behind narrows',
    blurb: 'A deep bay behind narrow heads on the south coast of Cuba: Velázquez\'s town, and Cortés sailed from here.' },
  cartagena: { name: 'Cartagena', lon: -75.6, lat: 10.42, crown: 'castile', from: 1533, region: 'the coast of the Main', people: 'the Calamarí',
    produce: { gold: 0.35, dye: 1.2, sugar: 0.6 }, depth: 8, kind: 'a great sheltered bay',
    blurb: 'The best harbour on the coast of the Main, a great bay behind islands, with the Calamarí villages on the shore.' },
};
const OPENS = { portugal: date(1534, 3, 10), castile: date(1502, 2, 1) };

// Each site is a port of its own, hidden until your charter puts it on your chart.
const MARKET = (prod) => {
  // every good, priced as a far colony prices it: dear for what it must import, cheap for its own
  const p = Object.fromEntries(GOODS.map((g) => [g.id, [Math.round((MARKETS.lisbon.p[g.id]?.[0] || 20) * 1.7)]]));
  Object.assign(p, { wine: [22], cloth: [24], wheat: [24], salt: [10], fish: [14] });
  if (prod.sugar) p.sugar = [11, 1];
  if (prod.brazilwood) p.brazilwood = [8, 1];
  if (prod.dye) p.dye = [9, 1];
  if (prod.gold) p.gold = [90, 1];
  return { k: 0.05, p };
};
for (const [id, s] of Object.entries(SITES)) {
  addPort({ id, name: s.name, lon: s.lon, lat: s.lat, known: false, hidden: true, from: s.from, crown: s.crown, colony: true, blurb: s.blurb },
    { harbour: { depth: s.depth, kind: s.kind }, market: MARKET(s.produce), start: { size: 0, grow: 0 } });
}

export const CHARTER_COST = 2500; // the patent, the settlers' passage and their tools
export const CHARTER_STANDING = 30;
export const MAX_COLONIES = 3;
export const SETTLERS = 60;
export const CAP = 6000; // the most settlers a colony draws, in these years
export const WHEAT_FEEDS = 12; // settler-months a unit of wheat feeds
export const FACTOR_PRICE = 0.18; // cz a settler-month, when your factor ships the provisions
export const BUILD = {
  mill: { name: 'a sugar mill', cost: 3000, needs: 150, text: 'An ox-driven mill and a boiling house: the cane the settlers grow becomes sugar here, twice what they could press by hand.' },
  fort: { name: 'a stockade fort', cost: 2500, needs: 0, text: 'A palisade and a few guns over the landing: raiders think twice.' },
  church: { name: 'a church', cost: 1500, needs: 100, text: 'A church of stone and timber: the settlers stay, more come, and the crown takes note.' },
};
export const STAGES = [[2000, 'a port'], [600, 'a town'], [150, 'a village'], [0, 'a camp']];
export const stageOf = (pop) => STAGES.find(([n]) => pop >= n)[1];

function C(S) {
  const c = state(S, 'colonies');
  c.charters = c.charters || {};
  c.c = c.c || {};
  c.told = c.told || {};
  return c;
}
export const ensure = C;
const mine = (S) => S.nation || 'portugal';
export const home = (S) => (mine(S) === 'castile' ? 'seville' : 'lisbon');
export const colonies = (S) => C(S).c;
export const colony = (S, pid) => C(S).c[pid] || null;

// The sites your crown would grant you a charter for now.
export function sitesOpen(S) {
  const y = yearOf(S.day);
  const c = C(S);
  return Object.entries(SITES).filter(([id, s]) => s.crown === mine(S) && y >= s.from && !c.charters[id] && !c.c[id]).map(([id, s]) => ({ id, ...s }));
}
export function canCharter(S, id) {
  const c = C(S);
  if (!sitesOpen(S).some((s) => s.id === id)) return { ok: false, why: 'not open to you' };
  if (Object.keys(c.c).length + Object.keys(c.charters).length >= MAX_COLONIES) return { ok: false, why: `no more than ${MAX_COLONIES} colonies` };
  if (Object.keys(c.charters).length) return { ok: false, why: 'found the colony you hold a charter for first' };
  if ((S.contracts?.standing || 0) < CHARTER_STANDING) return { ok: false, why: `the crown grants charters to captains of standing (${CHARTER_STANDING})` };
  if (S.purse < CHARTER_COST) return { ok: false, why: `${fmt(CHARTER_COST)} cz for the patent and the settlers` };
  return { ok: true };
}
export function charter(S, id) {
  if (!canCharter(S, id).ok) return null;
  S.purse -= CHARTER_COST;
  Accounts.record(S, { kind: 'colony', amount: -CHARTER_COST, port: S.ship?.docked, text: `The charter for ${SITES[id].region}` });
  C(S).charters[id] = { day: S.day };
  S.discovered = S.discovered || {};
  S.discovered[id] = true;
  const s = SITES[id];
  return { cost: CHARTER_COST, html: `The crown grants your house ${s.region}, with the right to settle it at your own cost. ${SETTLERS} settlers and their tools are aboard: sail to <b>${s.name}</b> and land them. It is <b>on your chart</b>.`, log: `Chartered to settle ${s.region} (${s.name}).` };
}

// Landing the settlers, at the site, with the charter.
export const canFound = (S, pid) => !!C(S).charters[pid] && S.ship?.docked === pid;
export function found(S, pid) {
  if (!canFound(S, pid)) return null;
  const c = C(S), s = SITES[pid];
  delete c.charters[pid];
  c.c[pid] = { founded: S.day, pop: SETTLERS, stores: SETTLERS * 4, heart: 60, relations: 55, stock: {}, built: {}, month: S.day, history: [], auto: true };
  setSize(S, pid);
  return { html: `Your settlers wade ashore at ${s.name} and raise a cross and a palisade. The colony of your house in ${s.region} is founded. ${s.people[0].toUpperCase()}${s.people.slice(1)} watch from the treeline, and come down to trade.`, log: `Founded the colony at ${s.name}.` };
}
function setSize(S, pid) { if (S.ports?.[pid]) S.ports[pid].size = Math.max(1, Math.round(C(S).c[pid].pop)); }

// Landing supplies from your hold: wheat feeds the settlers, wine and cloth hearten them, cloth
// given in trade keeps the goodwill of their neighbours.
export function land(S, pid, good, qty) {
  const col = colony(S, pid);
  const have = S.cargo?.[good] || 0;
  qty = Math.min(qty, have);
  if (!col || qty <= 0) return 0;
  S.cargo[good] = have - qty;
  if (S.paid && S.cargo[good] === 0) S.paid[good] = 0;
  else if (S.paid?.[good]) S.paid[good] *= (have - qty) / have;
  if (good === 'wheat') col.stores += qty * WHEAT_FEEDS;
  else if (good === 'wine') col.heart = Math.min(100, col.heart + qty * 0.6);
  else if (good === 'cloth') col.heart = Math.min(100, col.heart + qty * 0.3);
  return qty;
}
export function gift(S, pid, qty) {
  const col = colony(S, pid);
  const have = S.cargo?.cloth || 0;
  qty = Math.min(qty, have);
  if (!col || qty <= 0) return 0;
  S.cargo.cloth = have - qty;
  if (S.paid && !S.cargo.cloth) S.paid.cloth = 0;
  col.relations = Math.min(100, col.relations + qty * 1.5);
  return qty;
}
// What the colony has produced, into your hold, free: it is your house's.
export function loadProduce(S, pid, room) {
  const col = colony(S, pid);
  if (!col) return [];
  const got = [];
  for (const [g, n] of Object.entries(col.stock)) {
    const k = Math.min(Math.floor(n), room);
    if (k <= 0) continue;
    room -= k;
    col.stock[g] = n - k;
    S.cargo[g] = (S.cargo[g] || 0) + k;
    S.paid[g] = S.paid[g] || 0;
    got.push({ good: g, qty: k });
  }
  return got;
}
export function canBuild(S, pid, b) {
  const col = colony(S, pid), B = BUILD[b];
  if (!col || !B || col.built[b]) return { ok: false };
  if (b === 'mill' && !SITES[pid].produce.sugar) return { ok: false };
  if (col.pop < B.needs) return { ok: false, why: `when the colony has ${B.needs} settlers` };
  if (S.purse < B.cost) return { ok: false, why: `${fmt(B.cost)} cz` };
  return { ok: true };
}
export function build(S, pid, b) {
  if (!canBuild(S, pid, b).ok) return null;
  const col = colony(S, pid);
  S.purse -= BUILD[b].cost;
  Accounts.record(S, { kind: 'colony', amount: -BUILD[b].cost, port: pid, text: `${BUILD[b].name[0].toUpperCase()}${BUILD[b].name.slice(1)} at ${SITES[pid].name}` });
  col.built[b] = S.day;
  if (b === 'church' && S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 5;
  col.history.push({ day: S.day, text: `built ${BUILD[b].name}` });
  return { cost: BUILD[b].cost, html: `${BUILD[b].text}`, log: `Built ${BUILD[b].name} at ${SITES[pid].name}.` };
}
// How much of its own food the colony grows: little at first; manioc, maize, cattle and fish in
// a few years, and nearly all of it once it is a village of some years' standing.
export const selfFed = (S, col) => Math.min(0.95, 0.15 + 0.2 * (S.day - col.founded) / 365.25);
export const months = (col, S = null) => { const need = col.pop * (1 - (S ? selfFed(S, col) : 0)); return need < 1 ? 99 : Math.floor(col.stores / need); };
export const dues = (col) => (col.pop >= 600 ? Math.round(col.pop / 100 * 6) : 0); // cz a month: quitrents and tithes

// A month at the colony: the settlers eat, work, grow or sicken; the neighbours and the French.
function month(S, pid, col, rand, away) {
  const s = SITES[pid], msgs = [];
  const name = s.name;
  // food: your factor ships provisions when the stores run short, if the purse allows
  const need = col.pop * (1 - selfFed(S, col));
  if (col.stores < need * 2 && col.auto && need > 0) {
    const want = Math.round(need * 4 - col.stores), cost = Math.round(want * FACTOR_PRICE);
    if (S.purse >= cost) { S.purse -= cost; col.stores += want; Accounts.record(S, { kind: 'colony', amount: -cost, port: pid, text: `Provisions shipped to ${name}` }); }
  }
  col.stores -= col.pop * (1 - selfFed(S, col));
  let starving = false;
  if (col.stores < 0) {
    starving = true;
    col.stores = 0;
    if (!away) {
      const lost = Math.max(1, Math.round(col.pop * 0.06));
      col.pop -= lost; col.heart = Math.max(0, col.heart - 15);
      msgs.push({ html: `<b>Hunger at ${name}.</b> The stores are empty: ${lost} settlers have died or taken ship for home. Land wheat there, or leave provisions to your factor.`, kind: 'danger', log: `Hunger at ${name}: ${lost} lost.` });
    }
  }
  // growth: a heartened, fed colony draws settlers; a church draws more
  if (!starving) {
    const stage = col.pop >= 150 ? 1 : 0;
    const rate = (0.006 + 0.016 * col.heart / 100 + (col.built.church ? 0.005 : 0) + stage * 0.003) * Math.max(0, 1 - col.pop / CAP);
    col.pop += col.pop * rate;
  }
  col.heart += (55 - col.heart) * 0.05; // wine and cloth wear off
  col.relations += (50 - col.relations) * 0.03; // goodwill fades without trade
  // work: what the colony produces this month
  for (const [g, r] of Object.entries(s.produce)) {
    let q = col.pop / 100 * r * (g === 'sugar' ? (col.built.mill ? 2 : 0.6) : 1);
    if (g === 'brazilwood' && col.relations > 70) q *= 1.5; // the neighbours cut it, for trade goods
    col.stock[g] = Math.min(600, (col.stock[g] || 0) + q);
  }
  const d = dues(col);
  if (d) { S.purse += d; Accounts.record(S, { kind: 'colony', amount: d, port: pid, text: `Dues from ${name}` }); }
  // risks, only while you play: time away is only good news
  if (!away) {
    if (s.french && yearOf(S.day) >= 1520 && rand() < 0.035) {
      if (col.built.fort) msgs.push({ html: `French interlopers came for brazilwood at ${name}; the guns of your fort sent them off.`, kind: 'discover', log: `French driven off at ${name}.` });
      else {
        for (const g of Object.keys(col.stock)) col.stock[g] *= 0.4;
        col.pop *= 0.97;
        msgs.push({ html: `<b>French interlopers at ${name}.</b> They landed, took the brazilwood and sugar from the store-houses and burned the landing. A fort would keep them off.`, kind: 'danger', log: `French raid on ${name}.` });
      }
    }
    if (rand() < 0.018) {
      const lost = Math.max(1, Math.round(col.pop * 0.07));
      col.pop -= lost;
      msgs.push({ html: `<b>Fever at ${name}.</b> ${lost} settlers are buried.`, kind: 'danger', log: `Fever at ${name}: ${lost} dead.` });
    }
    if (col.relations < 30 && rand() < 0.06) {
      const lost = Math.max(1, Math.round(col.pop * (col.built.fort ? 0.03 : 0.09)));
      col.pop -= lost;
      col.relations = Math.min(100, col.relations + 10);
      msgs.push({ html: `<b>Fighting at ${name}.</b> ${s.people[0].toUpperCase()}${s.people.slice(1)} have attacked the outlying fields; ${lost} settlers are dead. The settlers had been taking more land than was ever agreed. Trade goods, and fair dealing, keep the peace.`, kind: 'danger', log: `Attack at ${name}: ${lost} dead.` });
    }
  }
  col.pop = Math.max(5, col.pop);
  return msgs;
}

export function tick(S, dd, ctx = {}) {
  const c = C(S), msgs = [];
  // the crown opens the charters: news, once
  const op = OPENS[mine(S)];
  if (S.day >= op && !c.told.open) {
    c.told.open = true;
    if (S.day - op < 120) msgs.push(mine(S) === 'portugal'
      ? { html: '<b>News:</b> King João III has divided the coast of Brazil into captaincies, fifty leagues of coast each, granted to private men to settle at their own cost, with the French already cutting brazilwood there. A captain of standing may seek a captaincy in Lisbon.', kind: 'discover', log: 'The Brazil captaincies are granted.' }
      : { html: '<b>News:</b> The crown grants charters to settle the islands of the Indies, at the settlers\' own cost. A captain of standing may seek one in Seville.', kind: 'discover', log: 'Charters to settle the Indies.' });
  }
  const rand = ctx.rand || Math.random;
  for (const [pid, col] of Object.entries(c.c)) {
    while (S.day - col.month >= 30) {
      col.month += 30;
      const before = stageOf(col.pop);
      msgs.push(...month(S, pid, col, rand, !!ctx.away));
      const after = stageOf(col.pop);
      if (after !== before && col.pop > (STAGES.find(([, n]) => n === before)?.[0] || 0)) {
        col.history.push({ day: S.day, text: `grew to ${after}` });
        if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 3;
        msgs.push({ html: `<b>${SITES[pid].name} is ${after} now:</b> ${Math.round(col.pop)} settlers.${after === 'a town' ? ' It pays your house its dues each month.' : ''}`, kind: 'discover', log: `${SITES[pid].name} grows to ${after}.` });
      }
      setSize(S, pid);
    }
  }
  return msgs;
}

// What the colony looks like now, for the screen.
export function summary(S, pid) {
  const col = colony(S, pid);
  if (!col) return null;
  return { name: SITES[pid].name, region: SITES[pid].region, people: SITES[pid].people, pop: Math.round(col.pop), stage: stageOf(col.pop), months: months(col, S), fed: Math.round(selfFed(S, col) * 100),
    heart: Math.round(col.heart), relations: Math.round(col.relations), stock: Object.entries(col.stock).map(([g, n]) => ({ good: g, name: goodName(g), qty: Math.floor(n) })).filter((x) => x.qty > 0),
    built: col.built, dues: dues(col), auto: col.auto, founded: col.founded };
}

export default {
  id: 'colonies', name: 'Settling the New World',
  ports: Object.keys(SITES), routes: true,
  tick, ensure,
};

// Ambitions (the design doc, phase 1): three goals always in view, each with a progress bar.
// When one is done (or history makes it impossible) the player chooses the next from three on
// offer: two from their own calling and one from another, so the other paths stay in sight.
// Every ambition earns money, standing and merit on its calling (callings.js), and merit is how
// a calling's ranks are climbed. One of the three is always a big one, a few hours' work.
// Pure rules: no browser modules.

import { PORTS, LAND_GROUPS, LANDS, distNm, portOpen } from './world.js';
import { GOODS, MARKETS } from './economy.js';
import { yearOf } from './ships.js';
import { home } from './nations.js';
import * as Callings from './callings.js';
import * as Houses from './houses.js';
import * as Works from './works.js';
import * as Law from './law.js';
import * as War from './war.js';

const SLOTS = 3;
const portById = (id) => PORTS.find((p) => p.id === id);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const round = (n, to) => Math.max(to, Math.round(n / to) * to);

// Places history reaches on a known date: beat the explorer there (crown's captains).
const RACES = [
  { port: 'flores', year: 1452, who: 'Diogo de Teive' },
  { port: 'gambia', year: 1455, who: 'Cadamosto' },
  { port: 'ribeiragrande', year: 1462, who: 'António de Noli' },
  { port: 'mina', year: 1471, who: 'João de Santarém' },
  { port: 'saotome', year: 1471, who: 'Pêro Escobar' },
  { port: 'mpinda', year: 1483, who: 'Diogo Cão' },
  { port: 'saobras', year: 1488, who: 'Bartolomeu Dias' },
  { port: 'santodomingo', year: 1492, who: 'Columbus' },
  { port: 'stjohns', year: 1497, who: 'John Cabot' },
  { port: 'portoseguro', year: 1500, who: 'Cabral' },
];

// The house's rough worth: its purse, what its cargo cost, and its ships.
export function worth(S) {
  const cargo = Object.values(S.paid || {}).reduce((t, v) => t + v, 0);
  return S.purse + cargo + 900 * (S.fleet?.ships?.length || 0);
}
const totals = (S) => S.accounts?.totals || {};
const tally = (S) => (S.tally = S.tally || { sold: {}, soldAt: {} });

// Record what sells where, for the ambitions that count it (called from accounts.js).
export function noteSale(S, good, qty, amount, port) {
  const T = tally(S);
  T.sold[good] = (T.sold[good] || 0) + (qty || 0);
  if (port) T.soldAt[port] = (T.soldAt[port] || 0) + (amount || 0);
}

// The kinds of ambition. `make(S, big, rand)` returns the particular goal, or null if none fits
// now; `value(S, a)` how far it has come (out of a.target); `lost(S, a)` true if it can no longer
// be done.
export const KINDS = {
  sales: { calling: 'merchant',
    make(S, big) {
      const target = round(Math.max(big ? 3000 : 800, worth(S) * (big ? 2 : 0.7)), 100);
      return { text: `Sell ${fmt(target)} cz of goods`, target, base: totals(S).sale || 0 };
    },
    value: (S, a) => (totals(S).sale || 0) - a.base },
  purse: { calling: 'merchant',
    make(S, big) {
      const target = round(Math.max(S.purse + (big ? 2500 : 600), S.purse * (big ? 3 : 1.6)), 100);
      return { text: `Hold ${fmt(target)} cz in your purse`, target, base: 0 };
    },
    value: (S) => S.purse },
  sellGood: { calling: 'merchant',
    make(S, big, rand) {
      const ok = GOODS.filter((g) => !['gold', 'spices', 'ivory'].includes(g.id) || worth(S) > 4000)
        .filter((g) => PORTS.some((p) => S.discovered[p.id] && portOpen(p.id, yearOf(S.day)) && S.seen?.[p.id] && MARKETS[p.id]?.p[g.id]?.[1]));
      if (!ok.length) return null;
      const g = ok[Math.floor(rand() * ok.length)];
      const target = big ? 120 : 40;
      return { text: `Sell ${target} ${g.unit} of ${g.name.toLowerCase()}`, target, good: g.id, base: tally(S).sold[g.id] || 0 };
    },
    value: (S, a) => (tally(S).sold[a.good] || 0) - a.base },
  tradePort: { calling: 'merchant',
    make(S, big, rand) {
      const h = portById(home(S));
      const ps = PORTS.filter((p) => S.discovered[p.id] && p.id !== h.id && !p.beyond && portOpen(p.id, yearOf(S.day)) && distNm(h.lon, h.lat, p.lon, p.lat) < (big ? 2400 : 1100));
      if (!ps.length) return null;
      const p = ps[Math.floor(rand() * ps.length)];
      const target = round(Math.max(big ? 2000 : 600, worth(S) * (big ? 1 : 0.4)), 100);
      return { text: `Sell ${fmt(target)} cz of goods in ${p.name}`, target, port: p.id, base: tally(S).soldAt[p.id] || 0 };
    },
    value: (S, a) => (tally(S).soldAt[a.port] || 0) - a.base },
  fleet: { calling: 'merchant',
    make(S, big) {
      const now = 1 + (S.fleet?.ships?.length || 0);
      const target = now + (big ? 3 : 1);
      return { text: `Have ${target} ships under your flag`, target, base: 0 };
    },
    value: (S) => 1 + (S.fleet?.ships?.length || 0) },
  lead: { calling: 'merchant',
    make(S, big, rand) {
      const ps = PORTS.filter((p) => S.discovered[p.id] && S.seen?.[p.id]?.day >= 0 && !p.beyond && Houses.leader(S, p.id, 0) !== 'you'
        && Object.keys(Houses.shares(S, p.id)).some((k) => k !== 'local' && k !== 'you'));
      if (!ps.length) return null;
      const p = ps[Math.floor(rand() * ps.length)];
      return { text: `Lead the trade of ${p.name}`, target: 1, port: p.id, base: 0 };
    },
    value: (S, a) => (Houses.leader(S, a.port, 0) === 'you' ? 1 : 0) },
  outtrade: { calling: 'merchant',
    make(S, big) {
      const rows = Houses.ledger(S).filter((r) => r.status === 'trading');
      const you = rows.findIndex((r) => r.id === 'you');
      if (you <= 0) return null;
      const r = big ? rows[0] : rows[you - 1];
      if (r.id === 'you') return null;
      return { text: `Rise above the ${Houses.defOf(r.id).name} in the Houses of the Sea`, target: 1, house: r.id, base: 0, big: big || you - 1 === 0 };
    },
    value: (S, a) => {
      const rows = Houses.ledger(S).filter((r) => r.status === 'trading');
      const iy = rows.findIndex((r) => r.id === 'you'), ih = rows.findIndex((r) => r.id === a.house);
      return ih < 0 || iy < ih ? 1 : 0;
    } },
  build: { calling: 'merchant',
    make(S, big) {
      if (big) {
        const now = new Set(Works.list(S).filter((b) => b.done).map((b) => b.pid)).size;
        const target = now + 3;
        return { text: `Have port works in ${target} ports`, target, base: 0 };
      }
      const now = Works.list(S).filter((b) => b.done && (b.id === 'quay' || b.id === 'warehouse')).length;
      return { text: 'Build a quay or a warehouse in a port you trade with', target: now + 1, base: 0 };
    },
    value: (S, a) => (a.text.startsWith('Have port works') ? new Set(Works.list(S).filter((b) => b.done).map((b) => b.pid)).size : Works.list(S).filter((b) => b.done && (b.id === 'quay' || b.id === 'warehouse')).length) },
  fortify: { calling: 'crown',
    make(S, big) {
      if ((S.contracts?.standing ?? 0) < 20 && !big) return null;
      const what = big ? 'fort' : 'church';
      const now = Works.list(S).filter((b) => b.done && b.id === what).length;
      return { text: big ? 'Build a fort to guard a coast for the crown' : 'Build a church and hospital in a port you serve', target: now + 1, base: 0, what: big ? 'fort' : 'church' };
    },
    value: (S, a) => Works.list(S).filter((b) => b.done && (a.what ? b.id === a.what : b.id === 'fort' || b.id === 'church')).length },
  contracts: { calling: 'crown',
    make(S, big) {
      if (!S.contracts?.unlocked) return null;
      const target = big ? 6 : 2;
      return { text: `Complete ${target} contracts`, target, base: S.contracts.done || 0 };
    },
    value: (S, a) => (S.contracts?.done || 0) - a.base },
  standing: { calling: 'crown',
    make(S, big) {
      if (!S.contracts?.unlocked) return null;
      const target = Math.round((S.contracts.standing || 0) + (big ? 40 : 15));
      return { text: `Raise your standing to ${target}`, target, base: 0 };
    },
    value: (S) => S.contracts?.standing || 0 },
  chart: { calling: 'crown',
    make(S, big, rand) {
      const h = portById(home(S));
      const gs = [...new Set(LANDS.map((l) => l.group))].filter((g) => !S.sighted?.[g] && LAND_GROUPS[g]).map((g) => {
        const l = LANDS.find((x) => x.group === g);
        const [x, y] = l.pts[0];
        return { g, d: distNm(h.lon, h.lat, x, y) };
      }).sort((a, b) => a.d - b.d);
      if (!gs.length) return null;
      const pick = big ? gs[Math.min(gs.length - 1, 2 + Math.floor(rand() * 3))] : gs[Math.floor(rand() * Math.min(3, gs.length))];
      return { text: `Chart ${LAND_GROUPS[pick.g]}`, target: 1, land: pick.g, base: 0 };
    },
    value: (S, a) => (S.sighted?.[a.land] ? 1 : 0) },
  visit: { calling: 'crown',
    make(S, big, rand) {
      const h = portById(home(S));
      const ps = PORTS.filter((p) => S.discovered[p.id] && !(S.seen?.[p.id]?.day >= 0) && portOpen(p.id, yearOf(S.day)) && !p.beyond)
        .sort((a, b) => distNm(h.lon, h.lat, a.lon, a.lat) - distNm(h.lon, h.lat, b.lon, b.lat));
      if (!ps.length) return null;
      const p = big ? ps[Math.min(ps.length - 1, 3 + Math.floor(rand() * 3))] : ps[Math.floor(rand() * Math.min(3, ps.length))];
      return { text: `Drop anchor in ${p.name}`, target: 1, port: p.id, base: 0, start: S.day };
    },
    value: (S, a) => (S.seen?.[a.port]?.day >= a.start ? 1 : 0) },
  race: { calling: 'crown',
    make(S, big) {
      const y = yearOf(S.day);
      const r = RACES.filter((x) => !S.discovered[x.port] && x.year > y + (big ? 1 : 0)).sort((a, b) => a.year - b.year)[0];
      if (!r || (!big && r.year - y > 12)) return null;
      return { text: `Reach ${portById(r.port).name} before ${r.who} (${r.year})`, target: 1, port: r.port, year: r.year, who: r.who, base: 0, big: true };
    },
    value: (S, a) => (S.discovered[a.port] ? 1 : 0),
    lost: (S, a) => yearOf(S.day) >= a.year && !S.discovered[a.port] },
  corsairs: { calling: 'privateer',
    make(S, big) {
      const target = big ? 4 : 1;
      return { text: target === 1 ? 'Take a corsair galley' : `Take ${target} corsair galleys`, target, base: S.pirates?.won || 0 };
    },
    value: (S, a) => (S.pirates?.won || 0) - a.base },
  bounty: { calling: 'privateer',
    make(S, big) {
      const target = big ? 1200 : 300;
      const now = (S.pirates?.bountyPaid || 0) + (S.pirates?.bounty || 0);
      return { text: `Earn ${fmt(target)} cz in the crown's bounties`, target, base: now };
    },
    value: (S, a) => (S.pirates?.bountyPaid || 0) + (S.pirates?.bounty || 0) - a.base },
  plunder: { calling: 'privateer',
    make(S, big) {
      const target = big ? 3 : 1;
      return { text: target === 1 ? 'Strip a beaten galley of her plunder' : `Plunder ${target} beaten galleys`, target, base: S.pirates?.plundered || 0 };
    },
    value: (S, a) => (S.pirates?.plundered || 0) - a.base },
  notoriety: { calling: 'privateer',
    make(S, big) {
      const target = Math.round((S.pirates?.notoriety || 0) + (big ? 8 : 3));
      return { text: `Make your name feared at sea (notoriety ${target})`, target, base: 0 };
    },
    value: (S) => S.pirates?.notoriety || 0 },
};

// Phase 4: ships taken, prizes condemned, a haven of your own, a house raided, service in a war.
const law = (S) => S.law || {};
Object.assign(KINDS, {
  prizes: { calling: 'privateer',
    make(S, big) {
      if (!S.voyages) return null;
      const target = big ? 4 : 1;
      return { text: target === 1 ? 'Take a ship at sea (tap a rival\'s ship on the chart)' : `Take ${target} ships at sea`, target, base: law(S).taken || 0 };
    },
    value: (S, a) => (law(S).taken || 0) - a.base },
  condemn: { calling: 'privateer',
    make(S) {
      if (!War.hasMarque(S) && !Law.licensed(S)) return null;
      return { text: 'Have a prize condemned at a prize court', target: 1, base: law(S).condemned || 0 };
    },
    value: (S, a) => (law(S).condemned || 0) - a.base },
  haven: { calling: 'privateer',
    make(S, big) {
      if (!big || !S.discovered?.cove || Works.building(S, 'cove', 'stockade')) return null;
      return { text: 'Make the hidden cove your own haven (build its stockade)', target: 1, base: 0, big: true };
    },
    value: (S) => (Works.has(S, 'cove', 'stockade') ? 1 : 0) },
  raid: { calling: 'privateer',
    make(S, big, rand = Math.random) {
      const hs = Houses.active(S);
      if (!hs.length || !S.voyages) return null;
      const house = hs[Math.floor(rand() * hs.length)];
      const target = big ? 3 : 1;
      const name = Houses.defOf(house).name;
      return { text: target === 1 ? `Take a ship of the house of ${name}` : `Take ${target} ships of the house of ${name}`, target, house, base: law(S).byHouse?.[house] || 0 };
    },
    value: (S, a) => (law(S).byHouse?.[a.house] || 0) - a.base },
  service: { calling: 'crown',
    make(S, big) {
      if (!War.enemyOf(S)) return null;
      const target = War.service(S) + (big ? 5 : 2);
      return { text: `Serve the crown in the war: win ${big ? 5 : 2} fights or prizes against ${Law.CROWNS[War.enemyOf(S)].name}`, target, base: 0 };
    },
    value: (S) => War.service(S),
    lost: (S) => !War.enemyOf(S) },
});

export function ensureAmbitions(S) {
  if (!S.ambitions) S.ambitions = { active: [], offers: null, done: 0, nextId: 1 };
  return S.ambitions;
}

function build(S, kind, big, rand) {
  const K = KINDS[kind];
  const a = K.make(S, big, rand);
  if (!a) return null;
  const isBig = big || !!a.big;
  const A = ensureAmbitions(S);
  const w = worth(S);
  return {
    id: A.nextId++, kind, calling: K.calling, big: isBig, ...a,
    reward: { cz: round(Math.max(isBig ? 400 : 120, w * (isBig ? 0.18 : 0.06)), 10), standing: isBig ? 6 : 2, merit: isBig ? 7 : 3 },
    taken: S.day,
  };
}

const same = (a, b) => a.kind === b.kind && a.port === b.port && a.good === b.good && a.land === b.land && a.house === b.house;

// Three to choose from: two of the player's calling, one of another; `big` marks the big one.
export function makeOffers(S, rand = Math.random) {
  const A = ensureAmbitions(S);
  const own = Callings.callingOf(S) || 'merchant';
  const needBig = !A.active.some((a) => a.big);
  const offers = [];
  const pick = (kinds, big) => {
    const order = kinds.slice().sort(() => rand() - 0.5);
    for (const k of order) {
      const a = build(S, k, big, rand);
      if (a && !A.active.some((x) => same(x, a)) && !offers.some((x) => same(x, a))) return a;
    }
    return null;
  };
  const mine = Object.keys(KINDS).filter((k) => KINDS[k].calling === own);
  const others = Object.keys(KINDS).filter((k) => KINDS[k].calling !== own);
  offers.push(pick(mine, needBig));
  offers.push(pick(mine, false));
  offers.push(pick(others, false));
  A.offers = offers.filter(Boolean);
  return A.offers;
}

// A new calling's first three: two of its own and one big one.
export function startAmbitions(S, rand = Math.random) {
  const A = ensureAmbitions(S);
  if (A.active.length) return;
  const own = Callings.callingOf(S);
  const mine = Object.keys(KINDS).filter((k) => KINDS[k].calling === own).sort(() => rand() - 0.5);
  for (const k of mine) {
    if (A.active.length >= SLOTS) break;
    const a = build(S, k, A.active.length === 0, rand);
    if (a && !A.active.some((x) => same(x, a))) A.active.push(a);
  }
  while (A.active.length < SLOTS) { const a = build(S, 'sales', false, rand); A.active.push(a); }
}

export function progress(S, a) {
  const v = Math.max(0, KINDS[a.kind].value(S, a));
  return { v: Math.min(v, a.target), of: a.target, f: Math.min(1, v / a.target) };
}

// Mark done what is done, drop what history has made impossible, pay the rewards. Returns
// messages ({ html, kind, log }) and makes offers for the empty slots.
export function checkAmbitions(S, rand = Math.random) {
  const A = ensureAmbitions(S);
  if (!S.calling) return [];
  const msgs = [];
  for (const a of A.active.slice()) {
    const K = KINDS[a.kind];
    if (progress(S, a).f >= 1) {
      A.active = A.active.filter((x) => x !== a);
      A.done++;
      S.purse += a.reward.cz;
      if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + a.reward.standing;
      const rose = Callings.addMerit(S, a.calling, a.reward.merit);
      msgs.push({ html: `<b>Ambition achieved:</b> ${a.text}. <b>+${fmt(a.reward.cz)} cz</b>, more standing, and a name as a ${Callings.CALLINGS[a.calling].short.toLowerCase()}.`, kind: 'discover', log: `Ambition achieved: ${a.text} (+${a.reward.cz} cz).`, cz: a.reward.cz });
      if (rose) msgs.push({ html: `<b>You rise in the world:</b> you are now known as a <b>${rose}</b>.`, kind: 'discover', log: `Rose to ${rose}.`, rank: rose });
    } else if (K.lost?.(S, a)) {
      A.active = A.active.filter((x) => x !== a);
      if (a.kind === 'race') msgs.push({ html: `${a.who} got there first: the race to ${portById(a.port).name} is lost.`, kind: '', log: `Lost the race to ${portById(a.port).name}.` });
      else msgs.push({ html: `The war is over: <i>${a.text}</i> can no longer be done.`, kind: '', log: `Ambition lapsed: ${a.text}.` });
    }
  }
  if (A.active.length < SLOTS && !A.offers?.length) makeOffers(S, rand);
  return msgs;
}

export const needsChoice = (S) => !!(S.calling && ensureAmbitions(S).active.length < SLOTS && S.ambitions.offers?.length);

export function accept(S, id, rand = Math.random) {
  const A = ensureAmbitions(S);
  const a = A.offers?.find((x) => x.id === id);
  if (!a) return false;
  a.taken = S.day;
  if (a.kind === 'visit') a.start = S.day;
  A.active.push(a);
  A.offers = null;
  if (A.active.length < SLOTS) makeOffers(S, rand);
  return true;
}

// When the calling changes: keep what is in hand, offer the new calling's goals next.
export function onCallingChanged(S, rand = Math.random) {
  const A = ensureAmbitions(S);
  if (!A.active.length) startAmbitions(S, rand);
  A.offers = null;
  if (A.active.length < SLOTS) makeOffers(S, rand);
}

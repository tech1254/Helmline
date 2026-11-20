// The crown's call to arms (Nov 2026): the war comes to a new captain in his first hour, not in
// 1475. Players were trading quietly for twenty minutes and leaving; the ones who stayed had met
// corsairs. So from the first voyage the crown has work for you, on the real campaigns of the 1450s,
// and it pays well and early.
//   Portugal, "the king's call": Ceuta, taken in 1415, is a fortress cut off on the Moroccan
//   coast, fed by sea from the Algarve and Lisbon. King Afonso V is gathering men for a crusade
//   in Morocco (it sails in 1458 and takes Alcácer Ceguer). Feed Ceuta; the captain of Ceuta puts
//   the king's swivel guns aboard; patrol the Strait against the corsairs; then sail with the
//   captain's raid on the coast at Alcácer Ceguer.
//   Castile, "the Granada frontier": Henry IV campaigns against the Nasrid kingdom of Granada,
//   1455-57, with the Duke of Medina Sidonia's galleys keeping the Strait. Supply the frontier
//   through Cádiz; patrol off the Moors' Gibraltar; then raid the coast of Málaga with the Duke.
// Each stage pays: the head start comes through the war prep (roughly 1,500 to 2,000 cz by the
// end of the third stage, with the guns). Pure rules: no browser modules.

import { GOODS } from './economy.js';
import { distNm } from './world.js';
import { yearOf } from './ships.js';
import * as Accounts from './accounts.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const good = (id) => GOODS.find((g) => g.id === id);
const mine = (S) => (S.nation === 'castile' ? 'castile' : 'portugal');

export const UNTIL = 1458; // the call lapses when the real campaign sails
export const REACH = 8; // miles from the mark at which the fight finds you
export const CALLS = {
  portugal: {
    name: 'The king\'s call', crown: 'the king',
    supply: { port: 'ceuta', portName: 'Ceuta', goods: { wheat: { qty: 12, pay: 24 }, wine: { qty: 8, pay: 20 } }, bonus: 300, standing: 6,
      letter: 'A letter under the king\'s seal: <b>King Afonso calls his captains.</b> Ceuta, held for Portugal since 1415, is cut off on the Moroccan coast and lives on what comes by sea. The king is gathering men for a crusade in Morocco. Carry wheat and wine to Ceuta: the king\'s factor there pays above the market.',
      done: 'The captain of Ceuta thanks you: the garrison eats.', guns: 'He has <b>swivel guns from the king\'s armoury</b> put on your rails for the next work: the corsairs of the Strait.' },
    patrol: { lon: -5.72, lat: 36.0, name: 'the Strait', label: 'Patrol the Strait', win: 350, lose: 150,
      text: 'Corsair galleys out of the Moroccan coast prey on the Ceuta run. The captain of Ceuta wants the Strait swept: sail to the mark on your chart, and see one off.' },
    raid: { lon: -5.62, lat: 35.9, name: 'Alcácer Ceguer', label: 'The raid on Alcácer Ceguer', win: 600, lose: 250, standing: 15,
      text: 'The king means to take Alcácer Ceguer, the corsairs\' harbour between Ceuta and Tangier. The captain of Ceuta is going to look at it first, with every ship he can find. Meet his raid at the mark off the town: its galleys will come out to fight.',
      enemy: 'The galleys of Alcácer Ceguer', where: 'Alcácer Ceguer' },
    after: 'The king will remember the name. In 1458 he sails for Morocco himself: Lisbon, Lagos and Porto will want cargoes carried to Ceuta for the army.',
  },
  castile: {
    name: 'The Granada frontier', crown: 'the king',
    supply: { port: 'cadiz', portName: 'Cádiz', goods: { wheat: { qty: 12, pay: 22 }, wine: { qty: 8, pay: 18 } }, bonus: 300, standing: 6,
      letter: 'A letter from the court: <b>King Henry makes war on Granada.</b> The last Moorish kingdom in Spain holds the mountains from Ronda to Almería, and the king means to burn its fields every summer until it pays. The frontier towns are fed through Cádiz. Carry wheat and wine there: the king\'s purveyor pays above the market.',
      done: 'The king\'s purveyor at Cádiz has his wheat and wine for the frontier.', guns: 'The Duke of Medina Sidonia, who keeps the Strait for the king, has <b>swivel guns from his arsenal</b> put on your rails: he needs ships against the Moors\' galleys.' },
    patrol: { lon: -5.42, lat: 36.03, name: 'Gibraltar', label: 'Watch Gibraltar', win: 350, lose: 150,
      text: 'Gibraltar is still the Moors\' rock, and its galleys cross the Strait to Africa for men and horses. The Duke wants it watched: sail to the mark on your chart, and see one off.' },
    raid: { lon: -4.42, lat: 36.6, name: 'Málaga', label: 'The raid on the coast of Málaga', win: 600, lose: 250, standing: 15,
      text: 'The Duke\'s galleys are going to burn the shipping off Málaga, Granada\'s port, while the king\'s army burns the fields inland. Meet them at the mark off the coast: the Moors\' galleys will come out to fight.',
      enemy: 'The galleys of Málaga', where: 'the coast of Málaga' },
    after: 'The king will remember the name. The war on Granada goes on, summer after summer; Seville and Sanlúcar will want cargoes carried to Cádiz for the frontier.',
  },
};
export const STAGES = ['supply', 'patrol', 'raid', 'done'];

export function ensure(S) {
  if (!S.call) S.call = { stage: null, got: {}, told: {}, paid: 0 };
  return S.call;
}
export const callOf = (S) => CALLS[mine(S)];
export const stage = (S) => S.call?.stage || null;
export const active = (S) => ['supply', 'patrol', 'raid'].includes(stage(S));

// The mark on the chart for the stage you are on (render.js, and the course button).
export function mark(S) {
  const st = stage(S);
  if (st !== 'patrol' && st !== 'raid') return null;
  const m = callOf(S)[st];
  return { lon: m.lon, lat: m.lat, name: m.name, stage: st };
}

// Begins after the first voyage, in port, while there is still time before the real campaign.
export function begin(S) {
  const x = ensure(S);
  if (x.stage || S.voyages < 1 || !S.ship?.docked || yearOf(S.day) >= UNTIL) return null;
  if (S.first && !S.first.done) return null; // the guided first voyage comes first
  x.stage = 'supply';
  x.since = S.day;
  return { html: `${callOf(S).supply.letter} <i>See ${callOf(S).name} in port.</i>`, kind: 'discover', log: `${callOf(S).name}: the crown calls.`, call: 'begin' };
}

export function tick(S, ctx = {}) {
  const x = ensure(S), msgs = [];
  if (ctx.on !== false) { const m = begin(S); if (m) msgs.push(m); }
  if (active(S) && yearOf(S.day) >= UNTIL) {
    x.stage = 'lapsed';
    msgs.push({ html: `${callOf(S).name}: the crown has its campaign under way without you.`, kind: '', log: 'The crown\'s call lapsed.' });
  }
  return msgs;
}

// The supply stage: what is still wanted, and delivering what you carry.
export function wanted(S) {
  const x = ensure(S), G = callOf(S).supply.goods;
  return Object.entries(G).map(([g, w]) => ({ good: g, qty: w.qty, pay: w.pay, got: x.got[g] || 0, left: Math.max(0, w.qty - (x.got[g] || 0)) }));
}
export function canDeliver(S, pid = S.ship?.docked) {
  if (stage(S) !== 'supply' || pid !== callOf(S).supply.port) return false;
  return wanted(S).some((w) => w.left > 0 && (S.cargo?.[w.good] || 0) > 0);
}
export function deliver(S) {
  if (!canDeliver(S)) return null;
  const x = ensure(S), C = callOf(S).supply;
  let cz = 0;
  const bits = [];
  for (const w of wanted(S)) {
    const n = Math.min(w.left, S.cargo[w.good] || 0);
    if (n <= 0) continue;
    const have = S.cargo[w.good];
    S.paid[w.good] = have > n ? (S.paid[w.good] || 0) * (have - n) / have : 0;
    S.cargo[w.good] = have - n;
    x.got[w.good] = (x.got[w.good] || 0) + n;
    cz += n * w.pay;
    bits.push(`${n} ${good(w.good).unit} of ${good(w.good).name.toLowerCase()}`);
  }
  const done = wanted(S).every((w) => w.left <= 0);
  if (done) cz += C.bonus;
  S.purse += cz;
  x.paid += cz;
  Accounts.record(S, { kind: 'contract', amount: cz, port: C.port, text: `${callOf(S).name}: supplies for ${C.portName}` });
  if (!done) return { html: `The crown takes ${bits.join(' and ')} and pays <b>${fmt(cz)} cz</b>. It still wants ${wanted(S).filter((w) => w.left).map((w) => `${w.left} ${good(w.good).unit} of ${good(w.good).name.toLowerCase()}`).join(' and ')}.`, kind: 'port', log: `${callOf(S).name}: delivered ${bits.join(', ')} for ${cz} cz.`, cz };
  if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + C.standing;
  const armed = arm(S);
  x.stage = 'patrol';
  return { html: `${C.done} ${armed ? `${C.guns} ` : ''}The crown pays <b>${fmt(cz)} cz</b>, with the bonus for the whole of it. <i>${callOf(S).patrol.label}: the mark is on your chart.</i>`, kind: 'discover', log: `${callOf(S).name}: ${C.portName} supplied, ${cz} cz.`, cz, stage: 'patrol' };
}

// The crown's guns: swivel guns on the rails if she has none.
function arm(S) {
  const fit = S.ship.fit = S.ship.fit || {};
  if (fit.guns && fit.guns !== 'none') return false;
  fit.guns = 'bercos';
  ensure(S).armed = S.day;
  return true;
}

// At the mark: the fight finds you (sim.js puts it on ui.pendingEncounter).
export function contact(S, lon, lat) {
  const m = mark(S), x = ensure(S);
  // one fight a sortie: after one, the next waits until you have put into port (S.voyages counts arrivals)
  if (!m || x.near === S.voyages || S.ship?.docked || distNm(lon, lat, m.lon, m.lat) > REACH) return null;
  x.near = S.voyages;
  const R = callOf(S)[m.stage];
  // both are the crown's fights: you attack, by surprise, a weakened galley (pirates.js CALL_FOES)
  if (m.stage === 'patrol') return { call: 'patrol', where: R.name, big: false, strength: 0.8, hunted: true };
  return { call: 'raid', where: R.where, big: false, strength: 1, hunted: true };
}

// After the fight (voyage.js settleEncounter): the crown pays for the work, won or not, but not
// a captain who paid tribute instead.
export function settle(S, enc, result) {
  const x = ensure(S), st = enc.call, R = callOf(S)[st];
  if (!R || stage(S) !== st) return [];
  if (result === 'paid') {
    return [{ html: `The crown does not pay captains who pay the corsairs. ${R.label} is still to do: put into port, and sail out to the mark again.`, kind: 'danger', log: `${callOf(S).name}: paid tribute at ${R.name}.` }];
  }
  const won = ['taken', 'beaten', 'sheered'].includes(result);
  const cz = won ? R.win : R.lose;
  S.purse += cz;
  x.paid += cz;
  Accounts.record(S, { kind: 'war', amount: cz, text: `${callOf(S).name}: ${R.name}` });
  if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + (won ? (R.standing || 5) : 2);
  x.stage = st === 'patrol' ? 'raid' : 'done'; // the next stage begins from port
  x.results = { ...(x.results || {}), [st]: result };
  if (st === 'patrol') {
    return [{ html: `${won ? `<b>A corsair seen off at ${R.name}.</b> The crown pays <b>${fmt(cz)} cz</b>.` : `You did not beat her, but you showed the king's flag at ${R.name}: the crown pays <b>${fmt(cz)} cz</b> for the work.`} <i>${callOf(S).raid.label} is next: put into ${callOf(S).supply.portName} for orders, then sail for the mark on your chart.</i>`, kind: 'discover', log: `${callOf(S).name}: patrol at ${R.name} (${result}), ${cz} cz.`, cz, stage: 'raid' }];
  }
  if (S.contracts) S.contracts.unlocked = true; // the crown's captain: the merchant houses hear of it
  return [{ html: `${won ? `<b>${R.label}: a victory.</b> The enemy's galleys are beaten, and the crown pays <b>${fmt(cz)} cz</b>.` : `${R.label} goes badly for you, but the work is done: the crown pays <b>${fmt(cz)} cz</b>.`} In all, the call has paid you <b>${fmt(x.paid)} cz</b>. ${callOf(S).after}`, kind: 'discover', log: `${callOf(S).name}: the raid (${result}), ${cz} cz; ${x.paid} cz in all.`, cz, stage: 'done' }];
}

export default { ensure, tick, mark, contact, settle };

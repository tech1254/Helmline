// Callings (the design doc, phase 1): after the first voyage the player chooses how to make a
// name: a free merchant, a captain in the crown's service, or a privateer. A soft leaning that
// hardens: early on you change freely; the longer you follow a path, the more it costs to leave
// it, in standing and in the reputation (merit) earned on it. Each calling has a ladder of three
// ranks, climbed with merit from ambitions (ambitions.js), and each rank pays in its own coin.
// Pure rules: no browser modules (the simulations use this too).

export const CALLINGS = {
  merchant: {
    id: 'merchant', name: 'Free merchant', short: 'Merchant',
    ranks: ['Merchant', 'Trading house', 'Banking dynasty'],
    pitch: 'Build a trading house: buy cheap, sell dear, put money into ports and ships, and outtrade the great houses.',
    perks: ['Your goods sell for a little more', 'Better still as a trading house', 'The best prices on any quay as a banking dynasty'],
  },
  crown: {
    id: 'crown', name: 'Captain of the crown', short: "Crown's captain",
    ranks: ['Knight', 'Captain-donee', 'Admiral of the Ocean Sea'],
    pitch: 'Serve the crown: chart new coasts, carry its contracts, and rise to govern lands of your own.',
    perks: ['The crown pays more for charts and contracts', 'More again as a captain-donee', 'The most of all as Admiral'],
  },
  privateer: {
    id: 'privateer', name: 'Privateer', short: 'Privateer',
    ranks: ['Corsair', 'Sea-lord', 'Master of a haven'],
    pitch: 'Take ships for a living: hunt corsairs and the crown\'s enemies, collect bounties and plunder, and be feared.',
    perks: ['Bigger bounties and plunder; your crew fights better', 'More again as a sea-lord', 'The most of all as master of a haven'],
  },
};
export const CALLING_IDS = Object.keys(CALLINGS);

export const RANK_MERIT = [0, 8, 20]; // merit needed for each rank
const FREE_YEARS = 1; // changing calling costs nothing in the first year on it

// The benefit of each rank, by what it touches: multipliers on what is paid.
const PERKS = {
  merchant: { sale: [1.02, 1.04, 1.07] },
  crown: { contract: [1.1, 1.2, 1.35], charts: [1.25, 1.5, 2] },
  privateer: { bounty: [1.25, 1.5, 2], plunder: [1.2, 1.4, 1.7], fight: [0.03, 0.05, 0.08] },
};

export function ensureCalling(S) {
  if (S.calling === undefined) S.calling = null; // { id, since, merit: { merchant, crown, privateer }, offered, snooze }
  if (!S.callingMeta) S.callingMeta = { offered: false, snooze: -1, merit: { merchant: 0, crown: 0, privateer: 0 }, history: [] };
  return S.calling;
}

export const callingOf = (S) => S.calling?.id || null;
export const meritOf = (S, id = callingOf(S)) => (id ? S.callingMeta?.merit?.[id] || 0 : 0);
export function rankOf(S, id = callingOf(S)) {
  if (!id) return -1;
  const m = meritOf(S, id);
  let r = 0;
  for (let i = 0; i < RANK_MERIT.length; i++) if (m >= RANK_MERIT[i]) r = i;
  return r;
}
export const rankName = (S) => (callingOf(S) ? CALLINGS[callingOf(S)].ranks[rankOf(S)] : null);
export const yearsOn = (S) => (S.calling ? (S.day - S.calling.since) / 365 : 0);

// The multiplier (or, for `fight`, the bonus) a calling's rank gives on `kind`; 1 (or 0) if none.
export function perk(S, kind) {
  const id = callingOf(S);
  const t = id && PERKS[id][kind];
  if (!t) return kind === 'fight' ? 0 : 1;
  return t[rankOf(S, id)];
}

// What leaving the present calling would cost now: standing, and a share of the merit earned.
export function switchCost(S) {
  const y = yearsOn(S);
  if (!S.calling || y < FREE_YEARS) return { standing: 0, meritLost: 0, free: true };
  const hard = Math.min(1, (y - FREE_YEARS) / 8); // fully set after nine years
  return { standing: Math.round(5 + 35 * hard), meritLost: Math.round(meritOf(S) * (0.3 + 0.5 * hard)), free: false };
}

// Should the choice be put to the player now? After the first voyage, in port.
export function dueForChoice(S) {
  ensureCalling(S);
  if (S.calling) return false;
  if (!S.ship?.docked || (S.voyages || 0) < 1) return false;
  if (S.first && !S.first.done) return false; // finish the guided first voyage
  return S.day >= (S.callingMeta.snooze ?? -1);
}

export function snooze(S) {
  ensureCalling(S);
  S.callingMeta.snooze = S.day + 20; // ask again in three weeks
}

// Take up (or change to) a calling. Returns { ok, why?, cost? }.
export function choose(S, id) {
  ensureCalling(S);
  if (!CALLINGS[id]) return { ok: false, why: 'no such calling' };
  if (S.calling?.id === id) return { ok: false, why: 'already your calling' };
  const cost = switchCost(S);
  if (S.calling) {
    S.callingMeta.merit[S.calling.id] = Math.max(0, meritOf(S) - cost.meritLost);
    if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) - cost.standing;
    S.callingMeta.history.push({ id: S.calling.id, from: S.calling.since, to: S.day });
  }
  S.calling = { id, since: S.day };
  S.callingMeta.offered = true;
  return { ok: true, cost };
}

// Merit earned on a calling (from ambitions). Returns the new rank's name if it rose, else null.
export function addMerit(S, id, n) {
  ensureCalling(S);
  const before = rankOf(S, id);
  S.callingMeta.merit[id] = (S.callingMeta.merit[id] || 0) + n;
  const after = rankOf(S, id);
  return id === callingOf(S) && after > before ? CALLINGS[id].ranks[after] : null;
}

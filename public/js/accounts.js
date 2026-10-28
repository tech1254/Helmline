// The ledger: an account of money in and out of the purse.
//
// The purse itself is always true. What the captain *knows* about it is another matter:
// his own dealings go into the books at once, but a hired captain's dealings are only
// written up when the owner docks at a port where that captain has traded and reads
// the factor's report there. Until then they show as "not yet accounted for".

const MAX_ENTRIES = 400; // totals are kept separately, so old lines can go

export const KINDS = {
  sale: 'Sales',
  purchase: 'Purchases',
  wages: 'Wages and upkeep',
  skim: 'Kept by captains',
  contract: 'Contracts',
  charts: 'Crown rewards',
  ships: 'Ships',
  corsairs: 'Corsairs',
  bounty: 'Corsair bounty',
  invest: 'Feitorias and fleet shares',
  house: 'Your house and honours',
  crown: 'The crown\'s share',
  repairs: 'Repairs',
  boats: 'Boatmen',
};

export function ensureAccounts(S) {
  if (!S.accounts) {
    // A save from before the ledger: whatever is in the purse is brought forward.
    S.accounts = { opening: S.purse, openDay: S.day, entries: [], pending: [], totals: {}, voyage: null, nextId: 1 };
  }
  return S.accounts;
}

function post(A, e) {
  A.totals[e.kind] = (A.totals[e.kind] || 0) + e.amount;
  // Fold repeated trades of the same good on the same day into one line.
  const last = A.entries[A.entries.length - 1];
  if (last && last.who === e.who && last.kind === e.kind && last.port === e.port && last.good === e.good &&
      Math.floor(last.day) === Math.floor(e.day) && Math.floor(last.heard) === Math.floor(e.heard) && e.good) {
    last.amount += e.amount;
    last.qty = (last.qty || 0) + (e.qty || 0);
    return;
  }
  e.id = A.nextId++;
  A.entries.push(e);
  if (A.entries.length > MAX_ENTRIES) A.entries.splice(0, A.entries.length - MAX_ENTRIES);
}

// The owner's own dealings: known the moment they happen.
// e: { kind, amount, port?, good?, qty?, text? }
export function record(S, e) {
  if (!e.amount) return;
  const A = ensureAccounts(S);
  post(A, { who: 'you', port: S.ship.docked || null, ...e, day: S.day, heard: S.day });
}

// A hired captain's dealing, written up in the port where it happened.
export function captain(S, ship, e) {
  if (!e.amount) return;
  const A = ensureAccounts(S);
  const entry = { who: ship.id, ship: ship.name, port: ship.at, ...e, day: S.day };
  // If the owner is lying in the same port, he sees it done.
  if (S.ship.docked && S.ship.docked === ship.at) post(A, { ...entry, heard: S.day, heardAt: ship.at });
  else A.pending.push(entry);
}

// Wages accrue every day; they are booked as one line per passage or stay in port.
export function accrueCaptainWages(ship, amount) {
  ship.wagesDue = (ship.wagesDue || 0) + amount;
}

export function bookCaptainWages(S, ship, text) {
  const due = ship.wagesDue || 0;
  if (due < 0.5) return;
  ship.wagesDue = 0;
  captain(S, ship, { kind: 'wages', amount: -due, text });
}

// The owner's crew is paid as it sails; the voyage is booked when he makes port.
export function accrueWages(S, amount, fromPort) {
  const A = ensureAccounts(S);
  if (!A.voyage) A.voyage = { from: fromPort || null, start: S.day, wages: 0 };
  A.voyage.wages += amount;
}

export function closeVoyage(S, portId) {
  const A = ensureAccounts(S);
  const v = A.voyage;
  A.voyage = null;
  if (!v || v.wages < 0.5) return;
  post(A, { who: 'you', kind: 'wages', port: portId, from: v.from, days: S.day - v.start, amount: -v.wages, day: S.day, heard: S.day });
}

// The factor in any port a hired captain trades in keeps his accounts. When the owner
// is in such a port (dropping anchor there, or lying there when the captain calls),
// he is handed everything that captain has done since his last report, wherever it
// happened, and the wages run up to that day.
export function trades(ship, portId) {
  return ship.at === portId || (ship.route?.stops || []).some((st) => st.port === portId);
}

export function reveal(S, portId, ships = []) {
  const A = ensureAccounts(S);
  const names = new Set();
  let count = 0, net = 0;
  for (const ship of ships) {
    if (!trades(ship, portId)) continue;
    bookCaptainWages(S, ship, 'to date');
    const mine = A.pending.filter((e) => e.who === ship.id);
    if (!mine.length) continue;
    A.pending = A.pending.filter((e) => e.who !== ship.id);
    for (const e of mine) {
      post(A, { ...e, heard: S.day, heardAt: portId });
      net += e.amount;
    }
    count += mine.length;
    names.add(ship.name);
  }
  return count ? { count, ships: [...names], net } : null;
}

export function known(S) {
  const A = ensureAccounts(S);
  return A.opening + Object.values(A.totals).reduce((s, v) => s + v, 0);
}

// What the purse says, less what the books say, less wages known to be running:
// the dealings of hired captains not yet heard of.
export function unaccounted(S) {
  const A = ensureAccounts(S);
  return S.purse - known(S) + (A.voyage ? A.voyage.wages : 0) + captainWagesRunning(S);
}

// Wages the hired crews have drawn since their last report. You know their rates, so
// these are not a mystery; they are entered with the captain's next accounts.
export function captainWagesRunning(S) {
  return (S.fleet?.ships || []).reduce((t, x) => t + (x.wagesDue || 0), 0);
}

// Sums by kind for entries heard of since `sinceDay`.
export function totalsSince(S, sinceDay) {
  const A = ensureAccounts(S);
  const out = {};
  for (const e of A.entries) if (e.heard >= sinceDay) out[e.kind] = (out[e.kind] || 0) + e.amount;
  return out;
}

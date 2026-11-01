// The sea loan (câmbio marítimo): how a Lisbon merchant without the money for a voyage found it.
// The Church forbade lending at interest, so nothing here runs by the day. A Genoese house (Salvago
// in Lisbon, the Lomellini factor in Lagos) advances a lump sum against your ship and her cargo,
// for a voyage into waters named at signing. You owe the sum and a premium fixed then, by a date.
// The lender carries the risk of the sea: what corsairs take and what sea water ruins in those
// waters comes off the debt, premium and all. Out of those waters he carries nothing.
// Miss the date and the debt grows by a tenth, your name suffers, and his agents take what is in
// your purse whenever you put in at Lisbon, Lagos or Seville, until it is paid. One loan at a time.
// Pure rules: no browser here.

import * as Ships from './ships.js';
import * as Accounts from './accounts.js';

export const LENDERS = {
  lisbon: { name: 'the house of Salvago', who: 'Lorenzo Salvago', of: 'Genoese' },
  lagos: { name: 'the Lomellini factor', who: 'Battista Lomellini', of: 'Genoese' },
  seville: { name: 'the Seville house of Salvago', who: 'Bernardo Salvago', of: 'Genoese' },
};
// The waters a loan covers, the premium, and how long you have to repay.
// `lat`: the cover ends south of this latitude (the Canaries are home waters).
export const WATERS = [
  { id: 'home', name: 'Home waters', where: 'Portugal, Andalusia, Morocco, Madeira and the Canaries', lat: 27, premium: 0.15, days: 150 },
  { id: 'guinea', name: 'Guinea', where: 'down the coast as far as Serra Leoa', lat: 7.5, premium: 0.25, days: 270 },
  { id: 'far', name: 'Beyond Guinea', where: 'the Mina coast and beyond', lat: -90, premium: 0.35, days: 420 },
];
export const LATE_PENALTY = 0.1;
export const LATE_STANDING = 3;
export const BARRED_DAYS = 365; // after a loan went unpaid past its day, no lender for a year
const STEP = 50;

export function ensureLending(S) {
  if (!S.lending) S.lending = { loan: null, history: [], barredUntil: null };
  return S.lending;
}

export const lenderAt = (pid) => LENDERS[pid] || null;
export const water = (id) => WATERS.find((w) => w.id === id);

// What the house will advance: three fifths of what your ship and her cargo are worth, and more
// for a good name; less while you owe a lender or wear a bad one.
export function limit(S) {
  const sh = S.ship;
  const ship = Ships.hullValue(sh.hull, Ships.serviceYears(sh, S.day));
  const cargo = Object.values(S.paid || {}).reduce((t, x) => t + (x || 0), 0);
  const standing = Math.max(0, S.contracts?.standing || 0);
  return Math.max(100, Math.floor((0.6 * (ship + cargo) + 15 * standing) / STEP) * STEP);
}

// The terms, or why there are none.
export function offer(S, pid) {
  const L = ensureLending(S);
  const lender = lenderAt(pid);
  if (!lender) return null;
  if (L.loan) return { lender, no: `You already owe ${LENDERS[L.loan.port]?.name || 'a lender'}: one sea loan at a time.` };
  if (L.barredUntil != null && S.day < L.barredUntil) return { lender, no: 'Since your last loan went unpaid past its day, no Genoese house will lend to you yet.' };
  if (!S.ship.docked) return null;
  const cold = (pid === 'lisbon' || pid === 'seville') && (S.story?.relation || 0) < 0 ? 0.05 : 0; // Salvago remembers
  const late = (L.history || []).some((h) => h.late) ? 0.05 : 0;
  return { lender, max: limit(S), terms: WATERS.map((w) => ({ ...w, premium: Math.round((w.premium + cold + late) * 100) / 100 })) };
}

export const owedOf = (loan) => Math.max(0, Math.round((loan.sum - loan.cover) * (1 + loan.premium) * (loan.late ? 1 + LATE_PENALTY : 1)) - (loan.repaid || 0));

export function borrow(S, pid, sum, waterId) {
  const o = offer(S, pid);
  if (!o || o.no) return null;
  const w = o.terms.find((t) => t.id === waterId);
  sum = Math.max(STEP, Math.min(o.max, Math.round(sum / STEP) * STEP));
  if (!w) return null;
  const L = ensureLending(S);
  L.loan = { port: pid, sum, premium: w.premium, waters: w.id, lat: w.lat, taken: S.day, due: S.day + w.days, cover: 0, repaid: 0, late: false };
  S.purse += sum;
  Accounts.record(S, { kind: 'debt', amount: sum, port: pid, text: `Sea loan from ${o.lender.name}, for ${w.name.toLowerCase()}` });
  return L.loan;
}

// Losses at sea while a loan is out: within its waters the lender bears them. `value` is what the
// goods (or coin) cost you. Returns the part taken off the debt, or 0.
export function seaLoss(S, value, lat) {
  const loan = S.lending?.loan;
  if (!loan || value <= 0 || lat < loan.lat) return 0;
  const room = Math.max(0, loan.sum - loan.cover);
  const off = Math.round(Math.min(room, value));
  loan.cover += off;
  return Math.round(off * (1 + loan.premium));
}

// Pay what you can (all, if the purse runs to it).
export function repay(S, amount = Infinity) {
  const L = ensureLending(S);
  const loan = L.loan;
  if (!loan) return 0;
  const pay = Math.max(0, Math.min(Math.floor(S.purse), owedOf(loan), amount));
  if (pay <= 0) return 0;
  S.purse -= pay;
  loan.repaid += pay;
  Accounts.record(S, { kind: 'debt', amount: -pay, port: S.ship.docked, text: `Repaid ${LENDERS[loan.port].name}` });
  if (owedOf(loan) <= 0) settle(S);
  return pay;
}

function settle(S) {
  const L = ensureLending(S);
  const loan = L.loan;
  L.history.push({ port: loan.port, sum: loan.sum, taken: loan.taken, done: S.day, late: loan.late, cover: loan.cover });
  if (loan.late) L.barredUntil = S.day + BARRED_DAYS;
  L.loan = null;
}

// Each day: a loan past its day goes late once (a tenth more, and your name suffers); a loan the
// sea has wiped out is settled. In Lisbon or Lagos, the lender's agents take what they can of a
// late debt. Returns messages.
export function tick(S) {
  const L = ensureLending(S);
  const loan = L.loan;
  const out = [];
  if (!loan) return out;
  if (owedOf(loan) <= 0) {
    out.push({ html: `The sea has taken all that ${LENDERS[loan.port].name} lent against: you owe them nothing.`, kind: 'port', log: 'Sea loan cancelled by losses at sea.' });
    settle(S);
    return out;
  }
  if (!loan.late && S.day > loan.due) {
    loan.late = true;
    if (S.contracts?.unlocked) S.contracts.standing = Math.max(0, (S.contracts.standing || 0) - LATE_STANDING);
    out.push({ html: `<b>Your sea loan is past its day.</b> ${LENDERS[loan.port].who} adds a tenth to it (${owedOf(loan).toLocaleString()} cz now), and the quays hear of it. His agents will take what is in your purse whenever you put in at Lisbon, Lagos or Seville until it is paid.`, kind: 'alert', level: 'alert', log: 'A sea loan went unpaid past its day.' });
  }
  if (loan.late && S.ship.docked && LENDERS[S.ship.docked] && S.purse > 0) {
    const took = repay(S);
    if (took) out.push({ html: `${LENDERS[loan.port].who}'s agents take <b>${took.toLocaleString()} cz</b> from your purse against the late loan${S.lending.loan ? `; ${owedOf(S.lending.loan).toLocaleString()} cz still owed` : ', and it is paid'}.`, kind: 'alert', level: 'alert', log: `A lender took ${took} cz against a late loan.` });
  }
  return out;
}

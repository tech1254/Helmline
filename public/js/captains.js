// Captains who learn. Most men looking for a ship on the Lisbon quay are green: one or two stars
// and cheap. Now and then a seasoned man asks a seasoned man's wage. Five stars is never hired,
// only earned. Navigation grows with days at sea, faster on hard passages (the tropics, the open
// ocean beyond the Cape); trade grows with every cargo sold. A season with the pilots at Lagos, or
// with a factor in Lisbon, buys a star sooner. And a captain who has grown good knows his worth:
// he asks for a raise, and takes it badly if he is refused.
//
// Skills are kept as fractions (2.6 is two stars, well on the way to three); stars are whole.

export const MAX_STARS = 5;
export const MAX_TRAINED = 4; // training goes so far; the fifth star is earned at sea and in the market
// Days at sea for a one-star navigator to gain a star; a better one learns more slowly (each star
// takes `stars` times as long). On easy coastal runs a green captain reaches three stars in about
// four years; on the Guinea coast or the India run in two or three.
export const NAV_DAYS = 250;
export const HARD_TROPICS = 1.5; // a passage south of the Canaries
export const HARD_BEYOND = 2; // days beyond the chart, on the open ocean
// Sales for a one-star trader to gain a star (likewise times his stars).
export const TRADE_SALES = 12;

// Wage, cz a day, by the average of his two skills (in between: in proportion).
const WAGES = [1, 1, 2, 3, 4, 5]; // a master is worth only a little more than a fine captain: tuned 28 Oct 2026 (tests/sim/personas.mjs)
export function fairWage(c) {
  const avg = Math.max(1, Math.min(MAX_STARS, (c.nav + c.trade) / 2));
  const i = Math.floor(avg), f = avg - i;
  return Math.round(WAGES[i] + (WAGES[Math.min(MAX_STARS, i + 1)] - WAGES[i]) * f);
}

export const stars = (x) => Math.max(1, Math.min(MAX_STARS, Math.floor((x ?? 1) + 1e-9)));

// A man looking for a ship: three in four are green, the rest seasoned.
export function applicant(rand = Math.random) {
  const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  let nav, trade;
  if (rand() < 0.75) { nav = pick(1, 2); trade = pick(1, 2); }
  else if (rand() < 0.5) { nav = pick(3, 4); trade = pick(2, 3); }
  else { nav = pick(2, 3); trade = pick(3, 4); }
  const c = { nav, trade, loyalty: 100 };
  c.wage = c.worth = fairWage(c); // worth: what his skill was worth when his wage was agreed
  return c;
}

const SKILL = { nav: 'navigator', trade: 'trader' };
function promoted(c, skill, before, shipName) {
  const now = stars(c[skill]);
  if (now <= stars(before)) return null;
  const text = `Captain ${c.name} of the ${shipName} has become a ${now >= 5 ? 'master' : now >= 4 ? 'fine' : now >= 3 ? 'capable' : 'better'} ${SKILL[skill]}: ${'★'.repeat(now)}${'☆'.repeat(MAX_STARS - now)}.`;
  return { html: text.replace(`the ${shipName}`, `the <b>${shipName}</b>`), kind: 'port', level: 'normal', log: text };
}

// Days at sea: `hard` days of them on hard passages count for more.
export function learnAtSea(c, days, hardDays = 0, beyondDays = 0, shipName = '') {
  const before = c.nav;
  const weighted = Math.max(0, days - hardDays - beyondDays) + hardDays * HARD_TROPICS + beyondDays * HARD_BEYOND;
  c.nav = Math.min(MAX_STARS, c.nav + weighted / (NAV_DAYS * stars(c.nav)));
  return promoted(c, 'nav', before, shipName);
}

// A cargo sold.
export function learnTrade(c, shipName = '') {
  const before = c.trade;
  c.trade = Math.min(MAX_STARS, c.trade + 1 / (TRADE_SALES * stars(c.trade)));
  return promoted(c, 'trade', before, shipName);
}

// ---- Training ---------------------------------------------------------------------------
export const TRAINING = {
  nav: { port: 'lagos', where: 'with the pilots at Lagos', days: 90, learns: 'navigation' },
  trade: { port: 'lisbon', where: 'with a factor in Lisbon', days: 90, learns: 'trade' },
};
export const trainFee = (c, skill) => 150 * (stars(c[skill]) + 1);
export const canTrain = (c, skill) => stars(c[skill]) < MAX_TRAINED;

// The season is over: up to the next whole star.
export function finishTraining(c, skill) {
  c[skill] = Math.min(MAX_TRAINED, stars(c[skill]) + 1);
  return stars(c[skill]);
}

// ---- Raises -----------------------------------------------------------------------------
export const RAISE_GAP = 1; // he asks once his worth is this much above his wage
export const ASK_AGAIN_DAYS = 365; // after a refusal
export const ANSWER_DAYS = 60; // no answer in this time is a refusal
export const REFUSED_LOYALTY = 25;
export const GRANTED_LOYALTY = 10;

// Called as days pass: a good captain asks; one left unanswered takes it as no. Returns news.
export function considerRaise(S, ship) {
  const c = ship.captain;
  if (c.asks) {
    if (S.day - c.asks.day >= ANSWER_DAYS) return refuse(S, ship, true);
    return null;
  }
  const worth = fairWage(c);
  if (c.worth == null) c.worth = worth; // hired before captains learned: content with his wage
  if (worth <= c.worth || worth < c.wage + RAISE_GAP) return null; // he asks once he has grown
  if (c.refused != null && S.day - c.refused < ASK_AGAIN_DAYS) return null;
  c.asks = { wage: worth, day: S.day };
  const text = `Captain ${c.name} of the ${ship.name} asks for a raise, from ${c.wage} to ${worth} cz a day: he has grown good, and knows it. Answer him in the Fleet panel.`;
  return { html: text.replace(`the ${ship.name}`, `the <b>${ship.name}</b>`), kind: 'alert', level: 'alert', log: text };
}

export function grant(S, ship) {
  const c = ship.captain;
  if (!c.asks) return null;
  c.wage = c.worth = c.asks.wage;
  c.asks = null;
  c.loyalty = Math.min(100, (c.loyalty ?? 100) + GRANTED_LOYALTY);
  return `Captain ${c.name} will sail for ${c.wage} cz a day.`;
}

export function refuse(S, ship, unanswered = false) {
  const c = ship.captain;
  if (!c.asks) return null;
  c.asks = null;
  c.refused = S.day;
  c.loyalty = Math.max(0, (c.loyalty ?? 100) - REFUSED_LOYALTY);
  const text = `Captain ${c.name} of the ${ship.name} ${unanswered ? 'heard nothing about his raise and takes it as a no' : 'is refused his raise'}. His loyalty falls to ${Math.round(c.loyalty)}.`;
  return { html: text.replace(`the ${ship.name}`, `the <b>${ship.name}</b>`), kind: 'alert', level: 'alert', log: text };
}

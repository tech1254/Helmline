// The story: the House of the player, 1451-1551 (the storyline doc). Act I, "The known coast",
// 1451-1460, is played here; later acts arrive with the roadmap steps they need.
//
// A story is a list of BEATS. Each fires once, when its moment comes (a date, a port, a purse),
// and shows a letter or a chapter card; some end in a choice, whose outcome is kept in
// S.story.choices for later beats to read. Letters reach you in port; chapter cards anywhere.
// Pure rules: no browser here (storyview.js shows them).

import { yearOf, dayOfYear } from './ships.js';
import * as Accounts from './accounts.js';

export const DEBT = 250; // Joao Vaz owed Salvago's house
export const DEBT_FORCED = 300; // what Salvago takes if you let it run past New Year
export const SALVAGO_PRICE = 600; // for the rutter
export const SALVAGO_LOAN = 400; // as a partner, he advances this against a share
const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
export const DEBT_DUE = date(1452, 1, 1);
const EARLY_BY = date(1451, 9, 1);
const CADAMOSTO = date(1455, 6, 15);
const HENRY_DIES = date(1460, 11, 13);

// The rutter's pages: what Joao Vaz wrote, and what it turns out to mean. Page 1 is Act I's.
export const PAGES = [
  { n: 1, title: 'The river of gold', riddle: '"South of the Cape of Masts the coast is low and green. A river comes out of the east there, wide as the Tagus, with a bar of three fathoms at high water. Nine days up, at a place they call Cantor, the caravans bring gold to trade for salt."', found: 'The Gambia, and Cantor upriver. Your father\'s soundings of the bar are good.' },
  { n: 2, title: 'The island of sugar', riddle: '"An island under the line, high and wooded, with no people on it. The soil is red and the rain falls every day. Cane would grow there as it grows in Madeira."', found: '' },
  { n: 3, title: 'The river that sweetens the sea', riddle: '"A river so great that the sea is sweet twenty leagues out from its mouth. The king of that country, they say, has a court like a Christian king\'s."', found: '' },
  { n: 4, title: 'The last page', riddle: 'Torn out. Only the edge of a drawing of the coast remains, turning east.', found: '' },
];

export function ensureStory(S, fresh = false) {
  if (!S.story) {
    // A game from before the story: it joins where the player is, without the prologue or the debt.
    S.story = { house: 'Vaz', fired: {}, choices: {}, pages: {}, letters: [], debt: null, relation: 0 };
    if (!fresh) {
      for (const id of ['prologue', 'debt_due', 'debt_taken', 'first_profit']) S.story.fired[id] = true;
      if (S.contracts?.unlocked) S.story.fired.henry = true;
    }
  }
  return S.story;
}

const docked = (S) => S.ship?.docked;
const inPort = (S, id) => S.ship?.docked === id;

// Each beat: id; when(S) is true when it is due; show(S) gives { kind: 'letter' | 'card', from?,
// title, body (html), choices?: [{ id, label, primary? }] } and choose(S, choiceId) applies it
// (with no choices, choose(S) is called once it has been read). Returns a line for the log.
export const BEATS = [
  {
    id: 'prologue', act: 1,
    when: (S) => S.day < 30,
    show: (S) => ({
      kind: 'card', title: 'Lisbon, March 1451',
      body: `<p>Your father, João Vaz, sailed south past Cape Bojador for Prince Henry, and the sea kept him. It sent back his barca, the <i>Esperança</i>, towed into Lagos by a fishing boat, and his sea chest: 300 cruzados, a note of what he owed to the Genoese house of Salvago, and his <b>rutter</b>, his book of courses and soundings, its last pages half-filled.</p>
        <p>Your mother has sold the furniture. The <i>Esperança</i> lies at the Ribeira quay. The book says there is a river where the caravans bring gold.</p>
        <label class="story-name">Your family's name <input id="story-house" value="${S.story.house}" maxlength="20" autocomplete="off"></label>`,
      ok: 'Begin',
    }),
    choose: (S, _c, input) => {
      const name = String(input || '').trim().replace(/[<>&"]/g, '').slice(0, 20);
      if (name) S.story.house = name[0].toUpperCase() + name.slice(1);
      S.story.debt = { amount: DEBT, due: DEBT_DUE, paid: null };
      return `The house of ${S.story.house} begins, in debt to Salvago for ${DEBT} cz.`;
    },
  },
  {
    id: 'debt_due', act: 1,
    when: (S) => inPort(S, 'lisbon') && S.story.debt && !S.story.debt.paid && S.day >= DEBT_DUE - 120,
    show: (S) => ({
      kind: 'letter', from: 'The clerk of Lorenzo Salvago', title: 'A reminder',
      body: `<p>Senhor Salvago presents his compliments and reminds the house of ${S.story.house} that João Vaz's debt of <b>${DEBT} cruzados</b> falls due at New Year. He would be sorry to collect it any other way than from your hand. It may be paid at the market in Lisbon.</p>`,
    }),
    choose: () => 'Salvago\'s clerk called about the debt.',
  },
  {
    id: 'debt_taken', act: 1,
    when: (S) => S.story.debt && !S.story.debt.paid && S.day >= DEBT_DUE,
    show: (S) => ({
      kind: 'letter', from: 'Lorenzo Salvago', title: 'The debt, collected',
      body: `<p>The year is out and João Vaz's debt with it. My agents have taken <b>${DEBT_FORCED} cruzados</b> from your account with the money-changers: the ${DEBT} owed, and what the waiting cost me. I do not forget a house that makes me collect.</p><p class="sig">Lorenzo Salvago</p>`,
    }),
    choose: (S) => {
      S.purse -= DEBT_FORCED;
      Accounts.record(S, { kind: 'debt', amount: -DEBT_FORCED, port: 'lisbon', text: 'Salvago collected João Vaz\'s debt, with interest' });
      S.story.debt.paid = 'taken';
      S.story.relation = -1;
      return `Salvago collected the debt, ${DEBT_FORCED} cz.`;
    },
  },
  {
    id: 'first_profit', act: 1,
    when: (S) => docked(S) && S.voyages >= 1 && S.purse >= 360,
    show: (S) => ({
      kind: 'letter', from: 'Inês', title: 'A letter from home',
      body: `<p>My child, Senhor Salvago's clerk came again today and I sent him away with a smile, which he did not expect. Your father always said the first profit is the dangerous one, because it makes a man think he understands the sea. Buy a little less than you can, and come home before the autumn gales.</p><p class="sig">Your mother</p>`,
    }),
    choose: () => 'A letter from Inês.',
  },
  {
    id: 'henry', act: 1,
    when: (S) => docked(S) && S.contracts?.unlocked,
    show: (S) => ({
      kind: 'letter', from: 'Prince Henry', title: 'From Sagres',
      body: `<p>We hear that the heir of João Vaz trades well${S.story.debt?.paid && S.story.debt.paid !== 'taken' ? ' and pays the debts of his house' : ''}. Your father served us past Bojador. If you would serve us further, find us a people beyond the known coast who will trade with Portugal, and come and tell us of it.</p><p class="sig">Henrique</p>`,
    }),
    choose: () => 'Prince Henry wrote from Sagres.',
  },
  {
    id: 'alvaro', act: 1,
    when: (S) => inPort(S, 'lagos'),
    show: () => ({
      kind: 'letter', from: 'Mestre Álvaro Gonçalves', title: 'An old pilot of Lagos',
      body: `<p>A grey man in a pilot's cap stops at the <i>Esperança</i>'s gangway. "That's João's barca. I sailed with your father for twenty years." He reads the rutter on the quay.</p>
        <p>"That's his hand, sure enough. Look: he gives the bar of a river at three fathoms at high water, and gold at a place called Cantor, nine days upriver. South of the Cape of Masts, he says. He went past the Rio do Ouro looking for a river that runs from the east, and he never wrote down a thing he hadn't seen. Find his river and you'll find what he was after."</p><p class="sig">Mestre Álvaro Gonçalves</p>`,
    }),
    choose: (S) => { S.story.alvaro = true; return 'Mestre Álvaro read the rutter: the river of gold lies south of the Cape of Masts.'; },
  },
  {
    id: 'page1', act: 1,
    when: (S) => inPort(S, 'gambia') || inPort(S, 'cantor'),
    show: (S) => ({
      kind: 'card', title: 'The rutter: the river of gold',
      body: `<p>The bar is where your father said, at three fathoms. The river comes out of the east, wide as the Tagus. This is his river of gold: the Gambia, and far up it, Cantor, where the caravans trade gold for salt.</p>
        <p>The first page of the rutter is filled in. ${S.discovered?.cantor ? 'Cantor is on your chart.' : 'Your father\'s directions put Cantor on your chart, nine days upriver: a shallow ship can reach it.'}</p>`,
      ok: 'Go on',
    }),
    choose: (S) => {
      S.story.pages[1] = S.day;
      S.story.reveal = 'cantor'; // the view charts it
      if (S.day < CADAMOSTO) S.story.first = (S.story.first || []).concat('gambia');
      return 'The rutter\'s first page: the Gambia, and gold at Cantor.';
    },
  },
  {
    id: 'salvago_offer', act: 1,
    when: (S) => inPort(S, 'lisbon') && S.story.pages[1] != null,
    show: (S) => ({
      kind: 'letter', from: 'Lorenzo Salvago', title: 'An offer for the book',
      body: `<p>${S.story.relation < 0 ? 'We parted badly over your father\'s debt. Let that be forgotten.' : 'You paid your father\'s debt like a gentleman.'} I hear you found João's river. Then the rest of his book is worth something to me.</p>
        <p>I will give you <b>${SALVAGO_PRICE} cruzados</b> for the rutter. Or, if you would rather keep it, take <b>${SALVAGO_LOAN} cruzados</b> of my money now as a partner, and give my house a share of whatever else your father found. Or keep it and go your own way. Think well.</p><p class="sig">Lorenzo Salvago</p>`,
      choices: [
        { id: 'keep', label: 'Keep the rutter', primary: true },
        { id: 'partner', label: `Take him as a partner (+${SALVAGO_LOAN} cz)` },
        { id: 'sell', label: `Sell it (+${SALVAGO_PRICE} cz)` },
      ],
    }),
    choose: (S, c) => {
      S.story.choices.rutter = c;
      if (c === 'sell') {
        S.purse += SALVAGO_PRICE;
        Accounts.record(S, { kind: 'debt', amount: SALVAGO_PRICE, port: 'lisbon', text: 'Sold João Vaz\'s rutter to Salvago' });
        S.story.relation = 0;
        return `Sold the rutter to Salvago for ${SALVAGO_PRICE} cz.`;
      }
      if (c === 'partner') {
        S.purse += SALVAGO_LOAN;
        Accounts.record(S, { kind: 'debt', amount: SALVAGO_LOAN, port: 'lisbon', text: 'Salvago\'s money, as a partner in the rutter' });
        S.story.relation = 1;
        return `Took Salvago as a partner in the rutter: ${SALVAGO_LOAN} cz.`;
      }
      S.story.relation = Math.min(S.story.relation, 0) - 1;
      return 'Kept the rutter. Salvago will be a rival.';
    },
  },
  {
    id: 'cadamosto', act: 1,
    when: (S) => docked(S) && S.day >= CADAMOSTO,
    show: (S) => {
      const first = (S.story.first || []).includes('gambia');
      return {
        kind: 'letter', from: 'News from Lagos', title: 'A Venetian on the Gambia',
        body: first
          ? `<p>Alvise Cadamosto, a Venetian in Prince Henry's service, has come home from the Gambia. He tells the Prince that a barca of Lisbon was trading there before him, and names the house of ${S.story.house}. The chroniclers at Sagres write it down.</p>`
          : `<p>Alvise Cadamosto, a Venetian in Prince Henry's service, has come home from the Gambia with tales of the river and its kings. The river your father found now has another man's name on it.</p>`,
      };
    },
    choose: (S) => {
      if ((S.story.first || []).includes('gambia') && S.house) S.house.renown = (S.house.renown || 0) + 5;
      return 'News of Cadamosto on the Gambia.';
    },
  },
  {
    id: 'henry_dies', act: 1,
    when: (S) => S.day >= HENRY_DIES,
    show: (S) => ({
      kind: 'card', title: 'The end of Act I: the patron is gone',
      body: `<p><i>Sagres, November 1460.</i> Prince Henry is dead. The man who sent ships past Bojador for forty years leaves debts, a school of pilots, and a coast charted to the mountains of Serra Leoa. The commissions from Sagres end with him.</p>
        <p>Your mother writes: "Now we find out who our friends were."</p>
        <p class="fine">${actOneSummary(S)}</p>
        <p class="fine">Act II, <i>The Guinea lease</i>, comes in a later update. Your voyages go on meanwhile.</p>`,
      ok: 'Sail on',
    }),
    choose: () => 'Prince Henry died at Sagres. The end of Act I.',
  },
];

function actOneSummary(S) {
  const st = S.story;
  const bits = [];
  bits.push(st.debt?.paid === 'early' ? 'You paid your father\'s debt early' : st.debt?.paid === 'taken' ? 'Salvago had to collect your father\'s debt' : st.debt?.paid ? 'You paid your father\'s debt' : null);
  bits.push(st.pages[1] != null ? `found the river of gold${(st.first || []).includes('gambia') ? ' before Cadamosto' : ''}` : 'never found your father\'s river');
  bits.push(st.choices.rutter === 'sell' ? 'and sold the rutter to Salvago' : st.choices.rutter === 'partner' ? 'and took Salvago as a partner' : st.choices.rutter === 'keep' ? 'and kept the rutter: Salvago is your rival' : '');
  return bits.filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

// The beat due now, if any (the first unfired one whose moment has come).
export function due(S) {
  const st = ensureStory(S);
  if (st.off) return null;
  for (const b of BEATS) {
    if (st.fired[b.id] != null) continue; // fired[id] is the day it fired (0 for the prologue)
    let ok = false;
    try { ok = !!b.when(S); } catch { /* not readable yet */ }
    if (ok) return b;
  }
  return null;
}

// A beat has been read (and its choice made): apply it, mark it, keep the letter.
export function resolve(S, beat, choiceId = null, input = null) {
  const st = ensureStory(S);
  if (st.fired[beat.id] != null) return null;
  const shown = beat.show(S);
  const line = beat.choose ? beat.choose(S, choiceId, input) : '';
  st.fired[beat.id] = S.day;
  st.letters.push({ day: S.day, id: beat.id, from: shown.from || null, title: shown.title, line });
  return line;
}

// Paying the debt in Lisbon, from the market panel.
export function canPayDebt(S) {
  const d = ensureStory(S).debt;
  return !!d && !d.paid && S.ship?.docked === 'lisbon';
}
export function payDebt(S) {
  const st = ensureStory(S);
  if (!canPayDebt(S) || S.purse < DEBT) return null;
  S.purse -= DEBT;
  Accounts.record(S, { kind: 'debt', amount: -DEBT, port: 'lisbon', text: 'Paid João Vaz\'s debt to Salvago' });
  st.debt.paid = S.day < EARLY_BY ? 'early' : 'paid';
  st.relation = st.debt.paid === 'early' ? 1 : 0;
  st.fired.debt_due = st.fired.debt_due ?? S.day;
  st.letters.push({ day: S.day, id: 'debt_paid', from: null, title: 'The debt paid', line: `Paid Salvago the ${DEBT} cz your father owed${st.debt.paid === 'early' ? ', early' : ''}.` });
  return st.debt.paid;
}

export const yearText = (day) => String(yearOf(day));

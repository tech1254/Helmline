// The story of a Castilian house, Act I, "The frontier at sea", 1451–1474 (the four-nations doc).
// A pilot family of Palos: the father lost on a run down the African coast, his barca, and a debt
// to the Genoese of Seville. Castile's lords hold the Canaries; Portugal claims Guinea, and from
// 1455 the Pope agrees. The act ends when Isabella is proclaimed queen, in December 1474.
// Beats work as in story.js (same engine, same fields). Pure rules: no browser here.

import { dayOfYear } from './ships.js';
import * as Accounts from './accounts.js';

export const DEBT = 250;
export const DEBT_FORCED = 300;
export const HERRERA_STAKE = 300; // a share in the lord of the Canaries' orchil
export const HERRERA_RETURN = 650; // what the share has paid by 1462
export const GUINEA_SHARE = 200; // the Palos men's share for gold brought home from Guinea
const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
export const DEBT_DUE = date(1452, 1, 1);
export const EARLY_BY = date(1451, 9, 1);
const ROMANUS = date(1455, 1, 8); // Romanus Pontifex
const HERRERA_PAYS = date(1462, 6, 1);
const GIBRALTAR = date(1462, 8, 20);
const ISABELLA = date(1474, 12, 13);

const docked = (S) => S.ship?.docked;
const inPort = (S, id) => S.ship?.docked === id;
const goldAboard = (S) => (S.cargo?.gold || 0) > 0;

export const BEATS = [
  {
    id: 'prologue', act: 1,
    when: (S) => S.day < 30,
    show: (S) => ({
      kind: 'card', title: 'Palos, March 1451',
      body: `<p>Your father, Alonso, was a pilot of Palos. Last autumn he went south with the Guinea men, past the Canaries to the coast the Portuguese call theirs, and the sea kept him. The <i>Santa María de la Rábida</i>, his barca, came home under his mate with a hold of salt fish and the news.</p>
        <p>He left you the barca, 300 cruzados in the chest, and a paper in the hand of Bernardo Salvago, a Genoese of Seville: <b>${DEBT} cruzados</b>, due at New Year. The friars of La Rábida have said a mass for him. The river is high, and the Guinea men are talking again.</p>
        <label class="story-name">Your family's name <input id="story-house" value="${S.story.house}" maxlength="20" autocomplete="off"></label>`,
      ok: 'Begin',
    }),
    choose: (S, _c, input) => {
      const name = String(input || '').trim().replace(/[<>&"]/g, '').slice(0, 20);
      if (name) S.story.house = name[0].toUpperCase() + name.slice(1);
      S.story.debt = { amount: DEBT, due: DEBT_DUE, paid: null };
      return `The house of ${S.story.house} begins, in debt to Bernardo Salvago of Seville for ${DEBT} cz.`;
    },
  },
  {
    id: 'debt_due', act: 1,
    when: (S) => inPort(S, 'seville') && S.story.debt && !S.story.debt.paid && S.day >= DEBT_DUE - 120,
    show: (S) => ({
      kind: 'letter', from: 'The clerk of Bernardo Salvago', title: 'A reminder',
      body: `<p>Micer Bernardo Salvago greets the house of ${S.story.house} and reminds it that Alonso's debt of <b>${DEBT} cruzados</b> falls due at New Year. His cousins in Lisbon keep their accounts the same way. It may be paid at the market here in Seville.</p>`,
    }),
    choose: () => 'Salvago\'s clerk called about the debt.',
  },
  {
    id: 'debt_taken', act: 1,
    when: (S) => S.story.debt && !S.story.debt.paid && S.day >= DEBT_DUE,
    show: (S) => ({
      kind: 'letter', from: 'Bernardo Salvago', title: 'The debt, collected',
      body: `<p>The year is out, and Alonso's debt with it. My agents in Palos have taken <b>${DEBT_FORCED} cruzados</b> against your barca: the ${DEBT} owed, and what the waiting cost me. A house that makes the Genoese collect will find our doors shut a while.</p><p class="sig">Bernardo Salvago</p>`,
    }),
    choose: (S) => {
      S.purse -= DEBT_FORCED;
      Accounts.record(S, { kind: 'debt', amount: -DEBT_FORCED, port: 'seville', text: 'Salvago collected Alonso\'s debt, with interest' });
      S.story.debt.paid = 'taken';
      S.story.relation = -1;
      return `Salvago collected the debt, ${DEBT_FORCED} cz.`;
    },
  },
  {
    id: 'first_profit', act: 1,
    when: (S) => docked(S) && S.voyages >= 1 && S.purse >= 360,
    show: () => ({
      kind: 'letter', from: 'Catalina', title: 'A letter from home',
      body: '<p>The Guinea men were at the door again, asking after your father\'s charts. I told them they went down with him, which is a lie the friars will forgive. Make your money on the coast we know before you go looking for his. And light a candle at La Rábida when you pass.</p><p class="sig">Your mother</p>',
    }),
    choose: () => 'A letter from Catalina.',
  },
  {
    id: 'romanus', act: 1,
    when: (S) => docked(S) && S.day >= ROMANUS,
    show: () => ({
      kind: 'card', title: 'The Pope gives Guinea to Portugal',
      body: '<p><i>January 1455.</i> Pope Nicholas V\'s bull <i>Romanus Pontifex</i> grants the King of Portugal all the coast of Africa from Cape Bojador to the Indies, and leave to seize any ship that trades there without his licence. The Guinea men of Palos say a bull is only parchment. The Portuguese caravels off Arguin are not.</p><p>Castile keeps the Canaries. South of Bojador, a Castilian ship sails at her own risk.</p>',
    }),
    choose: () => 'Romanus Pontifex: Guinea is Portugal\'s, by the Pope\'s word.',
  },
  {
    id: 'guinea_men', act: 1,
    when: (S) => inPort(S, 'palos') && S.contracts?.unlocked && S.day >= ROMANUS,
    show: (S) => ({
      kind: 'letter', from: 'The Guinea men of Palos', title: 'An offer in the tavern',
      body: `<p>Three pilots who sailed with your father come to the house of ${S.story.house}. They know the coast below Bojador, and the Gambia where the gold comes down. The Portuguese would hang them for saying so. Take your ship south and bring home gold, they say, and they will see the house of ${S.story.house} paid a share of what the Palos men take this year: <b>${GUINEA_SHARE} cruzados</b> on top of what the gold fetches.</p>
        <p>Or let them find another fool, and keep the peace with Portugal.</p>`,
      choices: [
        { id: 'go', label: 'Go south for gold', primary: true },
        { id: 'no', label: 'Keep to the Canaries and Morocco' },
      ],
    }),
    choose: (S, c) => {
      S.story.choices.guinea = c;
      if (c === 'go') { S.story.guinea = { since: S.day }; return 'Agreed with the Guinea men of Palos to run for gold.'; }
      return 'Refused the Guinea men.';
    },
  },
  {
    id: 'guinea_gold', act: 1,
    when: (S) => S.story.guinea && !S.story.guinea.done && inPort(S, 'palos') && goldAboard(S) && S.day > S.story.guinea.since + 20,
    show: (S) => ({
      kind: 'letter', from: 'The Guinea men of Palos', title: 'Gold from below Bojador',
      body: `<p>The pilots see the pouches come ashore at night and do not ask where you bought them. Their share for the house of ${S.story.house}: <b>${GUINEA_SHARE} cruzados</b>, as promised. In Lisbon they will hear of it; in Palos they will drink to it.</p>`,
    }),
    choose: (S) => {
      S.purse += GUINEA_SHARE;
      Accounts.record(S, { kind: 'contract', amount: GUINEA_SHARE, port: 'palos', text: 'The Guinea men\'s share, for gold from below Bojador' });
      S.story.guinea.done = S.day;
      if (S.house) S.house.renown = (S.house.renown || 0) + 2;
      return `Brought Guinea gold home to Palos: the pilots paid ${GUINEA_SHARE} cz.`;
    },
  },
  {
    id: 'herrera', act: 1,
    when: (S) => (inPort(S, 'gomera') || inPort(S, 'lanzarote')) && S.day >= date(1454, 1, 1),
    show: (S) => ({
      kind: 'letter', from: 'Diego García de Herrera', title: 'The lord of the Canaries',
      body: `<p>I am lord of these islands by my wife Inés Peraza's right, and I mean to be lord of the rest of them. The orchil the islanders gather here dyes the cloth of Flanders red. I need ships and silver to carry it to Seville and to keep the Portuguese off my coasts.</p>
        <p>Put <b>${HERRERA_STAKE} cruzados</b> into my orchil and I will pay the house of ${S.story.house} a share of every cargo until the year 1462.</p><p class="sig">Diego García de Herrera, lord of the Canaries</p>`,
      choices: [
        { id: 'share', label: `Take a share (−${HERRERA_STAKE} cz)`, primary: true },
        { id: 'no', label: 'Decline' },
      ],
    }),
    choose: (S, c) => {
      S.story.choices.herrera = c;
      if (c === 'share' && S.purse >= HERRERA_STAKE) {
        S.purse -= HERRERA_STAKE;
        Accounts.record(S, { kind: 'invest', amount: -HERRERA_STAKE, port: S.ship.docked, text: 'A share in Herrera\'s orchil' });
        S.story.herrera = true;
        return `Took a share in Herrera's orchil (${HERRERA_STAKE} cz).`;
      }
      S.story.choices.herrera = 'no';
      return c === 'share' ? 'Could not find the money for Herrera\'s orchil.' : 'Declined Herrera\'s orchil.';
    },
  },
  {
    id: 'herrera_pays', act: 1,
    when: (S) => S.story.herrera && S.day >= HERRERA_PAYS && docked(S),
    show: () => ({
      kind: 'letter', from: 'Diego García de Herrera', title: 'The orchil accounts',
      body: `<p>Eight years of orchil, and the Flemings still want more. Your share, as agreed: <b>${HERRERA_RETURN} cruzados</b>, paid by my factor in Seville. I have ships of my own now. Come and see me when you want land in the islands.</p><p class="sig">Diego García de Herrera</p>`,
    }),
    choose: (S) => {
      S.purse += HERRERA_RETURN;
      Accounts.record(S, { kind: 'invest', amount: HERRERA_RETURN, port: S.ship.docked, text: 'Herrera\'s orchil: the share paid out' });
      return `Herrera paid out the orchil share: ${HERRERA_RETURN} cz.`;
    },
  },
  {
    id: 'gibraltar', act: 1,
    when: (S) => docked(S) && S.day >= GIBRALTAR,
    show: () => ({
      kind: 'card', title: 'Gibraltar is Castile\'s',
      body: '<p><i>August 1462.</i> The men of the Duke of Medina Sidonia take Gibraltar from the Moors of Granada. The Strait is a Christian sea on both shores now: Portugal holds Ceuta, Castile the Rock. Fewer corsairs will slip out of the Strait to the Andalusian coast.</p><p class="fine">Sail on year by year, or, in Seville, let the years pass to 1474, the eve of the war with Portugal.</p>',
    }),
    choose: () => 'Gibraltar taken from the Moors.',
  },
  {
    id: 'isabella', act: 1,
    when: (S) => S.day >= ISABELLA,
    show: (S) => ({
      kind: 'card', title: 'The end of Act I: a queen in Segovia',
      body: `<p><i>Segovia, December 1474.</i> King Enrique is dead, and his half-sister Isabella has had herself proclaimed Queen of Castile. Portugal backs the dead king's daughter, Juana, and her uncle Afonso of Portugal means to marry her. There will be war, and it will be fought at sea as well as on land.</p>
        <p>The Guinea men of Palos are already sharpening their knives.</p>
        <p class="fine">${actOneSummary(S)}</p>
        <p class="fine">Act II, <i>The war of the queens</i>, begins when Portugal invades in the spring.</p>`,
      ok: 'Sail on',
    }),
    choose: () => 'Isabella proclaimed queen. The end of Act I.',
  },
];

function actOneSummary(S) {
  const st = S.story;
  const bits = [];
  bits.push(st.debt?.paid === 'early' ? 'You paid your father\'s debt early' : st.debt?.paid === 'taken' ? 'Salvago had to collect your father\'s debt' : st.debt?.paid ? 'You paid your father\'s debt' : null);
  bits.push(st.guinea?.done ? 'ran gold from Guinea with the Palos men' : st.choices.guinea === 'go' ? 'promised the Palos men gold and never brought it' : st.choices.guinea === 'no' ? 'kept out of Portugal\'s Guinea' : '');
  bits.push(st.herrera ? 'and took a share in the Canaries' : '');
  return bits.filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

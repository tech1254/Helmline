// The story, Acts II to IV (Nov 2026): 1469 to 1499, for both houses. Act I is in story.js
// (Portugal) and story_castile.js (Castile). The acts follow history and bend with the game:
// back Columbus from Lisbon and the Indies are charted for your house (and Portugal may go to war
// over them: war.js, the War of the Line); beat Dias to the Cape and the act says so.
// Beats work as in story.js. A beat with `until` that the years passed by (the time skip) is
// marked missed, not shown late. Pure rules: no browser here.

import { dayOfYear, yearOf } from './ships.js';
import * as Accounts from './accounts.js';
import * as Race from './race.js';
import * as War from './war.js';
import * as House from './house.js';

const date = (y, m, d) => dayOfYear(y) + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const docked = (S) => S.ship?.docked;
const inPort = (S, id) => S.ship?.docked === id;
const pay = (S, cz, port, text) => { S.purse += cz; Accounts.record(S, { kind: 'debt', amount: cz, port, text }); };
const renown = (S, n) => { const H = House.ensureHouse(S); H.renown = (H.renown || 0) + n; };
const standing = (S, n) => { if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + n; };
const grantFor = (S, pids, by, years) => {
  const R = Race.ensureRace(S);
  for (const p of pids) R.grants[p] = { by, until: S.day + years * 365.25 };
};
const served = (S, id) => S.war?.service?.[id] || 0;
const first = (S, pid) => S.race?.firsts?.[pid]?.by === 'you';

// ---- Portugal ---------------------------------------------------------------------------------
export const LEASE_BID = 1500, COLON_STAKE = 1000, MINA_SHARE = 800, MINA_RETURN = 2000, INDIA_SHARE = 2000, INDIA_RETURN = 7000;
const GUINEA = ['arguin', 'gambia', 'cantor', 'serraleoa', 'cestos', 'mina'];

export const PT = [
  // Act II: the war for Guinea
  {
    id: 'gomes_lease', act: 2,
    when: (S) => docked(S) && S.day >= date(1469, 6, 1), until: date(1470, 6, 1),
    show: (S) => ({
      kind: 'letter', from: 'The king\'s treasurer', title: 'The Guinea lease',
      body: `<p>King Afonso has no patience for the African coast, and needs money for his wars. He has leased the whole Guinea trade for five years to <b>Fernão Gomes</b> of Lisbon, for two hundred thousand reais a year and a hundred leagues of new coast charted every year.</p>
        <p>The Gomes are your rivals on every quay from Lagos to the Gambia. The treasurer lets it be known that a better offer would be heard: <b>${fmt(LEASE_BID)} cruzados</b> would buy the house of ${S.story.house} a share of the lease. Fernão Gomes, for his part, would pay well for your ships to carry his cargoes, and keep out of his way.</p>`,
      choices: [
        { id: 'bid', label: `Bid for a share (−${fmt(LEASE_BID)} cz)`, primary: true },
        { id: 'gomes', label: 'Carry for Gomes (+600 cz)' },
        { id: 'no', label: 'Keep out of it' },
      ],
    }),
    choose: (S, c) => {
      S.story.choices.lease = c;
      if (c === 'bid') {
        if (S.purse < LEASE_BID) { S.story.choices.lease = 'no'; return 'Could not raise the money for the Guinea lease.'; }
        pay(S, -LEASE_BID, 'lisbon', 'A share of the Guinea lease');
        grantFor(S, GUINEA, 'you', 5);
        standing(S, 5);
        return 'Bought a share of the Guinea lease: five years of the coast, against the Gomes.';
      }
      if (c === 'gomes') {
        pay(S, 600, 'lisbon', 'Fernão Gomes, for carrying his cargoes');
        grantFor(S, GUINEA, 'gomes', 5);
        return 'Took Fernão Gomes\'s money and kept out of his lease.';
      }
      return 'Kept out of the Guinea lease.';
    },
  },
  {
    id: 'page2', act: 2,
    when: (S) => inPort(S, 'saotome'),
    show: (S) => ({
      kind: 'card', title: 'The rutter: the island of sugar',
      body: `<p>An island under the line, high and wooded, with nobody on it. The soil is red and the rain falls every afternoon. Your father wrote that cane would grow here as it grows in Madeira, and he was right: São Tomé.</p><p>The second page of the rutter is filled in.${first(S, 'saotome') ? ' Nobody had charted these islands before your house.' : ''}</p>`,
      ok: 'Go on',
    }),
    choose: (S) => { S.story.pages[2] = S.day; return 'The rutter\'s second page: São Tomé, the island of sugar.'; },
  },
  {
    id: 'act2', act: 2,
    when: (S) => S.day >= date(1474, 3, 1), until: date(1475, 6, 1),
    show: (S) => ({
      kind: 'card', title: 'Act II: the war for Guinea',
      body: `<p><i>Lisbon, 1474.</i> King Afonso has given the Guinea trade to his son. Prince João is nineteen, cold and careful, and means to keep every league of the coast for Portugal. In Castile, King Enrique is dying, and two women claim his crown: his sister Isabella, and his daughter Joanna, whom King Afonso means to marry.</p>
        <p>Everyone on the quays says the same thing: when Enrique dies, there will be war, and it will be fought at sea for the gold of the Mina.</p>`,
      ok: 'Go on',
    }),
    choose: () => 'Act II: the war for Guinea.',
  },
  {
    id: 'commission', act: 2,
    when: (S) => docked(S) && War.current(S)?.id === 'succession', until: date(1476, 6, 1),
    show: () => ({
      kind: 'letter', from: 'Prince João', title: 'A commission for the war',
      body: `<p>Castile will send ships to the Mina, and to the Canaries, and to every coast my father's lease has opened. I want captains who will take them. Serve me in this war, and win me fights and prizes against Castile, and I will not forget it when the peace is made.</p><p class="sig">João</p>`,
      choices: [{ id: 'serve', label: 'Serve the prince', primary: true }, { id: 'trade', label: 'Keep to your trade' }],
    }),
    choose: (S, c) => { S.story.choices.commission = c; if (c === 'serve') standing(S, 3); return c === 'serve' ? 'Took Prince João\'s commission for the war.' : 'Kept to trade in the war.'; },
  },
  {
    id: 'guinea_fleet', act: 2,
    when: (S) => docked(S) && S.day >= War.GUINEA_FLEET.from && War.current(S), until: War.GUINEA_FLEET.from + War.GUINEA_FLEET.days,
    show: () => ({
      kind: 'letter', from: 'Prince João', title: 'The Castilian gold',
      body: '<p>Castile\'s Guinea fleet is at the Mina, buying our gold with our own goods. It will come home past the Cape Verdes and the Canaries in the autumn, its flagship in company with armed caravels. Bring me that flagship and you will be the first captain in Portugal.</p><p class="sig">João</p>',
    }),
    choose: () => 'Prince João asked for the Castilian Guinea fleet.',
  },
  {
    id: 'act2_end', act: 2,
    when: (S) => S.day >= date(1479, 9, 6), until: date(1480, 9, 1),
    show: (S) => {
      const n = served(S, 'succession');
      const fleet = S.war?.guineaTaken;
      const commissioned = S.story.choices.commission === 'serve';
      return {
        kind: 'card', title: 'The end of Act II: the peace of Alcaçovas',
        body: `<p><i>Alcaçovas, September 1479.</i> Castile gives up Guinea, the Mina and the Atlantic islands; Portugal gives up the Canaries and its claim to the crown of Castile. The gold of the coast is Portugal's alone.</p>
          <p class="fine">${fleet ? 'Your house took the Castilian Guinea fleet\'s flagship: Lisbon talks of nothing else. ' : ''}${n ? `You fought or took ships ${n} ${n === 1 ? 'time' : 'times'} in the war.` : 'You kept out of the fighting.'}${commissioned && n >= 3 ? ' Prince João keeps his word: you are named a captain of the Guinea coast, with more standing at court and a gift of 1,500 cruzados.' : commissioned ? ' The prince notes that you took his commission and did little with it.' : ''}</p>
          <p class="fine">Act III, <i>The Cape</i>, begins when João is king.</p>`,
        ok: 'Sail on',
      };
    },
    choose: (S) => {
      if (S.war?.guineaTaken) renown(S, 8);
      if (S.story.choices.commission === 'serve' && served(S, 'succession') >= 3) { pay(S, 1500, 'lisbon', 'Prince João\'s gift for the war'); standing(S, 10); renown(S, 5); S.story.captainOfGuinea = true; }
      return 'Peace at Alcaçovas. The end of Act II.';
    },
  },
  // Act III: the Cape
  {
    id: 'act3', act: 3,
    when: (S) => S.day >= date(1481, 9, 1), until: date(1482, 9, 1),
    show: (S) => ({
      kind: 'card', title: 'Act III: the Cape',
      body: `<p><i>Lisbon, 1481.</i> King Afonso is dead, and João II is king: the Perfect Prince, they call him, and they do not mean it kindly. He wants the way round Africa to the Indies, and he means to have it before anyone else.</p>
        <p>He is building a castle at the Mina to hold the gold coast, and sending captains south, each to carry stone pillars further down the coast than the last.${S.story.pages[1] != null ? ' Your father\'s rutter has two more pages that nobody has read.' : ''}</p>`,
      ok: 'Go on',
    }),
    choose: () => 'Act III: the Cape.',
  },
  {
    id: 'mina_castle', act: 3,
    when: (S) => inPort(S, 'lisbon') && S.day >= date(1482, 1, 15), until: date(1483, 6, 1),
    show: () => ({
      kind: 'letter', from: 'Diogo de Azambuja', title: 'The castle at the Mina',
      body: `<p>I sail for the Gold Coast with ten caravels of cut stone, lime and timber, to build the king a castle and a factory at the Mina. The crown will take the gold, but the factory will need everything else: wine, cloth, copper and wheat, every year. A share in its supplying costs <b>${fmt(MINA_SHARE)} cruzados</b>; the factors expect to return twice that and more before the decade is out.</p><p class="sig">Diogo de Azambuja</p>`,
      choices: [{ id: 'share', label: `Take a share (−${fmt(MINA_SHARE)} cz)`, primary: true }, { id: 'no', label: 'Decline' }],
    }),
    choose: (S, c) => {
      if (c === 'share' && S.purse >= MINA_SHARE) { pay(S, -MINA_SHARE, 'lisbon', 'A share in supplying the Mina castle'); S.story.minaShare = true; return 'Took a share in supplying São Jorge da Mina.'; }
      return 'Declined a share in the Mina castle.';
    },
  },
  {
    id: 'page3', act: 3,
    when: (S) => inPort(S, 'mpinda'),
    show: (S) => ({
      kind: 'card', title: 'The rutter: the river that sweetens the sea',
      body: `<p>Twenty leagues out, the sea under your keel turned brown and sweet. The river is the greatest you have ever seen, and the Manikongo, the king of this country, keeps a court of hundreds at his town inland, as your father heard. The third page of the rutter is filled in.${first(S, 'mpinda') ? ' No Portuguese pillar stands here yet: your house was first.' : ''}</p>`,
      ok: 'Go on',
    }),
    choose: (S) => { S.story.pages[3] = S.day; return 'The rutter\'s third page: the Zaire, the river that sweetens the sea.'; },
  },
  {
    id: 'colon', act: 3,
    when: (S) => inPort(S, 'lisbon') && S.day >= date(1484, 6, 1), until: date(1485, 9, 1),
    show: (S) => ({
      kind: 'letter', from: 'Cristóvão Colombo', title: 'A Genoese with a plan',
      body: `<p>Senhor, I am a Genoese, a chart-maker of this city, married into the house of Perestrelo. I have laid before the king a voyage west across the Ocean Sea to Cipangu and the Indies, and his learned men have laughed at my sums. I ask only for one ship, provisions and men.</p>
        <p>If the house of ${S.story.house} will put up <b>${fmt(COLON_STAKE)} cruzados</b> and a caravel's crew, I will sail from Lisbon under your flag, and what I find will be charted for you.</p><p class="sig">Cristóvão Colombo</p>`,
      choices: [{ id: 'back', label: `Back him (−${fmt(COLON_STAKE)} cz)`, primary: true }, { id: 'no', label: 'Send him to Castile' }],
    }),
    choose: (S, c) => {
      if (c === 'back' && S.purse >= COLON_STAKE) { pay(S, -COLON_STAKE, 'lisbon', 'Backing the Genoese Colombo'); S.story.backedColon = true; return 'Backed Colombo\'s voyage west.'; }
      return 'Sent Colombo away. He went to Castile.';
    },
  },
  {
    id: 'page4', act: 3,
    when: (S) => inPort(S, 'saobras'),
    show: (S) => ({
      kind: 'card', title: 'The rutter: the last page',
      body: `<p>The torn last page of your father's book had only the edge of a drawing on it: a coast turning east. Here it is. The land runs away to the east and north-east, and the sea is warm from the east. Africa has an end, and you have rounded it.</p><p>The rutter of João Vaz is complete.${first(S, 'saobras') ? ' No other ship has been here: the Cape is your house\'s.' : ''}</p>`,
      ok: 'Go on',
    }),
    choose: (S) => { S.story.pages[4] = S.day; renown(S, 5); return 'The rutter\'s last page: the coast turning east, round the end of Africa.'; },
  },
  {
    id: 'act3_end', act: 3,
    when: (S) => S.day >= date(1488, 12, 15), until: date(1489, 12, 1),
    show: (S) => ({
      kind: 'card', title: 'The end of Act III: the Cape of Good Hope',
      body: `<p><i>Lisbon, December 1488.</i> Bartolomeu Dias is home. He was blown south past the end of Africa in a storm, and came back round a cape the king has named Good Hope. Among those who heard him tell it at court was the Genoese Colombo, who is in Lisbon again, and leaves for Castile the next day.</p>
          <p class="fine">${first(S, 'saobras') ? `Dias found your house's mark at São Brás: <b>you beat him to the Cape by ${S.race.firsts.saobras.ahead || 1} ${S.race.firsts.saobras.ahead === 1 ? 'year' : 'years'}</b>.` : 'The Cape is Dias\'s.'} ${S.story.pages[4] != null ? 'Your father\'s rutter is complete.' : `The rutter has ${4 - Object.keys(S.story.pages).length} pages still unread.`}${S.story.minaShare ? ` Your share in the Mina castle has paid ${fmt(MINA_RETURN)} cruzados.` : ''}</p>
          <p class="fine">Act IV, <i>The Indies</i>, begins in 1492.</p>`,
      ok: 'Sail on',
    }),
    choose: (S) => { if (S.story.minaShare) { pay(S, MINA_RETURN, 'lisbon', 'The Mina castle share, paid out'); S.story.minaShare = 'paid'; } return 'Dias rounded the Cape. The end of Act III.'; },
  },
  // Act IV: the Indies
  {
    id: 'act4', act: 4,
    when: (S) => S.day >= date(1493, 3, 6), until: date(1494, 3, 1),
    show: (S) => {
      const yours = S.story.backedColon;
      return {
        kind: 'card', title: yours ? 'Act IV: the Indies are yours' : 'Act IV: the Indies',
        body: yours
          ? `<p><i>Lisbon, March 1493.</i> A battered caravel comes up the Tagus out of a storm: Colombo, home from the west under the flag of the house of ${S.story.house}. Thirty-three days west of the Canaries he found islands, green and full of people who wear gold: the Indies, he swears.</p><p>His charts are yours. King João sends for him at once, and Castile, which turned him away, says the Pope will decide whose they are.</p>`
          : `<p><i>Lisbon, March 1493.</i> A battered caravel comes up the Tagus out of a storm: Colombo, the Genoese who asked your house for a ship, home from the west under the flag of Castile. Thirty-three days west of the Canaries he found islands, full of people who wear gold: the Indies, he swears.</p><p>King João says the Treaty of Alcaçovas makes them Portugal's. Castile says the Pope will decide.</p>`,
        ok: 'Go on',
      };
    },
    choose: (S) => {
      if (S.story.backedColon && !S.discovered.santodomingo) {
        S.discovered.santodomingo = true;
        const R = Race.ensureRace(S);
        if (!R.firsts.santodomingo) { R.firsts.santodomingo = { by: 'you', day: S.day, ahead: 0 }; R.grants.santodomingo = { by: 'you', until: S.day + Race.GRANT_YEARS * 365.25 }; R.history.push({ day: S.day, text: 'Colombo, sailing for your house, charted the Indies in the west' }); }
        renown(S, 10);
        return 'Colombo came home from the Indies under your flag.';
      }
      return 'Colombo came home from the Indies, for Castile.';
    },
  },
  {
    id: 'india_fleet', act: 4,
    when: (S) => inPort(S, 'lisbon') && S.day >= date(1496, 1, 1), until: date(1497, 7, 8),
    show: () => ({
      kind: 'letter', from: 'King Manuel', title: 'The fleet for India',
      body: `<p>Our cousin João is dead, and we have taken up his work: the way to India round the Cape that Dias found. Vasco da Gama will sail next summer with four ships. We invite the houses of Lisbon to share in the venture: <b>${fmt(INDIA_SHARE)} cruzados</b> buys a share of whatever pepper and spice he brings home.</p><p class="sig">Manuel</p>`,
      choices: [{ id: 'share', label: `Take a share (−${fmt(INDIA_SHARE)} cz)`, primary: true }, { id: 'no', label: 'Decline' }],
    }),
    choose: (S, c) => {
      if (c === 'share' && S.purse >= INDIA_SHARE) { pay(S, -INDIA_SHARE, 'lisbon', 'A share in da Gama\'s fleet'); S.story.indiaShare = true; return 'Took a share in Vasco da Gama\'s fleet.'; }
      return 'Declined a share in da Gama\'s fleet.';
    },
  },
  {
    id: 'act4_end', act: 4,
    when: (S) => S.day >= date(1499, 9, 10), until: date(1500, 9, 1),
    show: (S) => ({
      kind: 'card', title: 'The end of Act IV: the way to India',
      body: `<p><i>Lisbon, September 1499.</i> Vasco da Gama is home from Calicut, with two ships of four and a third of his men, and pepper enough to pay for the voyage sixty times over. The way to the Indies lies round the Cape, and it is Portugal's.</p>
        <p class="fine">${first(S, 'calicut') ? 'Da Gama found your house already known on the Malabar coast: <b>you beat him to India</b>. ' : ''}${S.story.indiaShare ? `Your share in his fleet pays <b>${fmt(INDIA_RETURN)} cruzados</b>. ` : ''}${S.story.backedColon ? 'In the west, your Genoese has charted islands enough for an empire.' : ''}</p>
        <p class="fine">The story of the house of ${S.story.house} goes on: the age of the India fleets, the Habsburgs and the wars of the new century come in a later update. Sail on.</p>`,
      ok: 'Sail on',
    }),
    choose: (S) => { if (S.story.indiaShare) { pay(S, INDIA_RETURN, 'lisbon', 'Da Gama\'s fleet: your share of the pepper'); S.story.indiaShare = 'paid'; } return 'Da Gama came home from India. The end of Act IV.'; },
  },
];

// ---- Castile ----------------------------------------------------------------------------------
export const GUINEA_VENTURE = 1000, GUINEA_VENTURE_PAYS = 3500, VERA_STAKE = 600, VERA_RETURN = 1400, PINTA_STAKE = 1000;

export const CS = [
  // Act II: the war of the queens
  {
    id: 'cs_act2', act: 2,
    when: (S) => S.day >= date(1475, 5, 20), until: date(1476, 5, 1),
    show: () => ({
      kind: 'card', title: 'Act II: the war of the queens',
      body: '<p><i>Seville, 1475.</i> King Afonso of Portugal has crossed the border to marry his niece Joanna and take Castile\'s crown from Isabella. The war will be fought on the Duero, but the sea war is Andalusia\'s: Palos, Moguer and Sanlúcar are full of men who know the Guinea coast, and the queen has said they may go there, Portugal or no Portugal.</p>',
      ok: 'Go on',
    }),
    choose: () => 'Act II: the war of the queens.',
  },
  {
    id: 'toro', act: 2,
    when: (S) => docked(S) && S.day >= date(1476, 3, 10), until: date(1476, 9, 1),
    show: () => ({
      kind: 'letter', from: 'News from the Duero', title: 'Toro',
      body: '<p>King Ferdinand has met the Portuguese at Toro, in fog and rain. Both sides claim the day, but it is Afonso who has gone home to Portugal. Isabella\'s crown is safe on land. At sea, the queen\'s licences for Guinea stand.</p>',
    }),
    choose: () => 'News of the battle of Toro.',
  },
  {
    id: 'cs_guinea_fleet', act: 2,
    when: (S) => inPort(S, 'sanlucar') || inPort(S, 'palos') || inPort(S, 'seville') ? S.day >= date(1477, 10, 1) : false, until: date(1478, 4, 1),
    show: () => ({
      kind: 'letter', from: 'The queen\'s factor at Sanlúcar', title: 'A fleet for the Mina',
      body: `<p>Her Highness sends thirty-five caravels to the Mina this spring, to buy gold under the Portuguese guns. Any house may put money into the venture: <b>${fmt(GUINEA_VENTURE)} cruzados</b> buys a share of the gold that comes home. The Portuguese know it is coming.</p>`,
      choices: [{ id: 'share', label: `Venture ${fmt(GUINEA_VENTURE)} cz`, primary: true }, { id: 'no', label: 'Keep your money' }],
    }),
    choose: (S, c) => {
      if (c === 'share' && S.purse >= GUINEA_VENTURE) { pay(S, -GUINEA_VENTURE, 'sanlucar', 'A share in the Guinea fleet'); S.story.guineaVenture = Math.random() < 0.35 ? 'home' : 'taken'; return 'Put money into the queen\'s Guinea fleet.'; }
      return 'Kept out of the Guinea fleet.';
    },
  },
  {
    id: 'cs_guinea_fate', act: 2,
    when: (S) => S.story.guineaVenture && S.day >= date(1478, 11, 1), until: date(1479, 11, 1),
    show: (S) => ({
      kind: 'letter', from: 'The queen\'s factor at Sanlúcar', title: S.story.guineaVenture === 'home' ? 'The fleet is home' : 'The fleet is lost',
      body: S.story.guineaVenture === 'home'
        ? `<p>Against everything the Portuguese could do, the fleet is home with its gold. Your share comes to <b>${fmt(GUINEA_VENTURE_PAYS)} cruzados</b>.</p>`
        : '<p>The Portuguese were waiting at the Mina. They took the fleet with its gold and sent its men home in chains. Your share is lost with it.</p>',
    }),
    choose: (S) => { if (S.story.guineaVenture === 'home') pay(S, GUINEA_VENTURE_PAYS, 'sanlucar', 'The Guinea fleet\'s gold, your share'); return S.story.guineaVenture === 'home' ? 'The Guinea fleet came home with gold.' : 'The Guinea fleet was taken by the Portuguese.'; },
  },
  {
    id: 'cs_act2_end', act: 2,
    when: (S) => S.day >= date(1479, 9, 6), until: date(1480, 9, 1),
    show: (S) => ({
      kind: 'card', title: 'The end of Act II: the peace of Alcaçovas',
      body: `<p><i>September 1479.</i> Peace with Portugal. Isabella is queen; the Canaries are Castile's, all of them, conquered or not. Guinea and the Mina are Portugal's, and Castilian ships are barred from them for good.</p>
        <p class="fine">${served(S, 'succession') ? `You fought or took ships ${served(S, 'succession')} times for the queen.` : 'You kept out of the fighting.'} Act III, <i>Granada and the islands</i>, follows.</p>`,
      ok: 'Sail on',
    }),
    choose: () => 'Peace at Alcaçovas. The end of Act II.',
  },
  // Act III: Granada and the islands
  {
    id: 'cs_vera', act: 3,
    when: (S) => (inPort(S, 'seville') || inPort(S, 'sanlucar') || inPort(S, 'cadiz')) && S.day >= date(1480, 6, 1), until: date(1482, 1, 1),
    show: () => ({
      kind: 'letter', from: 'Pedro de Vera', title: 'Gran Canaria',
      body: `<p>The crown has made me governor of Gran Canaria, and I mean to finish its conquest. I need ships to carry men, horses and biscuit from Andalusia, and merchants who will advance the cost against the island's first sugar and orchil. <b>${fmt(VERA_STAKE)} cruzados</b> now; the island will repay it twice over.</p><p class="sig">Pedro de Vera</p>`,
      choices: [{ id: 'share', label: `Advance ${fmt(VERA_STAKE)} cz`, primary: true }, { id: 'no', label: 'Decline' }],
    }),
    choose: (S, c) => {
      if (c === 'share' && S.purse >= VERA_STAKE) { pay(S, -VERA_STAKE, 'seville', 'An advance to Pedro de Vera for Gran Canaria'); S.story.vera = true; return 'Advanced money for the conquest of Gran Canaria.'; }
      return 'Declined Pedro de Vera.';
    },
  },
  {
    id: 'cs_vera_pays', act: 3,
    when: (S) => S.story.vera === true && S.day >= date(1483, 6, 1), until: date(1485, 1, 1),
    show: () => ({ kind: 'letter', from: 'Pedro de Vera', title: 'Gran Canaria is the queen\'s', body: `<p>The last of the island's people have surrendered at Ansite. As I promised, the house is repaid: <b>${fmt(VERA_RETURN)} cruzados</b>, from the first sugar of Gran Canaria.</p>` }),
    choose: (S) => { pay(S, VERA_RETURN, 'seville', 'Pedro de Vera repays the advance'); S.story.vera = 'paid'; return 'Gran Canaria conquered; Pedro de Vera repaid the advance.'; },
  },
  {
    id: 'cs_colon', act: 3,
    when: (S) => (inPort(S, 'seville') || inPort(S, 'palos')) && S.day >= date(1486, 5, 1), until: date(1487, 12, 1),
    show: (S) => ({
      kind: 'letter', from: 'Fray Juan Pérez, of La Rábida', title: 'The Genoese at the friary',
      body: `<p>A Genoese widower came to our gate with his little son and a plan to reach the Indies by sailing west. The Portuguese king would not hear him; the queen has heard him, and sent him to her learned men, who will take years. He needs friends in Palos with ships. Your father would have liked him.</p>
        <p>If the house of ${S.story.house} will pledge <b>${fmt(PINTA_STAKE)} cruzados</b> toward his ships when the queen says yes, he will remember it.</p><p class="sig">Fray Juan Pérez</p>`,
      choices: [{ id: 'back', label: `Pledge ${fmt(PINTA_STAKE)} cz`, primary: true }, { id: 'no', label: 'Wish him luck' }],
    }),
    choose: (S, c) => { if (c === 'back') { S.story.pledgedColon = true; return 'Pledged money to the Genoese at La Rábida.'; } return 'Wished the Genoese luck.'; },
  },
  {
    id: 'cs_granada', act: 3,
    when: (S) => S.day >= date(1492, 1, 3), until: date(1492, 6, 1),
    show: () => ({
      kind: 'card', title: 'The end of Act III: Granada',
      body: '<p><i>January 1492.</i> The last Moorish king has handed the keys of Granada to Ferdinand and Isabella. Seven hundred years of war in Spain are over, and the crown has time, and money, for other things. In the camp at Santa Fe, the queen has said yes to the Genoese.</p><p class="fine">Act IV, <i>The Admiral</i>, begins.</p>',
      ok: 'Go on',
    }),
    choose: () => 'Granada fell. The end of Act III.',
  },
  // Act IV: the Admiral
  {
    id: 'cs_palos', act: 4,
    when: (S) => inPort(S, 'palos') && S.day >= date(1492, 5, 23), until: date(1492, 8, 3),
    show: (S) => ({
      kind: 'letter', from: 'The crown\'s notary at Palos', title: 'Two caravels for the Genoese',
      body: `<p>By royal order, read at the church of San Jorge: for its sins against the crown, the town of Palos must provide two caravels, crewed and victualled, for the voyage of Don Cristóbal Colón to the Indies. Martín Alonso Pinzón has taken the <i>Pinta</i>. ${S.story.pledgedColon ? `The Genoese has not forgotten the house of ${S.story.house}: he asks for the pledge you made at La Rábida.` : 'The second ship is still to find.'}</p>`,
      choices: [{ id: 'sail', label: `Fit out a caravel for him (−${fmt(PINTA_STAKE)} cz)`, primary: true }, { id: 'no', label: 'Let others go' }],
    }),
    choose: (S, c) => {
      if (c === 'sail' && S.purse >= PINTA_STAKE) { pay(S, -PINTA_STAKE, 'palos', 'A caravel for Colón\'s voyage'); S.story.sailedWithColon = true; return 'Fitted out a caravel for Colón\'s voyage west.'; }
      return 'Let others sail with Colón.';
    },
  },
  {
    id: 'cs_admiral', act: 4,
    when: (S) => S.day >= date(1493, 3, 15), until: date(1494, 3, 1),
    show: (S) => ({
      kind: 'card', title: 'The Admiral comes home',
      body: `<p><i>Palos, 15 March 1493.</i> The <i>Niña</i> comes up the Tinto on the tide, and the <i>Pinta</i> a few hours behind her: Colón is home, Admiral of the Ocean Sea, from islands far in the west where the people wear gold. The <i>Santa María</i> lies wrecked on one of them, and thirty-nine men wait there for him to come back.</p>
        <p class="fine">${S.story.sailedWithColon ? `Your caravel came home with him. The islands he found are charted for your house, and the queen remembers who fitted out the ships.` : 'Palos rings its bells. The Admiral will sail again in the autumn, with seventeen ships.'}</p>`,
      ok: 'Go on',
    }),
    choose: (S) => {
      if (S.story.sailedWithColon) {
        S.discovered.santodomingo = true;
        const R = Race.ensureRace(S);
        if (!R.firsts.santodomingo) { R.firsts.santodomingo = { by: 'you', day: S.day, ahead: 0 }; R.grants.santodomingo = { by: 'you', until: S.day + Race.GRANT_YEARS * 365.25 }; R.history.push({ day: S.day, text: 'your caravel sailed with the Admiral to the Indies' }); }
        renown(S, 10); standing(S, 10);
        pay(S, 2500, 'palos', 'The crown\'s thanks for a ship of the first voyage');
      }
      return 'The Admiral came home from the Indies.';
    },
  },
  {
    id: 'cs_act4_end', act: 4,
    when: (S) => S.day >= date(1499, 9, 10), until: date(1500, 9, 1),
    show: (S) => ({
      kind: 'card', title: 'The end of Act IV: two worlds',
      body: `<p><i>Seville, 1499.</i> The Admiral is in disgrace and his islands are in revolt; the Portuguese have reached India round the Cape and come home with pepper. The world is divided along a line drawn at Tordesillas, and every house in Seville is building ships for the Indies.</p>
        <p class="fine">The story of the house of ${S.story.house} goes on: the Indies fleets, the Habsburgs and the wars of the new century come in a later update. Sail on.</p>`,
      ok: 'Sail on',
    }),
    choose: () => 'The end of Act IV.',
  },
];

// The acts after Act I, for this house's nation.
export const actsFor = (S) => (S.nation === 'castile' ? CS : PT);
export const lastYear = () => yearOf(date(1499, 9, 10));

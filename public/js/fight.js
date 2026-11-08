// A fight at sea (the design doc, phase 4): four rounds at most, an action each round. The same
// system whichever side you are on. Attacking (hunting a ship, running down a corsair) you close,
// rake her rigging, fire into her, grapple and board, or call on her to strike. Attacked (by
// corsairs, the crown's hunters, an enemy warship) you run, turn and fire, repel boarders, pay
// tribute or strike your colours. Timing matters: the other ship's intent is shown before you
// choose (her men at the rail with grapnels: repel them now), boarding goes better once her crew
// is shaken, a ship with her rigging cut cannot run, a call to strike works on a beaten crew.
// Pure rules: no browser modules (the simulations use this too).

import * as Ships from './ships.js';
import * as Callings from './callings.js';

export const ROUNDS = 4;
export const ALONGSIDE = 0, CLOSE = 1, FAR = 2, GONE = 3;
export const RANGE_NAMES = ['alongside', 'within gunshot', 'at long range', 'out of reach'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (rand, a, b) => a + rand() * (b - a);

// The other ships: hull (0-100), knots, guns (as the yards' fight bonus), men (1 = a caravel's
// crew of sailors), morale (0-100); galleys row, so the wind does not stop them. Merchant ships
// are reckoned laden, so slower than their hulls sail empty.
export const FOES = {
  galley: { name: 'corsair galley', hull: 70, knots: 5.1, guns: 0.04, men: 2.1, morale: 62, rows: true, tribute: true },
  biggalley: { name: 'great corsair galley', hull: 85, knots: 4.9, guns: 0.06, men: 2.9, morale: 68, rows: true, tribute: true },
  caravel: { name: 'caravel', hull: 100, knots: 4.8, guns: 0, men: 0.9, morale: 45 },
  nau: { name: 'nau', hull: 100, knots: 4.8, guns: 0.1, men: 1.3, morale: 50 },
  carrack: { name: 'carrack', hull: 100, knots: 4.6, guns: 0.15, men: 1.6, morale: 55 },
  merchantman: { name: 'armed merchantman', hull: 100, knots: 5.2, guns: 0.25, men: 1.4, morale: 60 },
  hunter: { name: 'armed caravel', hull: 100, knots: 5.7, guns: 0.2, men: 1.8, morale: 70 },
  warship: { name: 'warship', hull: 100, knots: 5.5, guns: 0.3, men: 2.4, morale: 72 },
};

// What your flagship brings to a fight.
export function yourSide(S) {
  const st = Ships.flagStats(S);
  const h = Ships.hullOf(S.ship);
  const fit = Ships.normalFit(h.id, S.ship.fit);
  const guns = (Ships.choice('guns', fit.guns)?.fight || 0) + (h.fight || 0);
  const menFit = Ships.choice('crew', fit.crew)?.fight || 0;
  const P = S.pirates || {};
  const hull = S.hull ?? 100;
  return {
    name: S.ship.name, you: true, hull, knots: st.knots * (0.6 + 0.4 * hull / 100), guns,
    men: (0.7 + 0.3 * (h.size || 1)) * (1 + menFit * 5), nets: st.guard || 0,
    morale: clamp(58 + 2 * Math.min(P.won || 0, 8) + 120 * Callings.perk(S, 'fight'), 40, 92), rigging: 100,
  };
}

// The other side, from FOES, made stronger by `armed` (escorts and soldiers aboard: 0-2).
export function foeSide(kind, armed = 0, name = null) {
  const f = FOES[kind] || FOES.caravel;
  return { ...f, kind, name: name || f.name, guns: f.guns + 0.1 * armed, men: f.men + 0.4 * armed, morale: Math.min(90, f.morale + 8 * armed), rigging: 100 };
}

const fire = (s) => 0.35 + 3 * s.guns;
const melee = (s) => Math.max(0.05, s.men) * (0.4 + s.morale / 100);
const speed = (s) => s.knots * (0.35 + 0.65 * s.rigging / 100) * (s.rows ? 1 : 0.6 + 0.4 * s.hull / 100);
const reach = (s, r) => (r <= ALONGSIDE ? 1.3 : r === CLOSE ? 1 : s.guns >= 0.25 ? 0.6 : 0.3);

// The actions for each side. `at` is the ranges an action can be taken at.
export const ACTIONS = {
  close: { side: 'attack', name: 'Close in', at: [CLOSE, FAR], note: 'Bear down on her to bring her within reach.' },
  rigging: { side: 'attack', name: 'Rake her rigging', at: [CLOSE, FAR], note: 'Chain and bar shot into her sails: she cannot run, but it does her hull little harm.' },
  fire: { side: 'attack', name: 'Fire into her', at: [ALONGSIDE, CLOSE, FAR], note: 'Into her hull and deck: it shakes her crew. Weak at long range unless you carry long guns.' },
  board: { side: 'attack', name: 'Grapple and board', at: [ALONGSIDE, CLOSE], note: 'Lay her alongside and take her with your men. Best once her crew is shaken.' },
  demand: { side: 'attack', name: 'Call on her to strike', at: [ALONGSIDE, CLOSE], note: 'Demand her surrender. A beaten or outmatched crew may give up without a fight.' },
  run: { side: 'defend', name: 'Run', at: [ALONGSIDE, CLOSE, FAR], note: 'Crowd on sail. A faster ship gets away; a slower one is caught tired.' },
  turn: { side: 'defend', name: 'Turn and fire', at: [ALONGSIDE, CLOSE, FAR], note: 'Bring your guns to bear: a full broadside, but she gains on you.' },
  repel: { side: 'defend', name: 'Repel boarders', at: [ALONGSIDE, CLOSE, FAR], note: 'Every man to the rail with pikes and crossbows: twice as strong against boarders, wasted if none come.' },
  pay: { side: 'defend', name: 'Pay tribute', at: [ALONGSIDE, CLOSE, FAR], note: 'Corsairs will take money to let you pass.' },
  strike: { side: 'defend', name: 'Strike your colours', at: [ALONGSIDE, CLOSE, FAR], note: 'Surrender. They take what they came for.' },
};

// A new fight. role: 'attack' (you are the hunter) or 'defend'. opts: { range, tribute }.
export function start(S, role, foe, opts = {}) {
  const F = {
    role, you: yourSide(S), foe, r: opts.range ?? FAR, round: 1, log: [], done: null,
    tribute: opts.tribute ?? 0, startHull: S.hull ?? 100, lastYou: null, lastFoe: null,
  };
  if (opts.surprise) F.foe.morale -= 18; // caught unready
  plan(F, opts.rand || Math.random);
  return F;
}

// What you can do now: [{ id, name, note, odds? }].
export function choices(F) {
  const side = F.role;
  const out = [];
  for (const [id, a] of Object.entries(ACTIONS)) {
    if (a.side !== side || !a.at.includes(F.r)) continue;
    if (id === 'pay' && !(F.foe.tribute && F.tribute > 0 && F.round === 1)) continue;
    const c = { id, name: id === 'pay' ? `Pay tribute (${F.tribute} cz)` : a.name, note: a.note };
    if (id === 'board') c.odds = boardOdds(F.you, F.foe, F.plan === 'repel', F.foe.nets || 0);
    if (id === 'demand') c.odds = demandOdds(F);
    if (id === 'run') c.odds = runOdds(F);
    out.push(c);
  }
  return out;
}

export function boardOdds(att, def, repelling, nets = 0) {
  const a = melee(att), d = melee(def) * (repelling ? 2 : 1) * (1 + nets * 1.5);
  return clamp(a * a / (a * a + d * d), 0.03, 0.97);
}
function demandOdds(F) {
  const ratio = (fire(F.you) + melee(F.you)) / (fire(F.foe) + melee(F.foe));
  const beaten = (100 - F.foe.hull) / 100;
  return clamp(0.05 + (55 - F.foe.morale) / 70 + (ratio - 1) * 0.25 + beaten * 0.3 + (F.you.fear || 0), 0.02, 0.95);
}
function runOdds(F) {
  const gain = (speed(F.you) - speed(F.foe)) / 1.2;
  return clamp(0.5 + gain * 0.6, 0.05, 0.95);
}

// What the other ship means to do this round (chosen before you choose), and what you see.
const INTENT = {
  run: 'She is crowding on sail to get away.',
  close: 'She is bearing down on you.',
  board: 'Her men crowd the rail with grapnels: she means to board.',
  fire: 'She is running out her guns.',
  turn: 'She is putting her helm over to bring her guns round.',
  repel: 'Her crew line the rail with pikes and crossbows.',
  strike: 'Her crew look to their captain: they have had enough.',
  flee: 'She is falling away: they have had enough of you.',
  rigging: 'Her gunners are loading chain shot.',
};
function plan(F, rand) {
  const f = F.foe, y = F.you;
  let p;
  if (F.role === 'attack') { // she is the prey
    const faster = speed(f) >= speed(y) * 0.95;
    if (f.morale < 22 && rand() < 0.6) p = 'strike';
    else if (f.rows) p = rand() < 0.5 ? 'repel' : 'turn'; // corsairs stand and fight
    else if (F.r >= CLOSE && (faster || rand() < 0.45) && f.rigging > 25) p = 'run';
    else if (f.guns >= 0.1 && rand() < 0.55) p = 'turn';
    else p = F.r <= CLOSE && rand() < 0.7 ? 'repel' : 'run';
  } else { // she is the hunter
    if (f.morale < 28 && rand() < 0.7) p = 'flee';
    else if (F.r >= FAR) p = f.guns >= 0.25 && rand() < 0.4 ? 'fire' : 'close';
    else if (f.rows) p = rand() < 0.7 ? 'board' : 'fire'; // galleys board
    else p = (y.morale < 40 || y.hull < 45 || rand() < 0.35) ? 'board' : 'fire';
  }
  F.plan = p;
  // what the lookout sees: mostly the truth
  F.intent = rand() < 0.85 ? p : F.role === 'attack' ? (p === 'run' ? 'turn' : 'run') : (p === 'board' ? 'fire' : 'board');
  F.intentText = INTENT[F.intent];
}

// One round: you take action `act`; she does what she planned. Returns the lines of what happened.
export function round(F, act, rand = Math.random) {
  if (F.done) return [];
  const y = F.you, f = F.foe;
  const lines = [];
  const foeAct = F.plan;
  F.lastYou = act; F.lastFoe = foeAct;
  const youAttack = F.role === 'attack';
  const end = (result, text) => { F.done = { result, text }; lines.push(text); };

  // Giving up
  if (act === 'strike') { end('struck', 'You strike your colours.'); return finish(F, lines); }
  if (act === 'pay') { end('paid', `You pay the corsairs ${F.tribute} cz to go in peace.`); return finish(F, lines); }
  if (foeAct === 'strike') { end('taken', `The ${f.name} strikes her colours.`); return finish(F, lines); }
  if (foeAct === 'flee' && act !== 'run') {
    end('sheered', `The ${f.name} sheers off and makes away: you have beaten them off.`);
    return finish(F, lines);
  }
  if (act === 'demand') {
    if (rand() < demandOdds(F)) { end('taken', `You call on her to strike, and she does: the ${f.name} is yours without another shot.`); return finish(F, lines); }
    lines.push('You call on her to strike. Her captain answers with a curse.');
    f.morale = Math.min(100, f.morale + 4);
  }

  // Way: who closes, who gets away
  const att = youAttack ? y : f, def = youAttack ? f : y;
  const aAct = youAttack ? act : foeAct, dAct = youAttack ? foeAct : act;
  const closing = aAct === 'close' || aAct === 'board';
  const before = F.r;
  if (dAct === 'run' || foeAct === 'flee') {
    const gain = (speed(def) - speed(att)) / 1.2 + rnd(rand, -0.45, 0.45);
    if (closing) { if (gain > 0.3) F.r++; else if (gain < -0.15) F.r = Math.max(aAct === 'board' ? ALONGSIDE : CLOSE, F.r - 1); }
    else if (gain > -0.2) F.r++;
  } else if (closing) {
    F.r = Math.max(aAct === 'board' ? ALONGSIDE : CLOSE, F.r - 1);
    if (aAct === 'board' && before === FAR) F.r = CLOSE; // too far to grapple this round
  }
  if (F.r !== before) lines.push(F.r > before ? (youAttack ? `She draws away: ${RANGE_NAMES[F.r]}.` : `You draw away: ${RANGE_NAMES[F.r]}.`) : `${youAttack ? 'You close' : 'She closes'}: ${RANGE_NAMES[F.r]}.`);
  if (F.r >= GONE) {
    end(youAttack ? 'gotaway' : 'escaped', youAttack ? `The ${f.name} gets clean away.` : `The ${f.name} falls astern: you have escaped.`);
    return finish(F, lines);
  }

  // Guns
  const shoot = (from, to, kind, who) => {
    const k = reach(from, F.r) * rnd(rand, 0.7, 1.3) * fire(from);
    if (kind === 'rigging') {
      const cut = Math.min(to.rigging, 42 * reach(from, F.r) * rnd(rand, 0.7, 1.3) * Math.max(0.7, fire(from)));
      to.rigging -= cut; to.hull -= 3 * k; to.morale -= 4 * k;
      const whose = who === 'You' ? 'her' : 'your';
      lines.push(`${who === 'You' ? 'You rake' : 'She rakes'} ${whose} rigging: ${to.rigging < 30 ? `${whose} sails hang in rags` : 'spars and canvas come down'}.`);
    } else {
      const dmg = 13 * k * (kind === 'turn' ? 1.25 : 1);
      to.hull -= dmg; to.morale -= dmg * 0.7; to.men *= 1 - dmg / 300;
      lines.push(`${who} fire${who === 'You' ? '' : 's'} into ${who === 'You' ? 'her' : 'you'}${F.r >= FAR ? ' at long range' : ''}: ${dmg >= 14 ? 'a telling broadside' : dmg >= 6 ? 'some hits' : 'most of it wide'}.`);
    }
  };
  const yourShot = ['fire', 'rigging', 'turn'].includes(act) ? act : null;
  const herShot = ['fire', 'turn'].includes(foeAct) ? foeAct : foeAct === 'rigging' ? 'rigging' : null;
  if (yourShot) shoot(y, f, yourShot, 'You');
  if (herShot) shoot(f, y, herShot, 'She');

  // Boarding
  const youBoard = act === 'board' && F.r === ALONGSIDE;
  const sheBoards = foeAct === 'board' && F.r === ALONGSIDE;
  if (act === 'board' && F.r !== ALONGSIDE) lines.push('She slips away from your grapnels.');
  if (youBoard || sheBoards) {
    const [a, d, repel, nets] = youBoard ? [y, f, foeAct === 'repel', 0] : [f, y, act === 'repel', y.nets];
    const p = youBoard && sheBoards ? 0.5 * (melee(y) ** 2 / (melee(y) ** 2 + melee(f) ** 2)) + 0.25 : boardOdds(a, d, repel, nets);
    const won = rand() < p;
    if (youBoard) {
      if (won) { end('taken', `Your men swarm over her rail${foeAct === 'repel' ? ' through her pikes' : ''}. The ${f.name} is yours.`); return finish(F, lines); }
      y.morale -= 22; y.men *= 0.78; f.morale = Math.min(100, f.morale + 8); F.r = CLOSE;
      lines.push(`Your boarders are thrown back${foeAct === 'repel' ? ': she was ready for you' : ''}. You cast off with men lost.`);
    } else {
      if (won) { end('boarded', `They swarm over your rail${act === 'repel' ? ' through your pikes' : ''}. The ship is theirs.`); return finish(F, lines); }
      f.morale -= 26; f.men *= 0.75; y.morale = Math.min(100, y.morale + 8); F.r = CLOSE;
      lines.push(`${act === 'repel' ? 'You were ready for them: the' : 'The'} boarders are thrown back into the sea. She casts off, her men bloodied.`);
    }
  } else if (act === 'repel') {
    y.morale = Math.min(100, y.morale + 4);
    lines.push('Your men wait at the rail, but no boarders come.');
  } else if (foeAct === 'repel' && act !== 'board') {
    f.morale = Math.min(100, f.morale + 3);
  }

  // Broken?
  f.hull = Math.max(0, f.hull); y.hull = Math.max(0, y.hull);
  if (f.morale <= 12 || f.hull <= 15) {
    if (youAttack) end('taken', f.hull <= 15 ? `The ${f.name} is shot to pieces and strikes her colours.` : `Her crew throw down their arms: the ${f.name} strikes her colours.`);
    else end('beaten', f.rows ? `The galley's rowers are beaten: she lies alongside, yours for the taking.` : `The ${f.name} has had enough and sheers off.`);
    return finish(F, lines);
  }
  if (y.morale <= 10 || y.hull <= 12) {
    end(youAttack ? 'repulsed' : 'struck', y.hull <= 12 ? 'Your ship is shot to pieces: your crew strike the colours.' : 'Your crew will fight no more: they strike the colours.');
    return finish(F, lines);
  }

  // Dusk
  F.round++;
  if (F.round > ROUNDS) {
    if (youAttack) end('gotaway', `Night falls, and the ${f.name} slips away in the dark.`);
    else end('escaped', `Night falls, and the ${f.name} loses you in the dark.`);
    return finish(F, lines);
  }
  plan(F, rand);
  return finish(F, lines);
}

function finish(F, lines) {
  F.log.push(...lines);
  return lines;
}

// Who won, for the callers: 'win' (taken her, beaten them off, escaped), 'lose', or 'none'.
export function outcome(F) {
  const r = F.done?.result;
  if (!r) return null;
  if (r === 'taken' || r === 'beaten') return 'win';
  if (r === 'escaped' || r === 'sheered') return 'clear';
  if (r === 'struck' || r === 'boarded') return 'lose';
  if (r === 'paid') return 'paid';
  return 'none'; // she got away, or your attack was beaten off
}

// What the fight did to your hull, applied to S.hull (never below 10).
export function damageTo(F) {
  return Math.max(0, F.startHull - F.you.hull);
}

// Play a whole fight with a simple policy (the simulations and the captain's quick choice).
export function autoplay(F, rand = Math.random) {
  let guard = 0;
  while (!F.done && guard++ < 10) {
    const cs = choices(F).map((c) => c.id);
    let act;
    if (F.role === 'attack') {
      const b = choices(F).find((c) => c.id === 'board');
      const d = choices(F).find((c) => c.id === 'demand');
      if (d && d.odds > 0.55) act = 'demand';
      else if (F.intent === 'run' && cs.includes('rigging') && F.foe.rigging > 35 && speed(F.foe) > speed(F.you) * 0.9) act = 'rigging';
      else if (b && b.odds > 0.45 && F.intent !== 'repel') act = 'board';
      else if (F.r === FAR) act = 'close';
      else act = 'fire';
    } else {
      if (F.intent === 'board' && F.r <= CLOSE && runOdds(F) < 0.45) act = 'repel';
      else if (runOdds(F) > 0.4) act = 'run';
      else act = 'turn';
    }
    round(F, act, rand);
  }
  return F;
}

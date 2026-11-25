// Reference fights from the browser game's rules, for the Godot edition's parity tests
// (godot/tests/test_fight.gd). Every roll comes from a fixed list, so Godot can replay it.
// node tests/tools/fight_fixtures.mjs
import { writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const Fight = await import(root + 'public/js/fight.js');
let s = 12345;
const rolls = Array.from({ length: 4000 }, () => ((s = (s * 16807) % 2147483647) / 2147483647));
const cases = [];
const ships = [
  { hull: 'barca', fit: {} },
  { hull: 'caravel', fit: { guns: 'bercos', crew: 'crossbows' } },
  { hull: 'nau', fit: { guns: 'bercos', defence: 'nets' } },
  { hull: 'carrack', fit: {} },
];
const foes = ['galley', 'biggalley', 'caravel', 'merchantman', 'warship'];
const policies = { attack: [['fire', 'board', 'demand', 'close'], ['close', 'rigging', 'board'], 'auto'], defend: [['run', 'turn', 'repel'], ['repel', 'turn', 'strike'], 'auto', ['pay']] };
let at = 0;
for (const ship of ships) for (const kind of foes) for (const role of ['attack', 'defend']) for (const pol of policies[role]) for (const hull of [100, 55]) {
  const start = at;
  const rand = () => rolls[at++ % rolls.length];
  const S = { ship: { ...ship, name: 'Test' }, hull, pirates: { won: 3 } };
  const foe = Fight.foeSide(kind, kind === 'warship' ? 1 : 0);
  const opts = { range: role === 'attack' ? Fight.CLOSE : Fight.FAR, tribute: kind.includes('galley') ? 120 : 0, surprise: role === 'attack', rand };
  const F = Fight.start(S, role, foe, opts);
  const steps = [];
  if (pol === 'auto') Fight.autoplay(F, rand);
  else {
    let i = 0;
    while (!F.done && i < 12) {
      const ids = Fight.choices(F).map((c) => c.id);
      const act = pol.find((a) => ids.includes(a)) || ids[0];
      const lines = Fight.round(F, act, rand);
      steps.push({ act, lines, r: F.r, you: { hull: F.you.hull, morale: F.you.morale, rigging: F.you.rigging, men: F.you.men }, foe: { hull: F.foe.hull, morale: F.foe.morale, rigging: F.foe.rigging, men: F.foe.men }, intent: F.intent || null });
      i++;
    }
  }
  cases.push({ ship, hull, kind, role, policy: pol, opts: { range: opts.range, tribute: opts.tribute, surprise: opts.surprise }, start, used: at - start, steps, log: F.log, done: F.done, you: F.you, foe: F.foe });
}
writeFileSync(root + 'godot/tests/fight_fixtures.json', JSON.stringify({ rolls, cases }));
console.log(cases.length, 'fights;', at, 'rolls');

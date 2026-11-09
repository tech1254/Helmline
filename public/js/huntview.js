// Hunting on screen (hunt.js): tap a rival house's ship to see her and give chase; run her down
// and fight her; if she is yours, choose what to take.

import * as Hunt from './hunt.js';
import * as Houses from './houses.js';
import * as Law from './law.js';
import * as Ships from './ships.js';
import * as Accounts from './accounts.js';
import { GOODS } from './economy.js';
import { PORTS } from './world.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { openFight } from './fightview.js';
import { setSpeed, renderPanel } from './panels.js';
import { afterEncounter } from './voyage.js';
import { toast, addNotice } from './notices.js';
import { log } from './pricebook.js';
import { plog } from './playlog.js';
import { save } from './save.js';
import { toScreen } from './view.js';
import { isRevealed } from './fog.js';
import { held } from './util.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const portName = (id) => PORTS.find((p) => p.id === id)?.name || id;
const goodName = (id) => GOODS.find((g) => g.id === id)?.name.toLowerCase() || id;

// The rival ship under a tap on the chart, if any.
export function vesselAt(sx, sy, finger = false) {
  let best = null, bd = finger ? 26 : 16;
  for (const v of Houses.positions(S)) {
    if (!isRevealed(v.lon, v.lat)) continue;
    const [x, y] = toScreen(v.lon, v.lat);
    const d = Math.hypot(x - sx, y - sy);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function lawLine(info) {
  return `<p class="${info.law.ok ? 'fine' : 'warn'}">${info.law.text}</p>`;
}

// A rival ship, tapped on the chart: who she is, and whether to chase her.
export function openShip(v) {
  const info = Hunt.preyInfo(S, v);
  const chasing = S.chase?.key === v.key;
  const cargo = info.cargo.map((c) => `${c.qty} ${goodName(c.good)}`).join(' and ') || 'nothing you can see';
  confirmDialog({
    title: `The ${info.houseName} ${info.hullName}`,
    body: `<p>${info.convoy ? `A ${info.hullName} under the flag of ${info.crownName}, the enemy's shipping, sailing alone` : info.house === 'treasure' ? 'A great Castilian carrack of the Indies trade, home from Santo Domingo with gold and pearls, armed and in company' : info.special ? 'The flagship of Castile\'s Guinea fleet, home from the Mina with the gold of the Gold Coast, sailing in company with armed caravels: the richest prize of the war' : `A ${info.hullName} of the house of <b>${info.houseName}</b> of ${info.of}${info.crownName ? `, under the flag of ${info.crownName}` : ''}`}, bound from ${portName(info.from)} for ${portName(info.to)}.</p>
      <dl class="facts">
        <dt>Likely cargo</dt><dd>${cargo}, worth about ${fmt(info.cargoValue)} cz where she is bound</dd>
        <dt>The ship</dt><dd>worth about ${fmt(info.shipValue)} cz as a prize</dd>
        <dt>Arms</dt><dd>${Hunt.armedText(info.armed)}</dd>
      </dl>
      ${lawLine(info)}
      <p class="fine">Give chase and your ship steers to cut her off. Whether you catch her depends on your speed and the wind, and on how far she has to go to make port.</p>
      <div class="row choice">
        ${chasing ? '<button data-modal-action="stop">Break off the chase</button>' : '<button data-modal-action="leave">Leave her be</button>'}
        ${chasing ? '' : `<button class="primary" data-modal-action="chase"${S.ship.docked ? ' disabled title="Put to sea first"' : ''}>Give chase</button>`}
      </div>${S.ship.docked ? '<p class="fine">You are in port: set sail first.</p>' : ''}`,
    ok: null,
    cancel: 'Close',
    kind: 'prey',
    actions: {
      chase: () => {
        Hunt.startChase(S, v);
        plog('chase', { house: v.house, hull: v.hull, lawful: info.law.ok });
        toast(`You give chase to the <b>${info.houseName} ${info.hullName}</b>.`, 'alert');
        if (!ui.speed) setSpeed(ui.lastSpeed || 1);
        save();
      },
      stop: () => { Hunt.endChase(S); toast('You break off the chase.'); save(); },
      leave: () => {},
    },
  });
}

// You have run her down: fight, or let her go.
export function engagePrey(v) {
  setSpeed(0);
  const info = Hunt.preyInfo(S, v);
  confirmDialog({
    title: `You have run down the ${info.houseName} ${info.hullName}`,
    body: `<p>She is within gunshot. ${Hunt.armedText(info.armed)}</p>
      ${lawLine(info)}
      <p class="fine">You fight it round by round. Rake her rigging if she tries to run; board her once her crew is shaken, or call on her to strike.</p>
      <div class="row choice">
        <button data-modal-action="pass">Let her go</button>
        <button class="primary" data-modal-action="attack">Attack</button>
      </div>`,
    ok: null,
    cancel: false,
    kind: 'encounter',
    actions: {
      attack: () => {
        const { F } = Hunt.engage(S, v);
        openFight(F, { title: `Attacking the ${info.houseName} ${info.hullName}`, onDone: (done) => afterHunt(info, done) });
      },
      pass: () => { Hunt.endChase(S); toast('You let her go on her way.'); save(); },
    },
  });
}

function afterHunt(info, F) {
  Hunt.endChase(S);
  const res = F.done.result;
  const dmg = Math.max(0, F.startHull - F.you.hull);
  plog('hunt', { house: info.house, result: res, lawful: info.law.ok });
  if (res === 'taken') { S.hull = Math.max(10, (S.hull ?? 100) - dmg); offerSpoils(info); return; }
  Hunt.escaped(S, info);
  S.hull = Math.max(10, (S.hull ?? 100) - dmg);
  const lines = [res === 'repulsed' ? `Your crew have had enough: you break off, and the ${info.houseName} ship goes on her way.` : `The ${info.houseName} ship gets away. She will tell of you in ${portName(info.to)}.`];
  if (dmg >= 3) lines.push(`Your hull is damaged (${Math.round(S.hull)}%).`);
  for (const l of lines) addNotice(l, '');
  log(lines[0]);
  afterEncounter({ kind: '', lines, title: 'She got away' });
  save();
}

// She is yours: her cargo, the ship as a prize, a ransom, or a toll.
function offerSpoils(info) {
  const free = Ships.flagStats(S).hold - held();
  const ransom = Math.round(info.value * Hunt.RANSOM / 10) * 10, toll = Math.round(info.value * Hunt.TOLL / 10) * 10;
  const canPrize = Law.canSendPrize(S);
  const cargo = info.cargo.map((c) => `${c.qty} ${goodName(c.good)}`).join(' and ');
  const choose = (how) => {
    const r = Hunt.spoils(S, info, how, free);
    if (r.cz) Accounts.record(S, { kind: 'prizes', amount: r.cz, port: null, text: `${how === 'ransom' ? 'Ransom' : 'Toll'} from the ${info.houseName} ${info.hullName}` });
    for (const l of r.lines) addNotice(l, 'discover');
    log(r.lines[0]);
    afterEncounter({ kind: 'discover', lines: r.lines, title: 'A prize taken' });
    renderPanel();
    save();
  };
  confirmDialog({
    title: `The ${info.houseName} ${info.hullName} is yours`,
    body: `<p>Her crew stand disarmed on deck. In her hold: ${cargo || 'nothing'}.</p>
      ${lawLine(info)}
      <ul class="spoils">
        <li><button data-modal-action="cargo"><b>Take her cargo</b><small>${free > 0 ? `${free} units of room in your hold; worth about ${fmt(info.cargoValue)} cz in all` : 'Your hold is full'}</small></button></li>
        <li><button data-modal-action="prize" ${canPrize ? '' : 'disabled'}><b>Take her as a prize</b><small>${canPrize ? `ship and cargo, worth about ${fmt(info.value)} cz, sent in with a prize crew to sell ${info.law.ok ? 'at a prize court (the crown takes a fifth)' : 'at a haven, for about half'}` : `You can spare no more prize crews (${Law.MAX_PRIZES} already)`}</small></button></li>
        <li><button data-modal-action="ransom"><b>Ransom her</b><small>${fmt(ransom)} cz from her house, now</small></button></li>
        <li><button data-modal-action="toll"><b>Take a toll and let her go</b><small>${fmt(toll)} cz${info.law.ok ? '' : ': the least infamy'}</small></button></li>
      </ul>`,
    ok: null,
    cancel: false,
    kind: 'encounter',
    actions: { cargo: () => choose('cargo'), prize: () => choose('prize'), ransom: () => choose('ransom'), toll: () => choose('toll') },
  });
}

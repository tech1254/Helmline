// The act break (the design doc, "Time"): at the end of Act I the years can pass at once, to the
// eve of the 1475 war. "1461-1474: the house grows." Your ship lies up at home; your hired
// captains trade through the gap and your factors keep your custom; the rival houses rise and
// fall; history moves on. A summary shows what happened. Offered once when the act ends, and
// from the Houses of the Sea while it can still be taken.

import * as Story from './story.js';
import * as Houses from './houses.js';
import * as Accounts from './accounts.js';
import * as Ships from './ships.js';
import * as War from './war.js';
import { worth } from './ambitions.js';
import { S, ui } from './state.js';
import { advanceTime } from './sim.js';
import { confirmDialog } from './dialog.js';
import { renderPanel, setSpeed } from './panels.js';
import { log } from './pricebook.js';
import { plog } from './playlog.js';
import { save } from './save.js';
import { home, homeName } from './nations.js';
import { fmtDate } from './util.js';

export const SKIP_TO = Ships.dayOfYear(1474) + 59; // 1 March 1474
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const strip = (h) => h.replace(/<[^>]+>/g, '');

// Has Act I ended? (Portugal: Prince Henry's death, 1460; Castile: Gibraltar, 1462.)
export function actOver(S) {
  const f = S.story?.fired || {};
  if (S.story && !S.story.off && (S.nation === 'castile' ? f.gibraltar == null : f.henry_dies == null)) return false;
  return Ships.yearOf(S.day) >= (S.nation === 'castile' ? 1462 : 1461);
}

// Can the years pass now, and if not, why not.
export function canSkip(S) {
  if (S.day >= SKIP_TO - 30) return { ok: false, why: 'The war is close: there are no years to pass.' };
  if (!actOver(S)) return { ok: false, why: 'Not until the end of Act I.' };
  if (S.ship.docked !== home(S)) return { ok: false, why: `Lie up your ship at ${homeName(S)} first.` };
  if (S.lending?.loan) return { ok: false, why: 'Settle your sea loan first.' };
  if (S.story?.debt && !S.story.debt.paid) return { ok: false, why: 'Settle your father\'s debt first.' };
  if (S.law?.prizes?.length) return { ok: false, why: 'Sell your prizes first.' };
  return { ok: true };
}

// What your factors earn you a year while you are at home: a share of the trade you did in the
// last year, and something for each port where you have built.
function factorsYear(S) {
  const sold = (S.accounts?.entries || []).filter((e) => e.kind === 'sale' && e.day > S.day - 365).reduce((t, e) => t + e.amount, 0);
  const ports = new Set((S.works ? Object.keys(S.works.at) : [])).size;
  return Math.round(Math.min(16000, 600 + sold * 0.14 + ports * 300)); // doubled after the balance runs (Nov 2026)
}

// Let the years pass. Returns the summary.
export function skip() {
  const c = canSkip(S);
  if (!c.ok) return null;
  const from = S.day;
  const days = SKIP_TO - S.day;
  const before = { purse: S.purse, worth: worth(S), ledger: Object.fromEntries(Houses.ledger(S).map((r) => [r.id, r])), ships: S.fleet.ships.map((x) => ({ id: x.id, profit: x.profit })) };
  const perYear = factorsYear(S);
  for (const k of S.contracts?.active || []) if (k.deadline != null) k.deadline += days;
  ui.offlineBuffer = [];
  let msgs, earned = 0;
  try {
    let lastYear = Ships.yearOf(S.day);
    for (let d = 0; d < days; d += 1) {
      advanceTime(Math.min(1, days - d), false, true);
      const y = Ships.yearOf(S.day);
      if (y !== lastYear) {
        lastYear = y;
        S.purse += perYear; earned += perYear;
        Accounts.record(S, { kind: 'post', amount: perYear, text: 'Your factors\' trade through the year' });
      }
    }
  } finally {
    msgs = ui.offlineBuffer;
    ui.offlineBuffer = null;
  }
  S.skipped = { from, to: S.day };
  const ledger = Houses.ledger(S);
  const houses = ledger.filter((r) => r.id !== 'you').map((r) => {
    const b = before.ledger[r.id];
    if (!b) return `The house of ${r.name} has opened for business${r.status === 'trading' ? `, worth ${fmt(r.worth)} cz` : ''}.`;
    if (b.status === 'trading' && r.status !== 'trading') return `The house of ${r.name} is ${r.status === 'bought' ? 'bought out' : 'ruined'}.`;
    if (r.status !== 'trading') return null;
    return `${r.name}: ${fmt(b.worth)} → ${fmt(r.worth)} cz, ${r.led} ${r.led === 1 ? 'port' : 'ports'} led.`;
  }).filter(Boolean);
  const captains = S.fleet.ships.reduce((t, x) => t + (x.profit - (before.ships.find((b) => b.id === x.id)?.profit || 0)), 0);
  const seen = new Set();
  const news = msgs.filter((m) => m.kind === 'discover' && m.html).map((m) => strip(m.html)).filter((t) => !seen.has(t) && seen.add(t)).slice(-8);
  log(`The years pass: ${fmtDate(from)} to ${fmtDate(S.day)}. Purse ${S.purse - before.purse >= 0 ? '+' : ''}${fmt(S.purse - before.purse)} cz.`);
  plog('timeskip', { from: Ships.yearOf(from), to: Ships.yearOf(S.day), purse: Math.round(S.purse - before.purse) });
  save();
  return { from, to: S.day, purse: S.purse - before.purse, earned, captains, houses, news, perYear, rank: ledger.findIndex((r) => r.id === 'you') + 1, of: ledger.filter((r) => r.status === 'trading').length };
}

export function offerSkip(first = false) {
  const c = canSkip(S);
  const years = `${Ships.yearOf(S.day) + 1}–1474`;
  setSpeed(0);
  confirmDialog({
    title: first ? 'The years ahead' : 'Let the years pass',
    body: `<p>${first ? 'The act is over. ' : ''}You can sail on year by year, or let the years ${years} pass at once and take up the story on the eve of the war of 1475, when Castile and Portugal fight for the crown of Castile and the Guinea trade.</p>
      <ul class="help">
        <li>Your ship lies up at ${homeName(S)}; her crew is paid off.</li>
        <li>Your hired captains trade through the years, and your factors keep your custom: about <b>${fmt(factorsYear(S))} cz a year</b> on what you traded last year and the ports where you have built.</li>
        <li>The rival houses rise and fall; new ports and new ships come as history brings them. You may lose races to the explorers.</li>
      </ul>
      ${c.ok ? '' : `<p class="warn">${c.why}</p>`}
      <p class="fine">${first ? 'You can also do this later, from the Houses of the Sea, until the war.' : 'Your contracts\' deadlines move back with the years.'}</p>`,
    ok: c.ok ? `Let the years pass to ${War.warYear() - 1}` : null,
    cancel: first ? 'Sail on' : 'Not now',
    kind: 'timeskip',
    onOk: () => {
      const sum = skip();
      if (sum) showSkip(sum);
    },
  });
}

function showSkip(sum) {
  confirmDialog({
    title: `${Ships.yearOf(sum.from)}–${Ships.yearOf(sum.to)}: the house grows`,
    body: `<dl class="facts">
        <dt>Now</dt><dd>${fmtDate(sum.to)}</dd>
        <dt>Your factors' trade</dt><dd>+${fmt(sum.earned)} cz</dd>
        ${S.fleet.ships.length ? `<dt>Your captains' sales</dt><dd>${sum.captains >= 0 ? '+' : ''}${fmt(sum.captains)} cz</dd>` : ''}
        <dt>Change in your purse</dt><dd>${sum.purse >= 0 ? '+' : ''}${fmt(sum.purse)} cz</dd>
        <dt>Houses of the Sea</dt><dd>you stand ${sum.rank} of ${sum.of}</dd>
      </dl>
      ${sum.houses.length ? `<p><b>The rival houses</b></p><ul class="help">${sum.houses.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}
      ${sum.news.length ? `<p><b>News of the years</b></p><ul class="help">${sum.news.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}
      <p class="fine">War with ${S.nation === 'castile' ? 'Portugal' : 'Castile'} is a year off. Look to your ship: the yards have new hulls and guns.</p>`,
    ok: 'Take up the story',
    cancel: false,
    kind: 'summary',
    onOk: () => { renderPanel(); },
  });
}

// Each frame when nothing else is on screen: offer the years once, when the act is over and
// you are in your home port.
export function skipTick(free) {
  if (!free || S.skipOffered || !actOver(S) || S.day >= SKIP_TO - 30 || S.ship.docked !== home(S)) return;
  if (navigator.webdriver && !window.helmlineStory) return; // the tests ask for it
  S.skipOffered = true;
  offerSkip(true);
}

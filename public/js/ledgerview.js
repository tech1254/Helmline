// The Ledger panel: the accounts of the purse.

import * as Taxes from './taxes.js';
import * as House from './house.js';
import { GOODS } from './economy.js';
import * as Accounts from './accounts.js';
import { S, ui } from './state.js';
import { report } from './sim.js';
import { $, cz, fmtDate, portName } from './util.js';
import { tabs } from './panels.js';

// ---- Ledger ----------------------------------------------------------------------
export function entryText(e) {
  const g = e.good && GOODS.find((x) => x.id === e.good);
  const lot = g ? `${e.qty} ${e.qty === 1 ? g.one : g.unit} of ${g.name.toLowerCase()}` : '';
  if (e.kind === 'sale') return `Sold ${lot}`;
  if (e.kind === 'purchase') return `Bought ${lot}`;
  if (e.kind === 'wages') {
    if (e.who === 'you') {
      const d = Math.max(1, Math.round(e.days || 0));
      return `Crew wages, ${d} ${d === 1 ? 'day' : 'days'} at sea${e.from ? ` from ${portName(e.from)}` : ''}`;
    }
    return `Wages and upkeep, ${e.text}`;
  }
  return e.text || Accounts.KINDS[e.kind] || e.kind;
}

// What the crown will take of this year's gains, so far.
function taxLine() {
  const ren = House.renown(S);
  const t = Taxes.sofar(S, ren);
  const last = S.taxes?.last;
  if (t.gains < Taxes.BANDS[1].from && !last?.tax) return '<p class="fine">The crown\'s officials take no notice of a trader your size. Above 3,000 cz of gains in a year they take a share each New Year.</p>';
  return `<p class="fine">The crown's share: gains from trade this year so far ${cz(t.gains, false)}, on which the officials would take about <b>${t.tax.toLocaleString()} cz</b> at New Year${t.gross > t.tax ? ` (your renown spares ${Math.round(Taxes.relief(ren) * 100)}%)` : ''}.${last?.tax ? ` Last year: ${last.tax.toLocaleString()} cz.` : ''} 10% of gains over 3,000, 20% over 10,000, 30% over 25,000.</p>`;
}

export function renderLedger(el) {
  const A = Accounts.ensureAccounts(S);
  const ships = S.fleet.ships;
  if (ui.ledgerWho !== 'all' && ui.ledgerWho !== 'you' && !ships.some((x) => String(x.id) === ui.ledgerWho) && !A.entries.some((e) => String(e.who) === ui.ledgerWho)) ui.ledgerWho = 'all';
  const known = Accounts.known(S);
  const voyage = A.voyage ? A.voyage.wages : 0;
  const unacc = Accounts.unaccounted(S);
  const year = Accounts.totalsSince(S, S.day - 365);
  const kinds = Object.keys(Accounts.KINDS).filter((k) => A.totals[k] || year[k]);
  const row = (k) => `<tr><th scope="row">${Accounts.KINDS[k]}</th><td class="num ${(year[k] || 0) < 0 ? 'out' : 'in'}">${year[k] ? cz(year[k]) : '–'}</td><td class="num ${(A.totals[k] || 0) < 0 ? 'out' : 'in'}">${A.totals[k] ? cz(A.totals[k]) : '–'}</td></tr>`;
  const sum = (o) => kinds.reduce((t, k) => t + (o[k] || 0), 0);
  const totals = kinds.length
    ? `<table class="accounts"><thead><tr><th></th><th class="num">Last 12 months</th><th class="num">All time</th></tr></thead>
        <tbody>${kinds.map(row).join('')}</tbody>
        <tfoot><tr><th scope="row">Net</th><td class="num">${cz(sum(year))}</td><td class="num">${cz(sum(A.totals))}</td></tr></tfoot></table>`
    : '<p class="muted">Nothing entered yet.</p>';
  const whoName = (e) => (e.who === 'you' ? 'Your ship' : e.ship || 'Hired ship');
  const list = A.entries.filter((e) => ui.ledgerWho === 'all' || String(e.who) === ui.ledgerWho)
    .sort((x, y) => Math.floor(y.heard) - Math.floor(x.heard) || y.day - x.day || y.id - x.id).slice(0, 80);
  const options = [['all', 'All ships'], ['you', 'Your ship'], ...ships.map((x) => [String(x.id), x.name])];
  const entries = list.length
    ? `<table class="accounts entries"><tbody>${list.map((e) => {
        const late = e.who !== 'you' && Math.floor(e.heard) > Math.floor(e.day);
        return `<tr><td class="when">${fmtDate(e.day)}<small>${portName(e.port)}</small></td>
          <td>${ui.ledgerWho === 'all' ? `<span class="who">${whoName(e)}</span> ` : ''}${entryText(e)}${late ? `<small>Heard in ${portName(e.heardAt)}, ${fmtDate(e.heard)}</small>` : ''}</td>
          <td class="num ${e.amount < 0 ? 'out' : 'in'}">${cz(e.amount)}</td></tr>`;
      }).join('')}</tbody></table>`
    : '<p class="muted">No entries yet.</p>';
  el.innerHTML = `
    ${tabs('ledger')}
    <header><h2>Ledger</h2><button class="close" data-close-ledger aria-label="Close">×</button></header>
    <p class="blurb">Money in and out of your purse. Your own dealings are entered at once. A hired captain's are entered when you are in any port on his route: the factor there hands you everything he has done since his last report.</p>
    <dl class="facts">
      <dt>Purse</dt><dd>${cz(S.purse, false)}</dd>
      <dt>Brought forward ${fmtDate(A.openDay)}</dt><dd>${cz(A.opening, false)}</dd>
      <dt>Entered since then</dt><dd>${cz(known - A.opening)}</dd>
      ${voyage >= 0.5 ? `<dt>Wages this voyage so far</dt><dd>${cz(-voyage)}</dd>` : ''}
      ${Accounts.captainWagesRunning(S) >= 0.5 ? `<dt>Hired crews' wages since their last report</dt><dd>${cz(-Accounts.captainWagesRunning(S))}</dd>` : ''}
      ${Math.abs(unacc) >= 1 ? `<dt>Not yet accounted for</dt><dd class="${unacc < 0 ? 'out' : 'in'}">${cz(unacc)}</dd>` : ''}
    </dl>
    ${Math.abs(unacc) >= 1 ? `<p class="fine">${unacc < 0 ? 'Your purse is lighter' : 'Your purse is heavier'} than your books say: your hired captains have been trading and drawing pay, and you have not yet seen their accounts. Call at any port on a captain's route to collect his accounts.</p>` : ''}
    <h3>Totals</h3>
    ${totals}
    ${taxLine()}
    <h3>Entries</h3>
    ${ships.length || A.entries.some((e) => e.who !== 'you') ? `<label class="who-filter">Show <select data-ledger-who>${options.map(([v, t]) => `<option value="${v}" ${v === ui.ledgerWho ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    <div class="scroll">${entries}</div>`;
}

// Sea passages for the harbourmaster's reckoning: the real route through the winds,
// cached for a few days since he reasons from the same chart each time the price book opens.

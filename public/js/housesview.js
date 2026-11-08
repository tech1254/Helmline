// The rival houses on screen: the Houses of the Sea ledger (a tab beside the Ledger), who holds
// the trade of the port you are in (in the market), and buying out a house. Rules: houses.js.

import * as Houses from './houses.js';
import { PORTS } from './world.js';
import { S } from './state.js';
import { tabs } from './panels.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const pct = (x) => `${Math.round(x * 100)}%`;
const portName = (id) => PORTS.find((p) => p.id === id)?.name || id;
export const housesOpen = () => (S.voyages || 0) >= 1 || !!S.calling;

// Who holds the trade here, for the market: the largest shares, local merchants last.
export function shareLine(pid) {
  if (!S.houses) return '';
  const sh = Houses.shares(S, pid);
  const parts = Object.entries(sh).filter(([k, v]) => k !== 'local' && v >= 0.02).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k === 'you' ? `<b class="sw-you">you ${pct(v)}</b>` : `<span style="color:${Houses.defOf(k).colour}">${Houses.defOf(k).name} ${pct(v)}</span>`);
  if (!parts.length) return '';
  return `<p class="shares">Trade here: ${parts.join(' · ')} · local merchants ${pct(sh.local)}</p>`;
}

export function renderHouses(el) {
  const rows = Houses.ledger(S);
  const you = rows.findIndex((r) => r.id === 'you');
  const ahead = rows.filter((r, i) => i < you && r.status === 'trading');
  const lead = ahead.length ? `<p class="blurb">${ahead.length === 1 ? `Only the <b>${ahead[0].name}</b> stand above you.` : `${ahead.length} houses stand above you. The <b>${ahead[0].name}</b> lead the sea.`}</p>`
    : '<p class="blurb"><b>Your house leads the sea.</b></p>';
  const body = rows.map((r, i) => {
    const d = Houses.defOf(r.id);
    const q = r.id !== 'you' && r.status === 'trading' ? Houses.buyOutPrice(S, r.id) : null;
    const act = q ? (q.ok && S.purse >= q.price ? `<button data-buyout="${r.id}">Buy out: ${fmt(q.price)} cz</button>` : `<span class="fine">Buy out: ${fmt(q.price)} cz (${q.why})</span>`) : '';
    const status = r.status === 'ruined' ? 'ruined' : r.status === 'bought' ? 'bought out by you' : '';
    return `<tr class="${r.id === 'you' ? 'you' : ''}${status ? ' gone' : ''}">
      <td class="num">${r.status === 'trading' ? i + 1 : ''}</td>
      <td><span class="house-sw" style="background:${r.id === 'you' ? '#b8860b' : d.colour}"></span>${r.name}${d ? `<small>${d.style}</small>` : ''}${status ? `<small><i>${status}</i></small>` : ''}</td>
      <td class="num">${r.status === 'trading' ? fmt(r.worth) : '—'}</td>
      <td class="num">${r.status === 'trading' ? r.ships : '—'}</td>
      <td class="num">${r.led || ''}</td>
    </tr>${act ? `<tr class="act"><td></td><td colspan="4">${act}</td></tr>` : ''}`;
  }).join('');
  const here = S.ship.docked ? shareLine(S.ship.docked) : '';
  el.innerHTML = `${tabs('houses')}
    <h2>Houses of the Sea</h2>
    ${lead}
    <div class="scroll"><table class="houses"><thead><tr><th class="num">#</th><th>House</th><th class="num">Worth, cz</th><th class="num">Ships</th><th class="num">Ports led</th></tr></thead><tbody>${body}</tbody></table></div>
    ${here ? `<h3>${portName(S.ship.docked)}</h3>${here}` : ''}
    <p class="fine">Every port's trade is shared between its own merchants, the houses that work it and you. Buy and sell in a port and your share grows; a ring round a port on the chart shows who leads it. Where the houses hold sway, prices are narrower. Weaken a house enough and it is ruined; once your house is worth twice as much, you can buy it out and take its custom.</p>`;
}

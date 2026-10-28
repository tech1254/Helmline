// The Price book panel: prices seen, the harbourmaster, news and the log.

import { PORTS, distNm, findPath } from './world.js';
import { GOODS } from './economy.js';
import * as Events from './events.js';
import * as Pirates from './pirates.js';
import * as Ships from './ships.js';
import { S, market } from './state.js';
import { estimateVoyage } from './voyage.js';
import { $, ageText, cz, fmtDate } from './util.js';
import { tabs } from './panels.js';

export const passageCache = new Map();
// The passage is planned as the flagship would sail it: a barca keeps to the coast, so a run she
// cannot make (out to Madeira, say) has no passage at all.
export function passage(from, to, startDay) {
  const coastal = !!Ships.hullOf(S.ship).coastal;
  const key = `${from.lon.toFixed(1)},${from.lat.toFixed(1)}>${to.id}@${Math.floor(startDay / 5)}${coastal ? 'c' : ''}`;
  if (passageCache.has(key)) return passageCache.get(key);
  let est = null;
  if (distNm(from.lon, from.lat, to.lon, to.lat) < 1) est = { days: 0, nm: 0, hot: 0 };
  else {
    const route = findPath(from.lon, from.lat, to.lon, to.lat, 1, coastal);
    if (route) est = estimateVoyage(route, from, startDay);
  }
  if (passageCache.size > 300) passageCache.clear();
  passageCache.set(key, est);
  return est;
}

// Trade runs the captain could make from what he has seen: buy at A, carry to B.
// Net of wages for the whole passage (getting to A, then A to B) and of the cargo
// he can expect to lose to rot on the way.
export function suggestions() {
  const out = [];
  // only ports on the chart: hearsay of a port not yet found is no use to a captain
  const seen = Object.entries(S.seen).filter(([pid]) => S.discovered[pid]);
  const here = { lon: S.ship.lon, lat: S.ship.lat };
  const st = Ships.flagStats(S);
  for (const g of GOODS) {
    for (const [a, ra] of seen) {
      const buy = ra.prices[g.id].buy;
      if (buy == null) continue;
      for (const [b, rb] of seen) {
        if (a === b) continue;
        const sell = rb.prices[g.id].sell;
        if (sell - buy <= 2) continue;
        const pa = PORTS.find((p) => p.id === a), pb = PORTS.find((p) => p.id === b);
        const toA = passage(here, pa, S.day);
        if (!toA) continue;
        const run = passage(pa, pb, S.day + toA.days);
        if (!run) continue;
        const days = Math.max(1, toA.days + run.days);
        const wages = Math.round(days * st.upkeep);
        const budget = Math.max(S.purse - wages, 50);
        const units = Math.min(st.hold, Math.max(1, Math.floor(budget / buy)));
        // Prices move as you trade: you pay more for each unit and get less for each sold.
        const gross = (sell - buy) * units * 0.7;
        // Expected rot on the run from A to B, faster in the tropics.
        const rotDays = run.days + 0.6 * run.hot;
        const lost = g.spoil ? units * (1 - Math.exp(-g.spoil * st.spoil * rotDays)) : 0;
        const spoilage = Math.round(lost * sell * 0.9);
        const profit = Math.round(gross - wages - spoilage);
        const stale = Math.max(S.day - ra.day, S.day - rb.day);
        out.push({ g, pa, pb, buy, sell, units, gross: Math.round(gross), wages, spoilage, lost, profit, days, stale, score: profit / days, ageA: ra.day, ageB: rb.day, here: toA.days < 0.05 });
      }
    }
  }
  return out.filter((s) => s.profit > 0).sort((x, y) => y.score - x.score).slice(0, 4);
}

export function renderPrices(el) {
  const ports = PORTS.filter((p) => S.seen[p.id]);
  const head = ports.map((p) => {
    const age = S.day - S.seen[p.id].day;
    return `<th class="num ${age > 60 ? 'stale' : ''}">${p.name}<small>${ageText(S.seen[p.id].day)}${S.seen[p.id].by ? `<br>by ${S.seen[p.id].by}` : ''}</small></th>`;
  }).join('');
  const body = GOODS.map((g) => {
    const vals = ports.map((p) => S.seen[p.id].prices[g.id].sell);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const cells = ports.map((p) => {
      const rec = S.seen[p.id].prices[g.id];
      const t = hi > lo ? (rec.sell - lo) / (hi - lo) : 0.5;
      const cls = t > 0.75 ? 'hi' : t < 0.25 ? 'lo' : '';
      const stale = S.day - S.seen[p.id].day > 60 ? 'stale' : '';
      return `<td class="num ${cls} ${stale}">${rec.buy != null ? `<b title="You can buy here">${rec.buy}</b> / ` : ''}${rec.sell}</td>`;
    }).join('');
    return `<tr><th scope="row">${g.name}</th>${cells}</tr>`;
  }).join('');
  const sug = suggestions();
  const sugHtml = sug.length
    ? sug.map((s) => `<li><b>${s.g.name}:</b> buy at ${s.pa.name} (${s.buy}, seen ${ageText(s.ageA)}), sell at ${s.pb.name} (${s.sell}, seen ${ageText(s.ageB)}).
        About <b>+${s.profit.toLocaleString()} cz</b> clear on ${s.units} ${s.g.unit}, about ${Math.max(1, Math.round(s.days))} days${s.here ? '' : `, counting the passage to ${s.pa.name}`}.
        <small class="muted">${s.gross.toLocaleString()} cz on the trade, less ${s.wages.toLocaleString()} wages${s.spoilage ? ` and ${s.spoilage.toLocaleString()} for spoilage (${s.lost < 0.75 ? `under one ${s.g.one}` : `about ${Math.round(s.lost)} ${Math.round(s.lost) > 1 ? s.g.unit : s.g.one}`})` : ''}.</small>${s.stale > 60 ? ' <em>Old news: prices may have moved.</em>' : ''}</li>`).join('')
    : Object.keys(S.seen).length > 1
      ? '<li class="muted">No run you know of pays once wages and spoilage are counted. Visit more ports, or wait for prices to move.</li>'
      : '<li class="muted">Visit more ports. The price book can only reason from prices you have seen with your own eyes.</li>';
  el.innerHTML = `
    ${tabs('prices')}
    <header><h2>Price book</h2><button class="close" data-close-prices aria-label="Close">×</button></header>
    <p class="blurb">Prices as last seen by your ship, or noted by your captains and passed on when you call at a port on their route. <b>Bold</b> is the price to buy, the other is what they pay you. Entries older than two months are faded.</p>
    <div class="scroll"><table class="pricebook"><thead><tr><th>Good</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <h3>News</h3>
    <ul class="news">${Events.knownNews(S).map((n) => `<li><b>${n.t.title}</b> <span class="muted">· ${PORTS.find((p) => p.id === n.port).name} · since ${fmtDate(n.start)}, expected to last until about ${fmtDate(n.end)}</span><br>${n.t.text}</li>`).join('') || '<li class="muted">No news has reached you. Word travels by ship, so you hear it in port.</li>'}</ul>
    <h3>The harbourmaster suggests</h3>
    <ol class="sugg">${sugHtml}</ol>
    <p class="foot">Estimates use today's winds along the sea route, and allow for prices moving as you trade.</p>
    <h3>Your name at sea</h3>
    <p class="muted">${Pirates.reputationText(S)}</p>
    <h3>Log</h3>
    <ul class="log">${(S.log || []).slice(-6).reverse().map((l) => `<li><span>${fmtDate(l.day)}</span> ${l.text}</li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul>
    <div class="row"><button data-reset class="danger">Start a new game</button></div>`;
}

// Price a trade without making it: run it, then put the market back as it was.
export function quote(fn) {
  const saved = JSON.stringify(market.press), vol = JSON.stringify(market.vol || {});
  const r = fn();
  market.press = JSON.parse(saved);
  market.vol = JSON.parse(vol);
  return r;
}

export function tradeFacts(n, total, purseChange, extra) {
  const each = (total / n).toFixed(1);
  return `<dl class="facts">
      <dt>Total</dt><dd>${total.toLocaleString()} cz (about ${each} each)</dd>
      <dt>Purse after</dt><dd>${Math.floor(S.purse + purseChange).toLocaleString()} cz</dd>
    </dl>
    ${extra ? `<p>${extra}</p>` : ''}
    <p class="fine">Each unit moves the price a little, so the average differs from the listed price.</p>`;
}

export function log(text) {
  S.log = S.log || [];
  S.log.push({ day: S.day, text });
  if (S.log.length > 60) S.log.shift();
}

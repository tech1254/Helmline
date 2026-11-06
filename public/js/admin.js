// The harbour office (admin.html): players by day and by source, play time, where they came from,
// the feedback players send, and the accounts with their settings. For accounts with the `admin`
// flag; signs in with the same account as the game (and keeps the game signed in).

import { api } from './api.js';

const KEY = 'helmline-account-v1';
const $ = (id) => document.getElementById(id);
let token = null, days = 30;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => Math.round(x || 0).toLocaleString();
const dateOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

function load() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || 'null'); token = a?.token || null; return a; } catch (e) { return null; }
}

async function call(method, path, body) {
  const r = await fetch(api(path), { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await r.json(); } catch (e) { /* no body */ }
  return { ok: r.ok, status: r.status, data };
}

function showSignin(msg) {
  $('signin').hidden = false; $('board').hidden = true; $('bar').hidden = true;
  $('si-err').textContent = msg || '';
}

$('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await call('POST', '/api/account/login', { name: $('si-name').value.trim(), password: $('si-pass').value });
  if (!r.ok) { $('si-err').textContent = r.data.error || 'Could not sign in.'; return; }
  token = r.data.token;
  try { localStorage.setItem(KEY, JSON.stringify({ token, name: r.data.account?.name, flags: r.data.account?.flags || {} })); } catch (e2) { /* storage unavailable */ }
  refresh();
});

async function refresh() {
  if (!token) return showSignin();
  $('foot').textContent = 'Loading…';
  const r = await call('GET', `/api/admin/stats?days=${days}`);
  if (r.status === 401 || r.status === 403) return showSignin(r.status === 403 ? 'This account is not an admin. Sign in with one that is.' : 'Sign in again.');
  if (!r.ok) { $('foot').textContent = r.data.error || 'Could not load the figures.'; return; }
  $('signin').hidden = true; $('board').hidden = false; $('bar').hidden = false;
  $('who').textContent = `Signed in as ${load()?.name || 'admin'}`;
  render(r.data);
}

function render(d) {
  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map();
  for (let i = d.days - 1; i >= 0; i--) { const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); byDay.set(k, { day: k, active: 0, itch: 0, direct: 0, other: 0, mobile: 0, minutes: 0, fresh: 0 }); }
  for (const x of d.daily) if (byDay.has(x.day)) Object.assign(byDay.get(x.day), x);
  for (const x of d.fresh) if (byDay.has(x.day)) byDay.get(x.day).fresh = x.n;
  const rows = [...byDay.values()];
  const newIn = rows.reduce((t, x) => t + x.fresh, 0);
  const players = d.minutes?.players || 0, minutes = d.minutes?.m || 0;
  const tod = byDay.get(today) || { active: 0 };
  const itchShare = d.totals?.players ? Math.round(100 * (d.totals.itch || 0) / d.totals.players) : 0;
  $('kpis').innerHTML = [
    [n(d.totals?.players), 'players ever'],
    [n(newIn), `new in ${d.days} days`],
    [n(tod.active), 'playing today'],
    [n(players), `played in ${d.days} days`],
    [minutes < 120 ? `${n(minutes)} min` : `${n(minutes / 60)} h`, `played in ${d.days} days`],
    [players ? `${n(minutes / players)} min` : '—', 'each, on average'],
    [n(d.returning), 'came back another day'],
    [`${itchShare}%`, 'came from itch.io'],
  ].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  chart(rows);
  $('daily').querySelector('tbody').innerHTML = rows.slice().reverse().filter((x) => x.active || x.fresh).map((x) => `<tr><td>${x.day}</td><td class="num">${n(x.active)}</td><td class="num">${n(x.fresh)}</td><td class="num">${n(x.itch)}</td><td class="num">${n(x.mobile)}</td><td class="num">${n(x.minutes)}</td></tr>`).join('') || '<tr><td colspan="6" class="fine">No one yet in this period. Counting began on 5 November 2026.</td></tr>';
  $('refs').querySelector('tbody').innerHTML = d.refs.map((x) => `<tr><td>${esc(x.ref)}</td><td>${x.source === 'itch' ? 'itch.io' : x.source === 'direct' ? 'helmline.app' : 'other'}</td><td class="num">${n(x.players)}</td><td class="num">${n(x.minutes)}</td></tr>`).join('') || '<tr><td colspan="4" class="fine">Nothing yet.</td></tr>';
  $('feedback').innerHTML = d.feedback.map((f) => `<li><div class="meta"><span class="pill ${f.kind}">${f.kind}</span><span>#${f.id} · ${dateOf(f.created_at)}</span>${f.contact ? `<span>from ${esc(f.contact)}</span>` : ''}
      <label class="inline">Status <select data-fb="${f.id}">${['new', 'backlog', 'dismissed', 'done'].map((s) => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><span class="ok" id="fb-ok-${f.id}"></span></div>
      <div class="msg">${esc(f.message)}</div>${f.note ? `<div class="fine">Note: ${esc(f.note)}</div>` : ''}</li>`).join('') || '<li class="fine">No feedback yet.</li>';
  $('accounts').querySelector('tbody').innerHTML = d.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${dateOf(a.created_at)}</td><td class="num">${n(a.saves)}</td><td>${dateOf(a.last_save)}</td>
      <td><div class="flags"><input id="flags-${esc(a.name)}" value="${esc(a.flags)}" aria-label="Settings for ${esc(a.name)}"><button data-flags="${esc(a.name)}">Save</button></div><span class="ok" id="ok-${esc(a.name)}"></span></td></tr>`).join('');
  $('foot').textContent = `Figures from ${d.since} to today (UTC). A player is one browser: the same person on a phone and a computer counts twice. Play logs in this period: ${n(d.runs?.runs)} voyages from ${n(d.runs?.devices)} browsers.`;
}

function chart(rows) {
  const W = Math.max(640, rows.length * 22), H = 220, L = 34, B = 26, T = 10;
  const max = Math.max(4, ...rows.map((x) => Math.max(x.active, x.fresh)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - L - 8) / rows.length;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`;
  for (let g = 0; g <= 4; g++) { const v = g * step; s += `<line class="grid" x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; }
  rows.forEach((x, i) => {
    const x0 = L + i * bw + bw * 0.15, w = bw * 0.7;
    let base = 0;
    for (const [k, col] of [['itch', 'var(--itch)'], ['direct', 'var(--direct)'], ['other', 'var(--other)']]) {
      const v = x[k] || 0; if (!v) continue;
      s += `<rect x="${x0}" y="${y(base + v)}" width="${w}" height="${y(base) - y(base + v)}" fill="${col}"><title>${x.day}: ${v} ${k}</title></rect>`;
      base += v;
    }
    if (x.fresh) s += `<circle cx="${x0 + w / 2}" cy="${y(x.fresh)}" r="4" fill="none" stroke="var(--new)" stroke-width="2"><title>${x.day}: ${x.fresh} new</title></circle>`;
    if (i % Math.ceil(rows.length / 10) === 0) s += `<text x="${x0 + w / 2}" y="${H - 8}" text-anchor="middle">${x.day.slice(5)}</text>`;
  });
  $('chart').innerHTML = `${s}</svg>`;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.days) {
    days = +t.dataset.days;
    document.querySelectorAll('[data-days]').forEach((b) => b.setAttribute('aria-checked', String(b === t)));
    refresh();
  } else if (t.id === 'refresh') refresh();
  else if (t.dataset.flags) {
    const name = t.dataset.flags, ok = $(`ok-${name}`);
    let flags;
    try { flags = JSON.parse($(`flags-${name}`).value || '{}'); } catch (err) { ok.textContent = 'Not valid JSON.'; return; }
    const r = await call('POST', '/api/admin/flags', { name, flags });
    ok.textContent = r.ok ? 'Saved.' : (r.data.error || 'Could not save.');
  }
});
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-fb]');
  if (!sel) return;
  const r = await call('POST', '/api/admin/feedback', { id: +sel.dataset.fb, status: sel.value });
  $(`fb-ok-${sel.dataset.fb}`).textContent = r.ok ? 'Saved.' : (r.data.error || 'Could not save.');
});

load();
refresh();

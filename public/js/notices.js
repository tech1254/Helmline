// Notices: pop-ups and the feed under the bell.

import { S, ui } from './state.js';
import { resize } from './view.js';
import { $, fmtDate } from './util.js';
import { renderPanel } from './panels.js';

export let toastTimer;
// Notices: everything that happens is kept in a feed (the bell), and most of it shown briefly
// as a pop-up. Pop-ups stay up long enough to read, pause while hovered, and close on a tap.
// Hints about the controls ("That is dry land") are pop-ups only.
// Three levels, so a busy fleet at 4x does not bury what matters:
//   alert    must see: news, losses, a captain gone ashore (red pop-up)
//   normal   what happened, and outcomes: a captain's round of his route and what it made
//   routine  the working detail: a captain loaded or sold at a port, prices shared. Feed only,
//            hidden unless the feed is set to show everything, and not counted as unread.
export const NOTICES_MAX = 150;
export function addNotice(html, kind = '', day = S.day, level = 'normal') {
  S.notices = S.notices || [];
  S.noticeSeq = (S.noticeSeq || 0) + 1;
  S.notices.push({ id: S.noticeSeq, day, html, kind, ...(level === 'routine' ? { routine: true } : {}) });
  // keep the last 150 that matter; routine reports make room first
  while (S.notices.length > NOTICES_MAX) {
    const i = S.notices.findIndex((n) => n.routine);
    S.notices.splice(i >= 0 && S.notices.filter((n) => n.routine).length > 50 ? i : 0, 1);
  }
  if (ui.panelMode === 'notices') { S.noticesRead = S.noticeSeq; renderPanel(); }
  renderNoticeBadge();
}

export function unreadNotices() {
  return (S?.notices || []).filter((n) => n.id > (S.noticesRead || 0) && !n.routine).length;
}

export function renderNoticeBadge() {
  const n = unreadNotices();
  const b = $('notices-count');
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
  $('btn-notices').title = n ? `Notices: ${n} unread` : 'Notices';
}

export function toast(html, kind = '', feed = true, level = 'normal') {
  if (feed && S) addNotice(html, kind, S.day, level);
  if (level === 'routine') return; // in the feed only
  if (ui.arrival) { ui.arrival.held.push([html, kind]); return; } // shown once the arrival scene ends
  placeToasts();
  const el = $('toast');
  const item = document.createElement('div');
  item.className = `t ${kind}`;
  item.innerHTML = html;
  el.appendChild(item);
  while (el.children.length > 4) el.firstChild.remove();
  // Long enough to read: about 3.5 s plus 60 ms a character, 5 to 14 s.
  const chars = item.textContent.length;
  let left = Math.min(14000, Math.max(5000, 3500 + 60 * chars));
  let started = performance.now(), timer = null;
  const close = () => { item.classList.add('out'); setTimeout(() => item.remove(), 600); };
  const run = () => { started = performance.now(); timer = setTimeout(close, left); };
  item.addEventListener('mouseenter', () => { clearTimeout(timer); left -= performance.now() - started; });
  item.addEventListener('mouseleave', () => { left = Math.max(left, 1500); run(); });
  item.addEventListener('click', () => { clearTimeout(timer); close(); });
  run();
}

// On a phone the pop-ups sit just under the top bar, however many rows it wraps to.
// Pop-ups never cover the side panel, so they cannot swallow a tap meant for its buttons.
// On a wide screen they sit over the middle of the open chart, left of the panel; on a phone
// just under the top bar, with the stack cut off where the panel begins.
export function placeToasts() {
  const el = $('toast');
  const panel = $('panel');
  const open = !panel.hidden ? panel.getBoundingClientRect() : null;
  if (window.innerWidth > 700) {
    el.style.top = ''; el.style.maxHeight = '';
    const room = open ? open.left : window.innerWidth;
    el.style.left = `${Math.round(room / 2)}px`;
    el.style.setProperty('--toast-max', `${Math.max(240, Math.min(560, room - 32))}px`);
    return;
  }
  const top = Math.round($('hud').getBoundingClientRect().bottom + 8);
  el.style.left = '';
  el.style.top = `${top}px`;
  el.style.removeProperty('--toast-max');
  const room = open ? Math.round(open.top - top - 8) : null;
  el.style.maxHeight = room === null ? '' : `${room < 44 ? 0 : room}px`; // no room for a whole pop-up: none
}

// Pop-ups held back during the arrival scene, shown when it ends (already in the feed).
export function releaseToasts(list) {
  for (const [html, kind] of list.slice(-4)) toast(html, kind, false);
}

export function hint(html, kind = '') {
  toast(html, kind, false);
}

export function renderNotices(el) {
  S.noticesRead = S.noticeSeq || 0;
  renderNoticeBadge();
  const all = ui.noticesAll;
  const every = (S.notices || []).slice().reverse();
  const list = all ? every : every.filter((n) => !n.routine);
  const hidden = every.length - list.length;
  let lastDay = null;
  const items = list.map((n) => {
    const d = fmtDate(n.day);
    const head = d !== lastDay ? `<li class="day">${d}</li>` : '';
    lastDay = d;
    return `${head}<li class="n ${n.kind}${n.routine ? ' routine' : ''}">${n.html}</li>`;
  }).join('');
  el.innerHTML = `
    <header><h2>Notices</h2><button class="close" data-close aria-label="Close">×</button></header>
    <p class="notice-filter"><label><input type="checkbox" data-notices-all ${all ? 'checked' : ''}> Show your captains' port reports too</label>${!all && hidden ? ` <span class="muted">(${hidden} hidden)</span>` : ''}</p>
    <ul class="notices">${items || '<li class="muted">Nothing yet. News, arrivals and your captains\' reports will appear here.</li>'}</ul>`;
}

export function initNotices() {
  window.addEventListener('resize', placeToasts);
  placeToasts();
}

// Cloud saves: syncing with the server, conflicts, and the cloud panel.

import * as Cloud from './cloud.js';
import { S, market, setGame, ui } from './state.js';
import { applySaveData, load, payload, save } from './save.js';
import { centerOn } from './view.js';
import { catchUp } from './sim.js';
import { renderDock } from './dock.js';
import { $, fmtDate, timeAgo } from './util.js';
import { renderPanel } from './panels.js';
import { confirmDialog } from './dialog.js';
import { hint, toast } from './notices.js';

// ---- Cloud saves ---------------------------------------------------------------
export let cloudBusy = false;
export let remoteAhead = null; // a newer cloud save found at start-up

export async function cloudSync(force = false) {
  if ((!Cloud.cloud.code && !Cloud.cloud.slot) || cloudBusy || !ui.introDone) return;
  if (Cloud.cloud.status === 'conflict' && !force) return;
  const data = payload();
  if (data === ui.lastPushed && !force) return;
  cloudBusy = true;
  try {
    const r = await Cloud.push(data, S.day, force);
    if (r.ok) ui.lastPushed = data;
    else if (r.conflict) showConflict(r.conflict);
  } catch (e) {
    Cloud.markFailed(e);
  } finally {
    cloudBusy = false;
    renderCloudButton();
    if (ui.panelMode === 'cloud') renderPanel();
  }
}

export function showConflict(remote) {
  confirmDialog({
    title: 'This voyage moved on another device',
    body: `<dl class="facts">
        <dt>Other device</dt><dd>${fmtDate(remote.day || 0)}, saved ${timeAgo(remote.updatedAt)}</dd>
        <dt>This device</dt><dd>${fmtDate(S.day)}</dd>
      </dl>
      <p>Which voyage do you want to keep? The other one will be replaced.</p>
      <p><button data-modal-action="keep-local">Keep this device's voyage</button></p>`,
    ok: "Load the other device's",
    onOk: () => (Cloud.cloud.slot ? loadSlot(Cloud.cloud.slot, true) : loadFromCloud(Cloud.cloud.code, true)),
    actions: { 'keep-local': () => cloudSync(true) },
  });
}

// One of the account's saves, into play on this device.
export async function loadSlot(id, alreadyConfirmed = false) {
  let r;
  try { r = await Cloud.fetchSlot(id); } catch (e) { r = { ok: false, error: 'Could not reach the server.' }; }
  if (!r.ok) { hint(r.error); return; }
  return bringIn(r, () => Cloud.linkSlot(id, r.name, r.version), alreadyConfirmed, r.name);
}

export async function loadFromCloud(code, alreadyConfirmed = false) {
  let r;
  try { r = await Cloud.fetchSave(code); } catch (e) { r = { ok: false, error: 'Could not reach the server.' }; }
  if (!r.ok) { hint(r.status === 404 ? 'No save found for that code. Check it and try again.' : r.error); return; }
  return bringIn(r, () => Cloud.link(code, r.version), alreadyConfirmed, null);
}

function bringIn(r, linkIt, alreadyConfirmed, name) {
  const go = () => {
    const prev = { S, market };
    if (!applySaveData(JSON.parse(r.data))) {
      setGame(prev.S, prev.market);
      hint('That save could not be read.');
      return;
    }
    linkIt();
    ui.lastPushed = null;
    const sum = catchUp();
    if (sum) ui.pendingSummary = sum;
    remoteAhead = null;
    save();
    ui.panelMode = S.ship.docked ? 'port' : null;
    centerOn(S.ship.lon, S.ship.lat);
    renderPanel();
    renderCloudButton();
    toast(`Loaded ${name ? `<b>${name}</b>` : 'your voyage from the cloud'}: <b>${fmtDate(S.day)}</b>.`, 'port');
  };
  if (alreadyConfirmed) { go(); return; }
  const kept = !!Cloud.cloud.slot || !!Cloud.cloud.code;
  confirmDialog({
    title: name ? `Load ${name}?` : 'Load this cloud save?',
    body: `<dl class="facts"><dt>${name ? 'That save' : 'Cloud save'}</dt><dd>${fmtDate(r.day || 0)}, saved ${timeAgo(r.updatedAt)}</dd><dt>This device</dt><dd>${fmtDate(S.day)}${Cloud.cloud.slotName ? ` (${Cloud.cloud.slotName})` : ''}</dd></dl>
      <p>${kept ? 'The voyage on this device is already saved in the cloud, and stays there.' : 'The voyage on this device is not saved anywhere else and will be lost.'} ${name ? 'This device will play and save that one from now on.' : 'The two devices will stay in sync from now on.'}</p>`,
    ok: 'Load it',
    onOk: go,
  });
}

export async function startCloudSave() {
  try {
    const r = await Cloud.create(payload(), S.day);
    if (!r.ok) { hint(r.error || 'Could not start a cloud save.'); return; }
    ui.lastPushed = payload();
    toast(`Cloud save started. Your code is <b>${r.code}</b>.`, 'discover');
  } catch (e) {
    Cloud.markFailed(e);
    hint('Could not reach the server.');
  }
  renderCloudButton();
  renderPanel();
}

// A new voyage, signed in: kept as a new save in the account (the old one stays as it was).
export async function newVoyageSlot() {
  if (!Cloud.account.token) return;
  if (Cloud.cloud.slot) Cloud.unlink();
  const name = `Voyage begun ${new Date().toLocaleDateString()}`;
  try {
    const r = await Cloud.createSlot(name, payload(), S.day);
    if (r.ok) { ui.lastPushed = payload(); toast(`Saving this voyage to your account as <b>${name}</b>.`, 'port'); }
    else hint(r.error || 'Could not save to your account.');
  } catch (e) { Cloud.markFailed(e); }
  renderCloudButton();
}

export async function saveAsNewSlot(name) {
  try {
    const r = await Cloud.createSlot(name || `Voyage, ${fmtDate(S.day)}`, payload(), S.day);
    if (!r.ok) { hint(r.error || 'Could not save to your account.'); return; }
    ui.lastPushed = payload();
    toast(`Saved to your account as <b>${Cloud.cloud.slotName}</b>. This device keeps it in step from now on.`, 'discover');
  } catch (e) { Cloud.markFailed(e); hint('Could not reach the server.'); }
  renderCloudButton();
  renderPanel();
}

// At start-up: is the cloud copy ahead of this device?
export async function checkCloudOnStart() {
  if (Cloud.account.token) { try { await Cloud.refreshAccount(); } catch (e) { /* offline: try later */ } }
  if (!Cloud.cloud.code && !Cloud.cloud.slot) { renderCloudButton(); return; }
  try {
    const r = Cloud.cloud.slot ? await Cloud.fetchSlot(Cloud.cloud.slot) : await Cloud.fetchSave();
    if (!r.ok) { if (r.status === 404) Cloud.markFailed({ message: 'The cloud save no longer exists.' }); renderCloudButton(); return; }
    if (r.version > Cloud.cloud.version) {
      remoteAhead = r;
      if (!ui.introDone) {
        $('intro-cloud').hidden = false;
        $('intro-cloud').textContent = `Continue from the cloud (${fmtDate(r.day || 0)})`;
        $('intro-continue').textContent = 'Continue on this device';
      }
    }
  } catch (e) {
    Cloud.markFailed(e);
  }
  renderCloudButton();
}

export function renderCloudButton() {
  const b = $('btn-cloud');
  const st = Cloud.cloud.status;
  b.classList.toggle('linked', st === 'idle' || st === 'syncing');
  b.classList.toggle('problem', st === 'error' || st === 'conflict');
  b.title = st === 'off' ? (Cloud.account.name ? `Signed in as ${Cloud.account.name}: this voyage is not saved to your account` : 'Saves and account: cloud save off') : st === 'error' ? `Cloud save: ${Cloud.cloud.error}` : st === 'conflict' ? 'Cloud save: played on another device' : `Cloud save: synced ${timeAgo(Cloud.cloud.lastSync)}`;
  if (S) renderDock(); // on a phone the cloud button lives in More, which shows the warning
}

export function renderCloud(el) {
  const c = Cloud.cloud;
  const loadForm = `<form class="code-form" data-cloud-form>
      <label for="cloud-code">Save code from another device</label>
      <div class="code-row"><input id="cloud-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20"><button class="primary" type="submit">Load</button></div>
    </form>`;
  const A = Cloud.account;
  let acct;
  if (!A.token) {
    acct = `<p class="blurb">An account keeps up to ten voyages in the cloud, each its own save, on any device you sign in on.</p>
      <form class="account-form" data-account-form>
        <label>Name <input name="name" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="24" required></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" maxlength="200" required></label>
        <div class="row" style="justify-content:flex-start"><button class="primary" type="submit" data-account-act="login">Sign in</button><button type="submit" data-account-act="register">Create an account</button></div>
      </form>`;
  } else {
    const rows = A.slots.map((x) => `<li class="slot ${x.id === c.slot ? 'current' : ''}">
        <div><b>${x.name || 'A voyage'}</b>${x.id === c.slot ? ' <span class="badge">playing</span>' : ''}<br><small class="muted">${fmtDate(x.day || 0)} · saved ${timeAgo(x.updatedAt)}</small></div>
        <div class="row">${x.id === c.slot ? '' : `<button class="mini" data-slot-load="${x.id}">Load</button>`}<button class="mini" data-slot-rename="${x.id}">Rename</button><button class="mini" data-slot-delete="${x.id}">Delete</button></div>
      </li>`).join('');
    acct = `<p class="blurb">Signed in as <b>${A.name}</b>.${c.slot ? ` This voyage is <b>${c.slotName || 'saved'}</b>, kept in step as you play.` : ' This voyage is not saved to your account yet.'}</p>
      ${rows ? `<ul class="slots">${rows}</ul>` : '<p class="muted">No saves yet.</p>'}
      <div class="row" style="justify-content:flex-start">${A.slots.length < 10 ? `<button class="primary" data-slot-new>${c.slot ? 'Save a copy as a new save' : 'Save this voyage to my account'}</button>` : ''}<button data-account-logout>Sign out</button></div>
      ${A.flags && Object.keys(A.flags).length ? `<p class="foot">Switched on for your account: ${Object.entries(A.flags).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>` : ''}`;
  }
  let body;
  if (c.slot) {
    body = '<p class="muted">Save codes: this voyage is kept in your account instead.</p>';
  } else if (!c.code) {
    body = `<p class="blurb">Keep one voyage in step across your devices. A cloud save gets a code: enter it on your phone or another computer, and both stay in sync.</p>
      <div class="row" style="justify-content:flex-start"><button class="primary" data-cloud-create>Start a cloud save</button></div>
      <h3>Already have a code?</h3>${loadForm}`;
  } else {
    const state = { idle: `Synced ${timeAgo(c.lastSync)}.`, syncing: 'Syncing…', error: `Not synced: ${c.error}`, conflict: 'This voyage was also played on another device.' }[c.status] || '';
    body = `<p class="blurb">This voyage is saved to the cloud. Enter the code on another device to continue there.</p>
      <div class="save-code"><span id="cloud-code-text">${c.code}</span><button data-cloud-copy>Copy</button></div>
      <p class="${c.status === 'error' || c.status === 'conflict' ? 'warn' : 'muted'}">${state}</p>
      <p class="foot">Keep the code private: anyone with it can load or overwrite this voyage. The game syncs about every 30 seconds while you play, and whenever you reach port.</p>
      <div class="row"><button data-cloud-unlink>Stop syncing this device</button><button class="primary" data-cloud-sync>Sync now</button></div>
      <h3>Switch to a different save</h3>${loadForm}`;
  }
  el.innerHTML = `
    <header><h2>Saves</h2><button class="close" data-close aria-label="Close">×</button></header>
    <h3>Your account</h3>
    ${acct}
    <h3>Save codes</h3>
    ${body}`;
}

// Bring a saved game (from this device or the cloud) into play.

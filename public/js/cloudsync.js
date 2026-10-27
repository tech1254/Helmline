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
  if (!Cloud.cloud.code || cloudBusy || !ui.introDone) return;
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
    onOk: () => loadFromCloud(Cloud.cloud.code, true),
    actions: { 'keep-local': () => cloudSync(true) },
  });
}

export async function loadFromCloud(code, alreadyConfirmed = false) {
  let r;
  try { r = await Cloud.fetchSave(code); } catch (e) { r = { ok: false, error: 'Could not reach the server.' }; }
  if (!r.ok) { hint(r.status === 404 ? 'No save found for that code. Check it and try again.' : r.error); return; }
  const go = () => {
    const prev = { S, market };
    if (!applySaveData(JSON.parse(r.data))) {
      setGame(prev.S, prev.market);
      hint('That save could not be read.');
      return;
    }
    Cloud.link(code, r.version);
    ui.lastPushed = null;
    const sum = catchUp();
    if (sum) ui.pendingSummary = sum;
    remoteAhead = null;
    save();
    ui.panelMode = S.ship.docked ? 'port' : null;
    centerOn(S.ship.lon, S.ship.lat);
    renderPanel();
    renderCloudButton();
    toast(`Loaded your voyage from the cloud: <b>${fmtDate(S.day)}</b>.`, 'port');
  };
  if (alreadyConfirmed) { go(); return; }
  confirmDialog({
    title: 'Load this cloud save?',
    body: `<dl class="facts"><dt>Cloud save</dt><dd>${fmtDate(r.day || 0)}, saved ${timeAgo(r.updatedAt)}</dd><dt>This device</dt><dd>${fmtDate(S.day)}</dd></dl>
      <p>The voyage on this device will be replaced, and the two devices will stay in sync from now on.</p>`,
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

// At start-up: is the cloud copy ahead of this device?
export async function checkCloudOnStart() {
  if (!Cloud.cloud.code) return;
  try {
    const r = await Cloud.fetchSave();
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
  b.title = st === 'off' ? 'Cloud save: off' : st === 'error' ? `Cloud save: ${Cloud.cloud.error}` : st === 'conflict' ? 'Cloud save: played on another device' : `Cloud save: synced ${timeAgo(Cloud.cloud.lastSync)}`;
  if (S) renderDock(); // on a phone the cloud button lives in More, which shows the warning
}

export function renderCloud(el) {
  const c = Cloud.cloud;
  const loadForm = `<form class="code-form" data-cloud-form>
      <label for="cloud-code">Save code from another device</label>
      <div class="code-row"><input id="cloud-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20"><button class="primary" type="submit">Load</button></div>
    </form>`;
  let body;
  if (!c.code) {
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
    <header><h2>Cloud save</h2><button class="close" data-close aria-label="Close">×</button></header>
    ${body}`;
}

// Bring a saved game (from this device or the cloud) into play.

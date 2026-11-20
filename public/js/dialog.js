// The confirmation dialog.

import { ui } from './state.js';
import { save } from './save.js';
import { $ } from './util.js';
import { renderPanel } from './panels.js';

// ---- Confirmation dialog ----------------------------------------------------
// A dialog that must be answered (a corsair attack, a fight, the crown's fight) is never replaced
// by another one: the chart, the panel and the ambitions box stay live behind a dialog, and a
// click there used to open a new dialog over the fight and lose it, leaving the ship stuck at sea
// with the fight half-done. Returns false when the dialog could not open.
export const mustAnswer = (m = ui.modal) => !!m && (m.locked || m.kind === 'encounter' || m.kind === 'fight');
export function confirmDialog({ title, body, ok = 'Confirm', onOk, onCancel = null, kind = 'trade', preview = null, actions = {}, cancel = true }) {
  if (mustAnswer()) return false;
  $('modal-cancel').textContent = typeof cancel === 'string' ? cancel : 'Cancel';
  // With neither OK nor Cancel (a corsair attack), a choice in the body must be made.
  ui.modal = { onOk, onCancel, kind, preview, actions, locked: !cancel && ok === null };
  $('modal-ok').hidden = ok === null;
  $('modal-cancel').hidden = !cancel;
  $('modal').classList.toggle('aside', kind === 'voyage');
  $('modal').dataset.kind = kind;
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  if (ok !== null) $('modal-ok').textContent = ok;
  $('modal').hidden = false;
  (ok !== null ? $('modal-ok') : $('modal-body').querySelector('button.primary'))?.focus();
  return true;
}
export function closeModal(accept, viaAction = false) {
  if (!ui.modal) return;
  if (ui.modal.locked && !viaAction) return; // a choice must be made
  const m = ui.modal;
  ui.modal = null;
  $('modal').hidden = true;
  if (accept) m.onOk();
  else if (!viaAction) m.onCancel?.();
  renderPanel();
  save();
}

export function initDialog() {
  $('modal-ok').addEventListener('click', () => closeModal(true));
  $('modal-cancel').addEventListener('click', () => closeModal(false));
  $('modal-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modal-action]');
    if (!b || !ui.modal) return;
    const fn = ui.modal.actions?.[b.dataset.modalAction];
    closeModal(false, true);
    fn?.();
  });
}

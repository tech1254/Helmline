// The confirmation dialog.

import { ui } from './state.js';
import { save } from './save.js';
import { $ } from './util.js';
import { renderPanel } from './panels.js';

// ---- Confirmation dialog ----------------------------------------------------
export function confirmDialog({ title, body, ok = 'Confirm', onOk, kind = 'trade', preview = null, actions = {}, cancel = true }) {
  $('modal-cancel').textContent = typeof cancel === 'string' ? cancel : 'Cancel';
  // With neither OK nor Cancel (a corsair attack), a choice in the body must be made.
  ui.modal = { onOk, kind, preview, actions, locked: !cancel && ok === null };
  $('modal-ok').hidden = ok === null;
  $('modal-cancel').hidden = !cancel;
  $('modal').classList.toggle('aside', kind === 'voyage');
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  if (ok !== null) $('modal-ok').textContent = ok;
  $('modal').hidden = false;
  (ok !== null ? $('modal-ok') : $('modal-body').querySelector('button.primary'))?.focus();
}
export function closeModal(accept, viaAction = false) {
  if (!ui.modal) return;
  if (ui.modal.locked && !viaAction) return; // a choice must be made
  const m = ui.modal;
  ui.modal = null;
  $('modal').hidden = true;
  if (accept) m.onOk();
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

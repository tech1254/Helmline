// The House panel in Lisbon: what you own, your title and renown, and what you might have next.

import { S } from './state.js';
import * as House from './house.js';
import { confirmDialog } from './dialog.js';
import { toast } from './notices.js';
import { log } from './pricebook.js';
import { renderPanel } from './panels.js';
import { save } from './save.js';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function openHouse() {
  const H = House.ensureHouse(S);
  const t = House.title(S);
  const rows = House.THINGS.map((x) => {
    const have = H.owned[x.id] || 0;
    const c = House.canHave(S, x.id);
    const facts = [`${x.cost.toLocaleString()} cz`, `renown +${x.renown}`, x.upkeep ? `${x.upkeep} cz a day to keep` : '', x.title ? `title: ${House.TITLES.find((y) => y.id === x.title).name}` : ''].filter(Boolean).join(' · ');
    const status = have && !x.loan
      ? '<span class="owned">Yours</span>'
      : `<button data-modal-action="buy-${x.id}" ${c.ok ? '' : 'disabled'} title="${esc(c.why || '')}">${x.loan ? 'Lend' : 'Buy'}</button>${c.ok ? '' : `<small>${esc(c.why)}</small>`}`;
    return `<li class="house-item${have && !x.loan ? ' owned' : ''}"><div><b>${x.name}</b>${x.loan && have ? ` <small>(${have} so far)</small>` : ''}<small>${facts}</small></div><div class="house-act">${status}</div></li>`;
  }).join('');
  const owed = H.loans.filter((l) => l.owed > 0).reduce((n, l) => n + l.owed, 0);
  confirmDialog({
    title: 'Your house',
    body: `<dl class="facts">
        <dt>Title</dt><dd>${t.name}</dd>
        <dt>Renown</dt><dd>${H.renown}</dd>
        <dt>Upkeep</dt><dd>${House.upkeep(S) ? `${House.upkeep(S)} cz a day` : 'none'}</dd>
        ${owed ? `<dt>The crown owes you</dt><dd>${Math.round(owed).toLocaleString()} cz</dd>` : ''}
      </dl>
      <p class="fine">What a fortune is for: honour for your name and your heirs. None of this earns its price back.</p>
      <ul class="house-list">${rows}</ul>`,
    ok: 'Close',
    cancel: false,
    kind: 'summary',
    onOk: () => {},
    actions: Object.fromEntries(House.THINGS.map((x) => [`buy-${x.id}`, () => confirmBuy(x.id)])),
  });
}

function confirmBuy(id) {
  const x = House.thing(id);
  confirmDialog({
    title: `${x.name}?`,
    body: `<p>${x.text}</p>
      <dl class="facts">
        <dt>${x.loan ? 'Lent' : 'Cost'}</dt><dd>${x.cost.toLocaleString()} cz</dd>
        <dt>Renown</dt><dd>+${x.renown}</dd>
        ${x.upkeep ? `<dt>Upkeep</dt><dd>${x.upkeep} cz a day, for as long as you keep it</dd>` : ''}
        ${x.loan ? `<dt>Repaid</dt><dd>over ${House.LOAN_YEARS} years with ${Math.round(House.LOAN_INTEREST * 100)}% interest, if the crown pays: in about one year in ${Math.round(1 / House.LOAN_DEFAULT)} it does not</dd>` : ''}
        ${x.title ? `<dt>Title</dt><dd>${House.TITLES.find((y) => y.id === x.title).name}</dd>` : ''}
        <dt>Purse after</dt><dd>${Math.floor(S.purse - x.cost).toLocaleString()} cz</dd>
      </dl>`,
    ok: `${x.loan ? 'Lend' : 'Pay'} ${x.cost.toLocaleString()} cz`,
    onOk: () => {
      const m = House.acquire(S, id);
      if (m) { toast(m.html, m.kind); log(m.log); }
      renderPanel();
      save();
      openHouse();
    },
  });
}

// Money and patrons, in the market panel at Lisbon and Lagos: the sea loan (lending.js), the
// pilots' directions and the commission for discovery (pilots.js).

import { PORTS } from './world.js';
import * as Lending from './lending.js';
import * as Pilots from './pilots.js';
import { S } from './state.js';
import { fmtDate } from './util.js';
import { confirmDialog } from './dialog.js';
import { report } from './sim.js';
import { plog } from './playlog.js';

const cz = (n) => `${Math.round(n).toLocaleString()} cz`;

function loanLine() {
  const loan = S.lending?.loan;
  if (!loan) return '';
  const L = Lending.LENDERS[loan.port];
  const w = Lending.water(loan.waters);
  const owed = Lending.owedOf(loan);
  const here = !!Lending.lenderAt(S.ship.docked);
  return `<p><b>Sea loan:</b> you owe ${L.name} <b>${cz(owed)}</b>${loan.late ? ' <span class="warn">(past its day)</span>' : `, due ${fmtDate(loan.due)}`}. ${loan.cover ? `The sea has taken ${cz(loan.cover)} off it so far. ` : ''}<span class="fine">Losses to corsairs or sea water in ${w.name.toLowerCase()} come off the debt.</span></p>
    ${here ? `<div class="row"><button data-loan-repay ${S.purse < 1 ? 'disabled' : ''}>${S.purse >= owed ? `Repay ${cz(owed)}` : `Repay ${cz(Math.floor(S.purse))} of it`}</button></div>` : ''}`;
}

export function moneyBox() {
  const pid = S.ship.docked;
  if (!pid) return '';
  const bits = [];
  const o = Lending.offer(S, pid);
  if (S.lending?.loan) bits.push(loanLine());
  else if (o?.no) bits.push(`<p class="muted">${o.no}</p>`);
  else if (o) bits.push(`<p><b>A sea loan</b> from ${o.lender.name}: up to <b>${cz(o.max)}</b> against your ship and cargo, for a premium fixed now (from ${Math.round(o.terms[0].premium * 100)}%). If corsairs or the sea take your goods, the lender bears the loss.</p><div class="row"><button data-loan-ask>Borrow…</button></div>`);
  const dirs = Pilots.directionsFor(S, pid);
  if (dirs.length) bits.push(`<p><b>The pilots of Lagos</b> sell their courses for the coast already found: the place is marked on your chart, and you chart it yourself when you get there.</p><div class="row">${dirs.map((d) => `<button data-directions="${d.port}" ${S.purse < d.price ? 'disabled' : ''}>${d.name}, ${d.price} cz</button>`).join('')}</div>`);
  const c = Pilots.commissionOffer(S);
  if (c) bits.push(`<p><b>${c.name}:</b> ${cz(c.advance)} now toward the wages of a voyage of discovery, and ${cz(c.reward)} more when you come home having charted a new port south of Cape Bojador, within ${c.days} days. Nothing is owed if you find nothing.</p><div class="row"><button data-commission>Take the commission (+${cz(c.advance)})</button></div>`);
  const a = S.commission?.active;
  if (a) bits.push(`<p class="fine">Your commission for discovery: ${a.found ? `fulfilled by ${PORTS.find((p) => p.id === a.found).name}; ${cz(a.reward)} to collect at Lagos or Lisbon` : `chart a new port south of Cape Bojador by ${fmtDate(a.due)}`}.</p>`);
  if (!bits.length) return '';
  return `<details class="money-box" ${S.lending?.loan?.late || ui0() ? 'open' : ''}><summary>Money and patrons</summary>${bits.join('')}</details>`;
}
const ui0 = () => S.purse < 150; // short of money: open it

export function askLoan() {
  const o = Lending.offer(S, S.ship.docked);
  if (!o || o.no) return;
  const amounts = [];
  for (let a = 50; a <= o.max; a += a < 300 ? 50 : 100) amounts.push(a);
  if (amounts[amounts.length - 1] !== o.max) amounts.push(o.max);
  const pre = amounts.find((a) => a >= Math.min(o.max, 200)) || o.max;
  confirmDialog({
    title: `A sea loan from ${o.lender.name}`,
    body: `<p>${o.lender.who} will advance money against your ship and her cargo for a voyage. You owe the sum and a premium fixed now, by the day agreed: nothing runs by the day. Whatever corsairs or sea water take from you in the waters named comes off the debt. Miss the day and it grows by a tenth, and your name suffers.</p>
      <label class="field">Amount <select id="loan-sum">${amounts.map((a) => `<option value="${a}" ${a === pre ? 'selected' : ''}>${a.toLocaleString()} cz</option>`).join('')}</select></label>
      <fieldset class="loan-waters"><legend>For a voyage in</legend>${o.terms.map((t, i) => `<label class="opt"><input type="radio" name="loan-water" value="${t.id}" ${i === 0 ? 'checked' : ''}> <b>${t.name}</b> (${t.where}): premium ${Math.round(t.premium * 100)}%, repay within ${Math.round(t.days / 30)} months</label>`).join('')}</fieldset>
      <p class="fine" id="loan-total"></p>`,
    ok: 'Borrow',
    kind: 'loan',
    onOk: () => {
      const sum = +document.getElementById('loan-sum').value;
      const w = document.querySelector('input[name="loan-water"]:checked')?.value || 'home';
      const loan = Lending.borrow(S, S.ship.docked, sum, w);
      if (loan) {
        plog('loan', { sum: loan.sum, premium: loan.premium, waters: loan.waters, due: loan.due });
        report([{ html: `${Lending.LENDERS[loan.port].who} advances you <b>${cz(loan.sum)}</b>. You owe ${cz(Lending.owedOf(loan))} by ${fmtDate(loan.due)}.`, kind: 'port', log: `Sea loan: ${loan.sum} cz.` }]);
      }
    },
  });
  const total = () => {
    const sum = +document.getElementById('loan-sum').value;
    const t = o.terms.find((x) => x.id === (document.querySelector('input[name="loan-water"]:checked')?.value || 'home'));
    document.getElementById('loan-total').textContent = `You would owe ${cz(Math.round(sum * (1 + t.premium)))} by ${fmtDate(S.day + t.days)}.`;
  };
  document.getElementById('modal-body').addEventListener('change', total);
  total();
}

export function repayLoan() {
  const paid = Lending.repay(S);
  if (paid) {
    plog('repay', { paid });
    report([{ html: S.lending.loan ? `Paid ${cz(paid)} toward your sea loan; ${cz(Lending.owedOf(S.lending.loan))} still owed.` : `Paid off your sea loan (${cz(paid)}).`, kind: 'port', log: `Repaid ${paid} cz of a sea loan.` }]);
  }
}

export function buyDirections(port) {
  const d = Pilots.buyDirections(S, port);
  if (d) report([{ html: `The pilots give you their course for <b>${d.name}</b>: it is marked on your chart. Sail there to chart it.`, kind: 'port', log: `Bought directions for ${d.name}.` }]);
}

export function takeCommission() {
  const a = Pilots.takeCommission(S);
  if (a) report([{ html: `You take the commission: <b>${cz(a.advance)}</b> now. Chart a new port south of Cape Bojador by ${fmtDate(a.due)} for ${cz(a.reward)} more.`, kind: 'port', log: 'Took a commission for discovery.' }]);
}

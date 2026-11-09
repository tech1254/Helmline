// The law and the war on screen (law.js, war.js): fights with the crown's hunters and the enemy's
// warships, the prize court and the havens, pardons and the Guinea licence, the letter of marque
// when a war begins, a pirate crew's mutiny, and what is said of you in port.

import * as Law from './law.js';
import * as War from './war.js';
import * as Race from './race.js';
import { report } from './sim.js';
import * as Fight from './fight.js';
import * as Pirates from './pirates.js';
import * as Houses from './houses.js';
import * as Accounts from './accounts.js';
import { PORTS } from './world.js';
import { GOODS } from './economy.js';
import { S, ui } from './state.js';
import { confirmDialog } from './dialog.js';
import { openFight } from './fightview.js';
import { renderPanel, setSpeed } from './panels.js';
import { afterEncounter } from './voyage.js';
import { toast, addNotice } from './notices.js';
import { log } from './pricebook.js';
import { plog } from './playlog.js';
import { save } from './save.js';
import { home } from './nations.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const portName = (id) => PORTS.find((p) => p.id === id)?.name || id;

// ---- At sea: the crown's hunters, the enemy's warships ------------------------------------------
export function openDefence(enc) {
  const C = Law.CROWNS[enc.crown];
  if (enc.kind === 'reprisal') { openReprisal(enc); return; }
  if (enc.kind === 'search') { openSearch(enc); return; }
  if (enc.kind === 'frenchcorsair') { openFrench(enc); return; }
  const hunter = enc.kind === 'hunter';
  const foe = Fight.foeSide(hunter ? 'hunter' : 'warship', enc.armed || 0, hunter ? `${C.adj} armed caravel` : `${C.adj} warship`);
  const F = Fight.start(S, 'defend', foe, { range: Fight.FAR });
  openFight(F, {
    title: hunter ? `The ${C.adj} crown's hunters` : `An enemy warship`,
    intro: hunter
      ? `<p>An armed caravel flying the arms of ${C.name} bears down on you. Her captain carries a warrant: your piracy against ${C.adj} ships has caught up with you. If she takes you, your prizes are forfeit and you pay a heavy fine.</p>`
      : `<p>A ${C.adj} warship, her decks full of soldiers, has sighted you. She means to take you as a prize of war.</p>`,
    onDone: (done) => settleDefence(enc, done),
  });
}

// A French corsair, in the Atlantic approaches from 1521: no tribute, no quarter for the cargo.
function openFrench(enc) {
  const F = Fight.start(S, 'defend', Fight.foeSide('merchantman', enc.armed || 0, 'French corsair'), { range: Fight.FAR });
  openFight(F, {
    title: 'A French corsair!',
    intro: `<p>A tall ship with no flag but a French cut to her sails is bearing down on you off ${enc.where}, her gun ports open. The corsairs of Dieppe and La Rochelle are out for any Iberian cargo, and they do not take tribute.</p>`,
    onDone: (done) => {
      const res = done.done.result, dmg = Fight.damageTo(done);
      let lines, kind = '';
      if (res === 'struck' || res === 'boarded') {
        lines = Pirates.strip(S, { where: 'the French corsair' }, 0.35, dmg + 8).lines.map((l) => l.replace('The corsairs strip', 'The French strip'));
      } else {
        S.hull = Math.max(10, (S.hull ?? 100) - dmg);
        if (res === 'beaten' || res === 'sheered') {
          kind = 'discover';
          S.purse += Law.FRENCH_BOUNTY;
          Accounts.record(S, { kind: 'bounty', amount: Law.FRENCH_BOUNTY, port: null, text: 'The crown\'s reward for driving off a French corsair' });
          if (S.pirates) { S.pirates.notoriety += 1; S.pirates.won++; }
          lines = [`You drive off the French corsair. The crown pays ${Law.FRENCH_BOUNTY} cz for it when you next make port.`];
        } else lines = ['You are clear of the French corsair.'];
        if (dmg >= 3) lines.push(`Your hull is damaged (${Math.round(S.hull)}%).`);
      }
      plog('defence', { kind: 'frenchcorsair', result: res });
      for (const l of lines) addNotice(l, kind); log(lines[0]);
      afterEncounter({ kind, lines, title: kind ? 'Beaten off' : res === 'struck' || res === 'boarded' ? 'Taken' : 'Clear of them' }); renderPanel(); save();
    },
  });
}

// Neutral, carrying for the French: a League galley stops you to search the hold.
function openSearch(enc) {
  const g = GOODS.find((x) => x.id === enc.good);
  const n = S.cargo[enc.good] || 0;
  setSpeed(0);
  confirmDialog({
    title: 'Stopped by a League galley',
    body: `<p>A Spanish galley of the Holy League runs up alongside and hails you: neutral or not, any cargo bound for the French is contraband, and they mean to search your hold.</p>
      <p>Your ${n} ${g.unit} of ${g.name.toLowerCase()} for the French king's victuallers would be seized.</p>
      <p class="fine">Submit, and you lose that cargo but go on in peace. Run for it, and you fight the galley; whatever comes of it, Castile will not forget.</p>
      <div class="row choice"><button data-modal-action="run">Run for it</button><button class="primary" data-modal-action="submit">Submit to the search</button></div>`,
    ok: null, cancel: false, kind: 'encounter',
    actions: {
      submit: () => {
        const lost = S.cargo[enc.good] || 0;
        S.paid[enc.good] = 0; S.cargo[enc.good] = 0;
        const line = `The League's men take your ${lost} ${g.unit} of ${g.name.toLowerCase()} as contraband, and let you go.`;
        addNotice(line, 'alert'); log(line); plog('search', { result: 'submit', good: enc.good, qty: lost });
        afterEncounter({ kind: '', lines: [line], title: 'Searched' }); renderPanel(); save();
      },
      run: () => {
        Law.ensureLaw(S).infamy.castile = Law.infamy(S, 'castile') + 3;
        const F = Fight.start(S, 'defend', Fight.foeSide('galley', 1, 'League galley'), { range: Fight.CLOSE });
        F.foe.tribute = false;
        openFight(F, { title: 'Running from the League galley', onDone: (done) => {
          const res = done.done.result, dmg = Fight.damageTo(done);
          let lines;
          if (res === 'struck' || res === 'boarded') {
            const lost = S.cargo[enc.good] || 0; S.cargo[enc.good] = 0; S.paid[enc.good] = 0;
            S.hull = Math.max(10, (S.hull ?? 100) - dmg - 8);
            lines = [`The galley takes you. Your ${lost} ${g.unit} of ${g.name.toLowerCase()} are seized, and your hull is battered (${Math.round(S.hull)}%).`];
          } else {
            S.hull = Math.max(10, (S.hull ?? 100) - dmg);
            lines = ['You are clear of the League galley, cargo and all. Castile will remember it.'];
          }
          for (const l of lines) addNotice(l, ''); log(lines[0]); plog('search', { result: res });
          afterEncounter({ kind: '', lines, title: res === 'struck' || res === 'boarded' ? 'Taken' : 'Clear of them' }); renderPanel(); save();
        } });
      },
    },
  });
}

// A rival house you have raided sends an armed merchantman after you.
function openReprisal(enc) {
  const d = Houses.defOf(enc.house);
  const F = Fight.start(S, 'defend', Fight.foeSide('merchantman', enc.armed, `${d.name} merchantman`), { range: Fight.FAR });
  openFight(F, {
    title: `The ${d.name} want their own back`,
    intro: `<p>An armed merchantman in the colours of the house of ${d.name}, soldiers on her decks, bears down on you: the ${d.name} have not forgotten your raids on their ships.</p>`,
    onDone: (done) => {
      const res = done.done.result, dmg = Fight.damageTo(done);
      let lines;
      if (res === 'struck' || res === 'boarded') {
        lines = Pirates.strip(S, { where: `the ${d.name} ship` }, 0.3, dmg + 8).lines.map((l) => l.replace('The corsairs strip', `The ${d.name}'s men strip`));
      } else {
        S.hull = Math.max(10, (S.hull ?? 100) - dmg);
        if (res === 'beaten' || res === 'sheered') { const h = Houses.ensureHouses(S).h[enc.house]; if (h) h.wealth -= 800; }
        lines = [res === 'beaten' || res === 'sheered' ? `You beat off the ${d.name} ship. That will cost them.` : `You are clear of the ${d.name} ship.`];
        if (dmg >= 3) lines.push(`Your hull is damaged (${Math.round(S.hull)}%).`);
      }
      plog('defence', { kind: 'reprisal', house: enc.house, result: res });
      for (const l of lines) addNotice(l, '');
      log(lines[0]);
      afterEncounter({ kind: '', lines, title: res === 'struck' || res === 'boarded' ? 'Taken' : 'Clear of them' });
      renderPanel(); save();
    },
  });
}

function settleDefence(enc, F) {
  const C = Law.CROWNS[enc.crown];
  const hunter = enc.kind === 'hunter';
  const res = F.done.result;
  const dmg = Fight.damageTo(F);
  const lines = [];
  let kind = '';
  plog('defence', { kind: enc.kind, crown: enc.crown, result: res });
  if (res === 'struck' || res === 'boarded') {
    if (hunter) {
      const a = Law.arrested(S, enc.crown);
      S.hull = Math.max(10, (S.hull ?? 100) - dmg);
      if (a.fine) Accounts.record(S, { kind: 'fines', amount: -a.fine, port: null, text: `Fined by the ${C.adj} crown` });
      lines.push(`You are taken before the ${C.adj} court and fined <b>${fmt(a.fine)} cz</b>${a.lost ? `; your ${a.lost === 1 ? 'prize is' : 'prizes are'} forfeit` : ''}. The fine settles half the charge against you.`);
    } else {
      const r = Pirates.strip(S, { where: `the ${C.adj} warship` }, 0.3, dmg + 10);
      lines.push(...r.lines.map((l) => l.replace('The corsairs strip', 'The enemy strip')));
    }
  } else if (res === 'beaten' || res === 'sheered') {
    S.hull = Math.max(10, (S.hull ?? 100) - dmg);
    kind = 'discover';
    if (hunter) {
      Law.ensureLaw(S).infamy[enc.crown] = Law.infamy(S, enc.crown) + 2;
      lines.push(`You beat off the ${C.adj} hunters. They will come again, and fighting the crown's ships does your name no good there.`);
    } else {
      War.serve(S);
      if (S.contracts) S.contracts.standing = (S.contracts.standing || 0) + 2;
      const chest = 80 + Math.round(Math.random() * 160);
      S.purse += chest;
      Accounts.record(S, { kind: 'plunder', amount: chest, port: null, text: `The ${C.adj} warship's pay chest` });
      lines.push(`You beat off the ${C.adj} warship and take her pay chest (${chest} cz) as she strikes. Your crown counts it as service in the war.`);
    }
  } else {
    S.hull = Math.max(10, (S.hull ?? 100) - dmg);
    lines.push(res === 'paid' ? 'They will not be paid off.' : `You are clear of the ${C.adj} ${hunter ? 'hunters' : 'warship'}.`);
  }
  if (dmg >= 3 && !lines.some((l) => /hull/i.test(l))) lines.push(`Your hull is damaged (${Math.round(S.hull)}%).`);
  for (const l of lines) addNotice(l, kind);
  log(lines[0].replace(/<[^>]+>/g, ''));
  afterEncounter({ kind, lines, title: kind ? 'Beaten off' : res === 'struck' || res === 'boarded' ? 'Taken' : 'Clear of them' });
  renderPanel();
  save();
}

// ---- Each frame, when nothing else is showing: the marque, a mutiny ------------------------------
export function lawTick(free) {
  if (!free) return;
  const W = War.ensureWar(S);
  if (W.offer && War.yourWars(S).some((w) => w.id === W.offer)) { openMarque(); return; }
  if (ui.mutiny) { ui.mutiny = false; openMutiny(); }
}

function openMarque() {
  const w = War.WARS.find((x) => x.id === War.ensureWar(S).offer);
  const e = Law.CROWNS[War.enemyIn(S, w)];
  setSpeed(0);
  confirmDialog({
    title: `War with ${e.name}`,
    body: `<p>${w.start[S.nation || 'portugal']}</p>
      <p>The crown offers you a <b>letter of marque</b>: ${e.adj} ships become lawful prize, to be sold openly at any of your crown's ports (the crown takes its fifth). Every fight won and prize taken counts as service, rewarded at the peace.</p>
      <p class="fine">Without one, taking a ${e.adj} ship is still piracy. ${e.adj} warships will cruise the Guinea coast, the Canaries and the Algarve either way, and ${e.name}'s ports are shut to you until the peace.</p>`,
    ok: 'Take the letter of marque',
    cancel: 'Decline: you are a merchant',
    kind: 'war',
    onOk: () => { War.takeMarque(S, true); log(`Took a letter of marque against ${e.adj} shipping.`); toast(`You carry a letter of marque against <b>${e.adj}</b> shipping.`, 'discover'); },
    onCancel: () => { War.takeMarque(S, false); },
  });
}

function openMutiny() {
  const d = Law.mutinyDemand(S);
  setSpeed(0);
  confirmDialog({
    title: 'Mutiny!',
    body: `<p>Your crew sail on shares, and for ${Math.round(Law.ensureLaw(S).dry)} days at sea there has been no prize. The boatswain speaks for them: they want <b>${fmt(d)} cz</b> now, or they will go ashore at the next port.</p>
      <p class="fine">Pay them, or refuse and lose half your crew when you next make port (days in port to sign on more). A prize, or a run ashore at a haven, keeps them content.</p>
      <div class="row choice"><button data-modal-action="refuse">Refuse</button><button class="primary" data-modal-action="pay">Pay ${fmt(Math.min(d, Math.max(0, S.purse)))} cz</button></div>`,
    ok: null,
    cancel: false,
    kind: 'encounter',
    actions: {
      pay: () => { const p = Law.payMutineers(S); Accounts.record(S, { kind: 'wages', amount: -p, port: null, text: 'Paid off mutineers' }); log(`Paid the crew ${p} cz to end a mutiny.`); save(); },
      refuse: () => { Law.refuseMutineers(S); log('Refused the mutineers.'); toast('You refuse them. Half the crew will go ashore at the next port.', 'alert'); save(); },
    },
  });
}

// ---- In port --------------------------------------------------------------------------------
// What happens on making port: crew ashore at a haven, mutineers walking off, a closed port, word
// of the cove, and prizes to sell.
export function onDock(pid) {
  const won = Race.charted(S, pid); // first here? (race.js; charting by sight is in fog.js)
  for (const m of won) if (m.prize) Accounts.record(S, { kind: 'discovery', amount: m.prize, port: pid, text: `The crown's prize for charting ${portName(pid)}` });
  report(won);
  report(Race.hear(S, pid)); // the pilots' talk of coasts not yet charted (race.js)
  const L = Law.ensureLaw(S);
  Law.ashore(S, pid);
  if (L.walkOff) {
    L.walkOff = false;
    S.ship.recruitUntil = S.day + 8;
    toast('Half your crew go ashore with their grievances. Signing on more will take <b>8 days</b>.', 'alert', true, 'alert');
  }
  const shut = Law.closedTo(S, pid);
  if (shut) toast(`<b>${portName(pid)} is shut to you:</b> ${shut.text}`, 'alert', true, 'alert');
  if (Law.isHaven(pid) && pid !== Law.COVE && !S.discovered[Law.COVE] && (L.pirated > 0 || L.taken > 0 || S.calling?.id === 'privateer')) {
    S.discovered[Law.COVE] = true;
    toast('<b>Word in the haven:</b> a corsair tells you of a narrow bay on the empty east coast of Fuerteventura, behind a reef, that no chart shows. <b>A hidden cove</b> is on your chart: a haven of your own, if you build there.', 'discover', true);
    log('Heard of a hidden cove on Fuerteventura.');
  }
  const offers = Law.prizeOffers(S, pid);
  if (offers.length) toast(`Your ${offers.length === 1 ? 'prize' : 'prizes'} can be sold here: see the market.`, 'port');
}

// The box in the market: prizes to sell, pardons, the licence.
export function lawBox(pid) {
  const parts = [];
  const offers = Law.prizeOffers(S, pid);
  if (offers.length) {
    parts.push(`<p class="harbour"><b>${offers[0].court ? 'The prize court' : 'The fences'}</b> will take ${offers.map((o) => `${o.prize.name} for ${fmt(o.price)} cz${o.cut ? ` (the crown keeps its fifth, ${fmt(o.cut)} cz)` : ''}`).join('; ')}.</p><div class="row invest">${offers.map((o) => `<button data-prize-sell="${o.prize.id}">Sell ${o.prize.name}: ${fmt(o.price)} cz</button>`).join('')}</div>`);
  } else if (Law.ensureLaw(S).prizes.length) {
    const p = Law.ensureLaw(S).prizes;
    parts.push(`<p class="fine">Your prize crews wait with ${p.map((x) => x.name).join(' and ')}: ${p.some((x) => x.lawful) ? 'sell lawful prizes at any port of your crown' : ''}${p.some((x) => !x.lawful) ? `${p.some((x) => x.lawful) ? '; ' : ''}pirate prizes only at a haven` : ''}.</p>`);
  }
  for (const pd of Law.pardonsHere(S, pid)) {
    parts.push(`<p class="harbour"><b>The ${Law.CROWNS[pd.crown].adj} court</b> will sell you the king's pardon for your piracy (infamy ${Math.round(Law.infamy(S, pd.crown))})${War.service(S) && pd.crown === (S.nation || 'portugal') ? ', for less after your service in the war' : ''}.</p><div class="row invest"><button data-pardon="${pd.crown}" ${S.purse < pd.price ? 'disabled' : ''}>Buy the pardon: ${fmt(pd.price)} cz</button></div>`);
  }
  if (pid === home(S) && Law.canBuyLicence(S)) {
    const ok = (S.contracts?.standing ?? 0) >= Law.LICENCE_STANDING;
    parts.push(`<p class="fine">The crown licenses captains to take foreign interlopers on the Guinea coast, south of Cape Bojador${ok ? '' : ` (standing ${Law.LICENCE_STANDING} needed)`}.</p><div class="row invest"><button data-licence ${ok && S.purse >= Law.LICENCE_PRICE ? '' : 'disabled'}>Buy a Guinea licence: ${fmt(Law.LICENCE_PRICE)} cz</button></div>`);
  }
  return parts.join('');
}

export function lawClick(t) {
  const pid = S.ship.docked;
  if (!pid) return false;
  if (t.dataset.prizeSell) {
    const o = Law.sellPrize(S, pid, +t.dataset.prizeSell);
    if (o) {
      Accounts.record(S, { kind: 'prizes', amount: o.price, port: pid, text: `${o.court ? 'Prize court' : 'Fenced'}: ${o.prize.name}` });
      toast(`${o.court ? 'The prize court condemns' : 'The fences buy'} <b>${o.prize.name}</b>: <b>${fmt(o.price)} cz</b>${o.cut ? ` after the crown's fifth` : ''}.`, 'discover');
      log(`Sold ${o.prize.name} for ${o.price} cz.`);
      save();
    }
    return true;
  }
  if (t.dataset.pardon) {
    const c = t.dataset.pardon, price = Law.pardonPrice(S, c);
    confirmDialog({
      title: 'The king\'s pardon',
      body: `<p>For <b>${fmt(price)} cz</b> the ${Law.CROWNS[c].adj} crown forgives your piracy against its ships. Its ports open to you again and its hunters are called off.</p>`,
      ok: `Pay ${fmt(price)} cz`,
      kind: 'pardon',
      onOk: () => {
        const p = Law.buyPardon(S, c);
        if (p == null) return;
        Accounts.record(S, { kind: 'fines', amount: -p, port: pid, text: `The ${Law.CROWNS[c].adj} king's pardon` });
        toast(`You are pardoned by the crown of <b>${Law.CROWNS[c].name}</b>.`, 'discover');
        log(`Bought the ${Law.CROWNS[c].adj} pardon (${p} cz).`);
        save();
      },
    });
    return true;
  }
  if (t.dataset.licence !== undefined) {
    if (Law.buyLicence(S)) {
      Accounts.record(S, { kind: 'fines', amount: -Law.LICENCE_PRICE, port: pid, text: 'The crown\'s licence for Guinea' });
      toast('You hold the crown\'s licence: foreign interlopers on the Guinea coast are lawful prize.', 'discover');
      save();
    }
    return true;
  }
  return false;
}

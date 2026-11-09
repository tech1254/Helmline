# The first screen (Nov 2026, from the player data: most who left, left at the prologue). A new
# game opens on the chart with the prologue over it; the market, with the first-voyage guide and
# no debt box yet, opens when it is read. Selling: −10 beside −1 and All for a big cargo. The
# notes for the newer systems (rumours, rival ships, war, infamy) show when they first matter.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 390, 'height': 760})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true; window.helmlineStory = true; window.helmlineFirst = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro', state='visible')
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        if await J("() => !document.getElementById('intro-nation').hidden"):
            await pg.click('#intro-nation [data-nation="portugal"]'); await pg.wait_for_timeout(1500)
        st = await J("() => [document.getElementById('modal-title').textContent, document.getElementById('panel').hidden]")
        print('at the prologue:', st)
        if st[0] != 'Lisbon, March 1451': errs.append(f'no prologue: {st[0]}')
        if not st[1]: errs.append('the market panel is open behind the prologue')
        await pg.screenshot(path=f'{SP}/first-screen-1.png')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(600)
        after = await J("() => [document.getElementById('panel').hidden, !!document.querySelector('#panel .first'), !!document.querySelector('#panel .story-debt')]")
        print('after Begin (panel hidden, first voyage, debt box):', after)
        if after != [False, True, False]: errs.append(f'after the prologue: {after}')
        await pg.screenshot(path=f'{SP}/first-screen-2.png')
        # −10 for a big cargo
        await J("() => { const s = window.helmline.state; s.cargo.wine = 20; s.paid.wine = 180; s.first.done = true; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        n = await J("() => [...document.querySelectorAll('[data-sell=\"wine\"]')].map((b) => b.dataset.n)")
        print('sell buttons for 20 casks:', n)
        if n != ['1', '10', 'all']: errs.append(f'sell buttons: {n}')
        await pg.click('[data-sell="wine"][data-n="10"]'); await pg.wait_for_timeout(300)
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        w = await J("() => [window.helmline.state.cargo.wine, document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent]")
        print('after −10:', w)
        if w[0] != 10: errs.append(f'−10 did not sell ten: {w}')
        # the debt box once the first voyage is behind
        await J("() => { window.helmline.state.voyages = 1; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('#panel .story-debt')"): errs.append('no debt box after the first voyage')
        # the notes (with any story letter read first)
        for _ in range(6):
            if await J("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        notes = await J("""() => import('./js/panels.js').then((P) => { const s = window.helmline.state; s.contracts.unlocked = true; s.voyages = 6;
          s.tips.seen = { contracts: true, fleet: true, captains: true, accounts: true, corsairs: true, hull: true, boats: true, rivals: true, crown: true, age: true, house: true, history: true, early: true };
          const out = []; for (let i = 0; i < 6; i++) { const t = P.tipText(); if (!t) break; out.push(window.helmline.ui.tipKey); s.tips.seen[window.helmline.ui.tipKey] = true; } return out; })""")
        print('notes in turn:', notes, await J("() => [window.helmline.state.tips?.off, window.helmline.ui.modal ? 'modal' : null, window.helmline.ui.introDone]"))
        if not ({'legends', 'rivalships'} & set(notes)): errs.append(f'the new notes do not show: {", ".join(notes) or "none"}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

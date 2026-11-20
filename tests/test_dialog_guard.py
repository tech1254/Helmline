# A dialog that must be answered is never replaced (Nov 2026, from a player's report: "after
# trying to select a calling the sailing broke"). The chart, the panel and the ambitions box stay
# live behind a dialog; clicking "Choose your calling" while a corsair attack was on screen opened
# the calling dialog over the fight. The fight was lost from the screen but not from the game, and
# the ship lay stopped at sea for good. Now the fight stays until it is answered, the ship sails on
# after it, and the calling can be chosen then.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true; window.helmlineCallings = true;")
        J = lambda js: pg.evaluate(js)
        title = lambda: J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro', state='visible'); await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        if await J("() => !document.getElementById('intro-nation').hidden"):
            await pg.click('#intro-nation [data-nation="portugal"]'); await pg.wait_for_timeout(1200)
        for _ in range(6):
            if not await title(): break
            await pg.click('#modal-ok' if await J("() => !document.getElementById('modal-ok').hidden") else '#modal-cancel'); await pg.wait_for_timeout(200)
        await J("() => { const s = window.helmline.state; s.voyages = 3; s.pirates.cooldown = 1e9; if (s.story) s.story.off = true; s.callingMeta = { offered: false, snooze: 1e9, merit: { merchant: 0, crown: 0, privateer: 0 }, history: [] }; }")
        await J("() => window.helmline.dockAt('lagos')"); await pg.wait_for_timeout(300)
        while await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await J("() => window.helmline.sail('palos')"); await pg.wait_for_timeout(300)
        await pg.click('#modal-ok'); await pg.wait_for_timeout(600)

        # a great galley comes out; the player clicks "Choose your calling" behind the fight
        await J("() => { window.helmline.ui.pendingEncounter = { where: 'the Algarve', big: true, strength: 1.2 }; }"); await pg.wait_for_timeout(500)
        t0 = await title()
        await pg.click('[data-amb="calling"]'); await pg.wait_for_timeout(400)
        t1 = await title()
        print('fight:', t0, '| after clicking the calling button:', t1)
        if not t0 or 'galley' not in t0: errs.append(f'no fight opened: {t0}')
        if t1 != t0: errs.append(f'the fight was replaced by: {t1}')
        # the Set sail tab of the panel, behind the fight, can't replace it either
        await J("() => window.helmline.panel('sail')"); await pg.wait_for_timeout(200)
        if await J("() => !!document.querySelector('[data-sailto]')"):
            await J("() => document.querySelector('[data-sailto]').click()"); await pg.wait_for_timeout(300)
            if await title() != t0: errs.append(f'a voyage dialog replaced the fight: {await title()}')

        # fight it out (and win); the ship sails on afterwards
        await J("() => { if (window.helmline.ui.fight) window.helmline.ui.fight.foe.morale = 3; }")
        for _ in range(16):
            acts = await J("() => document.getElementById('modal').hidden ? [] : [...document.querySelectorAll('#modal-body [data-modal-action]')].map(b => b.dataset.modalAction)")
            if not acts:
                if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(200); continue
                break
            a = next((x for x in ['done', 'auto', 'repel', 'fight', 'keep', 'leave'] if x in acts), acts[0])
            await pg.click(f'#modal-body [data-modal-action="{a}"]'); await pg.wait_for_timeout(250)
        lon0 = await J("() => window.helmline.state.ship.lon")
        await J("() => window.helmline.sailFor(1)"); await pg.wait_for_timeout(300)
        st = await J("() => ({ lon: window.helmline.state.ship.lon, docked: window.helmline.state.ship.docked, modal: !document.getElementById('modal').hidden })")
        print('after the fight:', lon0, st)
        if st['lon'] == lon0 and st['docked'] != 'palos': errs.append(f'the ship did not sail on: {st}')

        # and the calling can be chosen now
        while await title(): await pg.click('#modal-ok' if await J("() => !document.getElementById('modal-ok').hidden") else '#modal-cancel'); await pg.wait_for_timeout(200)
        await pg.click('[data-amb="calling"]'); await pg.wait_for_timeout(300)
        if await title() != 'Choose your calling': errs.append(f'the calling dialog did not open afterwards: {await title()}')
        else:
            await pg.click('#modal-body [data-modal-action="merchant"]'); await pg.wait_for_timeout(300)
            if (await J("() => window.helmline.state.calling?.id")) != 'merchant': errs.append('the calling was not taken')

        print('ERRORS', errs); await b.close()

asyncio.run(main())

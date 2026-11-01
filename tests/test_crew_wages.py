# Crew wages the purse cannot pay: the purse stops at nothing and the rest is owed to the crew,
# paid from the first money in port; making port owing a month's wages, the crew walks off and a
# new one takes days to sign on (she cannot sail meanwhile).
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const h = window.helmline, s = h.state; s.pirates.cooldown = 1e9; s.tips.off = true; h.setSpeed(0); s.purse = 5; h.sail('safi'); }")
        await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await J("() => window.helmline.sailFor(6)")
        st = await J("() => ({ purse: window.helmline.state.purse, owed: window.helmline.state.crewOwed, hud: document.getElementById('hud-purse').textContent })")
        print('at sea, broke:', st)
        if st['purse'] < 0: errs.append('the purse went below nothing from wages')
        if not st['owed']: errs.append('nothing owed to the crew')
        if 'crew owed' not in st['hud']: errs.append('the purse in the top bar does not show what is owed')
        # in port with money: the crew is paid
        await J("() => { const h = window.helmline, s = h.state; h.dockAt('safi'); s.purse = 100; h.advance(1); }")
        st = await J("() => ({ purse: window.helmline.state.purse, owed: window.helmline.state.crewOwed })")
        print('in port with 100 cz:', st)
        if st['owed']: errs.append('the crew was not paid from the purse in port')
        # owing a month's wages: they walk off
        await J("() => { const h = window.helmline, s = h.state; h.dockAt('lisbon'); s.purse = 0; s.crewOwed = 500; h.dockAt('lagos'); }")
        st = await J("() => ({ owed: window.helmline.state.crewOwed, until: window.helmline.state.ship.recruitUntil, day: window.helmline.state.day })")
        print('after making port owing 500:', st)
        if st['owed'] or not st['until'] or st['until'] <= st['day']: errs.append('the crew did not walk off')
        await J("() => window.helmline.sail('lisbon')"); await pg.wait_for_timeout(100)
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        docked = await J("() => window.helmline.state.ship.docked")
        print('trying to sail while signing on: still docked at', docked)
        if docked != 'lagos': errs.append('she sailed with no crew')
        await J("() => window.helmline.advance(6)")
        await J("() => window.helmline.sail('lisbon')"); await pg.wait_for_timeout(100)
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        if await J("() => window.helmline.state.ship.docked"): errs.append('she could not sail after the new crew signed on')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

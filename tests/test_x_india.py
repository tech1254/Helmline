# Expansion: the Indian Ocean (x/india.js). Once Calicut is reached, Cochin (1500), Goa (1510),
# Malacca (1511) and Hormuz (1515) open as history reaches them; from any of them you coast to the
# others in days; their markets differ (cloves cheap at Malacca, spices dear at Hormuz); and the
# passage home round the Cape starts from any of them. Only Calicut is drawn at the chart's edge.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(12):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro', state='visible')
        await pg.click('#intro-new'); await pg.wait_for_timeout(200)
        if await J("() => !document.getElementById('intro-nation').hidden"):
            await pg.click('#intro-nation [data-nation="portugal"]'); await pg.wait_for_timeout(1200)
        await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; s.ship.hull = 'nau'; s.war = null; s.law = s.law || {}; s.law.cooldown = 1e9; }")
        # 1512: India reached
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1512) + 300; s.discovered.calicut = true; s.ship.inIndies = true; window.helmline.advance(1); }"); await ok_modals(pg)
        known = await J("() => ['cochin', 'goa', 'malacca', 'hormuz'].map((id) => !!window.helmline.state.discovered[id])")
        print('known in late 1512:', known)
        if known != [True, True, True, False]: errs.append(f'the Indian ports did not open with history: {known}')
        await J("() => window.helmline.dockAt('calicut')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        btns = await J("() => [...document.querySelectorAll('[data-india-coast]')].map((b) => b.textContent)")
        print('coasting from Calicut:', btns)
        if len(btns) != 3: errs.append(f'not three ports to coast to: {btns}')
        await pg.screenshot(path=f'{SP}/x-india-1-calicut.png')
        d0 = await J("() => window.helmline.state.day")
        await J("() => document.querySelector('[data-india-coast=\"malacca\"]').scrollIntoView()")
        await pg.click('[data-india-coast="malacca"]'); await pg.wait_for_timeout(250); await pg.click('#modal-ok'); await pg.wait_for_timeout(800); await ok_modals(pg)
        at = await J("() => [window.helmline.state.ship.docked, Math.round(window.helmline.state.day)]")
        print('at:', at, 'after', at[1] - d0, 'days')
        if at[0] != 'malacca' or not 28 <= at[1] - d0 <= 32: errs.append(f'coasting to Malacca went wrong: {at}')
        prices = await J("() => { const m = window.helmline.market(); return { malaccaSpices: m.buyPrice('malacca', 'spices'), calicutSpices: m.buyPrice('calicut', 'spices'), hormuzSpices: m.sellPrice ? m.sellPrice('hormuz', 'spices') : null }; }")
        print('prices:', prices)
        if not prices['malaccaSpices'] < prices['calicutSpices']: errs.append(f'cloves are not cheaper at Malacca: {prices}')
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/x-india-2-malacca.png')
        # home from Malacca, round the Cape
        ok = await J("() => window.helmline.sail('lisbon')"); await pg.wait_for_timeout(300)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('sailing home:', ok, t)
        if not ok and not t: errs.append('no passage home from Malacca')
        # the chart draws only Calicut at the edge
        await J("() => { const s = window.helmline.state; window.helmline.reveal(23.4, -35.75); window.helmline.panel(null); window.helmline.look(22, -35, 2); }"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/x-india-3-edge.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

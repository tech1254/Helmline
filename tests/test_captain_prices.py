# Captains' price notes reach the price book when the owner is in a port on their route,
# and only then; the owner's own ship plans the volta do mar home from Guinea.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.purse = 9000; s.contracts.unlocked = true; s.contracts.standing = 25; for (const k in s.discovered) s.discovered[k] = true; }")
        await pg.click('#btn-port'); await pg.wait_for_timeout(50)
        if await J("() => !document.querySelector('[data-tab=\"fleet\"]')"): await pg.click('#btn-port')
        await pg.click('[data-tab="fleet"]'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await pg.locator('[data-ship]').last.locator('[data-stop-i="1"] [data-f="port"]').select_option('gambia'); await pg.wait_for_timeout(60)
        await pg.locator('[data-route]').last.click(); await pg.wait_for_timeout(100)
        gambia0 = await J("() => window.helmline.state.seen.gambia?.day ?? null")
        await J("() => { window.helmline.state.ship.docked = null; window.helmline.advance(60); }")
        noted = await J("() => window.helmline.state.fleet.ships[0].seen?.gambia?.day ?? null")
        print('captain noted Gambia prices on day', noted, '| price book had', gambia0)
        await J("() => window.helmline.dockAt('lagos')")
        after_lagos = await J("() => window.helmline.state.seen.gambia?.day ?? null")
        print('after Lagos (not on his route):', after_lagos)
        if after_lagos != gambia0: errs.append('prices passed on at a port off the route')
        await J("() => window.helmline.dockAt('lisbon')")
        rec = await J("() => window.helmline.state.seen.gambia")
        toast = await J("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText).filter(t => /price book/.test(t)).pop() || ''")
        print('after Lisbon:', rec and round(rec['day']), rec and rec.get('by'), '|', toast[:200])
        if not rec or rec.get('by') is None or noted is None or round(rec['day']) != round(noted): errs.append('captain prices not passed on in Lisbon')
        await pg.click('#btn-prices'); await pg.wait_for_timeout(150)
        hdr = await J("() => [...document.querySelectorAll('.pricebook thead th')].map(t => t.textContent).join(' / ')")
        print('price book columns:', hdr)
        if 'Gambia River' not in hdr or 'by Santa Clara' not in hdr: errs.append('price book does not show the captain\'s Gambia prices')
        # Own ship: the course home from Costa da Mina goes out to sea.
        far = await J("() => { const h = window.helmline; h.dockAt('mina'); const s = h.state; const r = h.route(-9.36, 38.6); return Math.min(...r.map(p => p[0])); }")
        print('course Mina to Lisbon reaches west to', round(far, 1))
        if far > -22: errs.append('own course home from Mina does not swing out to sea')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

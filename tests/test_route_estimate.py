# The route editor reckons a route before the captain sails it: each leg's cargo and gain from the
# prices you have seen, the wages, and the round; a stop where nothing pays is flagged; a losing
# route is warned of; a port with no prices seen is named.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("""() => { const s = window.helmline.state, m = window.helmline.market(); s.pirates.cooldown = 1e9; s.tips.off = true; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 9000;
            for (const k in s.discovered) s.discovered[k] = true;
            for (const k of ['lisbon', 'lagos', 'ceuta', 'safi', 'arguin']) s.seen[k] = { day: s.day, prices: m.observe(k) }; }""")
        await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(200)
        await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        card = pg.locator('[data-ship]').first
        async def est(): return await J("() => document.querySelector('.route-est')?.innerText || ''")
        # Lisbon - Arguin: should pay
        await card.locator('[data-stop-i="1"] [data-f="port"]').select_option('arguin'); await pg.wait_for_timeout(150)
        e1 = await est()
        print('Lisbon-Arguin:', e1.replace('\n', ' | ')[:400])
        if 'a round' not in e1: errs.append('no estimate for Lisbon-Arguin')
        await card.locator('.route-est').evaluate("(d) => d.scrollIntoView()")
        await pg.screenshot(path=f'{SP}/route-estimate-1.png')
        # Lisbon - Ceuta: Ceuta sells nothing worth carrying back
        await card.locator('[data-stop-i="1"] [data-f="port"]').select_option('ceuta'); await pg.wait_for_timeout(150)
        e2 = await est()
        print('Lisbon-Ceuta:', e2.replace('\n', ' | ')[:400])
        if 'Ceuta' not in e2 or ('empty' not in e2 and 'lose' not in e2): errs.append('Ceuta not flagged')
        # a port with no prices seen
        await card.locator('[data-stop-i="1"] [data-f="port"]').select_option('porto'); await pg.wait_for_timeout(150)
        e3 = await est()
        print('Lisbon-Porto (unseen):', e3.replace('\n', ' | ')[:200])
        if 'No prices seen at Porto' not in e3: errs.append('unseen port not named')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

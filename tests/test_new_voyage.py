# Starting a new voyage from the More menu (phone) and the Saves panel (desktop): the dialog says
# what happens to the voyage in play, and the new one starts in Lisbon in 1451. Signed in, the
# old voyage stays in the account and the new one gets its own save.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        # phone, not signed in: the More menu
        pg = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 4321; s.day = 200; }")
        await pg.click('#dock-more'); await pg.wait_for_timeout(200)
        await pg.click('[data-menu="new"]'); await pg.wait_for_timeout(200)
        body = await J("() => document.getElementById('modal-body').innerText")
        print('phone dialog:', body.replace('\n', ' ')[:160])
        if 'will be lost' not in body: errs.append('the dialog does not warn that an unsaved voyage is lost')
        await pg.screenshot(path=f'{SP}/new-voyage-phone.png')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        st = await J("() => [window.helmline.state.day, Math.round(window.helmline.state.purse), window.helmline.state.ship.docked]")
        print('after:', st)
        if st != [0, 300, 'lisbon']: errs.append('the new voyage did not start in Lisbon in 1451')
        await pg.close()
        # desktop, signed in: from the Saves panel; the old save stays
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 5555; s.day = 120; }")
        await J("() => document.getElementById('btn-cloud').click()"); await pg.wait_for_timeout(200)
        await pg.fill('[data-account-form] [name=name]', 'Voyager'); await pg.fill('[data-account-form] [name=password]', 'long enough pw')
        await pg.click('[data-account-act="register"]')
        await pg.wait_for_selector('[data-slot-new]', timeout=10000)
        await pg.click('[data-slot-new]')
        for _ in range(25):
            await pg.wait_for_timeout(200)
            if await J("() => !!window.helmline.cloud().cloud.slot"): break
        first = await J("() => window.helmline.cloud().cloud.slot")
        await pg.click('[data-menu="new"]'); await pg.wait_for_timeout(200)
        body = await J("() => document.getElementById('modal-body').innerText")
        print('desktop dialog:', body.replace('\n', ' ')[:160])
        if 'stays in your account' not in body: errs.append('the dialog does not say the old voyage stays in the account')
        await pg.click('#modal-ok')
        for _ in range(25):
            await pg.wait_for_timeout(200)
            acc = await J("() => window.helmline.cloud()")
            if acc['cloud']['slot'] and acc['cloud']['slot'] != first: break
        print('saves:', [(s['name'], round(s['day'] or 0)) for s in acc['account']['slots']])
        if len(acc['account']['slots']) != 2 or acc['cloud']['slot'] == first: errs.append('the new voyage did not get its own save')
        if not any(round(s['day'] or 0) == 120 for s in acc['account']['slots']): errs.append('the old voyage was not kept')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

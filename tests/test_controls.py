import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
        J=lambda js: pg.evaluate(js); title=lambda: J("() => document.getElementById('panel').hidden ? null : document.querySelector('#panel h2')?.textContent")
        for k in 'PLNW':
            await pg.keyboard.press(k); await pg.wait_for_timeout(80); print(k, '->', await title())
        await pg.keyboard.press(' '); print('space pauses:', await J("() => document.querySelector('[data-speed=\"0\"]').classList.contains('on')"))
        await pg.keyboard.press('2'); print('2 -> 2x:', await J("() => document.querySelector('[data-speed=\"2\"]').classList.contains('on')"))
        await pg.click('#btn-port'); await pg.wait_for_timeout(80)
        if await title() != 'Lisbon': await pg.click('#btn-port')
        d0 = await J("() => window.helmline.state.day"); await pg.click('[data-wait]'); await pg.wait_for_timeout(100)
        print('wait a week: +', round(await J("() => window.helmline.state.day") - d0, 1), 'days')
        for b_ in ['#btn-cloud', '#btn-help']:
            await pg.click(b_); await pg.wait_for_timeout(80); print(b_, '->', await title())
        await pg.click('[data-close]')
        await J("() => window.helmline.encounter(false)"); await pg.wait_for_timeout(400)
        print('encounter dialog:', await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent"))
        await pg.click('[data-modal-action="run"]'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.purse = 6000; s.contracts.unlocked = true; s.contracts.standing = 6; }")
        await pg.click('#btn-port'); await pg.wait_for_timeout(50)
        if await J("() => !document.querySelector('[data-tab=\"fleet\"]')"): await pg.click('#btn-port')
        await pg.click('[data-tab="fleet"]'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await pg.locator('[data-route]').first.click(); await pg.wait_for_timeout(100)
        print('away 8h:', await J("() => window.helmline.away(480)"))
        await pg.wait_for_timeout(500)
        print('summary dialog:', await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent"))
        await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        closed = await J("() => document.getElementById('modal').hidden")
        print('Carry on closes the summary:', closed)
        if not closed: errs.append('Carry on did not close the summary')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

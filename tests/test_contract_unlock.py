import asyncio
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(900)
        state = lambda: pg.evaluate("() => ({ button: !document.getElementById('btn-contracts').hidden, tab: !!document.querySelector('[data-tab=contracts]'), active: window.helmline.state.contracts.active.map(c => c.title), unlocked: window.helmline.state.contracts.unlocked, purse: Math.round(window.helmline.state.purse) })")
        print('new game at 300 cz:', await state())
        await pg.click('[data-buy="wine"][data-n="1"]')
        await pg.evaluate("() => { window.helmline.state.purse = 520; }")
        await pg.click('[data-sell="wine"][data-n="1"]'); await pg.wait_for_timeout(200)
        print('after first sale over 500:', await state())
        print('toasts:', await pg.evaluate("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText)"))
        await pg.reload(); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
        print('after reload:', await state())
        print('ERRORS', errs); await b.close()
asyncio.run(main())

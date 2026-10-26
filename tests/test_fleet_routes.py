import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 6; s.purse = 9000; for (const k in s.discovered) s.discovered[k] = true; }")
        await pg.click('#btn-port'); await pg.click('#btn-port'); await pg.click('[data-tab="fleet"]'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        sel = lambda i, j, f: f'[data-stop-i="{i}"] [data-order-j="{j}"] [data-f="{f}"]'
        async def choose(css, val): await pg.select_option(css, val); await pg.wait_for_timeout(60)
        async def click(css): await pg.click(css); await pg.wait_for_timeout(60)
        # Stop 1 Lisbon: sell all, buy 50% wool
        await choose(sel(0,1,'good'), 'cloth'); await choose(sel(0,1,'pct'), '50')
        # Stop 2 Lagos: just buy 50% wine
        await choose('[data-stop-i="1"] [data-f="port"]', 'lagos')
        await click('[data-stop-i="1"] [data-order-j="0"] [data-draft="del-order"]')
        await choose(sel(1,0,'good'), 'wine'); await choose(sel(1,0,'pct'), '50')
        # Stop 3 Gambia: sell all, buy 50% pepper
        await click('[data-draft="add-stop"]'); await choose('[data-stop-i="2"] [data-f="port"]', 'gambia')
        await click('[data-stop-i="2"] [data-draft="add-order"]'); await choose(sel(2,1,'good'), 'pepper'); await choose(sel(2,1,'pct'), '50')
        # Stop 4 Funchal: passing through
        await click('[data-draft="add-stop"]'); await choose('[data-stop-i="3"] [data-f="port"]', 'funchal')
        await click('[data-stop-i="3"] [data-order-j="0"] [data-draft="del-order"]')
        # Stop 5 Arguin: buy 50% gold
        await click('[data-draft="add-stop"]'); await choose('[data-stop-i="4"] [data-f="port"]', 'arguin')
        await click('[data-stop-i="4"] [data-order-j="0"] [data-draft="del-order"]')
        await click('[data-stop-i="4"] [data-draft="add-order"]'); await choose(sel(4,0,'good'), 'gold'); await choose(sel(4,0,'pct'), '50')
        await pg.screenshot(path=f'{SP}/36-route-editor.png', full_page=True)
        await click('[data-route]')
        print('route:', await J("() => JSON.stringify(window.helmline.state.fleet.ships[0].route.stops.map(s => s.port + ':' + s.orders.map(o => o.act + ' ' + o.good + (o.pct ? ' ' + o.pct + '%' : '')).join(', ')))"))
        await J("() => window.helmline.advance(320)")
        for l in await J("() => window.helmline.state.log.filter(l => /Santa|São|Bom/.test(l.text)).map(l => Math.round(l.day) + ': ' + l.text)"): print(' ', l[:200])
        print('ship:', await J("() => { const s = window.helmline.state.fleet.ships[0]; return {sales: s.trips, profit: s.profit, status: s.status}; }"), '| wages paid', round(await J("() => window.helmline.state.fleet.wagesPaid")))
        # validation messages
        await pg.click('[data-tab="fleet"]'); await pg.wait_for_timeout(100)
        await J("() => { document.querySelector('[data-ship] details').open = true; }")
        await choose('[data-stop-i="1"] [data-f="port"]', 'lisbon')
        await click('[data-route]'); print('same-port validation:', await J("() => [...document.querySelectorAll('#toast .t')].pop().innerText"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

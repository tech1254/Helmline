import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        title = lambda: pg.evaluate("() => document.querySelector('#panel h2')?.textContent")
        st = lambda: pg.evaluate("() => { const s = window.helmline.state; return {purse: Math.round(s.purse), wine: s.cargo.wine, docked: s.ship.docked, route: s.ship.route.length}; }")
        modal = lambda: pg.evaluate("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent + ' | ' + document.getElementById('modal-body').innerText.replace(/\\s+/g,' ')")
        # Story 1: tabs
        await pg.click('[data-tab="prices"]'); print('tab ledger ->', await title())
        await pg.click('[data-tab="port"]'); print('tab market ->', await title())
        await pg.click('#btn-prices'); await pg.click('#btn-port'); print('top-bar Ledger then Market ->', await title())
        # Story 2: trade confirmations
        await pg.click('[data-buy="wine"][data-n="1"]'); print('+1 (no dialog):', await modal(), await st())
        await pg.click('[data-buy="wine"][data-n="max"]'); print('Max dialog:', await modal())
        await pg.screenshot(path=f'{SP}/10-buy-confirm.png')
        await pg.click('#modal-cancel'); print('after cancel:', await st())
        await pg.click('[data-buy="wine"][data-n="10"]'); await pg.click('#modal-ok'); print('+10 confirmed:', await st())
        await pg.click('[data-sell="wine"][data-n="all"]'); print('Sell all dialog:', await modal())
        await pg.keyboard.press('Escape'); print('after Esc:', await st())
        # Story 3: voyage confirmation via clicking Funchal on the chart
        pos = await pg.evaluate("() => { const c = document.getElementById('chart'); return null; }")
        await pg.click('[data-close]')
        xy = await pg.evaluate("""() => { const h = window.helmline; return h.screenOf(-16.9, 32.6); }""")
        await pg.mouse.click(*xy); await pg.wait_for_timeout(200)
        print('voyage dialog:', await modal())
        await pg.screenshot(path=f'{SP}/11-voyage-confirm.png')
        est = await pg.evaluate("() => +document.getElementById('modal-body').innerText.match(/about (\\d+) day/)[1]")
        await pg.click('#modal-ok'); print('after Set sail:', await st())
        await pg.evaluate("() => window.helmline.setSpeed(4)")
        day0 = await pg.evaluate("() => window.helmline.state.day")
        for _ in range(240):
            if await pg.evaluate("() => window.helmline.state.ship.docked") == 'funchal': break
            await pg.wait_for_timeout(250)
        day1 = await pg.evaluate("() => window.helmline.state.day")
        print(f'estimated {est} days, actual {day1-day0:.1f} days')
        await pg.screenshot(path=f'{SP}/12-hud.png', clip={'x':0,'y':0,'width':700,'height':60})
        print('ERRORS', errs); await b.close()
asyncio.run(main())

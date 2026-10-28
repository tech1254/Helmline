import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 6000; s.accounts.opening = 6000; for (const k in s.discovered) s.discovered[k] = true; }")
        await pg.click('#btn-port'); await pg.click('#btn-port')
        # Two ships, default two-port routes from the editor: Lisbon <-> Arguin and Lisbon <-> Gambia
        for dest in ['arguin', 'gambia']:
            await pg.click('[data-tab="fleet"]'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
            cards = await J("() => document.querySelectorAll('[data-ship]').length")
            card = f'[data-ship]:nth-of-type({cards}) ' if False else ''
            await J("() => { const d = [...document.querySelectorAll('[data-ship] details.route-edit')]; d[d.length-1].open = true; }")
            last = await J("() => document.querySelectorAll('[data-ship]').length")
            sc = f'[data-ship]:nth-last-of-type(1)'
            await pg.locator('[data-ship]').last.locator('[data-stop-i="1"] [data-f="port"]').select_option(dest); await pg.wait_for_timeout(60)
            await pg.locator('[data-ship]').last.locator('[data-route]').click(); await pg.wait_for_timeout(100)
        print('routes:', await J("() => window.helmline.state.fleet.ships.map(s => s.name + ': ' + s.route.stops.map(x => x.port).join('>'))"))
        A = lambda: J("() => { const a = window.helmline.accounts(); return { unacc: Math.round(a.unaccounted), pending: Math.round(a.pending), running: Math.round(a.due) }; }")
        # Wait in Lisbon, as the tester did, logging each time a ship calls
        for step in range(30):
            before = await J("() => window.helmline.state.fleet.ships.map(s => s.at)")
            await J("() => window.helmline.advance(5)")
            after = await J("() => window.helmline.state.fleet.ships.map(s => s.at)")
            calls = [i for i,(x,y) in enumerate(zip(before, after)) if x != y and y == 'lisbon']
            if calls: print(f'day {step*5+5}: ship {calls} called at Lisbon ->', await A())
        print('end of wait:', await A())
        # Sail away (undock) for a while, then drop anchor at Arguin: only the Arguin ship's accounts should arrive
        await J("() => { const h = window.helmline; h.state.ship.docked = null; }")
        await J("() => window.helmline.advance(40)")
        print('at sea 40 days:', await A())
        await J("() => window.helmline.dockAt('arguin')")
        print('docked Arguin:', await A(), '|', await J("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText).filter(t => /factor/.test(t)).pop() || 'no toast'"))
        await J("() => window.helmline.dockAt('funchal')")
        print('docked Funchal (no route):', await A())
        await J("() => window.helmline.dockAt('gambia')")
        print('docked Gambia:', await A(), '|', await J("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText).filter(t => /factor/.test(t)).pop() || 'no toast'"))
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('[data-modal-action="pay"]')
        await pg.click('#btn-ledger'); await pg.wait_for_timeout(200)
        print(await J("() => document.querySelector('#panel dl').innerText.replace(/\\n/g, ' | ')"))
        print('first rows:', await J("() => [...document.querySelectorAll('.entries tr')].slice(0,5).map(r => r.innerText.replace(/\\s+/g,' ')).join('\\n  ')"))
        await pg.screenshot(path=f'{SP}/42-ledger-fixed.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

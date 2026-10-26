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
        await click('[data-route]')
        A = lambda: J("() => window.helmline.accounts()")
        await pg.click('[data-tab="port"]')
        for _ in range(3): await click('[data-buy="wine"][data-n="1"]')
        await click('[data-buy="wine"][data-n="10"]'); await click('#modal-ok')
        await click('[data-sell="wine"][data-n="1"]')
        print('after trades', await A())
        await J("() => { window.helmline.dockAt('lagos'); }")
        await J("() => { const h = window.helmline; h.state.ship.docked = null; }")
        await J("() => window.helmline.advance(150)")
        a = await A(); print('after 150 days away', {k: round(v) for k, v in a.items()})
        print('  identity purse - known + voyage - pending - (-due) =', round(a['purse'] - a['known'] + a['voyage'] - a['pending'] + a['due'], 3))
        for port in ['gambia', 'arguin', 'lisbon', 'lagos']:
            await J(f"() => window.helmline.dockAt('{port}')")
            a = await A(); toast = await J("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText).filter(t => /factor/.test(t)).pop() || ''")
            print(f'docked {port}: unaccounted {round(a["unaccounted"])}, pending {round(a["pending"])}, due {round(a["due"])} |', toast[:160])
        await J("() => window.helmline.state.pirates && (window.helmline.state.pirates.cooldown = 9999)")
        if await J("() => !document.getElementById('modal').hidden"): await click('[data-modal-action="pay"]'); await pg.wait_for_timeout(200)
        await click('#btn-ledger'); await pg.wait_for_timeout(200)
        pass
        await pg.screenshot(path=f'{SP}/40-ledger.png', full_page=True)
        await pg.select_option('select[data-ledger-who]', 'you'); await pg.wait_for_timeout(100)
        print('-- your ship only:', await J("() => document.querySelectorAll('.entries tr').length"), 'rows')
        await pg.set_viewport_size({'width': 390, 'height': 780}); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/41-ledger-phone.png')
        print('phone overflow:', await J("() => document.getElementById('panel').scrollWidth > document.getElementById('panel').clientWidth + 1"))
        print('controls bar wraps to rows:', await J("() => { const c = document.getElementById('controls') || document.querySelector('.controls'); return c ? Math.round(c.getBoundingClientRect().height) : null; }"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

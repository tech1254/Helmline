# The crown's share and rival merchants: a rich year is taxed at New Year (less for renown), the
# ledger shows the reckoning so far, and rivals narrow prices on busy routes as the years pass.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 820})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        modal = lambda: J("() => !document.getElementById('modal').hidden")
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; window.helmline.setSpeed(0); }")
        # a rich year: 20,000 cz of sales booked this year, in Lisbon
        price0 = await J("() => [window.helmline.market().sellPrice('arguin', 'cloth'), window.helmline.market().buyPrice('lisbon', 'cloth')]")
        await J("() => { const s = window.helmline.state; s.accounts.totals.sale = (s.accounts.totals.sale || 0) + 20000; s.purse += 20000; }")
        await pg.click('#btn-ledger'); await pg.wait_for_timeout(200)
        line = await J("() => [...document.querySelectorAll('#panel p.fine')].map((p) => p.innerText).find((t) => t.includes('crown')) || null")
        print('ledger:', line)
        if not line or 'about' not in line: errs.append('no tax reckoning in the ledger')
        await pg.screenshot(path=f'{SP}/crown-1-ledger.png')
        purse = await J("() => window.helmline.state.purse")
        await J("() => window.helmline.advance(310)")  # past New Year 1452
        for _ in range(5):
            if await modal(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        t = await J("() => window.helmline.state.taxes")
        print('taxes:', {k: t[k] for k in ('year', 'paid', 'last')})
        if not t['paid']: errs.append('no tax taken at New Year')
        # renown halves it: the same year again for a commander
        r = await J("() => { const s = window.helmline.state; s.house = { owned: {}, renown: 100, loans: [], upkeepDue: 0 }; s.accounts.totals.sale += 20000; return null; }")
        await J("() => window.helmline.advance(366)")
        t2 = await J("() => window.helmline.state.taxes.last")
        print('with renown 100:', t2)
        if not (t2['tax'] < t2['gross']): errs.append('renown did not lower the tax')
        # rivals: forty years on, the Guinea routes are crowded and the gap has narrowed
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1493); window.helmline.advance(730); }")
        for _ in range(5):
            if await modal(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        price1 = await J("() => [window.helmline.market().sellPrice('arguin', 'cloth'), window.helmline.market().buyPrice('lisbon', 'cloth')]")
        rivals = await J("() => ({ arguin: window.helmline.state.rivals.r.arguin.cloth.toFixed(2), lisbon: window.helmline.state.rivals.r.lisbon.cloth.toFixed(2) })")
        print('cloth: Arguin sells / Lisbon buys', price0, '->', price1, 'rivalry', rivals)
        f = await J("() => [window.helmline.market().rival.arguin.cloth, window.helmline.market().rival.lisbon.cloth]")
        print('price factors: Arguin cloth (wanted there)', round(f[0], 3), '· Lisbon cloth (made there)', round(f[1], 3))
        if not (f[0] < 0.99 and f[1] > 1.02): errs.append('rivals did not narrow the gap between Lisbon and Arguin')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

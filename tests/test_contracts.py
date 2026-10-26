import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':860})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 6; s.purse = 900; for (const k in s.discovered) s.discovered[k] = true; }")
        # every offer at every port must be completable: wanted at destination, on sale at source, fits hold & purse, sane deadline
        check = """(pid) => { const s = window.helmline.state, m = window.helmline.market(); const out = []; 
          const offers = window.helmline.offers(pid);
          for (const o of offers) { const ok = m.sells(o.source, o.good) && !m.sells(o.to, o.good) || o.source !== o.to;
            const ratio = m.sellPrice(o.to, o.good) / m.buyPrice(o.source, o.good);
            const cost = o.qty * m.buyPrice(o.source, o.good);
            out.push(`${o.title} [from ${o.source}] pays ${o.reward}, cost ~${cost}, ratio ${ratio.toFixed(2)}, ${o.offeredDays} d` + (o.qty > 40 || cost > s.purse || ratio < 1.25 || !m.sells(o.source, o.good) ? '  <-- PROBLEM' : '')); }
          return out; }"""
        for pid in ['lisbon','lagos','funchal','lanzarote','arguin','gambia']:
            r = await J(f"() => ({check})('{pid}')")
            bad = [x for x in r if 'PROBLEM' in x]; print(pid, '->', len(r), 'offers,', len(bad), 'problems')
        # taking an offer gets replaced after a week
        await pg.click('#btn-port'); await pg.click('#btn-port'); await pg.wait_for_timeout(100)
        await pg.click('[data-tab="contracts"]'); n0 = await J("() => document.querySelectorAll('[data-accept]').length")
        await pg.click('[data-accept]'); n1 = await J("() => document.querySelectorAll('[data-accept]').length")
        await pg.click('[data-tab="port"]'); await pg.click('[data-wait]'); await pg.click('[data-tab="contracts"]')
        n2 = await J("() => document.querySelectorAll('[data-accept]').length")
        print(f'Lisbon offers: {n0} -> took one -> {n1} -> a week later -> {n2}')
        # ship limits by standing
        await J("() => { const s = window.helmline.state; s.purse = 9000; s.contracts.standing = 25; }")
        await pg.click('[data-tab="fleet"]')
        for i in range(3):
            btn = await pg.query_selector('[data-hire]:not([disabled])')
            if not btn: print(f'after {i} ships: no more can be bought |', await J("() => [...document.querySelectorAll('#panel .foot')].map(e => e.innerText).join(' / ')")); break
            await btn.click(); await pg.click('#modal-ok'); await pg.wait_for_timeout(150); await pg.click('[data-tab="fleet"]')
        print('ships owned at Respected:', await J("() => window.helmline.state.fleet.ships.length"))
        await pg.screenshot(path=f'{SP}/35-fleet-two.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

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
        await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
        # Reveal every port's prices, as if the captain had seen them all today.
        await pg.evaluate("""() => { const h = window.helmline, S = h.state, m = h.market();
          for (const id of ['lisbon','lagos','funchal','lanzarote','arguin','gambia']) { S.discovered[id] = true; S.seen[id] = { day: S.day, prices: m.observe(id) }; }
          S.purse = 800; }""")
        await pg.click('#btn-prices'); await pg.wait_for_timeout(300)
        t0 = await pg.evaluate("() => performance.now()")
        txt = await pg.evaluate("() => [...document.querySelectorAll('#panel h3')].find(h => h.textContent.includes('harbourmaster')).nextElementSibling.innerText")
        print(txt)
        await pg.screenshot(path=f'{SP}/38-harbour.png')
        # timing of a re-render
        ms = await pg.evaluate("() => { const t = performance.now(); document.getElementById('btn-prices').click(); document.getElementById('btn-prices').click(); return performance.now() - t; }")
        print('re-render ms', round(ms))
        print('errors', errs)
        await b.close()
asyncio.run(main())

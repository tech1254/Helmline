import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w,h,name in ((1280,900,'43-notices'),(390,780,'44-notices-phone')):
            pg = await b.new_page(viewport={'width':w,'height':h})
            errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
            await pg.click('#intro-new'); await pg.wait_for_timeout(300)
            await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
            J = lambda js: pg.evaluate(js)
            await pg.click('[data-close]') if await J("() => !!document.querySelector('[data-close]')") else None
            # A hint (no feed) and two events at once
            await J("() => { const h = window.helmline; h.state.purse = 520; }")
            await pg.mouse.click(w//2, h//2); await pg.wait_for_timeout(100)
            await J("() => window.helmline.dockAt('funchal')")
            await pg.wait_for_timeout(300)
            shown = await J("() => [...document.querySelectorAll('#toast .t')].map(t => t.innerText)")
            print(w, 'pop-ups now:', len(shown)); [print('   ', t[:90]) for t in shown]
            print('badge:', await J("() => document.getElementById('notices-count').hidden ? 'hidden' : document.getElementById('notices-count').textContent"))
            await pg.wait_for_timeout(5500)
            print('after 5.5 s still showing:', await J("() => document.querySelectorAll('#toast .t:not(.out)').length"))
            await pg.screenshot(path=f'{SP}/{name}-popups.png')
            # tap to dismiss
            n0 = await J("() => document.querySelectorAll('#toast .t:not(.out)').length")
            if n0: await pg.evaluate("() => document.querySelector('#toast .t:not(.out)').click()"); await pg.wait_for_timeout(700)
            print('after a tap:', await J("() => document.querySelectorAll('#toast .t').length"), 'of', n0)
            await pg.click('#btn-notices'); await pg.wait_for_timeout(200)
            print('feed:', await J("() => [...document.querySelectorAll('.notices li')].map(l => l.innerText.slice(0,70))"))
            print('badge after open:', await J("() => document.getElementById('notices-count').hidden"))
            await pg.screenshot(path=f'{SP}/{name}.png')
            await pg.reload(); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
            await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
            print('kept after reload:', await J("() => window.helmline.state.notices.length"), '| badge hidden:', await J("() => document.getElementById('notices-count').hidden"))
            print('ERRORS', errs); await pg.close()
        await b.close()
asyncio.run(main())

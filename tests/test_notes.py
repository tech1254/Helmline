# Captain's notes: early nudges, then one short note per system as it first matters. × puts away
# the note shown (the next one comes when it applies); 'No more notes' stops them all. The help
# folds its long sections away.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        tip = lambda: J("() => document.getElementById('tip').hidden ? null : document.getElementById('tip-text').innerText")
        t0 = await tip(); print('first nudge:', t0)
        if not t0 or 'wine' not in t0: errs.append('no first nudge')
        await pg.screenshot(path=f'{SP}/notes-1-early.png')
        # contracts open: × on the early nudge must not stop later notes
        await pg.click('#tip-close'); await pg.wait_for_timeout(100)
        if await tip(): errs.append('early nudge not put away')
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.purse = 600; window.helmline.render?.(); }")
        await pg.wait_for_timeout(300)  # the HUD redraws
        t1 = await tip(); print('next note:', t1)
        if not t1 or 'Contracts are open' not in t1: errs.append('contracts note not shown')
        await pg.screenshot(path=f'{SP}/notes-2-contracts.png')
        await pg.click('#tip-close'); await pg.wait_for_timeout(100)
        await J("() => { window.helmline.state.hull = 50; }")
        await pg.wait_for_timeout(300)
        t2 = await tip(); print('then:', t2)
        if not t2 or 'worn hull' not in t2: errs.append('hull note not shown after contracts note put away')
        await pg.click('#tip-off'); await pg.wait_for_timeout(100)
        await J("() => { window.helmline.state.discovered.mpinda = true; }")
        await J("() => document.getElementById('btn-help').click()"); await pg.wait_for_timeout(300)
        if await tip(): errs.append('notes still shown after No more notes')
        seen = await J("() => window.helmline.state.tips")
        print('tips state:', seen)
        # the help: short, with the long sections folded
        n = await J("() => [document.querySelectorAll('#panel details.help-more').length, [...document.querySelectorAll('#panel details.help-more')].filter((d) => d.open).length]")
        print('help sections (folded, open):', n)
        if n[0] < 5 or n[1] != 0: errs.append('help sections not folded')
        await pg.click('#panel details.help-more summary'); await pg.wait_for_timeout(100)
        await pg.screenshot(path=f'{SP}/notes-3-help.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

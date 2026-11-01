# Arrival scenes can be turned down where you will look for it: "First visits only" on the scene
# itself, and Arrival scenes in the More menu (every port, first visits only, off).
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmline.state.tips.off = true; }")
        # the scene: a button to play it on first visits only
        await J("() => { window.helmline.state.called = { lagos: true }; window.helmline.scene('lagos'); }"); await pg.wait_for_timeout(2200)
        has = await J("() => !!document.querySelector('#scene:not([hidden]) .scene-less')")
        print('scene shows "First visits only":', has)
        if not has: errs.append('no "First visits only" on the scene')
        await pg.screenshot(path=f'{SP}/scene-setting-1.png')
        if has:
            await pg.click('.scene-less'); await pg.wait_for_timeout(1200)
            st = await J("() => [window.helmline.state.settings?.arrivals, document.getElementById('scene').hidden]")
            print('after the tap: mode', st[0], '| scene closed', st[1])
            if st != ['first', True]: errs.append('the button did not set first visits only and close the scene')
        # More: Arrival scenes cycles first -> off -> every port
        await pg.click('#dock-more'); await pg.wait_for_timeout(200)
        sub = lambda: J("() => document.querySelector('[data-menu=\"scenes\"] small').textContent")
        seen = [await sub()]
        for _ in range(3):
            await pg.click('[data-menu="scenes"]'); await pg.wait_for_timeout(120); seen.append(await sub())
        print('More, Arrival scenes:', seen)
        if not (seen[0].startswith('First visits') and seen[1].startswith('Off') and seen[2].startswith('Every port') and seen[3].startswith('First visits')): errs.append(f'the menu item does not cycle: {seen}')
        await pg.screenshot(path=f'{SP}/scene-setting-2-menu.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

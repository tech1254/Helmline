"""The arrival scene: plays when the flagship sails into port (tests opt in, since automated
browsers skip it), holds pop-ups until it ends, can be skipped, and respects the setting.
Also a screenshot of each harbour setting."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro:not([hidden])'); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro:not([hidden])'); await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmlineScenes = true; }")
        st = lambda js: pg.evaluate(f"() => {{ const S = window.helmline.state; return {js}; }}")
        # sail to Lagos and watch her come in
        await pg.evaluate("() => { const S = window.helmline.state; S.ship.fit.mark = 'cross'; S.ship.fit.flags = 'streamers'; window.helmline.setCourse(-8.67, 37.03, 'lagos'); window.helmline.setSpeed(4); }")
        try:
            await pg.wait_for_selector('#scene:not([hidden])', timeout=30000)
        except Exception:
            print('STUCK', await st("({ d: S.ship.docked, r: S.ship.route.length, lon: S.ship.lon, lat: S.ship.lat, day: S.day, dest: S.ship.dest, speed: 0 })"), await pg.evaluate("() => ({ modal: document.querySelector('#modal-title').textContent, hidden: document.querySelector('#modal').hidden, intro: document.querySelector('#intro').hidden })"))
            raise
        await pg.wait_for_timeout(1700); await pg.screenshot(path=f'{OUT}/arrival_lagos_1.png')
        print('during scene: docked', await st("S.ship.docked"), 'toasts shown', await pg.locator('#toast .t').count())
        await pg.wait_for_timeout(2300); await pg.screenshot(path=f'{OUT}/arrival_lagos_2.png')
        await pg.wait_for_selector('#scene', state='hidden', timeout=8000)
        await pg.wait_for_timeout(300)
        print('after: panel open', await pg.is_visible('#panel'), 'toasts shown', await pg.locator('#toast .t').count(), 'called', await st("Object.keys(S.called)"))
        # skip with a tap
        await pg.evaluate("() => window.helmline.scene('lisbon')"); await pg.wait_for_timeout(500)
        await pg.mouse.click(400, 400); await pg.wait_for_selector('#scene', state='hidden', timeout=3000)
        print('skipped with a tap')
        await pg.evaluate("() => { window.helmline.setSpeed(1); window.helmline.scene('lisbon'); }"); await pg.wait_for_timeout(500)
        await pg.evaluate('document.activeElement?.blur()'); await pg.keyboard.press(' '); await pg.wait_for_selector('#scene', state='hidden', timeout=3000)
        print('space skips without pausing:', await pg.evaluate("() => document.querySelector('[data-speed=\"1\"]').classList.contains('on')"), 'register stays shut:', await pg.is_hidden('#yard'))
        # setting: first visits only
        await pg.evaluate("() => { window.helmline.state.settings = { arrivals: 'first' }; }")
        played = await pg.evaluate("() => { window.helmline.state.called.lagos = true; return window.helmline.state.settings.arrivals; }")
        await pg.evaluate("() => { window.helmline.dockAt('lisbon'); window.helmline.setCourse(-8.67, 37.03, 'lagos'); window.helmline.setSpeed(4); }")
        await pg.wait_for_function("() => window.helmline.state.ship.docked === 'lagos'", timeout=60000)
        print('first-visits mode, second call at Lagos: scene shown', await pg.is_visible('#scene'))
        await pg.evaluate("() => { window.helmline.state.settings = { arrivals: 'all' }; }")
        # each harbour
        for pid in ['lisbon', 'funchal', 'lanzarote', 'arguin', 'gambia', 'mina']:
            await pg.evaluate(f"() => window.helmline.scene('{pid}')")
            await pg.wait_for_timeout(4700 if pid == 'lisbon' else 4200)
            await pg.screenshot(path=f'{OUT}/arrival_{pid}.png')
            await pg.keyboard.press('Escape'); await pg.wait_for_selector('#scene', state='hidden', timeout=3000)
        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await pg.evaluate("() => window.helmline.scene('lisbon')"); await pg.wait_for_timeout(4700)
        await pg.screenshot(path=f'{OUT}/arrival_phone.png'); await pg.keyboard.press('Escape')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

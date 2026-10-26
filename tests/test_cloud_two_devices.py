import asyncio, sys, os
from playwright.async_api import async_playwright
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.'); URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        A = await (await b.new_context(viewport={'width':1280,'height':820})).new_page()
        B = await (await b.new_context(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)).new_page()
        errs=[]
        for pg in (A,B): pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda pg, js: pg.evaluate(js)
        # Device A: new game, buy wine, start a cloud save
        await A.goto(URL); await A.click('#intro-new'); await A.wait_for_timeout(300)
        await A.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas: no random corsairs
        await A.click('[data-buy="wine"][data-n="10"]'); await A.click('#modal-ok')
        await A.click('#btn-cloud'); await A.click('[data-cloud-create]'); await A.wait_for_timeout(500)
        code = await J(A, "() => document.getElementById('cloud-code-text')?.textContent")
        print('A started cloud save, code:', code, '| button:', await J(A, "() => document.getElementById('btn-cloud').className"))
        await A.screenshot(path=f'{SP}/25-cloud-panel.png')
        # Device B (phone): load the code from the intro link
        await B.goto(URL); await B.tap('#intro-code'); await B.wait_for_timeout(200)
        await B.fill('#cloud-code', code.lower().replace('-', ' ')); await B.tap('.code-row button'); await B.wait_for_timeout(400)
        print('B load dialog:', await J(B, "() => document.getElementById('modal-title').textContent"))
        await B.tap('#modal-ok'); await B.wait_for_timeout(300)
        print('B wine after load:', await J(B, "() => window.helmline.state.cargo.wine"))
        await B.screenshot(path=f'{SP}/26-phone-loaded.png')
        # B plays on: sail to Lagos, which syncs on docking
        await J(B, "() => { window.helmline.setCourse(-8.67, 37.03, 'lagos'); window.helmline.setSpeed(4); }")
        for _ in range(100):
            if await J(B, "() => window.helmline.state.ship.docked") == 'lagos': break
            await B.wait_for_timeout(200)
        await B.wait_for_timeout(800)
        print('B docked at Lagos, day', await J(B, "() => window.helmline.state.day.toFixed(1)"))
        # A reopens: should offer the newer cloud voyage
        await A.reload(); await A.wait_for_timeout(800)
        print('A intro offers:', await J(A, "() => document.getElementById('intro-cloud').hidden ? null : document.getElementById('intro-cloud').textContent"))
        await A.click('#intro-cloud'); await A.wait_for_timeout(600)
        print('A now at:', await J(A, "() => window.helmline.state.ship.docked"), 'day', await J(A, "() => window.helmline.state.day.toFixed(1)"))
        # Conflict: B keeps playing without syncing (buy cloth), A sails and syncs first
        await J(A, "() => { window.helmline.setCourse(-9.36, 38.6, 'lisbon'); window.helmline.setSpeed(4); }")
        for _ in range(100):
            if await J(A, "() => window.helmline.state.ship.docked") == 'lisbon': break
            await A.wait_for_timeout(200)
        await A.wait_for_timeout(800)
        await J(B, "() => { window.helmline.setCourse(-16.9, 32.6, 'funchal'); window.helmline.setSpeed(4); }")
        for _ in range(150):
            if await J(B, "() => window.helmline.state.ship.docked") == 'funchal': break
            await B.wait_for_timeout(200)
        await B.wait_for_timeout(1000)
        print('B conflict dialog:', await J(B, "() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent"))
        await B.screenshot(path=f'{SP}/27-phone-conflict.png')
        await B.tap('[data-modal-action="keep-local"]'); await B.wait_for_timeout(800)
        print('B kept its voyage; cloud status:', await J(B, "() => document.getElementById('btn-cloud').className"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

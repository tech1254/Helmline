import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':820})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        st = lambda: J("() => { const s = window.helmline.state; return {purse: Math.round(s.purse), hull: s.hull, wine: s.cargo.wine, pir: s.pirates}; }")
        await pg.click('[data-buy="wine"][data-n="10"]'); await pg.click('#modal-ok')
        await J("() => { window.helmline.setCourse(-13.38, 28.92, 'lanzarote'); window.helmline.setSpeed(1); }")
        await pg.wait_for_timeout(1500)
        for choice in ['run', 'fight', 'pay', 'fight']:
            await J("() => window.helmline.encounter(false)"); await pg.wait_for_timeout(300)
            title = await J("() => document.getElementById('modal-title').textContent")
            okHidden = await J("() => document.getElementById('modal-ok').hidden && document.getElementById('modal-cancel').hidden")
            if choice == 'run':
                await pg.screenshot(path=f'{SP}/28-corsairs.png')
                await pg.keyboard.press('Escape'); still = await J("() => !document.getElementById('modal').hidden")
                print('Escape cannot dismiss the encounter:', still)
            await pg.click(f'[data-modal-action="{choice}"]'); await pg.wait_for_timeout(200)
            after = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent + ' | ' + document.getElementById('modal-body').innerText.replace(/\\s+/g, ' ').slice(0, 220)")
            paused = await J("() => document.querySelector('[data-speed=\"0\"]').classList.contains('on')")
            print(f'{title} [ok/cancel hidden: {okHidden}] -> {choice}: paused={paused} | {after} | {await st()}')
            if not paused or not after: errs.append(f'no pause after {choice}')
            if choice == 'pay':
                await pg.click('[data-modal-action="back"]'); await pg.wait_for_timeout(200)
                print('  turn back ->', await J("() => document.getElementById('modal-title').textContent"))
                await pg.click('#modal-cancel'); await pg.wait_for_timeout(100)
                await J("() => window.helmline.setSpeed(1)")
            else:
                await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
                resumed = await J("() => !document.querySelector('[data-speed=\"0\"]').classList.contains('on')")
                print('  hold course resumes:', resumed)
                if not resumed: errs.append('Hold course did not resume')
        # natural encounters: high notoriety, sail through Barbary waters
        await J("() => { const s = window.helmline.state; s.pirates.notoriety = 60; s.pirates.cooldown = 0; window.helmline.setSpeed(4); }")
        seen = 0
        for _ in range(150):
            if await J("() => !document.getElementById('modal').hidden"):
                if await J("() => !!document.querySelector('[data-modal-action=\"pay\"]')"):
                    seen += 1; await pg.click('[data-modal-action="pay"]')
                else:
                    await pg.click('#modal-ok')
            if await J("() => window.helmline.state.ship.docked") == 'lanzarote': break
            await pg.wait_for_timeout(200)
        print('natural encounters on the way:', seen, '| docked:', await J("() => window.helmline.state.ship.docked"))
        # repair: sail to Funchal (a repair port)
        await J("() => { window.helmline.state.hull = 60; window.helmline.state.purse = 800; window.helmline.state.pirates.notoriety = 0; window.helmline.state.pirates.caution = 100; window.helmline.setCourse(-16.9, 32.6, 'funchal'); window.helmline.setSpeed(4); }")
        for _ in range(150):
            if await J("() => window.helmline.state.ship.docked") == 'funchal': break
            if await J("() => !document.getElementById('modal').hidden"):
                await pg.click('[data-modal-action="pay"]' if await J("() => !!document.querySelector('[data-modal-action=\"pay\"]')") else '#modal-ok')
            await pg.wait_for_timeout(200)
        btn = await pg.query_selector('[data-repair]'); print('repair button:', await btn.inner_text() if btn else None)
        await pg.screenshot(path=f'{SP}/29-repair.png')
        if btn: await btn.click(); print('after repair:', await st())
        await pg.click('#btn-prices'); print('ledger name at sea:', await J("() => [...document.querySelectorAll('#panel h3')].find(h => h.textContent.includes('name at sea')).nextElementSibling.textContent"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

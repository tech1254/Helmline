import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':820})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 10; s.purse = 3000; }")
        await pg.click('#btn-fleet'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await pg.select_option('[data-stop-i="1"] [data-f="port"]', 'funchal'); await pg.wait_for_timeout(60)
        await pg.click('[data-route]'); await pg.wait_for_timeout(200)
        await pg.click('[data-tab="contracts"]'); await pg.click('[data-accept]'); await pg.wait_for_timeout(200)
        state = lambda: J("() => { const s = window.helmline.state; const c = s.contracts.active.find(c => c.kind === 'deliver'); return {day: Math.round(s.day), dueInDays: c ? Math.round(c.deadline - s.day) : null, contracts: s.contracts.active.length, loyalty: Math.round(s.fleet.ships[0].captain.loyalty), standing: s.contracts.standing}; }")
        print('before:', await state())
        for label, minutes in [('8 h asleep', 480), ('9 h at work', 540), ('20 h away', 1200), ('30 h away', 1800)]:
            r = await J(f"() => window.helmline.away({minutes})"); await pg.wait_for_timeout(300)
            body = await J("() => document.getElementById('modal').hidden ? '' : [...document.querySelectorAll('#modal-body .fine, #modal-body .warn')].map(e => e.innerText).join(' / ')")
            print(f'{label}: {r} -> {await state()}'); print('   summary notes:', body)
            if label == '9 h at work': await pg.screenshot(path=f'{SP}/34-away-work.png')
            await pg.click('#modal-ok')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

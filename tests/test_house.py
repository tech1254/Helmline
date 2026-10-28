# Your house: prestige spending in Lisbon. Things are bought in order of their needs, titles
# follow, upkeep is charged, and a loan to the crown is repaid (or put off) year by year.
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
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.day = window.helmline.yearDay(1505) + 100; s.purse = 400000; s.contracts.standing = 50; s.contracts.unlocked = true; window.helmline.setSpeed(0); window.helmline.dockAt('lisbon'); }")
        for _ in range(4):
            if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        btn = await J("() => document.querySelector('[data-house]')?.textContent || null")
        print('house button:', btn)
        if not btn: errs.append('no House button in Lisbon')
        await pg.click('[data-house]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/house-1.png')
        # the commandery needs the place at court, which needs the knighthood
        dis = await J("() => document.querySelector('[data-modal-action=\"buy-commandery\"]').disabled")
        print('commandery locked at first:', dis)
        if not dis: errs.append('commandery not locked behind its needs')
        for item in ['townhouse', 'knighthood', 'fidalgo', 'commandery', 'chapel', 'loan']:
            await pg.click(f'[data-modal-action="buy-{item}"]'); await pg.wait_for_timeout(100)
            await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
        h = await J("() => { const s = window.helmline.state; return { renown: s.house.renown, owned: s.house.owned, purse: Math.round(s.purse), loans: s.house.loans.length }; }")
        print('after buying:', h)
        await pg.screenshot(path=f'{SP}/house-2.png')
        title = await J("() => document.getElementById('modal-body').innerText.match(/Title\\s+([^\\n]+)/)?.[1]")
        print('title:', title)
        if title != 'Commander of the Order of Christ': errs.append(f'wrong title: {title}')
        if h['renown'] != 5 + 10 + 20 + 40 + 20 + 8: errs.append('renown does not add up')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        # three years pass: upkeep is charged; the crown repays (or puts off) the loan
        before = await J("() => window.helmline.state.purse")
        await J("() => window.helmline.advance(3 * 365 + 5)")
        for _ in range(5):
            if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        lines = await J("() => [...window.helmline.state.accounts.entries].filter((e) => e.kind === 'house').map((e) => `${Math.round(e.amount)} ${e.text}`)")
        repaid = [l for l in lines if 'repays' in l]
        upkeep = [l for l in lines if 'upkeep' in l]
        print('repayments:', repaid, '| upkeep lines:', len(upkeep))
        if not upkeep: errs.append('no upkeep charged')
        if not repaid and 'put off' not in str(await J("() => window.helmline.state.log || ''")): print('  (the crown put off every repayment: possible, 1 in 125)')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

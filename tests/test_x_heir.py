# Expansion: your heir (x/heir.js). The founder is 25 in 1451; at 28 matches are proposed in
# Lisbon (a merchant's dowry, a noble name, a rival house as kin); children are born; at fourteen
# a child is placed (at sea, the counting house, court); in old age the house is handed on, and
# the house panel shows the family and its history.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(12):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro', state='visible')
        await pg.click('#intro-new'); await pg.wait_for_timeout(200)
        if await J("() => !document.getElementById('intro-nation').hidden"):
            await pg.click('#intro-nation [data-nation="portugal"]'); await pg.wait_for_timeout(1200)
        await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; }")
        age = await J("() => import('./js/x/heir.js').then((H) => H.family(window.helmline.state).head.age)")
        print('the founder in 1451:', age)
        if age != 25: errs.append(f'the founder is {age} in 1451')
        # 1455: a match, in Lisbon
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1455) + 10; window.helmline.advance(2); }"); await ok_modals(pg)
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-heir-match]')"): errs.append('no match offered in Lisbon at 29')
        else:
            await J("() => document.querySelector('[data-heir-match]').scrollIntoView()")
            await pg.click('[data-heir-match]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{SP}/x-heir-1-match.png')
            p0 = await J("() => window.helmline.state.purse")
            await pg.click('[data-modal-action="merchant"]'); await pg.wait_for_timeout(300); await ok_modals(pg)
            m = await J("() => [window.helmline.state.x.heir.spouse?.name, window.helmline.state.purse]")
            print('married:', m, 'dowry', m[1] - p0)
            if not m[0] or m[1] - p0 < 2999: errs.append(f'the match did not take: {m}')
        # the years pass: children
        await J("() => import('./js/x/heir.js').then((H) => { const s = window.helmline.state; const h = H.ensure(s); h.children.push({ name: 'Rui', born: s.day - 14.2 * 365.25, sex: 'm' }); })")
        await J("() => { window.helmline.advance(400); }"); await ok_modals(pg)
        kids = await J("() => window.helmline.state.x.heir.children.length")
        print('children:', kids)
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-heir-place]')"): errs.append('no child to place at fourteen')
        else:
            await J("() => document.querySelector('[data-heir-place]').scrollIntoView()")
            await pg.click('[data-heir-place]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{SP}/x-heir-2-place.png')
            await pg.click('[data-modal-action="court"]'); await pg.wait_for_timeout(300); await ok_modals(pg)
            pl = await J("() => window.helmline.state.x.heir.children.find((c) => c.name === 'Rui')?.place")
            if pl != 'court': errs.append(f'Rui was not placed at court: {pl}')
        # old age: hand the house on
        await J("() => import('./js/x/heir.js').then((H) => { const s = window.helmline.state; const h = H.ensure(s); h.head.born = s.day - 60 * 365.25; const r = h.children.find((c) => c.name === 'Rui'); r.born = s.day - 30 * 365.25; })")
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-heir-hand]')"): errs.append('no hand-over offered at 60')
        else:
            st0 = await J("() => window.helmline.state.contracts.standing")
            await J("() => document.querySelector('[data-heir-hand]').scrollIntoView()")
            await pg.click('[data-heir-hand]'); await pg.wait_for_timeout(300); await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
            h = await J("() => [window.helmline.state.x.heir.head.name, window.helmline.state.x.heir.head.gen, window.helmline.state.contracts.standing]")
            print('after the hand-over:', h, 'standing +', h[2] - st0)
            if h[0] != 'Rui' or h[1] != 2 or h[2] - st0 < 15: errs.append(f'the house did not pass to Rui: {h}')
        box = await J("() => window.helmline.xv('heir').houseBox()")
        if 'Rui' not in box or 'handed the house on' not in box: errs.append('the house panel does not show the family')
        await J("() => window.helmline.panel('houses')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/x-heir-3-house.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

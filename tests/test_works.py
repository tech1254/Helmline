# Port works (phase 3): in a port you trade with you can build a quay, a warehouse, a trading post
# (the feitoria), a fort, a shipyard and a church; each takes weeks, costs upkeep monthly, raises
# your share of the port's trade and does its own work: the warehouse stores cargo, the quay
# takes any draught, the fort keeps corsairs off, the shipyard refits, the trading post earns.
# Unpaid upkeep leaves a building neglected. Desktop and phone.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(6):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        W = "import('./js/works.js')"
        await pg.goto(URL); await pg.wait_for_timeout(400); await J("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('#intro-new'); await pg.wait_for_timeout(500); await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.voyages = 3; s.purse = 40000; s.contracts.unlocked = true; s.contracts.standing = 50; }")
        await J("() => window.helmline.dockAt('porto')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel(null); window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-tab=\"works\"]')"): errs.append('no Port works button in the market')
        await J("() => document.querySelector('[data-tab=\"works\"]').click()"); await pg.wait_for_timeout(300)
        offered = await J("() => [...document.querySelectorAll('[data-build]')].map((b) => b.dataset.build)")
        print('can build in Porto:', offered)
        if set(offered) != {'quay', 'warehouse', 'post', 'fort', 'yard', 'church'}: errs.append(f'not every building offered: {offered}')
        share0 = await J("() => import('./js/houses.js').then((H) => H.shares(window.helmline.state, 'porto').you)")
        for bid in ('warehouse', 'quay', 'fort', 'yard', 'post'):
            await J(f"() => document.querySelector('[data-build=\"{bid}\"]').click()"); await pg.wait_for_timeout(200); await ok_modals(pg); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/works-1-building.png')
        state = await J(f"() => {W}.then((M) => M.list(window.helmline.state).map((b) => [b.id, b.done]))")
        print('works in Porto:', state)
        if len(state) != 5: errs.append(f'not all built: {state}')
        # four months on, all finished
        purse0 = await J("() => window.helmline.state.purse")
        await J("() => window.helmline.advance(125)"); await ok_modals(pg)
        done = await J(f"() => {W}.then((M) => ['warehouse','quay','fort','yard','post'].map((id) => M.has(window.helmline.state, 'porto', id)))")
        print('finished after four months:', done)
        if not all(done): errs.append('the works were not finished after four months')
        tot = await J("() => window.helmline.state.accounts.totals")
        print('upkeep paid', tot.get('works'), 'post earned', tot.get('post'))
        if not tot.get('works') or tot['works'] >= 0: errs.append('no upkeep was paid')
        if not tot.get('post') or tot['post'] <= 0: errs.append('the trading post earned nothing')
        share1 = await J("() => import('./js/houses.js').then((H) => H.shares(window.helmline.state, 'porto').you)")
        print('your share of Porto', share0, '->', share1, await J("() => JSON.stringify({you: window.helmline.state.houses.you, held: window.helmline.state.houses.held, h: window.helmline.state.houses.h})"))
        if not (share1 > share0 + 0.1): errs.append(f'building did not raise your share ({share0} -> {share1})')
        # the fort keeps corsairs off nearby; the shipyard refits
        damp = await J(f"() => {W}.then((M) => [M.corsairDamp(window.helmline.state, -9.5, 41.5), M.corsairDamp(window.helmline.state, -9.5, 30)])")
        if damp != [0.35, 1]: errs.append(f'the fort does not keep corsairs off: {damp}')
        yard = await J(f"() => {W}.then((M) => M.isYard(window.helmline.state, 'porto'))")
        if not yard: errs.append('Porto has no shipyard of yours')
        # the warehouse: store and take
        await J("() => { const s = window.helmline.state; s.cargo.wine = 20; s.paid.wine = 200; }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('works'); }"); await pg.wait_for_timeout(300)
        await J("() => document.querySelector('[data-store=\"wine\"]').click()"); await pg.wait_for_timeout(200)
        st = await J(f"() => [window.helmline.state.cargo.wine, {W}.then((M) => M.storedUnits(window.helmline.state, 'porto'))]")
        stored = await J(f"() => {W}.then((M) => M.storedUnits(window.helmline.state, 'porto'))")
        print('after storing: hold', st[0], 'warehouse', stored)
        if st[0] != 0 or stored != 20: errs.append('storing did not move the wine')
        await pg.screenshot(path=f'{SP}/works-2-warehouse.png')
        await J("() => document.querySelector('[data-take=\"wine\"]').click()"); await pg.wait_for_timeout(200)
        back = await J("() => [window.helmline.state.cargo.wine, Math.round(window.helmline.state.paid.wine)]")
        if back != [20, 200]: errs.append(f'taking did not bring the wine back with its cost: {back}')
        # the quay: a laden nau stays alongside
        await J("() => { const s = window.helmline.state; s.ship.hull = 'nau'; s.cargo.salt = 150; s.ship.offshore = false; }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        await J("() => document.querySelector('[data-buy=\"wine\"][data-n=\"10\"]')?.click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
        off = await J("() => window.helmline.state.ship.offshore")
        if off: errs.append('the nau anchored off despite your quay')
        # neglect when the money runs out
        await J("() => { window.helmline.state.purse = 0; window.helmline.advance(31); }"); await ok_modals(pg)
        neg = await J(f"() => {W}.then((M) => M.has(window.helmline.state, 'porto', 'fort'))")
        if neg: errs.append('an unpaid fort still works')
        # the chart: the gold blocks under Porto
        await J("() => { window.helmline.state.purse = 5000; window.helmline.panel(null); document.getElementById('tip').hidden = true; window.helmline.look(-8.6, 41.1, 1.5); }")
        await pg.mouse.move(640, 430); await pg.mouse.wheel(0, -1); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{SP}/works-3-chart.png')
        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await J("() => { window.helmline.panel(null); window.helmline.panel('works'); }"); await pg.wait_for_timeout(300)
        wide = await J("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        if wide: errs.append('the works view scrolls sideways on a phone')
        await pg.screenshot(path=f'{SP}/works-4-phone.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

# Rival houses (phase 2): the Salvago and the Santángel trade from the start (the Gomes instead
# of the Santángel for Castile); the Houses of the Sea ledger ranks everyone; the market says
# who holds a port's trade, and trading there raises your share until you lead it (a gold ring
# on the chart); their ships sail between their ports; a house can be bought out once you are
# worth twice as much. Cargo worked alongside a quay takes days.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(6):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def start(b, errs, nation=None):
    pg = await b.new_page(viewport={'width': 1280, 'height': 860})
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '').split('\n')[1:3].__str__()))
    if nation: await pg.add_init_script("window.helmlineNations = true;")
    await pg.goto(URL); await pg.wait_for_timeout(400); await pg.evaluate("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.click('#intro-new'); await pg.wait_for_timeout(500)
    if nation:
        await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1000)
    await ok_modals(pg)
    await pg.evaluate("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.voyages = 1; }")
    return pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await start(b, errs)
        J = lambda js: pg.evaluate(js)
        H = "import('./js/houses.js')"
        rows = await J(f"() => {H}.then((M) => M.ledger(window.helmline.state).map((r) => [r.id, Math.round(r.worth), r.ships]))")
        print('ledger:', rows)
        ids = [r[0] for r in rows]
        if not {'you', 'salvago', 'santangel'} <= set(ids) or 'gomes' in ids: errs.append(f'wrong houses for Portugal: {ids}')
        # the Houses tab
        await J("() => { window.helmline.panel(null); window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        line = await J("() => document.querySelector('#panel p.shares')?.innerText || ''")
        print('market line:', line)
        if 'Salvago' not in line: errs.append('the market does not say who trades in Lisbon')
        await J("() => document.querySelector('[data-tab=\"houses\"]').click()"); await pg.wait_for_timeout(300)
        table = await J("() => [...document.querySelectorAll('table.houses tbody tr:not(.act)')].map((r) => r.innerText.replace(/\\s+/g, ' ').slice(0, 60))")
        print('Houses of the Sea:', table)
        if len(table) < 3: errs.append('the Houses of the Sea ledger is missing rows')
        await pg.screenshot(path=f'{SP}/houses-1-ledger.png')
        # their ships at sea
        vs = await J(f"() => {H}.then((M) => M.vessels(window.helmline.state).map((v) => [v.house, v.from, v.to]))")
        print('their ships:', vs)
        if len(vs) < 4: errs.append('the rival houses have no ships at sea')
        # trade in Lisbon for a few months: your share grows until you lead the port
        before = await J(f"() => {H}.then((M) => M.shares(window.helmline.state, 'lisbon').you)")
        for m in range(6):
            await J(f"() => {H}.then((M) => {{ M.noteTrade(window.helmline.state, 'lisbon', 2500); }})")
            await J("() => window.helmline.advance(30)"); await ok_modals(pg)
        after = await J(f"() => {H}.then((M) => [M.shares(window.helmline.state, 'lisbon').you, M.leader(window.helmline.state, 'lisbon')])")
        print('your share of Lisbon:', round(before, 2), '->', [round(after[0], 2), after[1]])
        if after[0] <= before or after[1] != 'you': errs.append(f'trading did not win you Lisbon: {after}')
        # buy out a house: not while it is young (its founders will not sell for ten years)
        await J("() => { const s = window.helmline.state; s.purse = 200000; }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('houses'); }"); await pg.wait_for_timeout(300)
        if await J("() => !!document.querySelector('[data-buyout=\"santangel\"]')"): errs.append('a house in its first ten years can be bought out')
        await J("() => { const s = window.helmline.state; s.day = Math.max(s.day, window.helmline.yearDay(1462)); }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('houses'); }"); await pg.wait_for_timeout(300)
        btn = await J("() => !!document.querySelector('[data-buyout=\"santangel\"]')")
        if not btn: errs.append('no buy-out offered for a much smaller house')
        else:
            await J("() => document.querySelector('[data-buyout=\"santangel\"]').click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
            st = await J("() => window.helmline.state.houses.h.santangel.status")
            held = await J("() => window.helmline.state.houses.held.valencia || 0")
            print('Santángel:', st, 'your hold in Valencia', round(held, 2))
            if st != 'bought' or held <= 0: errs.append('the buy-out did not take')
        await pg.screenshot(path=f'{SP}/houses-2-bought.png')
        # cargo alongside takes days
        await J("() => { const s = window.helmline.state; s.ship.boats = null; s.ship.offshore = false; }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        await J("() => document.querySelector('[data-buy=\"wine\"][data-n=\"10\"]')?.click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
        boats = await J("() => window.helmline.state.ship.boats")
        print('quay work:', boats)
        if not boats or not boats.get('quay') or boats['total'] != 10: errs.append(f'buying did not set the quay to work: {boats}')
        d0 = await J("() => window.helmline.state.day")
        await J("() => window.helmline.sail('porto')"); await ok_modals(pg)
        await J("() => window.helmline.sailFor(0.05)")
        d1 = await J("() => window.helmline.state.day")
        print('days passed loading before sailing:', round(d1 - d0, 2))
        if d1 - d0 < 0.2: errs.append('loading took no time')
        # the chart: rings and their ships
        await J("() => { window.helmline.panel(null); document.getElementById('tip').hidden = true; window.helmline.look(-4, 38, 0.5); }")
        await pg.mouse.move(640, 430); await pg.mouse.wheel(0, -1); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{SP}/houses-3-chart.png')
        await pg.close()
        # Castile: the Gomes of Lisbon, not the Santángel
        pc = await start(b, errs, 'castile')
        rows = await pc.evaluate(f"() => {H}.then((M) => M.ledger(window.helmline.state).map((r) => r.id))")
        print('Castile ledger:', rows)
        if 'gomes' not in rows or 'santangel' in rows: errs.append(f'wrong houses for Castile: {rows}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

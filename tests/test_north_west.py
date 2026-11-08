# The chart grown north and west (Nov 2026): the northern markets, the western Mediterranean and
# the Barbary coast are known from the start; Flores, Cape Verde, Newfoundland and the Caribbean
# are found by sailing there. A ship sails to Bruges and can buy a holk in its yard; salt cod is
# traded; an older save gains the new ports and lands. History's discovery of Flores (1452) says
# so when you found it first.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(6):
        if await pg.evaluate("() => !document.getElementById('modal').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_timeout(500); await J("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; document.getElementById('intro').hidden = true; }")
        known = await J("() => { const s = window.helmline.state; return ['bruges','antwerp','bristol','galway','valencia','genoa','sale','algiers','angra','flores','ribeiragrande','stjohns','santodomingo'].map((p) => [p, !!s.discovered[p]]); }")
        print('known at the start:', known)
        want = {'bruges': True, 'genoa': True, 'algiers': True, 'angra': True, 'flores': False, 'stjohns': False, 'santodomingo': False}
        for pid, v in known:
            if pid in want and v != want[pid]: errs.append(f'{pid} known={v}, expected {want[pid]}')
        sighted = await J("() => window.helmline.state.sighted")
        if not sighted.get('britain') or sighted.get('newfoundland'): errs.append(f'lands known at the start are wrong: {sighted}')
        # salt cod: a good in every port, cheap in Bristol
        fish = await J("() => { const m = window.helmline.market(); return { bristol: m.buyPrice('bristol', 'fish'), lisbon: m.sellPrice('lisbon', 'fish'), sells: m.sells('bristol', 'fish') }; }")
        print('salt cod:', fish)
        if not fish['sells'] or fish['bristol'] >= fish['lisbon']: errs.append(f'salt cod does not pay Bristol to Lisbon: {fish}')
        # a caravel sails to Bruges
        await J("() => { const s = window.helmline.state; s.ship.hull = 'caravel'; s.purse = 9000; s.contracts.unlocked = true; s.contracts.standing = 40; }")
        ok = await J("() => window.helmline.sail('bruges')")
        if not ok: errs.append('no course to Bruges')
        await ok_modals(pg)
        at = None
        for _ in range(30):
            at = await J("() => window.helmline.sailFor(2)"); await ok_modals(pg)
            if at and at != 'lisbon': break
        days = await J("() => window.helmline.state.day")
        print('arrived:', at, 'day', round(days))
        if at != 'bruges': errs.append(f'did not reach Bruges ({at})')
        if days > 40: errs.append(f'Lisbon to Bruges took {days} days')
        # the holk in the Bruges yard
        await J("() => { window.helmline.ui.arrival = null; }")
        await J("() => import('./js/shipyard.js').then((m) => m.openShips('yard'))"); await pg.wait_for_timeout(300)
        await J("() => document.querySelector('[data-yard-tab=\"new\"]')?.click()"); await pg.wait_for_timeout(300)
        offered = await J("() => [...document.querySelectorAll('#yard .hull-card h4')].map((h) => h.textContent)")
        print('the Bruges yard offers:', offered)
        if not any('Holk' in x for x in offered): errs.append('no holk in the Bruges yard')
        await pg.screenshot(path=f'{SP}/northwest-1-yard.png')
        btn = await J("() => { const b = document.querySelector('[data-trade-up=\"holk\"]'); return b ? (b.disabled ? 'disabled' : 'ok') : document.querySelector('#yard .hull-card .row')?.innerText; }")
        print('trade-up button:', btn)
        await J("() => document.querySelector('[data-trade-up=\"holk\"]')?.click()"); await pg.wait_for_timeout(300); await ok_modals(pg)
        hull = await J("() => window.helmline.state.ship.hull")
        print('flagship now:', hull)
        if hull != 'holk': errs.append(f'could not buy the holk ({hull})')
        await J("() => document.querySelector('#yard .yard-close')?.click()"); await pg.wait_for_timeout(200)
        # Flores, found before Diogo de Teive (1452)
        await J("() => { const s = window.helmline.state; s.day = 30; window.helmline.reveal(-31.15, 39.42); }")
        await J("() => { const p = window.helmline.ports.find((x) => x.id === 'flores'); window.helmline.reveal(p.lon, p.lat); }")
        # revealAt with quiet=true does not chart ports: chart it as sailing would
        await J("() => { window.helmline.state.discovered.flores = true; window.helmline.advance(400); }"); await ok_modals(pg)
        logged = await J("() => (window.helmline.state.log || []).map((l) => l.text || l).join(' | ')")
        if 'your charts had Flores and Corvo first' not in logged: errs.append('history did not say you found Flores first')
        # an older save: the new ports and lands are added
        await J("() => { const s = window.helmline.state; delete s.discovered.genoa; delete s.sighted.britain; window.helmline.save(); }")
        await pg.reload(); await pg.wait_for_timeout(1200); await ok_modals(pg)
        back = await J("() => { const s = window.helmline.state; return [!!s.discovered.genoa, !!s.sighted.britain]; }")
        if back != [True, True]: errs.append(f'an older save did not gain the new ports and lands: {back}')
        # the chart from Bruges
        await J("() => { document.getElementById('intro').hidden = true; window.helmline.panel(null); document.getElementById('tip').hidden = true; window.helmline.look(2, 50, 0.9); }")
        await pg.mouse.move(640, 430); await pg.mouse.wheel(0, -1); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{SP}/northwest-2-chart.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

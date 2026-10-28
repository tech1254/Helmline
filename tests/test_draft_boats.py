# Draft and ships' boats: a deep ship anchors outside the Arguin banks and works her cargo
# with boats (time passes in port, the boatmen are paid); deep courses keep off the banks; a
# barca goes up the Gambia to Cantor and a nau is refused; a hired nau uses her boats too.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; for (const k in s.discovered) s.discovered[k] = true; s.ship.hull = 'nau'; s.contracts.unlocked = true; s.contracts.standing = 45; }")
        # 1. A nau's course to Arguin keeps off the banks.
        r = await J("""() => { const h = window.helmline; const p = h.state.ship; const a = h.ports.find(x => x.id === 'arguin');
            const plan = h.plan(a.lon, a.lat, 'arguin'); if (!plan) return null;
            let worst = Infinity, lon = p.lon, lat = p.lat;
            for (const [x, y] of plan.route) { for (let t = 0; t <= 1; t += 0.02) worst = Math.min(worst, h.shoal(lon + (x - lon) * t, lat + (y - lat) * t)); lon = x; lat = y; }
            const end = plan.route[plan.route.length - 1]; return { legs: plan.route.length, shoalest: worst, end }; }""")
        print('nau course to Arguin:', r)
        if not r or r['shoalest'] <= 3: errs.append('deep course crosses the banks')
        # 2. At Arguin she lies outside the banks; her boats work a purchase; the boatmen are paid.
        await J("() => window.helmline.dockAt('arguin')")
        st = await J("() => { const s = window.helmline.state.ship; return { offshore: s.offshore, lon: s.lon, lat: s.lat, status: document.getElementById('status').textContent, harbour: document.querySelector('.harbour')?.innerText }; }")
        print('at Arguin:', st)
        if not st['offshore'] or st['lon'] > -17.2: errs.append('nau not anchored outside the banks')
        purse0 = await J("() => window.helmline.state.purse")
        await pg.click('[data-buy="gold"][data-n="10"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        bt = await J("() => ({ boats: window.helmline.state.ship.boats, status: document.getElementById('status').textContent, ledger: window.helmline.state.accounts.entries.filter(e => e.kind === 'boats').map(e => [e.text, Math.round(e.amount)]) })")
        print('after buying 10 gold:', bt)
        if not bt['boats'] or bt['boats']['total'] != 10 or not bt['ledger']: errs.append('no boat work or boatmen fee')
        d0 = await J("() => window.helmline.state.day")
        await J("() => window.helmline.setSpeed(4)")
        for _ in range(60):
            if await J("() => !window.helmline.state.ship.boats"): break
            await pg.wait_for_timeout(250)
        d1 = await J("() => window.helmline.state.day")
        print(f'boats finished after {d1 - d0:.1f} days of game time; status:', await J("() => document.getElementById('status').textContent"))
        if await J("() => !!window.helmline.state.ship.boats"): errs.append('boats never finished')
        await pg.screenshot(path=f'{OUT}/47-boats-arguin.png')
        # 3. Up the Gambia: the nau is refused; a barca goes up to Cantor and docks.
        await J("() => window.helmline.dockAt('gambia')")
        why = await J("() => { const h = window.helmline; const c = h.ports.find(x => x.id === 'cantor'); return h.plan(c.lon, c.lat, 'cantor') ? 'planned' : h.why(); }")
        print('nau to Cantor:', why[:140])
        if 'channel' not in why: errs.append('nau not refused the river')
        await J("() => { const s = window.helmline.state; s.ship.hull = 'barca'; s.cargo.gold = 0; }")
        rv = await J("() => { const h = window.helmline; const c = h.ports.find(x => x.id === 'cantor'); const plan = h.plan(c.lon, c.lat, 'cantor'); return plan && { legs: plan.route.length, river: plan.route.filter(p => p[2] === 1).length }; }")
        print('barca to Cantor:', rv)
        await J("() => { const h = window.helmline; const c = h.ports.find(x => x.id === 'cantor'); h.setCourse(c.lon, c.lat, 'cantor'); h.setSpeed(4); }")
        for _ in range(120):
            if await J("() => window.helmline.state.ship.docked") == 'cantor': break
            if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
            await pg.wait_for_timeout(250)
        at = await J("() => window.helmline.state.ship.docked")
        print('barca docked at:', at, '| market sells gold:', await J("() => !!document.querySelector('[data-buy=\"gold\"]')"))
        if at != 'cantor': errs.append('barca did not reach Cantor')
        await pg.screenshot(path=f'{OUT}/48-cantor.png')
        # 4. A hired nau on Lisbon <-> Arguin works her cargo with boats at Arguin.
        await J("""() => { const h = window.helmline, s = h.state; s.fleet.ships.push({ id: 77, name: 'Bom Jesus', hull: 'nau', captain: { id: 77, name: 'Gil Vaz', nav: 4, trade: 3, wage: 3, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null });
            h.route77(); }""")
        seen = set()
        for _ in range(40):
            await J("() => window.helmline.advance(5)")
            st = await J("() => { const x = window.helmline.state.fleet.ships.find(s => s.id === 77); return x && (x.status + '@' + x.at); }")
            seen.add(st)
            if st and st.startswith('boats@arguin'): break
        print('hired nau states:', sorted(seen))
        if not any(s and s.startswith('boats@arguin') for s in seen): errs.append('hired nau never used her boats at Arguin')
        # 5. The route editor says where a nau must use her boats, and refuses the river.
        notes = await J("""async () => { const panels = await import('/js/panels.js'); const s = window.helmline.state; const ship = s.fleet.ships.find(x => x.id === 77);
            const div = document.createElement('div'); div.innerHTML = panels.routeEditor(ship); return [...div.querySelectorAll('.stop-note')].map(n => n.textContent); }""")
        print('route editor notes for the nau:', notes)
        if not any('anchorage' in n for n in notes): errs.append('no boats note in the route editor')
        problem = await J("""async () => { const a = await import('/js/actions.js'); const s = window.helmline.state; const ship = s.fleet.ships.find(x => x.id === 77);
            return a.routeProblem({ stops: [{ port: 'lisbon', orders: [{ act: 'buy', good: 'best', pct: 100 }, { act: 'sell', good: 'all' }] }, { port: 'cantor', orders: [{ act: 'sell', good: 'all' }] }] }, ship); }""")
        print('nau route to Cantor:', problem)
        if not problem or 'river' not in problem: errs.append('nau route up the river not refused')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

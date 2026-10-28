# The road to the Indies: history opens new ports, the chart reaches the Cape and Brazil, a ship
# sails off its edge to Calicut and comes home, hired captains go too, and a rich captain can
# found a feitoria and buy shares in the India fleet.
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
        await J("() => { const p = window.helmline.state.pirates; if (p) p.cooldown = 1e9; }")
        title = lambda: J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")

        # 1. History: jump to 1499 and let the news come in; the new ports open
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1499) + 120; window.helmline.advance(2); }")
        opened = await J("() => ['mpinda', 'saotome', 'saobras', 'calicut', 'portoseguro'].map((id) => [id, !!window.helmline.state.discovered[id]])")
        print('opened by 1499:', opened)
        if [x for x, v in opened if v] != ['mpinda', 'saotome', 'saobras', 'calicut']: errs.append(f'wrong ports opened by 1499: {opened}')

        # 2. The chart: the far south, with the Cape and the way off the edge
        await J("() => { const s = window.helmline.state; s.ship.hull = 'nau'; s.purse = 60000; s.contracts.standing = 50; s.contracts.unlocked = true; window.helmline.dockAt('saobras'); }")
        for _ in range(3):
            if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await J("() => { window.helmline.setSpeed(0); }")
        await J("() => { window.helmline.state.ui = 0; document.querySelector('[data-close]')?.click(); window.helmline.look(-8, -12, 0.35); }")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/indies-0-south.png')
        await J("() => { const s = window.helmline.state; const F = window.helmline; for (let x = -42; x < 24; x += 1) for (let y = -36; y < 12; y += 1) F.reveal?.(x, y); }")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/indies-0-south-revealed.png')
        await J("() => window.helmline.dockAt('saobras')")
        for _ in range(3):
            if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await pg.screenshot(path=f'{SP}/indies-1-saobras.png')
        print('docked:', await J("() => window.helmline.state.ship.docked"), '| feitoria button:', await J("() => document.querySelector('[data-feitoria]')?.textContent || null"))

        # 3. Off the edge of the chart to Calicut, in July, with the monsoon
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1499) + 185; s.cargo.copper = 30; s.paid.copper = 450; s.cargo.gold = 10; s.paid.gold = 900; }")
        plan = await J("() => window.helmline.sail('calicut')")
        print('a course for the edge:', plan)
        await pg.wait_for_timeout(200)
        if await title(): await pg.click('#modal-ok')
        await J("() => window.helmline.setSpeed(4)")
        t = None
        for _ in range(100):
            t = await title()
            if t and 'Calicut' in t: break
            if t: await pg.click('#modal-ok')
            await pg.wait_for_timeout(150)
        print('at the edge:', t)
        await pg.screenshot(path=f'{SP}/indies-2-edge.png')
        body = await J("() => document.getElementById('modal-body').innerText.replace(/\\s+/g, ' ')")
        print('  ', body[:260])
        if not t or 'Sail on' not in t: errs.append('no offer to sail on for Calicut')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        t = await title(); print('then:', t)
        await pg.screenshot(path=f'{SP}/indies-3-landfall.png')
        if t != 'Landfall on the Malabar coast': errs.append(f'no landfall summary: {t}')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        st = await J("() => { const s = window.helmline.state; return { docked: s.ship.docked, inIndies: s.ship.inIndies, hull: Math.round(s.hull), day: s.day }; }")
        print('in India:', st)
        if st['docked'] != 'calicut': errs.append('not docked at Calicut')
        for _ in range(3):
            if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        await pg.screenshot(path=f'{SP}/indies-4-calicut.png')
        spice = await J("() => { const m = window.helmline.market(); return [m.buyPrice('calicut', 'spices'), m.sellPrice('lisbon', 'spices')]; }")
        print('spices: Calicut buy, Lisbon sell', spice)
        await pg.click('[data-buy="spices"][data-n="max"]'); await pg.wait_for_timeout(100)
        if await title(): await pg.click('#modal-ok')
        print('spices aboard:', await J("() => window.helmline.state.cargo.spices"))

        # 4. Home: the course is planned from the edge, with the months across the ocean first
        await J("() => { const s = window.helmline.state; s.day += 150; }")  # wait for the north-east monsoon
        await J("() => window.helmline.sail('lisbon')")
        await pg.wait_for_timeout(200)
        body = await J("() => document.getElementById('modal-body').innerText.replace(/\\s+/g, ' ')")
        print('set sail for Lisbon:', body[:240])
        if 'Indian Ocean' not in body: errs.append('the home passage is not in the estimate')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        t = await title(); print('then:', t)
        if t != 'The Cape again': errs.append(f'no summary of the passage home: {t}')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        st = await J("() => { const s = window.helmline.state; return { docked: s.ship.docked, inIndies: s.ship.inIndies, route: s.ship.route.length, dest: s.ship.dest?.port }; }")
        print('sailing home:', st)
        if st['inIndies'] or st['dest'] != 'lisbon' or not st['route']: errs.append('not sailing home from the edge')

        # 5. A hired captain on the India run
        r = await J("""() => { const s = window.helmline.state, m = window.helmline.market();
          s.fleet.ships.push({ id: 91, name: 'Bom Jesus', hull: 'nau', captain: { id: 91, name: 'Pêro', nav: 5, trade: 4, wage: 4, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null, hullPct: 100 });
          return true; }""")
        ok = await J("""() => { const s = window.helmline.state; const F = window.helmline;
          const ship = s.fleet.ships.find((x) => x.id === 91);
          s.day = F.yearDay(1501) + 45; // mid-February: the India fleets' season
          return ship.id; }""")
        await J("""() => { const s = window.helmline.state; const ship = s.fleet.ships.find((x) => x.id === 91);
          window.helmlineFleetRoute = { stops: [{ port: 'lisbon', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'copper', pct: 50 }] }, { port: 'calicut', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'spices', pct: 100 }] }], next: 0 }; }""")
        await J("() => window.helmline.fleetRoute(91, window.helmlineFleetRoute)")
        leg = await J("() => { const x = window.helmline.state.fleet.ships.find((y) => y.id === 91); return x.leg && { to: x.leg.to, days: Math.round(x.leg.days), post: x.leg.post, status: x.status }; }")
        print('hired nau bound for Calicut:', leg)
        if not leg or leg['to'] != 'calicut' or not leg['post']: errs.append('hired captain cannot sail for Calicut')
        await J("() => { window.helmline.setSpeed(0); window.helmline.advance(260); }")
        for _ in range(5):
            if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        x = await J("() => { const s = window.helmline.state; const x = s.fleet.ships.find((y) => y.id === 91); return x ? { at: x.at, status: x.status, hold: JSON.stringify(x.hold), trips: x.trips } : 'lost'; }")
        print('a while later:', x, '|', await J("() => { const x = window.helmline.state.fleet.ships.find((y) => y.id === 91); return x ? window.helmline.fleetStatus(91) : ''; }"))

        # 6. Investments in Lisbon: shares in the India fleet
        await J("() => { const s = window.helmline.state; s.ship.route = []; s.ship.dest = null; window.helmline.dockAt('lisbon'); }")
        for _ in range(5):
            if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        btn = await J("() => document.querySelector('[data-shares]')?.textContent || null")
        print('shares button:', btn)
        if not btn: errs.append('no India fleet shares in Lisbon')
        else:
            await pg.click('[data-shares]'); await pg.wait_for_timeout(100); await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
            inv = await J("() => window.helmline.state.invest")
            print('invested:', inv)
            await J("() => { window.helmline.advance(800); }")
            for _ in range(5):
                if await title(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
            print('after the fleet came home:', await J("() => window.helmline.state.invest.fleets.length"), [e['text'] for e in await J("() => window.helmline.state.accounts.entries.filter((e) => e.kind === 'invest')")])
        size = await J("() => localStorage.getItem('helmline-save')?.length || Object.values(localStorage).map((v) => v.length).sort((a, b) => b - a)[0]")
        print('save size:', size)
        if size and size > 200000: errs.append(f'save too big: {size}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

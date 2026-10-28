# Captains who learn: the quay offers mostly green men; a captain gains stars at sea and in the
# market; one who has grown asks for a raise (grant or refuse, in the Fleet panel); a season with
# the pilots at Lagos buys a star, starting when his ship next calls there.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        modal = lambda: J("() => !document.getElementById('modal').hidden")
        async def ok():
            for _ in range(6):
                if await modal(): await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.contracts.unlocked = true; s.contracts.standing = 25; s.tips.off = true; window.helmline.setSpeed(0); }")
        # the quay: many applicants, mostly green, wages by skill
        pool = await J("""() => { const F = window.helmline.state.fleet; const out = []; for (let i = 0; i < 40; i++) { F.candidates = null; out.push(...window.helmline.fleetCandidates()); } return out.map((c) => [c.nav, c.trade, c.wage]); }""")
        green = sum(1 for n, t, w in pool if n + t <= 4) / len(pool)
        print(f'applicants: {len(pool)}, green {green:.0%}, wages {sorted(set(w for *_, w in pool))}, best {max(n + t for n, t, _ in pool)}')
        if not (0.6 < green < 0.9): errs.append('the quay is not mostly green')
        if any(n == 5 or t == 5 for n, t, _ in pool): errs.append('a five-star captain was for hire')
        # hire one through the Fleet panel
        await J("() => { window.helmline.state.fleet.candidates = null; document.getElementById('btn-fleet').click(); }"); await pg.wait_for_timeout(200)
        await pg.click('[data-hire]'); await ok()
        ship = await J("() => { const x = window.helmline.state.fleet.ships[0]; return { id: x.id, cap: { ...x.captain } }; }")
        print('hired:', ship['cap'])
        # he learns: a long tropical passage and a few sales
        await J("""() => { const x = window.helmline.state.fleet.ships[0]; x.captain.nav = 1; x.captain.trade = 1; x.captain.wage = 1; x.captain.worth = 1;
            window.helmline.fleetRoute(x.id, { stops: [{ port: 'lisbon', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'cloth', pct: 100 }] }, { port: 'arguin', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'best', pct: 100 }] }], next: 0 }); }""")
        await J("() => window.helmline.advance(700)"); await ok()
        cap = await J("() => window.helmline.state.fleet.ships[0].captain")
        print('after ~2 years Lisbon-Arguin:', {k: (round(v, 2) if isinstance(v, float) else v) for k, v in cap.items() if k in ('nav', 'trade', 'wage', 'asks', 'loyalty')})
        if cap['nav'] < 2: errs.append('no navigation learned at sea')
        if cap['trade'] <= 1.2: errs.append('no trade learned from sales')
        news = await J("() => window.helmline.state.notices.filter((n) => /has become|asks for a raise/.test(n.html)).map((n) => n.html.replace(/<[^>]+>/g, ''))") if await J("() => !!window.helmline.state.notices") else []
        print('news:', news[:4])
        # a raise: make him good enough to ask, then answer in the Fleet panel
        await J("() => { const c = window.helmline.state.fleet.ships[0].captain; c.asks = null; c.refused = null; c.nav = 3.5; c.trade = 3.2; window.helmline.advance(1); }")
        asks = await J("() => window.helmline.state.fleet.ships[0].captain.asks")
        print('asks:', asks)
        if not asks: errs.append('a grown captain did not ask for a raise')
        await J("() => document.querySelector('#panel [data-tab=\"fleet\"]')?.click() || null"); await J("() => window.helmline.renderPanel?.()")
        await pg.wait_for_timeout(200)
        if not await J("() => !!document.querySelector('[data-raise=\"grant\"]')"):
            await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(200)
        await pg.locator('[data-raise="refuse"]').scroll_into_view_if_needed()
        await pg.screenshot(path=f'{SP}/captains-1-raise.png')
        l0 = await J("() => window.helmline.state.fleet.ships[0].captain.loyalty")
        await pg.click('[data-raise="refuse"]'); await pg.wait_for_timeout(150)
        c = await J("() => window.helmline.state.fleet.ships[0].captain")
        print(f'refused: loyalty {round(l0)} -> {round(c["loyalty"])}, wage {c["wage"]}')
        if not c['loyalty'] < l0 - 15: errs.append('refusing did not cost loyalty')
        # a year later he asks again; this time pay him
        await J("() => window.helmline.advance(370)"); await ok()
        c = await J("() => window.helmline.state.fleet.ships[0].captain")
        if not c.get('asks'): errs.append('he did not ask again a year later')
        else:
            await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(150)
            if not await J("() => !!document.querySelector('[data-raise=\"grant\"]')"): await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(150)
            await pg.click('[data-raise="grant"]'); await pg.wait_for_timeout(150)
            c2 = await J("() => window.helmline.state.fleet.ships[0].captain")
            print('granted: wage', c['wage'], '->', c2['wage'])
            if c2['wage'] != c['asks']['wage']: errs.append('raise not paid')
        # training: order a season with the pilots at Lagos; it starts when she calls there
        await J("""() => { const x = window.helmline.state.fleet.ships[0]; x.captain.nav = 2.3; x.captain.asks = null;
            window.helmline.fleetRoute(x.id, { stops: [{ port: 'lisbon', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'best', pct: 100 }] }, { port: 'lagos', orders: [{ act: 'sell', good: 'all' }, { act: 'buy', good: 'best', pct: 100 }] }], next: 0 }); }""")
        await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(150)
        if not await J("() => !!document.querySelector('[data-train=\"nav\"]')"): await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(150)
        await J("() => document.querySelector('details.train').open = true")
        await pg.screenshot(path=f'{SP}/captains-2-train.png')
        purse0 = await J("() => window.helmline.state.purse")
        await pg.click('[data-train="nav"]'); await pg.wait_for_timeout(150)
        st = None
        for _ in range(60):
            await J("() => window.helmline.advance(2)"); await ok()
            st = await J("() => { const x = window.helmline.state.fleet.ships[0]; return [x.status, x.at, x.trainUntil]; }")
            if st[0] == 'training': break
        print('training:', st, '· status:', await J("() => window.helmline.fleetStatus(window.helmline.state.fleet.ships[0].id)"))
        if st[0] != 'training' or st[1] != 'lagos': errs.append('training did not start at Lagos')
        await J("() => window.helmline.advance(95)"); await ok()
        c = await J("() => [window.helmline.state.fleet.ships[0].captain.nav, window.helmline.state.fleet.ships[0].status]")
        print('after the season: navigation', c[0], '· ship', c[1])
        if c[0] < 3: errs.append('training did not give the next star')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

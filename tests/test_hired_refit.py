# Hired ships at the yards: from the Fleet tab, order a refit (period gear by date: a quadrant in
# 1460, the astrolabe in 1485...) and a new hull, from anywhere; the refit is done at her next yard,
# the hull at Lisbon. New gear is announced at the turn of the year. The new hulls are drawn.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("""() => { const h = window.helmline, s = h.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 20000;
            for (const k in s.discovered) s.discovered[k] = true; s.day = h.yearDay(1486) + 10; s.yardNews = 1486; h.setSpeed(0); }""")
        await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(200)
        await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        sid = await J("() => window.helmline.state.fleet.ships[0].id")
        # she sails Lisbon - Safi; send her off first, so she is away when the orders are placed
        await J(f"() => window.helmline.fleetRoute({sid}, {{ stops: [{{ port: 'safi', orders: [{{ act: 'sell', good: 'all' }}, {{ act: 'buy', good: 'best', pct: 100 }}] }}, {{ port: 'lisbon', orders: [{{ act: 'sell', good: 'all' }}, {{ act: 'buy', good: 'best', pct: 100 }}] }}] }})")
        await J("() => window.helmline.advance(1)")
        await J("() => window.helmline.panel('fleet')"); await pg.wait_for_timeout(200)
        await pg.click(f'[data-ship-yard="{sid}"]'); await pg.wait_for_timeout(250)
        title = await J("() => document.getElementById('modal-title').textContent")
        navs = await J("() => [...document.querySelectorAll('[data-refit=\"nav\"] option')].map((o) => o.textContent + (o.disabled ? ' [x]' : ''))")
        print('dialog:', title, '| navigation:', navs)
        if not any('astrolabe' in n.lower() and '[x]' not in n for n in navs): errs.append('the astrolabe is not offered in 1486')
        if not any('almanac' in n.lower() and '[x]' in n for n in navs): errs.append('Zacuto\'s almanac is offered before 1496')
        await pg.select_option('[data-refit="nav"]', 'astrolabe')
        await pg.select_option('[data-refit="stores"]', 'casks')
        await pg.screenshot(path=f'{SP}/hired-refit-1-dialog.png')
        await pg.click('[data-modal-action="refit"]'); await pg.wait_for_timeout(200)
        o = await J(f"() => window.helmline.state.fleet.ships.find((x) => x.id === {sid}).orders")
        print('orders:', o)
        if not o or o.get('fit', {}).get('nav') != 'astrolabe': errs.append('the refit was not ordered')
        # a new hull too: an urca, built at Lisbon
        await pg.click(f'[data-ship-yard="{sid}"]'); await pg.wait_for_timeout(250)
        has = await J("() => !!document.querySelector('[data-modal-action=\"new-urca\"]')")
        if not has: errs.append('no urca offered in 1486')
        else: await pg.click('[data-modal-action="new-urca"]'); await pg.wait_for_timeout(200)
        await J("() => window.helmline.panel('fleet')"); await pg.wait_for_timeout(150)
        line = await J("() => document.querySelector('[data-ship] p.note')?.innerText || ''")
        print('card:', line)
        if 'Ordered' not in line: errs.append('the orders are not shown on her card')
        await J("() => document.querySelector('[data-ship] p.note')?.scrollIntoView()")
        await pg.screenshot(path=f'{SP}/hired-refit-2-card.png')
        # let her sail: Safi is no yard; back at Lisbon she gets both
        before = await J("() => window.helmline.state.purse")
        for i in range(30):
            await J("() => window.helmline.advance(5)")
            sh = await J(f"() => {{ const x = window.helmline.state.fleet.ships.find((x) => x.id === {sid}); return {{ hull: x.hull, nav: x.fit?.nav, orders: x.orders, at: x.at, status: x.status }}; }}")
            if sh['hull'] == 'urca' and sh['nav'] == 'astrolabe': break
        print('after her call at Lisbon:', sh)
        if sh['hull'] != 'urca': errs.append('the new hull was not built at Lisbon')
        if sh['nav'] != 'astrolabe': errs.append('the refit was not done (the new hull may have lost it: it is done after)')
        # the yards' news at the turn of a year with new gear (1496: the almanac)
        await J("() => { const h = window.helmline, s = h.state; s.day = h.yearDay(1496) + 1; s.yardNews = 1495; h.advance(1); }"); await pg.wait_for_timeout(200)
        news = await J("() => (window.helmline.state.notices || []).map((n) => n.html).filter((t) => t.includes('New at the shipyards')).pop() || ''")
        print('news:', news[:160])
        if 'almanac' not in news: errs.append('no word of new gear at the turn of the year')
        # drawings of the new hulls, for the record
        await J("""async () => { const A = await import('/js/shipart.js'); const d = document.createElement('div'); d.id = 'art'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#efe3c4;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:20px';
            d.innerHTML = [['urca', {}], ['armedcaravel', { guns: 'gunports' }], ['nau', { guns: 'culverins', area: 'topsails' }], ['caravel', { guns: 'falcons', nav: 'quadrant' }]].map(([h, f]) => `<div>${A.shipSVG({ hull: h, fit: f })}<p style="text-align:center;font:16px Georgia">${h} ${Object.values(f).join(', ')}</p></div>`).join(''); document.body.appendChild(d); }""")
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/hired-refit-3-hulls.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

# The wars of the 1490s: the War of the Line (1493-95) comes only if Portugal charted the Indies in
# the west first (or you provoked Castile); otherwise the crisis passes. Service in it moves the
# Line, and with it Santo Domingo's crown. The conquest of Tenerife (1494-96): crown supply
# contracts for Castile out of Seville, wheat dear at La Gomera, news of the campaign, and land
# on Tenerife (a trading post at Santa Cruz) for service.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(8):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def fresh(pg, nation):
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#intro', state='visible')
    await pg.click('#intro-new'); await pg.wait_for_timeout(200)
    if await J("() => !document.getElementById('intro-nation').hidden"):
        await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1200)
    await ok_modals(pg)
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; if (s.story) s.story.off = true; }")

async def to_date(pg, y, m, d):
    await pg.evaluate(f"() => {{ const s = window.helmline.state; const t = window.helmline.yearDay({y}) + Math.round((Date.UTC({y}, {m - 1}, {d}) - Date.UTC({y}, 0, 1)) / 864e5); window.helmline.advance(Math.max(0, t - s.day)); }}")
    await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true;")
        J = lambda js: pg.evaluate(js)

        # 1. Portugal charted the Indies first: the War of the Line, and a far Line at the peace
        await fresh(pg, 'portugal')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1493) + 100; }")
        await J("() => import('./js/race.js').then((R) => { const s = window.helmline.state; R.ensureRace(s); s.race.firsts.santodomingo = { by: 'you', day: s.day }; s.discovered.santodomingo = true; s.war = null; })")
        await to_date(pg, 1493, 6, 3)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('June 1493:', t)
        await pg.screenshot(path=f'{SP}/wars90-1-line.png')
        if not t or 'War with Castile' not in t: errs.append(f'no War of the Line: {t}')
        else: await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await ok_modals(pg)
        cur = await J("() => window.helmline.war().current(window.helmline.state)?.id")
        if cur != 'line': errs.append(f'the current war is {cur}')
        await J("() => window.helmline.war().serve(window.helmline.state, 10)")
        await to_date(pg, 1495, 6, 10); await ok_modals(pg)
        crown = await J("() => window.helmline.law().crownOf('santodomingo', window.helmline.state)")
        print('after Tordesillas, Santo Domingo is', crown)
        if crown != 'portugal': errs.append(f'great service did not move Santo Domingo to Portugal: {crown}')

        # 2. Columbus charted it for Castile, nobody provoked anyone: the crisis passes
        await fresh(pg, 'portugal')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1493) + 100; s.war = null; }")
        await to_date(pg, 1493, 6, 3); await ok_modals(pg)
        cur = await J("() => window.helmline.war().current(window.helmline.state)?.id || null")
        averted = await J("() => !!window.helmline.state.war.averted?.line")
        print('no provocation: current war', cur, 'averted', averted)
        if cur or not averted: errs.append('the War of the Line came without cause')

        # 3. Castile: the conquest of Tenerife
        await fresh(pg, 'castile')
        nation = await J("() => window.helmline.state.nation")
        if nation != 'castile': errs.append(f'not a Castilian game: {nation}')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1494) + 80; s.war = null; }")
        await to_date(pg, 1494, 4, 3); await ok_modals(pg)
        wheat = await J("() => [window.helmline.market().buyPrice('gomera', 'wheat'), window.helmline.market().buyPrice('seville', 'wheat')]")
        print('wheat at La Gomera and Seville:', wheat)
        if wheat[0] < wheat[1] * 1.3: errs.append('wheat is not dear at La Gomera in the campaign')
        done = 0
        for _ in range(3):
            await J("() => window.helmline.dockAt('seville')"); await pg.wait_for_timeout(250); await ok_modals(pg)
            offers = await J("() => window.helmline.offers('seville').filter((o) => o.campaign).map((o) => ({ id: o.id, title: o.title, good: o.good, qty: o.qty, reward: o.reward }))")
            if not offers: errs.append('no campaign contract at Seville'); break
            o = offers[0]; print('offer:', o['title'], o['reward'], 'cz')
            await J(f"() => import('./js/contracts.js').then((C) => {{ const s = window.helmline.state; const c = C.accept(s, {o['id']}, 'seville'); s.cargo['{o['good']}'] = (s.cargo['{o['good']}'] || 0) + {o['qty']}; s.paid['{o['good']}'] = (s.paid['{o['good']}'] || 0) + 100; window._c = c.id; }})")
            await J("() => window.helmline.dockAt('gomera')"); await pg.wait_for_timeout(250); await ok_modals(pg)
            await J("() => import('./js/contracts.js').then((C) => { const s = window.helmline.state; const c = s.contracts.active.find((x) => x.id === window._c); if (c) C.deliver(s, c); })")
            done += 1
        served = await J("() => window.helmline.state.war.campaign?.tenerife || 0")
        print('cargoes for the campaign:', served)
        if served < 3: errs.append(f'campaign service not counted: {served}')
        await pg.screenshot(path=f'{SP}/wars90-2-tenerife.png')
        await to_date(pg, 1496, 10, 2); await ok_modals(pg)
        post = await J("() => !!window.helmline.state.invest?.feitorias?.santacruz")
        print('a trading post granted at Santa Cruz:', post)
        if not post: errs.append('no land on Tenerife for the service')
        await to_date(pg, 1497, 1, 5); await ok_modals(pg)
        if not await J("() => !!window.helmline.state.discovered.santacruz"): errs.append('Santa Cruz did not open in 1497')
        await J("() => window.helmline.dockAt('santacruz')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/wars90-3-santacruz.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

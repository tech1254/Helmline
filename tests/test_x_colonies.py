# Expansion: settling the New World (x/colonies.js). Portugal in 1535: a captaincy sought in
# Lisbon (the site goes on the chart), the settlers landed at Olinda, wheat and wine landed,
# cloth traded with the neighbours, a fort built, the colony's sugar and brazilwood loaded; the
# colony grows over the years and shows in the house panel. Castile's charters open in 1502.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(12):
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
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 30000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; s.ship.hull = 'nau'; }")

async def to_date(pg, y, m, d):
    await pg.evaluate(f"() => {{ const s = window.helmline.state; const t = window.helmline.yearDay({y}) + Math.round((Date.UTC({y}, {m - 1}, {d}) - Date.UTC({y}, 0, 1)) / 864e5); window.helmline.advance(Math.max(0, t - s.day)); }}")
    await pg.wait_for_timeout(300)

async def port_panel(pg):
    await pg.evaluate("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true;")
        J = lambda js: pg.evaluate(js)

        await fresh(pg, 'portugal')
        early = await J("() => window.helmline.x('colonies') && import('./js/x/colonies.js').then((C) => C.sitesOpen(window.helmline.state).length)")
        if early: errs.append(f'captaincies open in 1451: {early}')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1534) + 40; s.war = null; }")
        await to_date(pg, 1535, 3, 1); await ok_modals(pg)
        await J("() => { window.helmline.state.contracts.standing = 40; window.helmline.state.purse = 30000; }")
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await port_panel(pg)
        n = await J("() => document.querySelectorAll('[data-colony-charter]').length")
        print('captaincies offered at Lisbon:', n)
        if n < 3: errs.append(f'too few captaincies offered: {n}')
        await J("() => { const d = document.querySelector('[data-colony-charter]').closest('details'); if (d) d.open = true; }")
        await pg.screenshot(path=f'{SP}/x-colonies-1-charters.png')
        await J("() => document.querySelector('[data-colony-charter=\"olinda\"]').scrollIntoView()")
        await pg.click('[data-colony-charter="olinda"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/x-colonies-2-charter.png')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
        known = await J("() => [!!window.helmline.state.discovered.olinda, !!window.helmline.state.x?.colonies?.charters?.olinda]")
        print('chartered, on the chart:', known)
        if known != [True, True]: errs.append(f'the charter did not take: {known}')
        # sail there: a course is planned
        ok = await J("() => window.helmline.sail('olinda')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        if not ok: errs.append('no course to Olinda')
        await J("() => { const s = window.helmline.state; s.cargo.wheat = 30; s.cargo.wine = 10; s.cargo.cloth = 20; s.paid.wheat = 400; s.paid.wine = 100; s.paid.cloth = 200; window.helmline.dockAt('olinda'); }"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await port_panel(pg)
        await J("() => document.querySelector('[data-colony-found]')?.scrollIntoView()")
        if not await J("() => !!document.querySelector('[data-colony-found]')"): errs.append('no button to land the settlers')
        else:
            await pg.click('[data-colony-found]'); await pg.wait_for_timeout(300); await ok_modals(pg)
        col = await J("() => window.helmline.state.x?.colonies?.c?.olinda || null")
        if not col: errs.append('the colony was not founded')
        else:
            for sel in ('[data-colony-land="wheat"]', '[data-colony-land="wine"]', '[data-colony-gift]'):
                await J(f"() => document.querySelector('{sel}')?.scrollIntoView()")
                await pg.click(sel); await pg.wait_for_timeout(250)
            c2 = await J("() => { const c = window.helmline.state.x.colonies.c.olinda; const s = window.helmline.state; return { stores: c.stores, heart: c.heart, rel: c.relations, wheat: s.cargo.wheat, cloth: s.cargo.cloth }; }")
            print('after landing supplies:', c2)
            if c2['wheat'] or c2['cloth'] or c2['stores'] <= 240 or c2['rel'] <= 55: errs.append(f'supplies did not land: {c2}')
            await J("() => document.querySelector('[data-colony-build=\"fort\"]')?.scrollIntoView()")
            await pg.click('[data-colony-build="fort"]'); await pg.wait_for_timeout(250); await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
            if not await J("() => !!window.helmline.state.x.colonies.c.olinda.built.fort"): errs.append('the fort was not built')
            await pg.screenshot(path=f'{SP}/x-colonies-3-colony.png')
            # the years pass
            await to_date(pg, 1541, 3, 1); await ok_modals(pg)
            grown = await J("() => { const c = window.helmline.state.x.colonies.c.olinda; return { pop: Math.round(c.pop), stock: c.stock, size: window.helmline.state.ports.olinda.size }; }")
            print('six years on:', grown)
            if grown['pop'] <= 70: errs.append(f'the colony did not grow: {grown}')
            await J("() => window.helmline.dockAt('olinda')"); await pg.wait_for_timeout(300); await ok_modals(pg)
            await port_panel(pg)
            await J("() => { const s = window.helmline.state; for (const g of Object.keys(s.cargo)) s.cargo[g] = 0; }")
            await port_panel(pg)
            await J("() => document.querySelector('[data-colony-load]')?.scrollIntoView()")
            await pg.click('[data-colony-load]'); await pg.wait_for_timeout(300)
            got = await J("() => { const s = window.helmline.state; return [s.cargo.sugar, s.cargo.brazilwood]; }")
            print('loaded:', got)
            if not (got[0] or got[1]): errs.append('nothing loaded from the colony')
            await J("() => window.helmline.panel('houses')"); await pg.wait_for_timeout(300)
            hb = await J("() => document.getElementById('panel').textContent.includes('Your colonies')")
            if not hb: print('  (the house panel is not "houses"; checked through the view instead)'); hb = 'Olinda' in await J("() => window.helmline.xv('colonies').houseBox()")
            if not hb: errs.append('the colony is not in the house panel')
            await pg.screenshot(path=f'{SP}/x-colonies-4-house.png')

        # Castile: charters from 1502, on Hispaniola
        await fresh(pg, 'castile')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1503); s.war = null; s.contracts.standing = 40; }")
        await J("() => window.helmline.dockAt('seville')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        ids = await J("() => import('./js/x/colonies.js').then((C) => C.sitesOpen(window.helmline.state).map((s) => s.id))")
        print('Castile in 1503:', ids)
        if ids != ['puertoplata']: errs.append(f'Castile\'s charters in 1503: {ids}')
        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await port_panel(pg); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/x-colonies-5-phone.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

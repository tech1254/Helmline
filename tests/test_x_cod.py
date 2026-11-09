# Expansion: the cod fishery (x/cod.js). From 1500, a ship lying on the Banks in summer with salt
# fills its hold with salt cod (a sack of salt for three barrels); out of season, or without
# salt, it does not. A fishing station at St John's dries cod ashore all season. Salt cod is
# dearest in Lent in the Iberian ports. The Banks are marked on the chart.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(12):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def to_date(pg, y, m, d):
    await pg.evaluate(f"() => {{ const s = window.helmline.state; const t = window.helmline.yearDay({y}) + Math.round((Date.UTC({y}, {m - 1}, {d}) - Date.UTC({y}, 0, 1)) / 864e5); if (t - s.day > 30) s.day = t - 2; window.helmline.advance(Math.max(0, t - s.day)); }}")
    await pg.wait_for_timeout(300)

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
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; s.ship.hull = 'nau'; s.war = null; }")
        await to_date(pg, 1505, 6, 1); await ok_modals(pg)
        # lie on the Banks with salt
        await J("() => { const s = window.helmline.state; for (const g of Object.keys(s.cargo)) s.cargo[g] = 0; s.cargo.salt = 20; s.paid.salt = 100; s.ship.docked = null; s.ship.route = []; s.ship.lon = -50.5; s.ship.lat = 45; s.law.cooldown = 1e9; window.helmline.reveal(-50.5, 45); window.helmline.look(-50.5, 45, 1); }")
        await J("() => window.helmline.advance(8)"); await pg.wait_for_timeout(300)
        c = await J("() => [window.helmline.state.cargo.fish, window.helmline.state.cargo.salt]")
        print('eight days on the Banks:', c)
        if not c[0] or c[1] >= 20: errs.append(f'no fishing on the Banks: {c}')
        await J("() => window.helmline.advance(30)"); await pg.wait_for_timeout(300)
        c2 = await J("() => [window.helmline.state.cargo.fish, window.helmline.state.cargo.salt]")
        print('until the salt is gone:', c2)
        if c2[1] != 0 or c2[0] < 55 or c2[0] > 61: errs.append(f'the salt did not cure three barrels a sack: {c2}')
        await pg.screenshot(path=f'{SP}/x-cod-1-banks.png')
        # out of season
        await J("() => { const s = window.helmline.state; s.cargo.salt = 10; s.cargo.fish = 0; }")
        await to_date(pg, 1505, 12, 1)
        await J("() => { const s = window.helmline.state; s.ship.docked = null; s.ship.route = []; s.ship.lon = -50.5; s.ship.lat = 45; s.cargo.fish = 0; s.cargo.salt = 10; window.helmline.advance(10); }")
        w = await J("() => window.helmline.state.cargo.fish")
        if w: errs.append(f'fishing the Banks in December: {w}')
        # the station
        await J("() => { window.helmline.state.discovered.stjohns = true; window.helmline.dockAt('stjohns'); }"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-cod-station]')"): errs.append('no fishing station to build at St Johns')
        else:
            await J("() => document.querySelector('[data-cod-station]').scrollIntoView()")
            await pg.click('[data-cod-station]'); await pg.wait_for_timeout(250); await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
            await J("() => window.helmline.advance(Math.round(window.helmline.yearDay(1506) + 212 - window.helmline.state.day))"); await ok_modals(pg)
            await J("() => { window.helmline.state.cargo.salt = 0; window.helmline.dockAt('stjohns'); }"); await pg.wait_for_timeout(300); await ok_modals(pg)
            await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
            f0 = await J("() => window.helmline.state.cargo.fish")
            await J("() => document.querySelector('[data-cod-load]')?.scrollIntoView()")
            await pg.click('[data-cod-load]'); await pg.wait_for_timeout(300)
            f1 = await J("() => window.helmline.state.cargo.fish")
            print('loaded from the station:', f1 - f0)
            if f1 - f0 < 50: errs.append(f'the station gave too little: {f1 - f0}')
            await pg.screenshot(path=f'{SP}/x-cod-2-station.png')
        # Lent
        await to_date(pg, 1507, 3, 1)
        lent = await J("() => window.helmline.market().sellPrice ? window.helmline.market().sellPrice('seville', 'fish') : window.helmline.market().buyPrice('seville', 'fish')")
        await to_date(pg, 1507, 6, 1)
        june = await J("() => window.helmline.market().sellPrice ? window.helmline.market().sellPrice('seville', 'fish') : window.helmline.market().buyPrice('seville', 'fish')")
        print('salt cod at Seville in Lent and in June:', lent, june)
        if not lent > june: errs.append(f'salt cod is not dearer in Lent: {lent} {june}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

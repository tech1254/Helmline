"""Ship progression: the register, the shipyard (refits, orders, trading up, delivery) and
hulls for hired captains. Screenshots of each screen, desktop and phone."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1360, 'height': 860})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro:not([hidden])'); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro:not([hidden])'); await pg.click('#intro-new'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { window.helmline.state.pirates.cooldown = 1e9; }")
        st = lambda js: pg.evaluate(f"() => {{ const S = window.helmline.state; return {js}; }}")
        print('new game ship:', await st("({ hull: S.ship.hull, name: S.ship.name, cloth: S.ship.fit.cloth })"), 'hud', await pg.inner_text('#hud-hold'))

        # the register opens with S, and time stands still behind it
        await pg.evaluate('document.activeElement?.blur()'); await pg.keyboard.press('s')
        try:
            await pg.wait_for_selector('#yard:not([hidden]) .register', timeout=4000)
        except Exception:
            print('DEBUG', await pg.evaluate("() => ({ active: document.activeElement?.outerHTML?.slice(0, 80), modal: !document.querySelector('#modal').hidden, title: document.querySelector('#modal-title').textContent, intro: document.querySelector('#intro').hidden, yard: document.querySelector('#yard').hidden, scene: document.querySelector('#scene').hidden })"), errs)
            raise
        d0 = await st("S.day"); await pg.wait_for_timeout(800); d1 = await st("S.day")
        print('register cards:', await pg.locator('.hull-card').count(), 'time frozen:', d0 == d1, 'pencil hulls:', await pg.locator('.hull-card.pencil').count())
        await pg.screenshot(path=f'{OUT}/shipyard_register_start.png')
        await pg.keyboard.press('Escape'); print('closed:', await pg.is_hidden('#yard'))

        # a rich captain in 1472, trusted by the crown
        await pg.evaluate("""() => { const S = window.helmline.state; S.purse = 30000; S.contracts.unlocked = true; S.contracts.standing = 45;
          S.day = window.helmline.yearDay(1472) + 10; S.cargo.wine = 30; S.paid.wine = 300; }""")
        await pg.click('[data-ships="yard"]'); await pg.wait_for_selector('.shipyard')
        await pg.click('[data-yard-tab="rig"]'); await pg.click('[data-opt="cloth:linen"]'); await pg.click('[data-opt="area:bonnets"]')
        await pg.click('[data-yard-tab="arms"]'); await pg.click('[data-opt="guns:bercos"]'); await pg.click('[data-opt="stores:casks"]')
        await pg.click('[data-yard-tab="colours"]'); await pg.click('[data-opt="mark:cross"]'); await pg.click('[data-opt="paint:redlead"]'); await pg.click('[data-opt="flags:streamers"]')
        await pg.screenshot(path=f'{OUT}/shipyard_refit.png')
        before = await st("({ purse: S.purse, day: S.day })")
        await pg.click('[data-yard="commission"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        after = await st("({ purse: S.purse, day: S.day, fit: S.ship.fit })")
        print('refit paid:', round(before['purse'] - after['purse']), 'days in yard:', round(after['day'] - before['day'], 1), 'fit:', after['fit'])
        # a refit may not leave less hold than the cargo aboard
        await pg.evaluate("() => { const S = window.helmline.state; S.ship.fit.stow = 'extra'; S.cargo.wine = 46; }")
        await pg.click('[data-yard-tab="hull"]'); await pg.click('[data-opt="stow:standard"]'); await pg.click('[data-yard="commission"]'); await pg.wait_for_timeout(200)
        print('shrinking the hold below the cargo refused:', await st("S.ship.fit.stow"), 'dialog open', await pg.is_visible('#modal'))
        await pg.evaluate("() => { const S = window.helmline.state; S.cargo.wine = 30; }"); await pg.click('[data-yard="reset"]')
        # square rig: may be ordered from 1470, fitted from 1480
        await pg.click('[data-yard-tab="rig"]'); await pg.click('[data-opt="rig:square"]')
        await pg.click('[data-yard="commission"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        print('rig ordered:', await st("S.yard.orders.map(o => o.choice)"), 'rig now:', await st("S.ship.fit.rig"))
        # a nau on order, then trade up to a barinel meanwhile
        await pg.click('[data-yard-tab="new"]'); await pg.screenshot(path=f'{OUT}/shipyard_new.png')
        await pg.fill('[data-yard-name]', 'Santa Catarina'); await pg.click('[data-order-hull="nau"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await pg.fill('[data-yard-name]', 'São Cristóvão')
        await pg.click('[data-trade-up="barinel"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        print('after trade up:', await st("({ hull: S.ship.hull, cargo: S.cargo.wine, mark: S.ship.fit.mark, guns: S.ship.fit.guns, orders: S.yard.orders.length })"), 'hud', await pg.inner_text('#hud-hold'))
        await pg.click('[data-yard="close"]')
        # four years on: the nau is half built
        await pg.evaluate("() => { const S = window.helmline.state; S.day = window.helmline.yearDay(1476); }")
        await pg.evaluate('document.activeElement?.blur()'); await pg.keyboard.press('s'); await pg.wait_for_selector('.register')
        print('on the stocks:', await pg.locator('.order-card').count(), await pg.locator('.order-card h4').all_inner_texts())
        await pg.screenshot(path=f'{OUT}/shipyard_register_building.png', full_page=False)
        await pg.locator('.orders').scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/shipyard_register_orders.png')
        await pg.keyboard.press('Escape')
        # 1480: delivery
        await pg.evaluate("() => { const S = window.helmline.state; S.day = window.helmline.yearDay(1480) + 2; window.helmline.advance(1); }")
        print('told:', await st("S.yard.orders.map(o => !!o.told)"))
        await pg.click('[data-ships="yard"]'); await pg.wait_for_selector('.banner.ready')
        await pg.screenshot(path=f'{OUT}/shipyard_delivery.png')
        purse = await st("S.purse")
        await pg.click('[data-deliver-order="1"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        print('delivered:', await st("({ hull: S.ship.hull, name: S.ship.name, orders: S.yard.orders.length })"), 'paid', round(purse - await st("S.purse")))
        purse = await st("S.purse")
        await pg.click('[data-deliver-order="0"]'); await pg.wait_for_timeout(200)
        print('rig order on a nau refunded:', round(await st("S.purse") - purse), 'orders left', await st("S.yard.orders.length"))
        await pg.click('[data-yard-tab="arms"]'); await pg.click('[data-opt="guns:bombards"]'); await pg.click('[data-yard-tab="colours"]'); await pg.click('[data-opt="stern:carved"]')
        await pg.click('[data-yard="commission"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        print('nau fitted:', await st("({ guns: S.ship.fit.guns, stern: S.ship.fit.stern })"), 'stats', await pg.evaluate("() => document.querySelector('.ship-stats').innerText.replace(/\\n/g,' | ')"))
        await pg.screenshot(path=f'{OUT}/shipyard_nau.png')
        await pg.click('[data-yard="close"]')

        # a barca for a hired captain
        await pg.evaluate("() => { window.helmline.state.fleet.candidates = null; }")
        await pg.click('#btn-fleet'); await pg.click('[data-hire-hull="barca"]'); await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        print('hired:', await st("S.fleet.ships.map(x => ({ name: x.name, hull: x.hull }))"))
        await pg.screenshot(path=f'{OUT}/shipyard_fleet.png')

        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800}); await pg.wait_for_timeout(200)
        await pg.evaluate("() => { document.querySelector('#panel [data-close]')?.click(); }")
        await pg.evaluate('document.activeElement?.blur()'); await pg.keyboard.press('s'); await pg.wait_for_selector('.register'); await pg.screenshot(path=f'{OUT}/shipyard_phone_register.png')
        await pg.click('[data-yard="open-yard"]'); await pg.wait_for_selector('.shipyard'); await pg.screenshot(path=f'{OUT}/shipyard_phone_yard.png')
        wide = await pg.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
        print('phone fits width:', wide)
        await pg.click('[data-yard="close"]')

        # an old save with no ship details loads as a lateen caravel
        await pg.evaluate("""() => { const raw = JSON.parse(localStorage.getItem('helmline-proto0-v1')); delete raw.S.ship.hull; delete raw.S.ship.fit; delete raw.S.ship.name; delete raw.S.yard;
          for (const x of raw.S.fleet.ships) delete x.hull; localStorage.setItem('helmline-proto0-v1', JSON.stringify(raw));
          Storage.prototype.setItem = () => {}; }""")  # so the save on unload does not overwrite it
        await pg.reload(); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
        print('old save:', await st("({ hull: S.ship.hull, name: S.ship.name, rig: S.ship.fit.rig, fleet: S.fleet.ships.map(x => x.hull) })"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

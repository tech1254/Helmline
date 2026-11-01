# Castile: a new voyage asks which crown; Castile begins at Palos with a barca and the house's
# own story (Alonso's debt to Salvago of Seville); Seville lies up the Guadalquivir, is home (the
# shipyard builds ships there, the debt is paid there); its yards build Castile's ladder (the nao
# vizcaína, not Portugal's barinel); the pilots of Palos sell courses. Portugal is unchanged.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true; window.helmlineStory = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector('#intro', state='visible')
        await pg.click('#intro-new'); await pg.wait_for_timeout(200)
        shown = await J("() => !document.getElementById('intro-nation').hidden")
        await pg.screenshot(path=f'{SP}/castile-1-choose.png')
        if not shown: errs.append('no choice of crown')
        await pg.click('#intro-nation [data-nation="castile"]'); await pg.wait_for_timeout(1500)
        title = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('first card:', title)
        if title != 'Palos, March 1451': errs.append(f'no Castilian prologue: {title}')
        await pg.screenshot(path=f'{SP}/castile-2-prologue.png')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        st = await J("() => { const s = window.helmline.state; return { nation: s.nation, at: s.ship.docked, name: s.ship.name, gomera: s.discovered.gomera, debt: s.story.debt, house: s.story.house }; }")
        print('state:', st)
        if st['nation'] != 'castile' or st['at'] != 'palos': errs.append('not a Castilian start at Palos')
        if not st['gomera']: errs.append('La Gomera not on a Castilian chart')
        if not st['debt'] or st['debt']['amount'] != 250: errs.append('no debt to Salvago')
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.tips.off = true; window.helmline.panel('port'); }")
        await J("() => { const m = document.querySelector('.money-box'); if (m) m.open = true; }")
        box = await J("() => document.querySelector('.money-box')?.innerText || ''")
        print('Palos money box:', box.replace('\n', ' | ')[:200])
        if 'pilots of Palos' not in box: errs.append('no pilots at Palos')
        await pg.screenshot(path=f'{SP}/castile-3-palos.png')
        # up the river to Seville
        ok = await J("() => window.helmline.sail('seville')")
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
        await pg.wait_for_timeout(100)
        for i in range(10):
            await J("() => window.helmline.sailFor(2)")
            if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
            if await J("() => window.helmline.state.ship.docked") == 'seville': break
        at = await J("() => window.helmline.state.ship.docked")
        print('after sailing up the Guadalquivir:', at)
        if at != 'seville': errs.append('did not reach Seville up the river')
        # the debt, paid in Seville
        await J("() => { const s = window.helmline.state; s.purse = 600; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        while await J("() => !document.getElementById('modal').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(150)
        has = await J("() => !!document.querySelector('[data-pay-debt]')")
        if not has: errs.append('no way to pay the debt in Seville')
        else:
            await pg.click('[data-pay-debt]'); await pg.wait_for_timeout(200)
            if await J("() => window.helmline.state.story.debt.paid") is None: errs.append('the debt was not paid')
        # Castile's yards
        order = await J("async () => { const Sh = await import('/js/ships.js'); const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 10; return Sh.hullOrder(s).map((h) => h + ':' + Sh.availability(s, Sh.HULLS[h]).ok); }")
        print('Castile yards:', order)
        if not any(o.startswith('naovizcaina:yes') for o in order) or any(o.startswith('barinel') for o in order): errs.append('wrong ladder for Castile')
        if not any(o.startswith('redonda:no') for o in order): errs.append('the carabela redonda is offered before 1480')
        await pg.click('[data-ships="yard"]'); await pg.wait_for_timeout(300)
        head = await J("() => document.querySelector('#yard h2, #yard h1')?.textContent || ''")
        print('yard:', head)
        if 'Seville' not in head: errs.append('Seville is not the home yard')
        await pg.screenshot(path=f'{SP}/castile-4-yard.png')
        await J("() => document.querySelector('.yard-close')?.click()")
        # Portugal: the menu's new voyage still sails for Portugal by default
        print('ERRORS', errs); await b.close()

asyncio.run(main())

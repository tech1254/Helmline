# Ships age: an old hull can no longer be made fully sound, a great rebuild gives back years (twice
# at most), and an old hired ship can be rebuilt or given a new hull at the Lisbon yard.
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
        modal = lambda: J("() => !document.getElementById('modal').hidden")
        print('new barca:', await J("() => { const s = window.helmline.state; return { built: s.ship.built, day: s.day }; }"))
        # an old caravel, badly worn, in Lisbon
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.ship.hull = 'caravel'; s.contracts.standing = 30; s.ship.built = s.day - 13 * 365; s.hull = 40; s.purse = 20000; window.helmline.setSpeed(0); window.helmline.dockAt('lisbon'); }")
        for _ in range(4):
            if await modal(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        banner = await J("() => document.querySelector('.banner')?.innerText.replace(/\\s+/g, ' ')")
        print('banner:', banner)
        await pg.screenshot(path=f'{SP}/age-1-banner.png')
        if 'no better than' not in (banner or ''): errs.append('no age note on the hull banner')
        await pg.click('[data-repair]'); await pg.wait_for_timeout(200)
        h = await J("() => Math.round(window.helmline.state.hull)")
        print('after the yard:', h)
        if h >= 100: errs.append('an old hull was made fully sound')
        # two great rebuilds, then no more
        for n in range(2):
            await pg.click('[data-rebuild]'); await pg.wait_for_timeout(100); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
            for _ in range(3):
                if await modal(): await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
            print(f'rebuild {n + 1}:', await J("() => { const s = window.helmline.state; return { hull: Math.round(s.hull), rebuilt: s.ship.rebuilt, years: +((s.day - s.ship.built) / 365).toFixed(1) }; }"))
        more = await J("() => !!document.querySelector('[data-rebuild]')")
        print('a third rebuild offered:', more)
        if more: errs.append('a hull took a third rebuild')
        # an old hired ship in Lisbon: a new hull
        await J("""() => { const s = window.helmline.state;
          s.fleet.ships.push({ id: 93, name: 'Santa Clara', hull: 'caravel', captain: { id: 93, name: 'Gil', nav: 4, trade: 4, wage: 4, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: { wine: { qty: 30, paid: 270 } }, profit: 0, trips: 0, last: null, hullPct: 70, built: s.day - 14 * 365, tropic: 0 }); }""")
        await pg.click('#btn-fleet'); await pg.wait_for_timeout(200)
        print('fleet panel:', await J("() => [document.getElementById('panel').hidden, !!document.querySelector('[data-ship-yard]'), document.querySelector('#panel h2')?.textContent, (document.querySelector('[data-ship=\"93\"]')?.innerText || '').slice(-300)]"))
        await J("() => document.querySelector('[data-ship-yard=\"93\"]').click()"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/age-2-fleet-yard.png')
        print('dialog:', await J("() => [document.getElementById('modal').hidden, document.getElementById('modal-title').textContent, !!document.querySelector('[data-ship-yard=\"93\"]')?.closest('form')]"), errs)
        await pg.click('[data-modal-action="new-barinel"]'); await pg.wait_for_timeout(200)
        x = await J("() => { const s = window.helmline.state, x = s.fleet.ships.find((y) => y.id === 93); return { hull: x.hull, built: x.built === s.day, pct: x.hullPct, wine: x.hold.wine?.qty }; }")
        print('after a new hull:', x)
        if x['hull'] != 'barinel' or not x['built'] or x['wine'] != 30: errs.append('hired ship not given a new hull properly')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

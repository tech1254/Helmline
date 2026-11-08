# Hunting corsairs: galleys cruise their waters; word of them comes in port and marks the chart;
# from the masthead you see one and where; sail onto her and choose: attack (with surprise, no
# tribute) or let her go. Taken, she is gone, and the crown owes a bounty.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def finish_fight(pg):
    """Play out an open fight (fightview.js): the sailing master fights it, then Continue."""
    for _ in range(12):
        acts = await pg.evaluate("() => document.getElementById('modal').hidden ? [] : [...document.querySelectorAll('#modal-body [data-modal-action]')].map(b => b.dataset.modalAction)")
        if 'done' in acts: await pg.click('#modal-body [data-modal-action="done"]'); await pg.wait_for_timeout(200); return True
        if 'auto' in acts: await pg.click('#modal-body [data-modal-action="auto"]'); await pg.wait_for_timeout(200); continue
        return False
    return False

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.tips.off = true; s.pirates.cooldown = 30; s.ship.hull = 'caravel'; s.hull = 100; s.purse = 2000; window.helmline.setSpeed(0); }")
        # galleys put to sea as days pass
        await J("() => { for (let i = 0; i < 400; i++) window.helmline.tickGalleys(1); }")
        g = await J("() => window.helmline.state.pirates.galleys.map((x) => ({ zone: x.zone, big: x.big }))")
        print('galleys at sea after 400 days of ticks:', g)
        if not g: errs.append('no galleys put to sea')
        # one off Safi: word of her in Safi's port
        await J("""() => { const s = window.helmline.state; s.pirates.galleys = [{ id: 1, lon: -10.2, lat: 32.6, heading: 200, big: false, zone: 'the Barbary coast', until: s.day + 30, seen: null }]; window.helmline.dockAt('safi'); }""")
        await pg.wait_for_timeout(300)
        t = await J("() => [...document.querySelectorAll('#toast .t')].map((x) => x.innerText).find((x) => x.includes('Word on the quay')) || ''")
        print('in Safi:', t[:110])
        if 'corsair galley was seen' not in t: errs.append('no word of the galley in port')
        seen = await J("() => window.helmline.state.pirates.galleys[0].seen")
        if seen is None: errs.append('the reported galley is not marked')
        await J("() => window.helmline.look(-10, 32.4, 0.9)"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/hunt-1-reported.png')
        # at sea, within sight: the lookout sees her
        await J("""() => { const h = window.helmline, s = h.state; h.panel(null); s.ship.docked = null; s.ship.lon = -10.0; s.ship.lat = 33.0; s.ship.route = []; s.day += 1; h.advance(0.25); }""")
        await pg.wait_for_timeout(200)
        t = await J("() => [...document.querySelectorAll('#toast .t')].map((x) => x.innerText).find((x) => x.includes('in sight')) || ''")
        print('at sea:', t[:110])
        if 'in sight' not in t: errs.append('the lookout did not see her')
        # run her down: the hunt dialog
        found = await J("""() => { const h = window.helmline, s = h.state, g = s.pirates.galleys[0]; s.ship.lon = g.lon + 0.05; s.ship.lat = g.lat; return h.huntCheck(); }""")
        print('alongside her:', found)
        await pg.wait_for_timeout(800)
        title = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        body = await J("() => document.getElementById('modal-body').innerText")
        print('dialog:', title, '|', body.replace('\n', ' ')[:140])
        if title != 'You have run down a corsair galley': errs.append('no hunt dialog')
        if 'Pay' in body: errs.append('a tribute was offered when hunting')
        await pg.screenshot(path=f'{SP}/hunt-2-dialog.png')
        await pg.click('#modal-body [data-modal-action="attack"]'); await pg.wait_for_timeout(300)
        await J("() => { window.helmline.ui.fight.foe.morale = 5; }")  # her rowers are beaten: the attack succeeds
        await pg.click('#modal-body [data-modal-action="fire"]'); await pg.wait_for_timeout(300)
        await finish_fight(pg)
        t2 = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('after the attack:', t2)
        if t2 == 'The galley is yours':
            await pg.click('#modal-body [data-modal-action="plunder"]'); await pg.wait_for_timeout(300)
        st = await J("() => ({ galleys: window.helmline.state.pirates.galleys.length, bounty: window.helmline.state.pirates.bounty, won: window.helmline.state.pirates.won })")
        print('afterwards:', st)
        if st['galleys'] != 0: errs.append('the beaten galley is still at sea')
        if not st['bounty']: errs.append('no bounty owed for her')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

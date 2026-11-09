# The Italian Wars: the chart reaches Naples and Sicily (Marseille, Naples and Palermo are known
# ports with routes); for Castile, war with France in 1495 (marque, Marseille shut, League
# contracts to Naples); Genoa (and the Salvago) French from 1499; for a neutral Portugal, contracts
# for both sides, and a League galley that searches a hold carrying for the French.
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

        # 1. the chart: the new ports are known, charted, and can be sailed to
        await fresh(pg, 'portugal')
        known = await J("() => ['marseille', 'naples', 'palermo'].map((id) => !!window.helmline.state.discovered[id])")
        seen = await J("() => import('./js/fog.js').then((F) => [[14.22, 40.8], [13.38, 38.18], [15.3, 39.5]].map(([x, y]) => F.isRevealed(x, y)))")
        print('known:', known, 'charted waters:', seen)
        if not all(known): errs.append(f'the new ports are not known: {known}')
        if not all(seen): errs.append(f'the Tyrrhenian is not charted: {seen}')
        await J("() => { window.helmline.panel(null); window.helmline.look(9, 40, 0.5); }"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{SP}/italy-1-chart.png')
        await J("() => window.helmline.sail('naples')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        route = await J("() => window.helmline.state.ship.route?.length || 0")
        print('a course from Lisbon to Naples:', route, 'points')
        if not route: errs.append('no course to Naples')
        for pid in ('marseille', 'naples', 'palermo'):
            await J(f"() => window.helmline.dockAt('{pid}')"); await pg.wait_for_timeout(250); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        wheat = await J("() => window.helmline.market().buyPrice('palermo', 'wheat')")
        print('wheat at Palermo:', wheat)
        await pg.screenshot(path=f'{SP}/italy-2-palermo.png')

        # 2. Portugal neutral in 1495: contracts for both sides; the League searches a hold for the French
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1495) + 80; s.war = null; }")
        await to_date(pg, 1495, 4, 5); await ok_modals(pg)
        cur = await J("() => window.helmline.war().current(window.helmline.state)?.id || null")
        if cur: errs.append(f'Portugal is at war in 1495: {cur}')
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(250); await ok_modals(pg)
        camps = await J("() => window.helmline.offers('lisbon').filter((o) => o.campaign).map((o) => o.campaign)")
        print('campaign contracts at Lisbon:', camps)
        if not ({'league1', 'france1'} <= set(camps)): errs.append(f'not both sides\' contracts at Lisbon: {camps}')
        fr = await J("() => window.helmline.offers('lisbon').find((o) => o.campaign === 'france1')")
        await J(f"() => import('./js/contracts.js').then((C) => {{ const s = window.helmline.state; C.accept(s, {fr['id']}, 'lisbon'); s.cargo['{fr['good']}'] = {fr['qty']}; s.paid['{fr['good']}'] = 100; }})")
        await J("() => window.helmline.sail('marseille')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        hit = await J("() => { const s = window.helmline.state; s.law.cooldown = 0; const c0 = s.pirates.cooldown; s.pirates.cooldown = 0; const h = window.helmline.law().hunters(s, 5, 4, 39.5, () => 0); s.pirates.cooldown = c0; return h; }")
        print('in the western Mediterranean with French cargo:', hit and hit.get('kind'))
        if not hit or hit['kind'] != 'search': errs.append(f'no League search: {hit}')
        else:
            await J(f"() => {{ window.helmline.ui.pendingEncounter = {{ kind: 'search', crown: 'castile', contract: 0, good: '{fr['good']}', where: 'x' }}; }}"); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'{SP}/italy-3-search.png')
            t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
            if t != 'Stopped by a League galley': errs.append(f'no search dialog: {t}')
            else:
                await pg.click('[data-modal-action="submit"]'); await pg.wait_for_timeout(300)
                if await J(f"() => window.helmline.state.cargo['{fr['good']}']"): errs.append('submitting to the search kept the contraband')
            await ok_modals(pg)

        # 3. Castile: war with France, Marseille shut, League contracts; Genoa French from 1499
        await fresh(pg, 'castile')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1495) + 80; s.war = null; }")
        await to_date(pg, 1495, 4, 2)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('Castile, April 1495:', t)
        if not t or 'France' not in t: errs.append(f'no war with France for Castile: {t}')
        else: await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await ok_modals(pg)
        shut = await J("() => window.helmline.law().closedTo(window.helmline.state, 'marseille')")
        if not shut: errs.append('Marseille is open to Castile in the war')
        lawful = await J("() => window.helmline.law().lawful(window.helmline.state, 'france', 40).ok")
        if not lawful: errs.append('French ships are not lawful prize under the marque')
        await to_date(pg, 1500, 1, 10); await ok_modals(pg)
        g = await J("() => [window.helmline.law().crownOf('genoa', window.helmline.state), window.helmline.law().houseCrown(window.helmline.state, 'salvago')]")
        print('Genoa and the Salvago in 1500:', g)
        if g != ['france', 'france']: errs.append(f'Genoa is not French in 1500: {g}')
        await to_date(pg, 1504, 2, 1); await ok_modals(pg)
        n = await J("() => window.helmline.law().crownOf('naples', window.helmline.state)")
        print('Naples in 1504:', n)
        if n != 'castile': errs.append(f'Naples is not Spanish in 1504: {n}')

        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await J("() => { window.helmline.panel(null); window.helmline.look(12, 40, 0.8); }"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/italy-4-phone.png')
        if await J("() => document.documentElement.scrollWidth > window.innerWidth + 1"): errs.append('the page scrolls sideways on a phone')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

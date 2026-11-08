# The race (phase 5): the explorers are rivals. Charting a coast before history pays the crown's
# prize and grants your house its trade for ten years; history otherwise charts it on its date,
# or a rival house's caravel does, earlier. Rumours heard in port and the legends of the old
# charts are marked on the chart; tapping one sets a course; Antillia leads on to the Indies.
# From São Brás you can find the way to India before da Gama. Desktop and phone.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(6):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        R = "import('./js/race.js')"
        await pg.goto(URL); await pg.wait_for_timeout(400); await J("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('#intro-new'); await pg.wait_for_timeout(500); await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.voyages = 3; s.purse = 8000; }")
        # no rival beats history in this game: the dates are history's
        await J(f"() => {R}.then((M) => {{ const s = window.helmline.state; M.ensureRace(s); for (const r of M.RACES) s.race.dates[r.port] = {{ year: r.year, who: r.who, house: null }}; }})")

        # 1. the legends are on the chart from the start; tap Antillia
        marks = await J(f"() => {R}.then((M) => M.marks(window.helmline.state).map((m) => m.id))")
        print('marks at the start:', marks)
        if not {'antillia', 'brendan', 'sevencities', 'brasil'} <= set(marks): errs.append(f'the legends are not marked: {marks}')
        await J("() => { window.helmline.panel(null); window.helmline.look(-30, 32, 0.25); }"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/race-1-legends.png')
        sx, sy = await J("() => window.helmline.screenOf(-46, 27.5)")
        await pg.mouse.click(sx, sy); await pg.wait_for_timeout(300)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('tapped:', t)
        if t != 'Antillia': errs.append(f'tapping Antillia did not open it: {t}')
        await pg.screenshot(path=f'{SP}/race-2-antillia.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)

        # 2. a rumour heard at Arguin; charting the Gambia before Cadamosto wins the race
        await J("() => window.helmline.dockAt('arguin')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        rum = await J(f"() => {R}.then((M) => M.marks(window.helmline.state).filter((m) => m.kind === 'rumour').map((m) => m.id))")
        print('rumours after Arguin:', rum)
        if 'gambia' not in rum: errs.append('no rumour of the Gambia at Arguin')
        purse0 = await J("() => window.helmline.state.purse")
        await J("() => window.helmline.dockAt('gambia')"); await pg.wait_for_timeout(300)
        first = await J("() => window.helmline.state.race.firsts.gambia")
        gained = await J("() => window.helmline.state.purse") - purse0
        print('charted the Gambia first:', first, 'prize', gained)
        if not first or first['by'] != 'you' or gained < 400: errs.append('charting the Gambia early did not win the race')
        await ok_modals(pg)
        # the grant: the rivals hold little sway there
        g = await J(f"() => {R}.then((M) => M.grant(window.helmline.state, 'gambia'))")
        sh = await J("() => import('./js/houses.js').then((H) => H.shares(window.helmline.state, 'gambia'))")
        print('grant', g, 'shares at the Gambia', {k: round(v, 2) for k, v in sh.items()})
        if g != 'you': errs.append('no grant of the Gambia')
        # on Cadamosto's date: you beat him
        await J("() => window.helmline.advance(window.helmline.yearDay(1455) + 160 - window.helmline.state.day)"); await pg.wait_for_timeout(300)
        beat = await J("() => [...document.querySelectorAll('#notices li, .toast')].some((x) => /You beat Cadamosto/.test(x.textContent)) || window.helmline.state.race.told.gambia")
        if not beat: errs.append('no news that you beat Cadamosto')
        await ok_modals(pg)
        # history charts what nobody reached: the Mina in 1471
        await J("() => window.helmline.advance(window.helmline.yearDay(1471) + 160 - window.helmline.state.day)"); await pg.wait_for_timeout(300); await ok_modals(pg)
        if not await J("() => !!window.helmline.state.discovered.mina"): errs.append('history did not chart the Mina in 1471')

        # 3. a legend: sail over Antillia; it leads on to land in the west
        await J("() => window.helmline.sail('lisbon')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.ship.lon = -45.6; s.ship.lat = 27.7; s.ship.route = [[-46, 27.5]]; s.ship.dest = { lon: -46, lat: 27.5, port: null }; }")
        await J("() => window.helmline.sailFor(1)"); await pg.wait_for_timeout(300)
        L = await J("() => window.helmline.state.race.legends.antillia")
        lead = await J("() => window.helmline.state.race.rumours.santodomingo")
        print('Antillia searched:', L, 'leads to', lead and lead.get('name'))
        if not L.get('found'): errs.append('sailing over Antillia found nothing')
        if not lead: errs.append('Antillia does not lead to land in the west')
        await ok_modals(pg)

        # 4. São Brás before Dias, and the way to India before da Gama
        await J("() => window.helmline.dockAt('saobras')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        f = await J("() => window.helmline.state.race.firsts.saobras")
        print('São Brás:', f)
        if not f or f['by'] != 'you': errs.append('reaching São Brás early did not win the race')
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        if not await J("() => !!document.querySelector('[data-seek-india]')"): errs.append('no way to seek India at São Brás')
        else:
            await J("() => document.querySelector('[data-seek-india]').click()"); await pg.wait_for_timeout(200)
            await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        if not await J("() => window.helmline.state.discovered.calicut && window.helmline.state.race.firsts.calicut?.by === 'you'"): errs.append('the way to India was not charted first')
        await ok_modals(pg)
        # the house history in the Houses tab
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('houses'); }"); await pg.wait_for_timeout(300)
        hist = await J("() => [...document.querySelectorAll('h3')].some((h) => h.textContent.includes('history'))")
        await pg.screenshot(path=f'{SP}/race-3-history.png')
        if not hist: errs.append('no house history in the Houses tab')

        # 5. a rival house beats history to a coast
        await J("() => { const s = window.helmline.state; s.race.dates.mpinda = { year: 1452, who: 'a caravel of the house of Salvago', house: 'salvago' }; s.race.told.mpinda = false; delete s.discovered.mpinda; }")
        await J("() => window.helmline.advance(2)"); await pg.wait_for_timeout(200); await ok_modals(pg)
        rf = await J("() => window.helmline.state.race.firsts.mpinda")
        print('Mpinda:', rf)
        if not rf or rf['by'] != 'salvago': errs.append('a rival house did not chart Mpinda first')

        # phone: the chart marks and the dialog fit
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await J("() => { window.helmline.panel(null); window.helmline.look(-20, 40, 0.18); }"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/race-4-phone.png')
        if await J("() => document.documentElement.scrollWidth > window.innerWidth + 1"): errs.append('the page scrolls sideways on a phone')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

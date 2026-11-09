# Deeper careers: the enemy's merchant shipping in wartime (lawful prizes with a letter of marque,
# piracy without), rival houses that are harder to buy out, and the crown's commissions to explore
# (a stipend now, a reward on top of the prize if you chart the coast first, a lapse if history
# gets there before you).
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
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 20000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; }")

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

        # 1. Portugal at war with Castile, 1475: Castilian merchantmen at sea; lawful with a letter of marque
        await fresh(pg, 'portugal')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1475) + 120; s.war = null; }")
        await to_date(pg, 1475, 7, 1); await ok_modals(pg)
        await J("() => { const w = window.helmline.state.war; w.marque = null; w.marques = {}; w.offer = null; }")
        before = await J("() => import('./js/houses.js').then((Ho) => import('./js/hunt.js').then((H) => { const s = window.helmline.state; const v = Ho.positions(s).find((x) => x.convoy); return v ? { key: v.key, lawful: H.preyInfo(s, v).law.ok, crown: H.preyInfo(s, v).crown } : null; }))")
        print('a Castilian merchantman, no letter:', before)
        if not before or before['crown'] != 'castile': errs.append(f'no enemy merchant shipping in 1475: {before}')
        elif before['lawful']: errs.append('taking enemy shipping without a letter of marque is lawful')
        await J("() => { window.helmline.state.war.offer = 'succession'; window.helmline.war().takeMarque(window.helmline.state, true); }")
        got = await J("() => import('./js/houses.js').then((Ho) => import('./js/hunt.js').then((H) => { const s = window.helmline.state; const v = Ho.positions(s).find((x) => x.convoy); const info = H.preyInfo(s, v); const sv0 = window.helmline.war().service(s); const r = H.spoils(s, info, 'prize', 0); return { key: v.key, lawful: info.law.ok, name: info.houseName + ' ' + info.hullName, service: window.helmline.war().service(s) - sv0, gone: !Ho.positions(s).some((x) => x.key === v.key), infamy: s.law.infamy?.castile || 0, lines: r.lines }; }))")
        print('with a letter:', got)
        if not got['lawful']: errs.append('enemy shipping is not lawful with a letter of marque')
        if not got['gone']: errs.append('a taken merchantman is still at sea')
        if got['service'] < 1: errs.append('taking enemy shipping is not service in the war')
        if got['infamy']: errs.append('a lawful prize brought infamy')
        # the ship on the chart
        await J("() => window.helmline.dockAt('lagos')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        v = await J("() => import('./js/houses.js').then((Ho) => { const v = Ho.positions(window.helmline.state).find((x) => x.convoy); return v ? { key: v.key, lon: v.lon, lat: v.lat } : null; })")
        if v:
            await J(f"() => {{ window.helmline.reveal({v['lon']}, {v['lat']}); window.helmline.panel(null); window.helmline.look({v['lon']}, {v['lat']}, 2); }}"); await pg.wait_for_timeout(400)
            sx, sy = await J(f"() => window.helmline.screenOf({v['lon']}, {v['lat']})")
            await pg.mouse.click(sx, sy); await pg.wait_for_timeout(300)
            t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
            print('tapped:', t)
            await pg.screenshot(path=f'{SP}/careers-1-convoy.png')
            if not t or 'Castilian' not in t: errs.append(f'tapping a merchantman did not open her: {t}')
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)

        # 2. Buying out a rival house: dearer, and not a young house
        q = await J("() => import('./js/houses.js').then((Ho) => { const s = window.helmline.state; const id = Ho.active(s)[0]; return { id, q: Ho.buyOutPrice(s, id), worth: Ho.houseWorth ? null : null }; })")
        print('buy-out:', q)
        if q['q'] and q['q']['ok'] and 'three' not in (q['q']['why'] or '') and q['q']['price'] < 1000: errs.append(f'buy-out looks too cheap: {q}')
        young = await J("() => import('./js/houses.js').then((Ho) => { const s = window.helmline.state; const d0 = s.day; s.day = window.helmline.yearDay(1525); Ho.ensureHouses(s); const h = Ho.ensureHouses(s).h; if (!h.thorne) return 'no thorne'; h.thorne.status = 'trading'; const r = Ho.buyOutPrice(s, 'thorne'); s.day = d0; return r && r.why; })")
        print('Thorne in 1525:', young)
        if young != 'no thorne' and 'founders' not in (young or ''): errs.append(f'a house founded in 1520 can be bought in 1525: {young}')

        # 3. A commission to explore: offered at Lisbon, fulfilled by charting first
        await fresh(pg, 'portugal')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1478) + 10; s.war = null; s.contracts.standing = 40; }")
        await to_date(pg, 1478, 2, 1); await ok_modals(pg)
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        has = await J("() => !!document.querySelector('[data-explore-commission]')")
        print('commission offered at Lisbon:', has)
        if not has: errs.append('no commission offered at Lisbon in 1478')
        else:
            p0 = await J("() => window.helmline.state.purse")
            await J("() => document.querySelector('[data-explore-commission]').scrollIntoView()")
            await pg.click('[data-explore-commission]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{SP}/careers-2-commission.png')
            await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
            c = await J("() => [window.helmline.state.race.commission?.port, window.helmline.state.purse, !!window.helmline.state.race.rumours?.[window.helmline.state.race.commission?.port]]")
            print('commission:', c, 'stipend', c[1] - p0)
            if not c[0] or c[1] - p0 < 50: errs.append(f'the commission did not take: {c}')
            if not c[2]: errs.append('no rumour marked for the commission')
            r = await J(f"() => import('./js/race.js').then((R) => {{ const s = window.helmline.state; const p0 = s.purse; const m = R.charted(s, '{c[0]}'); return {{ gain: s.purse - p0, msgs: m.length, left: s.race.commission }}; }})")
            print('charted it first:', r)
            if r['msgs'] < 2 or r['left']: errs.append(f'the commission was not fulfilled: {r}')
        # a commission that lapses
        lapse = await J("() => import('./js/race.js').then((R) => { const s = window.helmline.state; s.race.commissionDeclined = 0; const o = R.takeCommission(s, 'lisbon', true); if (!o) return 'none offered'; s.day = o.by + 1; const m = R.tick(s); return { left: s.race.commission, lapsed: m.some((x) => /lapsed/.test(x.html)) }; })")
        print('lapse:', lapse)
        if lapse != 'none offered' and (lapse['left'] or not lapse['lapsed']): errs.append(f'the commission did not lapse: {lapse}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

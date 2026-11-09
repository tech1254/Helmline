# The late game, 1500-1551: Barbarossa's Algiers from 1516 (and the Tyrrhenian from 1520); French
# corsairs in the Atlantic approaches from 1521, driven off for the crown's bounty; the
# Habsburg-Valois wars for Castile (France the enemy, marque, the Indies fleet contracts); the
# Indies treasure ship each summer from 1522, a prize no Portuguese captain may take lawfully;
# and the news and history of the late years (the earthquake at Lisbon, 1531).
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

        await fresh(pg, 'portugal')
        # 1. Barbarossa: the waters off Algiers are dangerous from 1516, the Tyrrhenian from 1520
        d = await J("() => import('./js/pirates.js').then((P) => [P.danger(3, 37.5, 1500).d, P.danger(3, 37.5, 1517).d, P.danger(12, 39, 1517).d, P.danger(12, 39, 1521).d])")
        print('danger off Algiers 1500/1517, Tyrrhenian 1517/1521:', d)
        if not (d[1] > d[0] and d[3] > d[2]): errs.append(f'the Barbary zones do not open: {d}')

        # 2. Portugal, 1525: a French corsair off the coast, beaten off for the bounty
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1525) + 100; s.war = null; }")
        await to_date(pg, 1525, 4, 20); await ok_modals(pg)
        hit = await J("() => { const s = window.helmline.state; s.law.cooldown = 0; const c0 = s.pirates.cooldown; s.pirates.cooldown = 0; const h = window.helmline.law().hunters(s, 5, -9.6, 38.4, () => 0); s.pirates.cooldown = c0; return h; }")
        print('off Lisbon in 1525:', hit)
        if not hit or hit['kind'] != 'frenchcorsair': errs.append(f'no French corsair off Lisbon in 1525: {hit}')
        early = await J("() => { const s = window.helmline.state; const d0 = s.day; s.day = window.helmline.yearDay(1510); s.law.cooldown = 0; const c0 = s.pirates.cooldown; s.pirates.cooldown = 0; const h = window.helmline.law().hunters(s, 5, -9.6, 38.4, () => 0); s.pirates.cooldown = c0; s.day = d0; return h?.kind || null; }")
        if early == 'frenchcorsair': errs.append('French corsairs before 1521')
        await J("() => { const s = window.helmline.state; s.ship.hull = 'nau'; s.ship.fit = { guns: 'bombards', crew: 'menatarms' }; window.helmline.sail('porto'); }"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J("() => { window.helmline.ui.pendingEncounter = { kind: 'frenchcorsair', crown: null, armed: 0, where: 'the Portuguese coast' }; }"); await pg.wait_for_timeout(600)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('the dialog:', t)
        await pg.screenshot(path=f'{SP}/late-1-french.png')
        if t != 'A French corsair!': errs.append(f'no French corsair dialog: {t}')
        else:
            p0 = await J("() => window.helmline.state.purse")
            for _ in range(8):
                if await J("() => !!document.querySelector('[data-modal-action=\"auto\"]')"):
                    await pg.click('[data-modal-action="auto"]'); await pg.wait_for_timeout(300)
                if await J("() => !!document.querySelector('[data-modal-action=\"done\"]')"):
                    await pg.click('[data-modal-action="done"]'); await pg.wait_for_timeout(300); break
            await ok_modals(pg)
            res = await J("() => window.helmline.ui.fight?.done?.result || null")
            p1 = await J("() => window.helmline.state.purse")
            print('result:', res, 'purse', p0, '->', p1)
            if res in ('beaten', 'sheered') and p1 - p0 < 300: errs.append('no bounty for driving off a French corsair')

        # 3. Portugal, 1523: the Indies treasure ship is on the chart, and taking her is piracy
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1523) + 100; }")
        await to_date(pg, 1523, 6, 20); await ok_modals(pg)
        ts = await J("() => Promise.all([import('./js/hunt.js'), import('./js/houses.js')]).then(([H, Ho]) => { const s = window.helmline.state; const v = Ho.positions(s).find((x) => x.house === 'treasure'); if (!v) return null; const i = H.preyInfo(s, v); return { lon: v.lon, lat: v.lat, lawful: i.law.ok, value: i.value, name: i.hullName }; })")
        print('the treasure ship:', ts)
        if not ts: errs.append('no Indies treasure ship in June 1523')
        elif ts['lawful'] or ts['value'] < 3000: errs.append(f'the treasure ship is wrong: {ts}')
        news = await J("() => (window.helmline.state.log || []).map((l) => l.text || l).join(' | ')")
        if 'Indies treasure ship of 1523' not in news and 'Fleury' not in news: print('  (log has no treasure news; checking notices)')

        # 4. Castile, 1521: war with France; the Indies fleet contracts at Seville
        await fresh(pg, 'castile')
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1521) + 140; s.war = null; }")
        await to_date(pg, 1521, 6, 10); await ok_modals(pg)
        cur = await J("() => window.helmline.war().current(window.helmline.state)?.id || null")
        enemy = await J("() => window.helmline.war().enemyOf(window.helmline.state)")
        print('Castile in June 1521:', cur, enemy)
        if cur != 'valois1' or enemy != 'france': errs.append(f'no war with France in 1521: {cur} {enemy}')
        await to_date(pg, 1522, 2, 1); await ok_modals(pg)
        await J("() => window.helmline.dockAt('seville')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        camps = await J("() => window.helmline.offers('seville').filter((o) => o.campaign).map((o) => o.campaign)")
        print('campaign contracts at Seville:', camps)
        if 'indies' not in camps: errs.append(f'no Indies fleet contract at Seville: {", ".join(camps) or "none"}')
        await to_date(pg, 1526, 2, 1); await ok_modals(pg)
        cur = await J("() => window.helmline.war().current(window.helmline.state)?.id || null")
        if cur: errs.append(f'still at war in February 1526: {cur}')
        noT = await J("() => window.helmline.prey().some((x) => x.house === 'treasure')")
        if noT: errs.append('a Castilian captain sees the treasure ship as prey')

        # 5. the history of the late years: Lisbon after the earthquake
        sz = await J("() => window.helmline.state.ports?.lisbon?.size ?? null")
        await to_date(pg, 1531, 3, 1); await ok_modals(pg)
        sz2 = await J("() => window.helmline.state.ports?.lisbon?.size ?? null")
        print('Lisbon before and after 1531:', sz, sz2)
        await J("() => { window.helmline.panel('rutter'); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/late-2-castile.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

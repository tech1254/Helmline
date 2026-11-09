# Expansion: the silver age (x/silver.js). Castile: Nombre de Dios and Havana charted from 1519;
# the escort commission at Sanlúcar in spring, out with the fleet and home, paid; the fair at
# Nombre de Dios (gold cheap, cloth dear) from January to March. Portugal: the homeward Indies
# fleet on the chart each summer from 1535, and taking one of its ships at peace is piracy.
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
    try: await pg.wait_for_selector('#intro', state='visible', timeout=8000)
    except Exception:
        await pg.screenshot(path=f'{SP}/x-silver-fail.png'); print('intro state:', await J("() => [document.getElementById('intro')?.hidden, document.getElementById('intro')?.className, localStorage.length]")); raise
    await pg.click('#intro-new'); await pg.wait_for_timeout(200)
    if await J("() => !document.getElementById('intro-nation').hidden"):
        await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1200)
    await ok_modals(pg)
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 30000; s.voyages = 6; s.contracts.unlocked = true; s.contracts.standing = 40; s.skipOffered = true; if (s.story) s.story.off = true; s.ship.hull = 'nau'; }")

async def to_date(pg, y, m, d):
    await pg.evaluate(f"() => {{ const s = window.helmline.state; const t = window.helmline.yearDay({y}) + Math.round((Date.UTC({y}, {m - 1}, {d}) - Date.UTC({y}, 0, 1)) / 864e5); if (t - s.day > 30) s.day = t - 2; window.helmline.advance(Math.max(0, t - s.day)); }}")
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

        # Castile, spring 1536: the escort commission
        await fresh(pg, 'castile')
        await J("() => { window.helmline.state.war = null; }")
        await to_date(pg, 1536, 4, 1); await ok_modals(pg)
        await J("() => { window.helmline.state.contracts.standing = 40; }")
        known = await J("() => [!!window.helmline.state.discovered.nombrededios, !!window.helmline.state.discovered.havana]")
        print('charted for Castile:', known)
        if known != [True, True]: errs.append(f'the Indies ports are not charted for Castile: {known}')
        await J("() => window.helmline.dockAt('sanlucar')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await port_panel(pg)
        if not await J("() => !!document.querySelector('[data-silver-escort]')"): errs.append('no escort commission at Sanlúcar in April')
        else:
            await J("() => document.querySelector('[data-silver-escort]').scrollIntoView()")
            await pg.click('[data-silver-escort]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=f'{SP}/x-silver-1-escort.png')
            await pg.click('#modal-ok'); await pg.wait_for_timeout(300); await ok_modals(pg)
            e = await J("() => window.helmline.state.x.silver.escort")
            print('escort:', e and e['out'], e and e['stage'])
            if not e: errs.append('the escort commission did not take')
            ok = await J("() => window.helmline.sail('nombrededios')"); await pg.wait_for_timeout(200); await ok_modals(pg)
            if not ok: errs.append('no course to Nombre de Dios')
            await J("() => { window.helmline.state.day += 60; window.helmline.dockAt('nombrededios'); }"); await pg.wait_for_timeout(300); await ok_modals(pg)
            st = await J("() => window.helmline.state.x.silver.escort?.stage")
            if st != 'home': errs.append(f'reaching Nombre de Dios did not turn the fleet home: {st}')
            p0 = await J("() => window.helmline.state.purse")
            await J("() => { window.helmline.state.day += 60; window.helmline.dockAt('sanlucar'); }"); await pg.wait_for_timeout(300); await ok_modals(pg)
            p1 = await J("() => window.helmline.state.purse")
            print('paid for the escort:', p1 - p0)
            if p1 - p0 < 3999: errs.append(f'the escort was not paid in full: {p1 - p0}')
        # the fair
        await to_date(pg, 1537, 2, 1); await ok_modals(pg)
        fair = await J("() => { const m = window.helmline.market(); return [m.buyPrice('nombrededios', 'gold'), m.sellPrice ? m.sellPrice('nombrededios', 'cloth') : null]; }")
        await to_date(pg, 1537, 6, 1); await ok_modals(pg)
        after = await J("() => { const m = window.helmline.market(); return [m.buyPrice('nombrededios', 'gold'), m.sellPrice ? m.sellPrice('nombrededios', 'cloth') : null]; }")
        print('gold and cloth at Nombre de Dios, at the fair and after:', fair, after)
        if not fair[0] < after[0]: errs.append(f'gold is not cheaper at the fair: {fair} {after}')
        await J("() => window.helmline.dockAt('nombrededios')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await port_panel(pg)
        await pg.screenshot(path=f'{SP}/x-silver-2-nombrededios.png')

        # Portugal, summer 1540: the homeward fleet
        await pg.goto(URL); await pg.wait_for_timeout(1500) # let the saved game settle before starting afresh
        await fresh(pg, 'portugal')
        await J("() => { window.helmline.state.war = null; }")
        await to_date(pg, 1540, 6, 25); await ok_modals(pg)
        fl = await J("() => import('./js/houses.js').then((Ho) => import('./js/hunt.js').then((H) => { const s = window.helmline.state; const vs = Ho.positions(s).filter((v) => v.key.includes('flota')); return vs.map((v) => { const i = H.preyInfo(s, v); return { key: v.key, lawful: i.law.ok, value: i.value, note: !!i.note }; }); }))")
        print('the Indies fleet:', fl)
        if len(fl) != 3: errs.append(f'the homeward fleet is not on the chart: {len(fl)}')
        elif fl[0]['lawful'] or not fl[0]['note'] or fl[0]['value'] < 8000: errs.append(f'the fleet ships are wrong: {fl[0]}')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

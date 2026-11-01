# The play log: each game gets its own run id; its actions (ledger entries, notices, sailing,
# arriving, snapshots) are sent in batches to /api/playlog; a new voyage starts a new run; and
# the switch in More stops it.
import asyncio, sys, os, json, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

def rows():
    return json.loads(urllib.request.urlopen(f'{URL}__test/playlog').read())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        await ctx.add_init_script("window.helmlineLog = true")
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmline.state.tips.off = true; }")
        run1 = await J("() => window.helmline.state.runId")
        # buy, sail, arrive
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(150)
        await pg.click('[data-buy="wine"][data-n="10"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
        await J("() => { window.helmline.sail('lagos'); document.getElementById('modal-ok').click(); }")
        for _ in range(60):
            if await J("() => window.helmline.state.ship.docked === 'lagos'"): break
            await J("() => window.helmline.sailFor(2)")
        await J("() => window.helmline.flushLog()"); await pg.wait_for_timeout(500)
        r = [x for x in rows() if x['run'] == run1]
        kinds = {}
        for row in r:
            for e in json.loads(row['events']): kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
        print('run', run1, 'batches', len(r), 'events by kind', kinds)
        for k in ('new', 'money', 'sail', 'dock', 'snapshot'):
            if not kinds.get(k): errs.append(f'no {k} event logged')
        ev = [e for row in r for e in json.loads(row['events'])]
        buy = next((e for e in ev if e['kind'] == 'money' and e.get('good') == 'wine'), None)
        print('the purchase:', buy)
        if not buy or buy.get('qty') != 10: errs.append('the purchase was not logged with its good and quantity')
        # a new voyage: a new run
        await pg.click('#dock-more'); await pg.wait_for_timeout(150); await pg.click('[data-menu="new"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
        run2 = await J("() => window.helmline.state.runId")
        print('new voyage run:', run2)
        if not run2 or run2 == run1: errs.append('a new voyage did not start a new run')
        # switched off: nothing more is sent
        await pg.click('#dock-more'); await pg.wait_for_timeout(150)
        label = await J("() => document.querySelector('[data-menu=\"playlog\"] b').textContent")
        await pg.click('[data-menu="playlog"]'); await pg.wait_for_timeout(100)
        label2 = await J("() => document.querySelector('[data-menu=\"playlog\"] b').textContent")
        print('menu:', label, '->', label2)
        n0 = len(rows())
        await J("() => { window.helmline.panel('port'); }"); await pg.click('[data-buy="cloth"][data-n="10"]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
        await J("() => window.helmline.flushLog()"); await pg.wait_for_timeout(400)
        if len(rows()) != n0: errs.append('the play log sent while switched off')
        if label2 != 'Play log: off': errs.append('the switch did not turn it off')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

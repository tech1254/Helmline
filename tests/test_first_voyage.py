# The first voyage: a new player sees three steps at the top of the market (buy a cargo here,
# sail to a nearby port where it sells for more, sell it), each with a button that does it, then
# what the run made. Skip ends it. Choosing a crown starts one game, not a stray Portuguese one
# first (the play log has one 'new' per game). Castile on a computer, Portugal on a phone.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg, J):
    for _ in range(6):
        if await J("() => !document.getElementById('modal').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
        else: break

async def play(b, errs, nation, vp, mobile):
    pg = await b.new_page(viewport=vp, is_mobile=mobile, has_touch=mobile)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("window.helmlineNations = true; window.helmlineStory = true; window.helmlineFirst = true; window.helmlineLog = true;")
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#intro', state='visible')
    await pg.click('#intro-new'); await pg.wait_for_timeout(200)
    await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1200)
    await ok_modals(pg, J) # the prologue
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
    f = await J("() => window.helmline.state.first")
    print(nation, 'run:', f)
    if not f or f.get('done'): errs.append(f'{nation}: no first voyage'); await pg.close(); return pg
    box = await J("() => document.querySelector('.first')?.innerText || ''")
    print(' box:', box.replace('\n', ' | '))
    if 'Your first voyage' not in box: errs.append(f'{nation}: no first-voyage box in the market')
    tip = await J("() => document.getElementById('tip').hidden")
    if not tip: errs.append(f'{nation}: the captain\'s note repeats the box in port')
    await pg.screenshot(path=f'{SP}/first-{nation}-1-buy.png')
    # 1. buy
    await pg.click('.first [data-buy]'); await pg.wait_for_timeout(200); await ok_modals(pg, J)
    have = await J(f"() => window.helmline.state.cargo['{f['good']}']")
    if have != f['qty']: errs.append(f'{nation}: bought {have}, not {f["qty"]}')
    if not await J("() => !!document.querySelector('.first [data-sailto]')"): errs.append(f'{nation}: no sail button after buying')
    await pg.screenshot(path=f'{SP}/first-{nation}-2-sail.png')
    # 2. sail
    await pg.click('.first [data-sailto]'); await pg.wait_for_timeout(200); await ok_modals(pg, J)
    if await J("() => window.helmline.state.ship.docked"): errs.append(f'{nation}: did not sail')
    note = await J("() => document.getElementById('tip-text').textContent")
    print(' at sea:', note)
    if 'On your way' not in note: errs.append(f'{nation}: no note at sea')
    for _ in range(20):
        await J("() => window.helmline.sailFor(2)"); await ok_modals(pg, J)
        if await J("() => window.helmline.state.ship.docked"): break
    at = await J("() => window.helmline.state.ship.docked")
    if at != f['to']: errs.append(f'{nation}: arrived at {at}, not {f["to"]}')
    await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(300); await ok_modals(pg, J)
    await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{SP}/first-{nation}-3-sell.png')
    # 3. sell
    if not await J("() => !!document.querySelector('.first [data-sell]')"): errs.append(f'{nation}: no sell button at {at}')
    else:
        await pg.click('.first [data-sell]'); await pg.wait_for_timeout(200); await ok_modals(pg, J)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        done = await J("() => document.querySelector('.first.done')?.innerText || ''")
        print(' done:', done.replace('\n', ' | ')[:240])
        if 'first voyage is done' not in done: errs.append(f'{nation}: no end of the first voyage')
        await pg.screenshot(path=f'{SP}/first-{nation}-4-done.png')
        await pg.click('.first [data-first-end]'); await pg.wait_for_timeout(200)
        if await J("() => !!document.querySelector('.first')"): errs.append(f'{nation}: the box stayed after Carry on')
    # one game, one 'new'
    await J("() => window.helmline.flushLog()"); await pg.wait_for_timeout(500)
    return pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await play(b, errs, 'castile', {'width': 1280, 'height': 860}, False)
        await play(b, errs, 'portugal', {'width': 390, 'height': 800}, True)
        rows = await pg.evaluate("() => fetch('/__test/playlog').then((r) => r.json())")
        news = [e['at'] for r in rows for e in json.loads(r['events']) if e.get('kind') == 'new']
        print('new games in the play log:', news)
        if news != ['palos', 'lisbon']: errs.append(f'not one new game per crown chosen: {news}')
        # skip
        sk = await b.new_page(viewport={'width': 1280, 'height': 860})
        await sk.add_init_script("window.helmlineStory = true; window.helmlineFirst = true;")
        await sk.goto(URL); await sk.evaluate("() => localStorage.clear()"); await sk.reload(); await sk.wait_for_selector('#intro', state='visible')
        await sk.click('#intro-new'); await sk.wait_for_timeout(1000)
        await ok_modals(sk, sk.evaluate)
        await sk.evaluate("() => window.helmline.panel('port')"); await sk.wait_for_timeout(200)
        await sk.click('.first [data-first-end]'); await sk.wait_for_timeout(200)
        if await sk.evaluate("() => !!document.querySelector('.first')"): errs.append('Skip did not end it')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

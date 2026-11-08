# Callings and ambitions (phase 1): after the first voyage the calling is offered; taking one
# puts three ambitions in a box under the HUD, one of them big; doing one pays, adds merit and
# offers three more (two of the calling, one of another); a calling's rank pays (a merchant's
# goods sell for more); changing calling is free in the first year and costs later; an older
# save without a calling is offered one. Desktop and phone.
import asyncio, sys, os, json
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
        await pg.add_init_script("window.helmlineCallings = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_timeout(400); await J("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('#intro-new'); await pg.wait_for_timeout(800)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; }")
        await pg.wait_for_timeout(800)
        if await J("() => !document.getElementById('modal').hidden"): errs.append('a calling was offered before any voyage')
        # after a voyage, in port
        await J("() => { const s = window.helmline.state; s.voyages = 1; s.first = { done: true }; }")
        await pg.wait_for_timeout(900)
        title = await J("() => document.getElementById('modal').hidden ? '' : document.getElementById('modal-title').textContent")
        print('offered:', title)
        if title != 'Choose your calling': errs.append(f'no calling offered after the first voyage ({title})')
        await pg.screenshot(path=f'{SP}/callings-1-choice.png')
        await pg.click('[data-modal-action="merchant"]'); await pg.wait_for_timeout(700)
        st = await J("() => { const s = window.helmline.state; return { calling: s.calling, amb: s.ambitions.active.map((a) => [a.kind, a.text, a.big]) }; }")
        print('calling:', st['calling'], 'ambitions:', st['amb'])
        if (st['calling'] or {}).get('id') != 'merchant': errs.append('the calling was not taken')
        if len(st['amb']) != 3 or not any(a[2] for a in st['amb']): errs.append(f'not three ambitions with a big one: {st["amb"]}')
        box = await J("() => document.getElementById('ambitions').innerText")
        print('box:', box.replace('\n', ' | '))
        if 'Merchant' not in box: errs.append('the ambitions box does not show the rank')
        # a merchant's goods sell for more
        await J("() => { const s = window.helmline.state; s.cargo.wine = 20; s.paid.wine = 180; s.purse = 1000; }")
        await J("() => { window.helmline.panel(null); window.helmline.panel('port'); }"); await pg.wait_for_timeout(300)
        before = await J("() => window.helmline.state.purse")
        perk = await J("() => import('./js/callings.js').then((C) => C.perk(window.helmline.state, 'sale'))")
        if perk <= 1: errs.append(f'a merchant has no price edge ({perk})')
        await J("() => document.querySelector('[data-sell=\"wine\"][data-n=\"all\"]').click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
        got = await J("() => window.helmline.state.purse") - before
        print('sold 20 casks for', got)
        if got < 100: errs.append(f'the sale paid too little ({got})')
        # finish an ambition: hold enough in the purse, or sell enough
        await J("() => { const s = window.helmline.state; for (const a of s.ambitions.active) if (!a.big) { if (a.kind === 'purse') s.purse = a.target + 10; else { a.target = 1; a.base = -1e9; } } }")
        await pg.wait_for_timeout(1300)
        st2 = await J("() => { const s = window.helmline.state; return { done: s.ambitions.done, merit: s.callingMeta.merit, offers: (s.ambitions.offers || []).map((a) => [a.calling, a.text]) }; }")
        print('after:', st2)
        if st2['done'] < 1: errs.append('no ambition was achieved')
        if st2['merit']['merchant'] < 3: errs.append('no merit for it')
        title = await J("() => document.getElementById('modal').hidden ? '' : document.getElementById('modal-title').textContent")
        print('dialog now:', title, await J("() => import('./js/ambitions.js').then((A) => [A.needsChoice(window.helmline.state), JSON.stringify({m: !!window.helmline.ui.modal, s: window.helmline.ui.screen, a: !!window.helmline.ui.arrival, later: window.helmline.ui.ambitionsLater, ps: !!window.helmline.ui.pendingSummary})])"))
        if title != 'Your next ambition':
            await ok_modals(pg); await pg.wait_for_timeout(1200)
            title = await J("() => document.getElementById('modal').hidden ? '' : document.getElementById('modal-title').textContent")
            if title != 'Your next ambition': errs.append(f'the next ambition was not offered ({title})')
            await J("() => document.querySelector('[data-amb=\"choose\"]')?.click()"); await pg.wait_for_timeout(300)
        if len(st2['offers']) != 3 or sum(1 for c, _ in st2['offers'] if c != 'merchant') != 1: errs.append(f'offers are not two of the calling and one other: {st2["offers"]}')
        await pg.screenshot(path=f'{SP}/callings-2-offers.png')
        await J("() => document.querySelector('#modal-body [data-modal-action]').click()")
        for _ in range(20):
            await pg.wait_for_timeout(250)
            if await J("() => window.helmline.state.ambitions.active.length >= 3"): break
            if await J("() => !document.getElementById('modal').hidden && document.getElementById('modal-title').textContent === 'Your next ambition'"):
                await J("() => document.querySelector('#modal-body [data-modal-action]').click()")
        n = await J("() => window.helmline.state.ambitions.active.length")
        if n != 3: errs.append(f'{n} ambitions after choosing')
        # changing calling: free in the first year, costly after
        cost = await J("() => import('./js/callings.js').then((C) => C.switchCost(window.helmline.state))")
        if not cost['free']: errs.append('changing calling in the first year is not free')
        await J("() => { const s = window.helmline.state; s.calling.since = s.day - 365 * 5; }")
        cost = await J("() => import('./js/callings.js').then((C) => C.switchCost(window.helmline.state))")
        print('cost of leaving after five years:', cost)
        if cost['free'] or cost['standing'] < 10: errs.append(f'leaving after five years costs too little: {cost}')
        await J("() => document.querySelector('[data-amb=\"calling\"]').click()"); await pg.wait_for_timeout(300)
        body = await J("() => document.getElementById('modal-body').innerText")
        if 'standing' not in body: errs.append('the change dialog does not say what it costs')
        await pg.click('#modal-cancel'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/callings-3-box.png')
        # an older save with voyages but no calling is offered one
        await J("() => { const s = window.helmline.state; delete s.calling; delete s.callingMeta; delete s.ambitions; delete s.first; s.voyages = 12; window.helmline.save(); }")
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.click('#intro-continue') if await J("() => !!document.getElementById('intro-continue') && !document.getElementById('intro-continue').hidden") else None
        title = ''
        for _ in range(24):
            await pg.wait_for_timeout(250)
            title = await J("() => document.getElementById('modal').hidden ? '' : document.getElementById('modal-title').textContent")
            if title == 'Choose your calling': break
            if title: await ok_modals(pg)
        if title != 'Choose your calling': errs.append(f'an older save was not offered a calling ({title})')
        else: await pg.click('#modal-cancel'); await pg.wait_for_timeout(300)
        # phone: the box folds to a line
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        ph.on('pageerror', lambda e: errs.append(str(e)))
        await ph.add_init_script("window.helmlineCallings = true;")
        await ph.goto(URL); await ph.wait_for_timeout(1200)
        await ph.click('#intro-new'); await ph.wait_for_timeout(800)
        await ph.evaluate("() => { const s = window.helmline.state; s.voyages = 1; s.first = { done: true }; }")
        await ph.wait_for_timeout(900)
        if await ph.evaluate("() => !document.getElementById('modal').hidden"):
            await ph.screenshot(path=f'{SP}/callings-4-phone-choice.png')
            await ph.click('[data-modal-action="privateer"]'); await ph.wait_for_timeout(600)
        folded = await ph.evaluate("() => document.getElementById('ambitions').classList.contains('folded')")
        h = await ph.evaluate("() => document.getElementById('ambitions').offsetHeight")
        print('phone box folded', folded, 'height', h)
        if not folded or h > 60: errs.append('the box is not folded on a phone')
        wide = await ph.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        if wide: errs.append('the phone page scrolls sideways')
        await ph.screenshot(path=f'{SP}/callings-5-phone.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

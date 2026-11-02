# Taking a sight: on a long passage, once 8 days out with 6 to go, a button offers a sight of the
# Pole Star (once a passage); time stands still while it is open; marking with the sight on the
# star gives extra speed for the rest of the passage; a short hop offers none; south of the line only an astrolabe
# (the sun) will do. Desktop and phone.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def run(b, label, vp, mobile, errs):
    pg = await b.new_page(viewport=vp, is_mobile=mobile, has_touch=mobile)
    pg.on('pageerror', lambda e: errs.append(f'{label}: {e}'))
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.click('#intro-new'); await pg.wait_for_timeout(300)
    await J("() => { const h = window.helmline, s = h.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.purse = 2000; h.setSpeed(0); for (const k in s.discovered) s.discovered[k] = true; }")
    # a short hop: no sight
    await J("() => window.helmline.sail('lagos')")
    if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
    await J("() => window.helmline.sailFor(0.3)"); await pg.wait_for_timeout(800)
    short = await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')")
    print(label, 'sight offered on the hop to Lagos:', short)
    if short: errs.append(f'{label}: a sight offered on a short hop')
    # a long passage: Arguin
    await J("() => { const h = window.helmline; h.dockAt('lisbon'); h.sail('arguin'); }")
    if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
    await J("() => window.helmline.sailFor(2)"); await pg.wait_for_timeout(800)
    early = await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')")
    if early: errs.append(f'{label}: a sight offered before 8 days out')
    await J("() => window.helmline.sailFor(6.5)"); await pg.wait_for_timeout(800)
    shown = await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')")
    print(label, 'sight offered on the passage to Arguin:', shown)
    if not shown: errs.append(f'{label}: no sight offered on a long passage'); await pg.close(); return
    await pg.screenshot(path=f'{SP}/sight-{label}-1-button.png')
    await pg.click('[data-game="sight"]'); await pg.wait_for_timeout(600)
    title = await J("() => document.getElementById('modal-title').textContent")
    print(label, 'dialog:', title)
    day0 = await J("() => window.helmline.state.day")
    await pg.screenshot(path=f'{SP}/sight-{label}-2-sight.png')
    # set the sight on the star and mark when the roll is small
    await J("""() => { const s = window.helmline.state, el = document.getElementById('sight-angle'); el.value = s.ship.lat.toFixed(1); el.dispatchEvent(new Event('input')); }""")
    for i in range(80):
        if await J("() => Math.abs(window.helmline.ui?.sightRoll?.() ?? 0) < 0.4"): break
        await pg.wait_for_timeout(50)
    await pg.click('[data-modal-action="mark"]'); await pg.wait_for_timeout(300)
    st = await J("() => ({ sight: window.helmline.state.ship.passage, day: window.helmline.state.day, btn: !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]') })")
    print(label, 'after marking:', st)
    if abs(st['day'] - day0) > 0.01: errs.append(f'{label}: time passed while taking the sight')
    if not st['sight'] or st['sight']['grade'] == 'miss': errs.append(f'{label}: a sight on the star was not graded good')
    await pg.wait_for_timeout(700)
    if await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')"): errs.append(f'{label}: the button is offered again at once')
    k = await J("async () => { const Sg = await import('/js/navsight.js'); return Sg.boost(window.helmline.state); }")
    await J("() => window.helmline.sailFor(3)"); await pg.wait_for_timeout(700)
    if await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')"): errs.append(f'{label}: a second sight offered on the same passage')
    k2 = await J("async () => { const Sg = await import('/js/navsight.js'); return Sg.boost(window.helmline.state); }")
    if k2 != k: errs.append(f'{label}: the bonus did not last the passage')
    print(label, 'speed factor now:', k)
    if k <= 1: errs.append(f'{label}: no speed from the sight')
    # south of the line, no astrolabe: nothing to sight; with one: the sun
    south = await J("""async () => { const Sg = await import('/js/navsight.js'); const s = window.helmline.state; const lat = s.ship.lat; s.ship.lat = -5; s.ship.passage = { start: s.day - 10, sighted: false, mult: 1 };
        const a = Sg.offer(s, 3000, 5).ok; s.ship.fit.nav = 'astrolabe'; const b = Sg.offer(s, 3000, 5); s.ship.lat = lat; s.ship.fit.nav = 'dead'; return [a, b.ok, b.body?.id]; }""")
    print(label, 'south of the line, no astrolabe / astrolabe:', south)
    if south[0] or not south[1] or south[2] != 'sun': errs.append(f'{label}: the sun sight south of the line is wrong')
    # the traverse board: a new passage, 3 days out
    await J("() => { const h = window.helmline; h.dockAt('lisbon'); h.sail('arguin'); }")
    if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
    await J("() => window.helmline.sailFor(3.5)"); await pg.wait_for_timeout(800)
    if not await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=board]')"): errs.append(f'{label}: no traverse board offered')
    else:
        await pg.click('[data-game="board"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/sight-{label}-3-board.png')
        calls = await J("() => window.helmline.ui.boardCalls")
        for c in calls:
            await pg.click(f'#board [data-point="{c}"]'); await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(300)
        P = await J("() => window.helmline.state.ship.passage")
        print(label, 'traverse board:', P.get('board'), P.get('boardMult'))
        if P.get('board') != 'fine': errs.append(f'{label}: a perfect board was not graded fine')
    # the astrolabe and the almanac: shoot the sun 8 days out, hold the light, work the sum
    await J("() => { const h = window.helmline, s = h.state; s.ship.fit.nav = 'almanac'; s.ship.passage.start = s.day - 9; }"); await pg.wait_for_timeout(800)
    if not await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=sight]')"): errs.append(f'{label}: no sun sight offered with an astrolabe')
    else:
        await pg.click('[data-game="sight"]'); await pg.wait_for_timeout(300)
        title = await J("() => document.getElementById('modal-title').textContent")
        if title != 'Shoot the sun at noon': errs.append(f'{label}: the astrolabe game did not open ({title})')
        # keep the alidade on the sun as the astrolabe swings
        for i in range(120):
            if await J("() => document.getElementById('modal-title').textContent") != 'Shoot the sun at noon': break
            await J("() => { const u = window.helmline.ui, el = document.getElementById('sight-angle'); if (el) { el.value = (u.sightAlt - u.sightRoll()).toFixed(1); el.dispatchEvent(new Event('input')); } }")
            if i == 10: await pg.screenshot(path=f'{SP}/sight-{label}-4-astrolabe.png')
            await pg.wait_for_timeout(60)
        title = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print(label, 'after the astrolabe:', title)
        if title != 'Work the latitude': errs.append(f'{label}: no almanac sum after a good sun sight')
        else:
            await pg.screenshot(path=f'{SP}/sight-{label}-5-almanac.png')
            right = await J("""async () => { const Sg = await import('/js/navsight.js'); const s = window.helmline.state; const dec = Sg.declination(s.day);
                const h = Math.round((90 - Math.abs(s.ship.lat - dec)) * 2) / 2; const v = Math.round(Sg.latFrom(h, dec, s.ship.lat >= dec) * 2) / 2;
                return `${Math.abs(v)}° ${v >= 0 ? 'north' : 'south'}`; }""")
            btns = await J("() => [...document.querySelectorAll('#modal-body [data-modal-action]')].map((b) => b.textContent)")
            print(label, 'sums offered:', btns, 'right:', right)
            if right not in btns: errs.append(f'{label}: the right sum is not offered')
            else: await pg.click(f'#modal-body [data-modal-action] >> text="{right}"'); await pg.wait_for_timeout(300)
            P = await J("() => window.helmline.state.ship.passage")
            print(label, 'after the sum:', P.get('grade'), P.get('mult'))
            if P.get('grade') != 'fine': errs.append(f'{label}: the right sum did not make a fine sight')
    # the lead: a nau coming in to Safi (open roadstead, she lies off)
    await J("() => { const h = window.helmline, s = h.state; s.ship.fit.nav = 'dead'; s.ship.hull = 'nau'; s.contracts.unlocked = true; h.dockAt('lisbon'); s.cargo.wine = 100; h.sail('safi'); }")
    if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
    for i in range(20):
        await J("() => window.helmline.sailFor(0.5)"); await pg.wait_for_timeout(600)
        if await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=lead]')") or await J("() => window.helmline.state.ship.docked"): break
    if not await J("() => !!document.querySelector('#pilot-games:not([hidden]) [data-game=lead]')"): errs.append(f'{label}: no lead offered coming in to Safi laden')
    else:
        await pg.click('[data-game="lead"]'); await pg.wait_for_timeout(200)
        for i in range(200):
            if await J("() => window.helmline.ui.leadPaid() >= window.helmline.ui.leadBottom"): break
            await pg.wait_for_timeout(25)
        await pg.screenshot(path=f'{SP}/sight-{label}-6-lead.png')
        await pg.click('[data-modal-action="bottom"]'); await pg.wait_for_timeout(200)
        P = await J("() => window.helmline.state.ship.passage")
        print(label, 'the lead:', P.get('lead'))
        if P.get('lead') not in ('fine', 'good'): errs.append(f'{label}: a timely sounding was not graded')
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        await run(b, 'desktop', {'width': 1280, 'height': 860}, False, errs)
        await run(b, 'phone', {'width': 390, 'height': 800}, True, errs)
        print('ERRORS', errs); await b.close()

asyncio.run(main())

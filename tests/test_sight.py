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
    short = await J("() => !document.getElementById('sight-btn').hidden")
    print(label, 'sight offered on the hop to Lagos:', short)
    if short: errs.append(f'{label}: a sight offered on a short hop')
    # a long passage: Arguin
    await J("() => { const h = window.helmline; h.dockAt('lisbon'); h.sail('arguin'); }")
    if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')
    await J("() => window.helmline.sailFor(2)"); await pg.wait_for_timeout(800)
    early = await J("() => !document.getElementById('sight-btn').hidden")
    if early: errs.append(f'{label}: a sight offered before 8 days out')
    await J("() => window.helmline.sailFor(6.5)"); await pg.wait_for_timeout(800)
    shown = await J("() => !document.getElementById('sight-btn').hidden")
    print(label, 'sight offered on the passage to Arguin:', shown)
    if not shown: errs.append(f'{label}: no sight offered on a long passage'); await pg.close(); return
    await pg.screenshot(path=f'{SP}/sight-{label}-1-button.png')
    await pg.click('#sight-btn'); await pg.wait_for_timeout(600)
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
    st = await J("() => ({ sight: window.helmline.state.ship.passage, day: window.helmline.state.day, btn: !document.getElementById('sight-btn').hidden })")
    print(label, 'after marking:', st)
    if abs(st['day'] - day0) > 0.01: errs.append(f'{label}: time passed while taking the sight')
    if not st['sight'] or st['sight']['grade'] == 'miss': errs.append(f'{label}: a sight on the star was not graded good')
    await pg.wait_for_timeout(700)
    if await J("() => !document.getElementById('sight-btn').hidden"): errs.append(f'{label}: the button is offered again at once')
    k = await J("async () => { const Sg = await import('/js/navsight.js'); return Sg.boost(window.helmline.state); }")
    await J("() => window.helmline.sailFor(3)"); await pg.wait_for_timeout(700)
    if await J("() => !document.getElementById('sight-btn').hidden"): errs.append(f'{label}: a second sight offered on the same passage')
    k2 = await J("async () => { const Sg = await import('/js/navsight.js'); return Sg.boost(window.helmline.state); }")
    if k2 != k: errs.append(f'{label}: the bonus did not last the passage')
    print(label, 'speed factor now:', k)
    if k <= 1: errs.append(f'{label}: no speed from the sight')
    # south of the line, no astrolabe: nothing to sight; with one: the sun
    south = await J("""async () => { const Sg = await import('/js/navsight.js'); const s = window.helmline.state; const lat = s.ship.lat; s.ship.lat = -5; s.ship.passage = { start: s.day - 10, sighted: false, mult: 1 };
        const a = Sg.offer(s, 3000, 5).ok; s.ship.fit.nav = 'astrolabe'; const b = Sg.offer(s, 3000, 5); s.ship.lat = lat; s.ship.fit.nav = 'dead'; return [a, b.ok, b.body?.id]; }""")
    print(label, 'south of the line, no astrolabe / astrolabe:', south)
    if south[0] or not south[1] or south[2] != 'sun': errs.append(f'{label}: the sun sight south of the line is wrong')
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        await run(b, 'desktop', {'width': 1280, 'height': 860}, False, errs)
        await run(b, 'phone', {'width': 390, 'height': 800}, True, errs)
        print('ERRORS', errs); await b.close()

asyncio.run(main())

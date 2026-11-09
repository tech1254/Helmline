# The story, Acts II to IV (1469-1499), for both houses: each beat shows when its moment comes,
# choices have their effects (the Guinea lease, Prince João's commission, backing Columbus, the
# India fleet; for Castile the Guinea venture, Gran Canaria, a caravel for the Admiral), beats
# the years passed by are skipped, not shown late, and backing Columbus from Lisbon charts the
# Indies for your house and brings the War of the Line.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def story(pg, seen, pick='primary'):
    """Read every story card and letter now showing; take the primary choice."""
    for _ in range(12):
        st = await pg.evaluate("() => { const m = document.getElementById('modal'); if (m.hidden) return null; return { title: document.getElementById('modal-title').textContent, story: !!document.querySelector('#modal-body .story'), ok: !document.getElementById('modal-ok').hidden }; }")
        if not st: return
        if st['story']: seen.append(st['title'])
        if st['story'] and await pg.evaluate("() => !!document.querySelector('#modal-body .story-choices button.primary')"):
            await pg.click('#modal-body .story-choices button.primary')
        elif st['ok']: await pg.click('#modal-ok')
        else: return
        await pg.wait_for_timeout(250)

async def fresh(pg, nation):
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#intro', state='visible')
    await pg.click('#intro-new'); await pg.wait_for_timeout(200)
    if await J("() => !document.getElementById('intro-nation').hidden"):
        await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1200)
    await story(pg, [])
    # Act I is done: mark its beats as read
    await J("() => import('./js/story.js').then((St) => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 30000; s.voyages = 8; s.contracts.unlocked = true; s.contracts.standing = 40; for (const b of St.beatsFor(s)) if (b.act === 1) s.story.fired[b.id] = s.story.fired[b.id] ?? 1; s.story.pages[1] = 1; s.skipOffered = true; })")

async def go(pg, y, m, d, port, seen):
    await pg.evaluate(f"() => {{ const s = window.helmline.state; const t = window.helmline.yearDay({y}) + Math.round((Date.UTC({y}, {m - 1}, {d}) - Date.UTC({y}, 0, 1)) / 864e5); if (t > s.day) window.helmline.advance(t - s.day); }}")
    await pg.wait_for_timeout(200)
    await story(pg, seen)
    await pg.evaluate(f"() => window.helmline.dockAt('{port}')"); await pg.wait_for_timeout(300)
    await pg.evaluate("() => { window.helmline.ui.arrival = null; }")
    for _ in range(3):
        await pg.wait_for_timeout(700)
        await story(pg, seen)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true; window.helmlineStory = true;")
        J = lambda js: pg.evaluate(js)

        # Portugal, sailing through the years
        await fresh(pg, 'portugal')
        seen = []
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1469) + 140; }")
        await go(pg, 1469, 6, 5, 'lisbon', seen)
        lease = await J("() => [window.helmline.state.story.choices.lease, window.helmline.state.race?.grants?.mina?.by]")
        print('the Guinea lease:', lease)
        if lease != ['bid', 'you']: errs.append(f'the Guinea lease bid did not take: {lease}')
        await pg.screenshot(path=f'{SP}/acts-1-portugal.png')
        await go(pg, 1474, 3, 5, 'lisbon', seen)
        await go(pg, 1475, 5, 20, 'lisbon', seen)
        await J("() => window.helmline.war().serve(window.helmline.state, 4)")
        await go(pg, 1479, 9, 10, 'lisbon', seen)
        cap = await J("() => !!window.helmline.state.story.captainOfGuinea")
        if not cap: errs.append('Prince João did not reward the commission at the peace')
        await go(pg, 1481, 9, 5, 'lisbon', seen)
        await go(pg, 1482, 2, 1, 'lisbon', seen)
        await go(pg, 1484, 6, 5, 'lisbon', seen)
        backed = await J("() => !!window.helmline.state.story.backedColon")
        if not backed: errs.append('could not back Colombo')
        await go(pg, 1488, 12, 20, 'lisbon', seen)
        await go(pg, 1493, 3, 10, 'lisbon', seen)
        indies = await J("() => [!!window.helmline.state.discovered.santodomingo, window.helmline.state.race.firsts.santodomingo?.by]")
        print('Colombo for the house:', indies)
        if indies != [True, 'you']: errs.append(f'backing Colombo did not chart the Indies for the house: {indies}')
        await go(pg, 1493, 6, 5, 'lisbon', seen)
        war = await J("() => window.helmline.war().current(window.helmline.state)?.id || null")
        print('June 1493:', war)
        if war != 'line': errs.append(f'no War of the Line after backing Colombo: {war}')
        await go(pg, 1496, 2, 1, 'lisbon', seen)
        purse0 = await J("() => window.helmline.state.purse")
        await go(pg, 1499, 9, 15, 'lisbon', seen)
        paid = await J("() => window.helmline.state.story.indiaShare")
        print('the India share:', paid)
        if paid != 'paid': errs.append('the India share did not pay')
        print('Portugal saw:', seen)
        for t in ['The Guinea lease', 'Act II: the war for Guinea', 'A commission for the war', 'The end of Act II: the peace of Alcaçovas', 'Act III: the Cape', 'The castle at the Mina', 'A Genoese with a plan', 'The end of Act III: the Cape of Good Hope', 'Act IV: the Indies are yours', 'The fleet for India', 'The end of Act IV: the way to India']:
            if t not in seen: errs.append(f'Portugal never saw "{t}"')
        await pg.screenshot(path=f'{SP}/acts-2-end.png')

        # Portugal, letting the years pass: the lease is skipped, not shown late
        await fresh(pg, 'portugal')
        seen = []
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1474) + 59; }")
        await go(pg, 1474, 3, 2, 'lisbon', seen)
        print('after the skip:', seen)
        if 'The Guinea lease' in seen: errs.append('the 1469 lease was shown in 1474')
        if 'Act II: the war for Guinea' not in seen: errs.append('Act II did not open after the skip')

        # Castile
        await fresh(pg, 'castile')
        seen = []
        await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1475) + 130; }")
        await go(pg, 1475, 5, 25, 'seville', seen)
        await go(pg, 1477, 10, 5, 'sanlucar', seen)
        await go(pg, 1479, 9, 10, 'seville', seen)
        await go(pg, 1480, 6, 5, 'seville', seen)
        await go(pg, 1483, 6, 5, 'seville', seen)
        await go(pg, 1486, 5, 5, 'palos', seen)
        await go(pg, 1492, 1, 5, 'palos', seen)
        await go(pg, 1492, 5, 25, 'palos', seen)
        await go(pg, 1493, 3, 20, 'palos', seen)
        cs = await J("() => [window.helmline.state.story.vera, !!window.helmline.state.story.sailedWithColon, window.helmline.state.race.firsts.santodomingo?.by]")
        print('Castile:', cs)
        if cs != ['paid', True, 'you']: errs.append(f'Castile\'s acts did not take: {cs}')
        print('Castile saw:', seen)
        for t in ['Act II: the war of the queens', 'A fleet for the Mina', 'Gran Canaria', 'The end of Act III: Granada', 'Two caravels for the Genoese', 'The Admiral comes home']:
            if t not in seen: errs.append(f'Castile never saw "{t}"')
        await pg.screenshot(path=f'{SP}/acts-3-castile.png')
        # phone
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await J("() => { window.helmline.panel('rutter'); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/acts-4-phone.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

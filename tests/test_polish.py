# Small things that add up, on a phone: the bell counts only alerts; a row of tabs too wide for the
# panel fades where there are more; the feitoria is offered below the goods and only when you can
# found one; and pressing and holding the time button pauses at once.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.notices = s.notices || []; s.noticeSeq = s.noticeSeq || 0; s.noticesRead = s.noticeSeq; }")
        # the bell: three plain notices and one alert make one unread
        await J("""() => { const s = window.helmline.state; for (let i = 0; i < 3; i++) { s.noticeSeq++; s.notices.push({ id: s.noticeSeq, day: s.day, html: 'news ' + i, kind: 'port' }); }
            s.noticeSeq++; s.notices.push({ id: s.noticeSeq, day: s.day, html: 'a ship lost', kind: 'alert' }); }""")
        await pg.wait_for_timeout(300)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(100)
        badge = await J("() => { const b = document.getElementById('notices-count'); return b.hidden ? null : b.textContent; }")
        print('bell after 3 notices and 1 alert:', badge)
        if badge != '1': errs.append(f'the bell counts {badge}, not just the alert')
        # tabs: with Contracts and Fleet open, the row is wider than a phone's panel
        await J("() => { const s = window.helmline.state; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 9000; }")
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        t = await J("() => { const t = document.querySelector('#panel .tabs'); return { over: t.scrollWidth > t.clientWidth, right: t.classList.contains('more-right'), left: t.classList.contains('more-left'), tabs: [...t.querySelectorAll('button')].map((b) => b.textContent) }; }")
        print('tabs at Market:', t)
        if t['over'] and not t['right']: errs.append('no fade where tabs run off the right')
        await pg.screenshot(path=f'{SP}/polish-tabs.png')
        await J("() => window.helmline.panel('fleet')"); await pg.wait_for_timeout(200)
        t2 = await J("() => { const t = document.querySelector('#panel .tabs'), on = t.querySelector('.on').getBoundingClientRect(), r = t.getBoundingClientRect(); return { onVisible: on.left >= r.left - 1 && on.right <= r.right + 1, left: t.classList.contains('more-left') }; }")
        print('tabs at Fleet:', t2)
        if not t2['onVisible']: errs.append('the open tab is scrolled out of sight')
        # the feitoria: not offered where you cannot found one; below the goods where you can
        await J("() => { window.helmline.state.contracts.standing = 5; window.helmline.dockAt('safi'); }"); await pg.wait_for_timeout(200)
        low = await J("() => !!document.querySelector('[data-feitoria]')")
        await J("() => { window.helmline.state.contracts.standing = 25; window.helmline.state.purse = 9000; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        pos = await J("() => { const f = document.querySelector('[data-feitoria]'), t = document.querySelector('#panel table.market'); return f && t ? !!(t.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) : null; }")
        print('feitoria offered at standing 5:', low, '| at 25 with 9000 cz, below the goods:', pos)
        if low: errs.append('a feitoria was offered to a captain who cannot found one')
        if pos is not True: errs.append('the feitoria is not offered below the goods')
        # press and hold the time button: paused at once
        await J("() => { window.helmline.panel(null); window.helmline.setSpeed(2); }")
        box = await pg.locator('#dock-time').bounding_box()
        await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await pg.mouse.down(); await pg.wait_for_timeout(650); await pg.mouse.up(); await pg.wait_for_timeout(100)
        sp = await J("() => document.getElementById('dock-time').innerText.replace(/\\n/g, ' ')")
        print('after a long press at 2x:', sp)
        if 'Paused' not in sp: errs.append('a long press did not pause')
        await pg.tap('#dock-time'); await pg.wait_for_timeout(80)
        sp2 = await J("() => document.getElementById('dock-time').innerText.replace(/\\n/g, ' ')")
        print('then a tap:', sp2)
        if sp2 != '1× Speed': errs.append('a tap after pausing did not go to 1x')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

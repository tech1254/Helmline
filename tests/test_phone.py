import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 360, 'height': 740}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.tap('#intro-new'); await pg.wait_for_timeout(400)
        await pg.tap('[data-close]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=sys.argv[1]+'/23-phone.png')
        # The phone layout: one row at the top, the controls in a bar at the bottom.
        lay = await pg.evaluate("""() => { const hud = document.getElementById('hud').getBoundingClientRect(), dock = document.getElementById('dock').getBoundingClientRect();
            const shown = [...document.querySelectorAll('#hud .controls > *')].filter(e => e.offsetParent).map(e => e.id);
            return { hudHeight: Math.round(hud.height), dockTop: Math.round(dock.top), screen: innerHeight, topButtons: shown }; }""")
        print('layout:', lay)
        if lay['hudHeight'] > 60 or lay['topButtons'] != ['btn-notices']: errs.append(f'top bar not compact: {lay}')
        speed = lambda: pg.evaluate("() => document.getElementById('dock-speed').innerText.split('\\n')[0] + ' ' + document.getElementById('dock-play').innerText.split('\\n')[1]")
        await pg.tap('#dock-speed'); s1 = await speed(); await pg.tap('#dock-speed'); s2 = await speed(); await pg.tap('#dock-play'); s3 = await speed(); await pg.tap('#dock-play'); s4 = await speed()
        print('speed taps:', s1, '|', s2, '|', s3, '|', s4)
        if s1 != '2× Pause' or s2 != '4× Pause' or s3 != '4× Play' or s4 != '4× Pause': errs.append('speed or pause buttons wrong')
        await pg.tap('#dock-books'); await pg.wait_for_timeout(150)
        books = await pg.evaluate("() => ({ title: document.querySelector('#panel h2').textContent, tabs: [...document.querySelectorAll('#panel .tabs button')].map(b => b.textContent) })")
        print('Books in port:', books)
        if books['title'] != 'Lisbon' or 'Ledger' not in books['tabs']: errs.append('Books did not open the market with tabs')
        await pg.tap('[data-tab="ledger"]'); await pg.tap('#dock-books'); await pg.wait_for_timeout(100)
        await pg.tap('#dock-books'); await pg.wait_for_timeout(100)
        again = await pg.evaluate("() => document.querySelector('#panel h2').textContent")
        print('Books reopens the last tab:', again)
        if again != 'Ledger': errs.append('Books did not reopen the last tab')
        await pg.tap('#dock-more'); await pg.wait_for_timeout(100)
        menu = await pg.evaluate("() => [...document.querySelectorAll('[data-menu]')].map(b => b.querySelector('b').textContent)")
        print('More:', menu)
        await pg.tap('[data-menu="wind"]'); wind = await pg.evaluate("() => document.getElementById('btn-wind').classList.contains('on')")
        print('winds after tapping Hide:', wind)
        if wind: errs.append('Hide the winds did not work')
        await pg.tap('[data-menu="help"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=sys.argv[1]+'/24-phone-help.png')
        await pg.tap('[data-close]'); await pg.wait_for_timeout(200)
        # A long time-away summary on a small phone: it must fit, scroll, and close.
        small = await b.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=2, has_touch=True, is_mobile=True)
        q = await small.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
        await q.goto(URL); await q.wait_for_selector('#intro', state='visible'); await q.tap('#intro-new'); await q.wait_for_timeout(300)
        await q.evaluate("""() => { const h = window.helmline, s = h.state; s.pirates.cooldown = 1e9; s.purse = 9000; s.contracts.unlocked = true; s.contracts.standing = 25;
            s.fleet.ships.push({ id: 99, name: 'Santa Clara', captain: { id: 99, name: 'Nuno Gomes', nav: 4, trade: 3, wage: 3, loyalty: 100 }, at: 'lisbon', status: 'idle', route: null, leg: null, hold: {}, profit: 0, trips: 0, last: null }); }""")
        await q.evaluate("""() => { const m = []; for (let i = 0; i < 14; i++) m.push({ html: `News: item ${i}. A long line of news from a distant port, to make the summary run on.`, kind: '' });
            window.__long = m; }""")
        await q.evaluate("() => window.helmline.away(600)")
        await q.wait_for_timeout(300)
        # pad the summary body to well beyond the screen
        await q.evaluate("""() => { const b = document.getElementById('modal-body'); b.insertAdjacentHTML('beforeend', '<ul class="help">' + window.__long.map(m => `<li>${m.html}</li>`).join('') + '</ul>'); }""")
        await q.wait_for_timeout(100)
        geo = await q.evaluate("""() => { const c = document.querySelector('#modal .card').getBoundingClientRect(), ok = document.getElementById('modal-ok').getBoundingClientRect(), body = document.getElementById('modal-body');
            return { cardBottom: Math.round(c.bottom), screen: innerHeight, okBottom: Math.round(ok.bottom), scrolls: body.scrollHeight > body.clientHeight, visible: !document.getElementById('modal').hidden }; }""")
        print('long summary on a 640 px phone:', geo)
        if not geo['visible'] or geo['cardBottom'] > geo['screen'] or geo['okBottom'] > geo['screen'] or not geo['scrolls']:
            errs.append(f'summary does not fit and scroll: {geo}')
        await q.screenshot(path=sys.argv[1]+'/45-phone-summary.png')
        await q.tap('#modal-ok'); await q.wait_for_timeout(200)
        closed = await q.evaluate("() => document.getElementById('modal').hidden")
        print('Carry on tapped, closed:', closed)
        if not closed: errs.append('could not close the summary on a phone')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

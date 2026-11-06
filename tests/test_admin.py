# The harbour office (admin.html): only an admin account sees it; it shows players by day and
# source, where they came from, feedback (with a status to set) and accounts (with settings to
# change). Desktop and phone.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        base = URL.rstrip('/')
        J = lambda js: pg.evaluate(js)
        await pg.goto(base + '/admin.html'); await pg.wait_for_timeout(500)
        if not await J("() => !document.getElementById('signin').hidden"): errs.append('no sign-in for a stranger')
        # two accounts: one admin
        for name in ('Harbourmaster', 'Deckhand'):
            r = await pg.request.post(base + '/api/account/register', data=json.dumps({'name': name, 'password': 'correct horse'}))
            if r.status not in (200, 201): errs.append(f'register {name}: {r.status}')
        await pg.request.post(base + '/__test/flags', data=json.dumps({'name': 'Harbourmaster', 'flags': {'admin': True}}))
        # some players and some feedback
        for i, (src, ref) in enumerate([('itch', 'allan.itch.io'), ('itch', 'allan.itch.io'), ('direct', None), ('other', 'reddit.com')]):
            await pg.request.post(base + '/api/hello', data=json.dumps({'device': f'dplayer{i:04d}', 'kind': 'start', 'source': src, 'ref': ref, 'mobile': i % 2 == 0}))
            await pg.request.post(base + '/api/hello', data=json.dumps({'device': f'dplayer{i:04d}', 'kind': 'beat', 'source': src, 'ref': ref}))
        await pg.request.post(base + '/api/feedback', data=json.dumps({'kind': 'bug', 'message': 'The map froze near Arguin.'}))
        # the deckhand is turned away
        await pg.fill('#si-name', 'Deckhand'); await pg.fill('#si-pass', 'correct horse'); await pg.click('#signin-form button'); await pg.wait_for_timeout(600)
        msg = await J("() => document.getElementById('si-err').textContent")
        print('deckhand:', msg)
        if 'not an admin' not in msg: errs.append('a non-admin was not turned away')
        # the harbourmaster sees the office
        await pg.fill('#si-name', 'Harbourmaster'); await pg.fill('#si-pass', 'correct horse'); await pg.click('#signin-form button'); await pg.wait_for_timeout(800)
        kpis = await J("() => [...document.querySelectorAll('.kpi')].map((k) => k.innerText.replace('\\n', ' '))")
        print('figures:', kpis)
        if not kpis or not kpis[0].startswith('4'): errs.append(f'players ever not 4: {kpis[:1]}')
        refs = await J("() => [...document.querySelectorAll('#refs tbody tr')].map((r) => r.innerText.replace(/\\t/g, ' | '))")
        print('where from:', refs)
        if not any('allan.itch.io' in r and 'itch.io' in r for r in refs): errs.append('itch.io not shown as a source')
        await pg.screenshot(path=f'{SP}/admin-1.png', full_page=True)
        # feedback status
        sel = pg.locator('#feedback select').first
        await sel.select_option('backlog'); await pg.wait_for_timeout(400)
        fb = await J("() => fetch('/__test/feedback').then((r) => r.json())")
        print('feedback status:', [f['status'] for f in fb])
        if fb[-1]['status'] != 'backlog': errs.append('the feedback status was not saved')
        # an account's settings
        await pg.fill('#flags-Deckhand', '{"speed10": true}'); await pg.click('[data-flags="Deckhand"]'); await pg.wait_for_timeout(400)
        r = await pg.request.post(base + '/api/account/login', data=json.dumps({'name': 'Deckhand', 'password': 'correct horse'}))
        flags = (await r.json())['account']['flags']
        print('deckhand settings now:', flags)
        if not flags.get('speed10'): errs.append('settings were not saved')
        # the API turns away a non-admin token
        tok = (await r.json())['token']
        st = await pg.request.get(base + '/api/admin/stats', headers={'authorization': f'Bearer {tok}'})
        if st.status != 403: errs.append(f'the stats API answered a non-admin ({st.status})')
        # phone
        ph = await b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True)
        await ph.goto(base + '/'); await ph.evaluate(f"() => localStorage.setItem('helmline-account-v1', localStorage.getItem('helmline-account-v1'))")
        await ph.close()
        await pg.set_viewport_size({'width': 390, 'height': 800}); await pg.wait_for_timeout(300)
        wide = await J("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        if wide: errs.append('the office scrolls sideways on a phone')
        await pg.screenshot(path=f'{SP}/admin-2-phone.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

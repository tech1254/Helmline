# Usage counts: opening the game sends a 'start' for this browser; time played adds minutes; one
# row per browser per day, and the day it was first seen. The API answers pages served by itch.io
# (CORS), and not other sites.
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineUsage = true;")
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible')
        await pg.click('#intro-new'); await pg.wait_for_timeout(800)
        u = await J("() => fetch('/__test/usage').then((r) => r.json())")
        dev = await J("() => localStorage.getItem('helmline-device')")
        mine = [r for r in u['usage'] if r['device'] == dev]
        print('usage rows for this browser:', mine, '| first seen:', [d for d in u['devices'] if d['device'] == dev])
        if not mine or mine[0]['sessions'] < 1: errs.append('no start counted')
        # a beat: two minutes played
        await J(f"() => fetch('/api/hello', {{ method: 'POST', body: JSON.stringify({{ device: '{dev}', kind: 'beat', source: 'other' }}) }})")
        u = await J("() => fetch('/__test/usage').then((r) => r.json())")
        m = [r for r in u['usage'] if r['device'] == dev][0]['minutes']
        print('minutes after a beat:', m)
        if m != 2: errs.append('a beat did not add two minutes')
        # CORS: an itch.io page may call the API; another site may not
        base = URL.rstrip('/')
        ok = await pg.request.fetch(base + '/api/hello', method='OPTIONS', headers={'origin': 'https://html-classic.itch.zone', 'access-control-request-method': 'POST'})
        bad = await pg.request.fetch(base + '/api/hello', method='OPTIONS', headers={'origin': 'https://evil.example', 'access-control-request-method': 'POST'})
        post = await pg.request.post(base + '/api/hello', headers={'origin': 'https://html-classic.itch.zone'}, data=json.dumps({'device': 'dtest12345', 'kind': 'start', 'source': 'itch', 'ref': 'allan.itch.io'}))
        print('preflight itch:', ok.status, ok.headers.get('access-control-allow-origin'), '| other site:', bad.status, '| post from itch:', post.status, post.headers.get('access-control-allow-origin'))
        if ok.status != 204 or ok.headers.get('access-control-allow-origin') != 'https://html-classic.itch.zone': errs.append('itch.io preflight refused')
        if bad.status != 403: errs.append('another site was allowed')
        if post.headers.get('access-control-allow-origin') != 'https://html-classic.itch.zone': errs.append('no CORS header for itch.io')
        u = await J("() => fetch('/__test/usage').then((r) => r.json())")
        it = [r for r in u['usage'] if r['device'] == 'dtest12345']
        print('itch row:', it)
        if not it or it[0]['source'] != 'itch' or it[0]['ref'] != 'allan.itch.io': errs.append('the itch.io visit was not counted as such')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

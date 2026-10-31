# Captains' routes, simple and advanced: a new captain's route opens in Simple mode (ports only;
# he sells everything and chooses the cargo); Advanced shows the orders; a route with orders of
# its own opens in Advanced; switching it back to Simple sets the orders aside. Desktop and phone.
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
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 9000; for (const k in s.discovered) s.discovered[k] = true; }")
    await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(200)
    await pg.click('[data-hire]'); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
    card = pg.locator('[data-ship]').first
    mode = await J("() => document.querySelector('.route-mode .on')?.textContent")
    orders = await J("() => document.querySelectorAll('.route-editor [data-order-j]').length")
    print(label, 'new captain: mode', mode, '| order rows', orders)
    if mode != 'Simple' or orders: errs.append(f'{label}: a new route did not open in Simple mode')
    # name three ports and start
    await card.locator('[data-stop-i="1"] [data-f="port"]').select_option('lagos'); await pg.wait_for_timeout(80)
    await card.locator('[data-draft="add-stop"]').click(); await pg.wait_for_timeout(80)
    await card.locator('[data-stop-i="2"] [data-f="port"]').select_option('safi'); await pg.wait_for_timeout(80)
    await card.locator('details.route-edit').evaluate("(d) => d.scrollIntoView()")
    await pg.screenshot(path=f'{SP}/routes-{label}-1-simple.png')
    await card.locator('[data-route]').click(); await pg.wait_for_timeout(300)
    r = await J("() => window.helmline.state.fleet.ships[0].route.stops.map((s) => s.port + ':' + s.orders.map((o) => o.act + ' ' + o.good + (o.pct ? ' ' + o.pct : '')).join(','))")
    print(label, 'route:', r)
    if [x.split(':')[0] for x in r] != ['lisbon', 'lagos', 'safi'] or not all(x.endswith('sell all,buy best 100') for x in r): errs.append(f'{label}: simple route not set as named')
    summary = await J("() => [...document.querySelectorAll('[data-ship] p.muted')].map((p) => p.textContent).find((t) => t.startsWith('Route')) || ''")
    print(label, summary)
    if 'captain chooses' not in summary: errs.append(f'{label}: summary does not say the captain chooses')
    # advanced: the orders show; set one of his own
    await J("() => document.querySelector('[data-ship] details.route-edit').open = true")
    await card.locator('[data-draft="mode-advanced"]').click(); await pg.wait_for_timeout(150)
    orders = await J("() => document.querySelectorAll('.route-editor [data-order-j]').length")
    if orders != 6: errs.append(f'{label}: advanced shows {orders} order rows, not 6')
    await card.locator('[data-stop-i="0"] [data-order-j="1"] [data-f="good"]').select_option('cloth'); await pg.wait_for_timeout(80)
    await pg.screenshot(path=f'{SP}/routes-{label}-2-advanced.png')
    await card.locator('[data-route]').click(); await pg.wait_for_timeout(300)
    # it reopens in Advanced (it has orders of its own)
    await J("() => { window.helmline.state.routeMode = 'simple'; }")
    await J("() => document.querySelector('[data-ship] details.route-edit').open = true")
    await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(100)
    await J("() => document.getElementById('btn-fleet').click()"); await pg.wait_for_timeout(150)
    mode = await J("() => document.querySelector('.route-mode .on')?.textContent")
    print(label, 'route with own orders reopens in:', mode)
    if mode != 'Advanced': errs.append(f'{label}: a route with orders did not reopen in Advanced')
    # back to simple: the orders are set aside
    await J("() => document.querySelector('[data-ship] details.route-edit').open = true")
    await card.locator('[data-draft="mode-simple"]').click(); await pg.wait_for_timeout(150)
    await card.locator('[data-route]').click(); await pg.wait_for_timeout(300)
    simple = await J("() => window.helmline.state.fleet.ships[0].route.stops.every((s) => s.orders.length === 2 && s.orders[1].good === 'best')")
    if not simple: errs.append(f'{label}: switching to Simple did not set the orders aside')
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        await run(b, 'desktop', {'width': 1280, 'height': 860}, False, errs)
        await run(b, 'phone', {'width': 390, 'height': 800}, True, errs)
        print('ERRORS', errs); await b.close()

asyncio.run(main())

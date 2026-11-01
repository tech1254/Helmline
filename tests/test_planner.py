# The voyage planner in Set sail: each port with its passage, what the hold fetches there,
# contracts due there and the best cargo to load here; "Load" buys it (with the usual confirm);
# order by value or nearest; the Plain list switch brings back the old list and is remembered.
# Also how fast it opens with every port charted. Desktop and phone.
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
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.purse = 800; s.cargo.wine = 10; s.paid.wine = 100; }")
    # a contract due at Porto, and prices seen at Porto and Lagos
    await J("""() => { const h = window.helmline, s = h.state, m = h.market(); s.contracts.unlocked = true;
        for (const p of ['porto', 'lagos', 'safi']) s.seen[p] = { day: s.day, prices: m.observe(p) };
        s.contracts.active.push({ id: 999, kind: 'deliver', good: 'wine', qty: 10, to: 'porto', source: 'lisbon', title: 'Deliver 10 casks of wine to Porto', reward: 200, deadline: s.day + 60, patron: 'Test' }); }""")
    await J("() => document.querySelector('[data-tab=\"sail\"]')?.click()"); await pg.wait_for_timeout(250)
    h = await J("() => document.querySelector('#panel h2')?.textContent")
    print(label, 'panel:', h)
    if h != 'Plan a voyage': errs.append(f'{label}: the planner is not the default')
    rows = await J("() => [...document.querySelectorAll('li.plan')].map((li) => li.querySelector('.plan-head b').textContent + ' ' + li.querySelector('.net').textContent)")
    print(label, 'by value:', rows[:5])
    porto = await J("() => [...document.querySelectorAll('li.plan')].find((li) => li.textContent.includes('Porto'))?.innerText || ''")
    if 'Contract: Deliver 10 casks of wine to Porto' not in porto or 'ready in your hold' not in porto: errs.append(f'{label}: the contract is not shown for Porto')
    nets = await J("() => [...document.querySelectorAll('li.plan .net')].map((n) => +n.textContent.replace(/[^0-9-]/g, ''))")
    if nets != sorted(nets, reverse=True): errs.append(f'{label}: not ordered by value')
    await pg.screenshot(path=f'{SP}/planner-{label}-1.png')
    # nearest first
    await pg.click('[data-plan-sort="near"]'); await pg.wait_for_timeout(150)
    print(label, 'nearest:', await J("() => [...document.querySelectorAll('li.plan .plan-head b')].slice(0, 4).map((b) => b.textContent)"))
    # load the suggested cargo for a port
    btn = pg.locator('li.plan [data-buy]').first
    if await btn.count():
        good = await btn.get_attribute('data-buy'); n = int(await btn.get_attribute('data-n'))
        before = await J(f"() => window.helmline.state.cargo['{good}']")
        await btn.click(); await pg.wait_for_timeout(150)
        if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')  # one unit is bought without asking
        await pg.wait_for_timeout(200)
        after = await J(f"() => window.helmline.state.cargo['{good}']")
        print(label, f'loaded {good}: {before} -> {after} (suggested {n})')
        if after - before != n: errs.append(f'{label}: Load did not buy the suggested cargo')
        if await J("() => document.querySelector('#panel h2')?.textContent") != 'Plan a voyage': errs.append(f'{label}: the planner closed after loading')
        # the port loaded for stays in view, and is not offered the same cargo again as if the hold were empty
        focus = await J("() => { const li = document.querySelector('li.plan.focus'); if (!li) return null; const r = li.getBoundingClientRect(), p = document.getElementById('panel').getBoundingClientRect(); return { port: li.dataset.port, visible: r.bottom > p.top && r.top < p.bottom, again: li.querySelector('[data-buy]')?.dataset.buy || null, n: +(li.querySelector('[data-buy]')?.dataset.n || 0) }; }")
        print(label, 'after loading, in view:', focus)
        if not focus or not focus['visible']: errs.append(f'{label}: the port loaded for is not kept in view')
        elif focus['again'] == good and focus['n'] >= n: errs.append(f'{label}: the same cargo is suggested again as if the hold were empty')
    else:
        errs.append(f'{label}: no cargo suggested anywhere')
    # contracts: the offers on this board under the port they go to; take one, then load its goods
    await J("() => { const s = window.helmline.state; s.contracts.standing = 10; s.purse = 3000; s.contracts.active = s.contracts.active.filter((c) => c.id !== 999); window.helmline.panel('sail'); }"); await pg.wait_for_timeout(200)
    offers = await J("() => [...document.querySelectorAll('li.plan .plan-offer')].map((o) => o.closest('li.plan').querySelector('.plan-head b').textContent + ': ' + o.querySelector('p').innerText)")
    board = await J("() => window.helmline.offers('lisbon').map((o) => o.title)")
    print(label, 'offers on the board:', board)
    print(label, 'offers in the planner:', [o[:90] for o in offers])
    if len(offers) < 1: errs.append(f'{label}: no offers in the planner')
    take = pg.locator('li.plan [data-accept]').first
    if await take.count():
        oid = int(await take.get_attribute('data-accept'))
        await take.click(); await pg.wait_for_timeout(250)
        active = await J(f"() => window.helmline.state.contracts.active.some((c) => c.id === {oid})")
        h = await J("() => document.querySelector('#panel h2')?.textContent")
        held = await J("() => document.querySelector('.plan-held')?.innerText || ''")
        print(label, 'took it:', active, '| still in', h, '| your contracts:', held.replace('\n', ' ')[:120])
        if not active: errs.append(f'{label}: Take it did not accept the offer')
        if h != 'Plan a voyage': errs.append(f'{label}: taking an offer left the planner')
        c = await J(f"() => window.helmline.state.contracts.active.find((c) => c.id === {oid})")
        if c['source'] == 'lisbon':
            btn = pg.locator(f'li.plan button[data-buy="{c["good"]}"]', has_text='for the contract')
            full = await J("() => { const s = window.helmline.state; return 25 - Object.values(s.cargo).reduce((a, b) => a + b, 0) <= 0; }")
            if full: print(label, 'hold full: no load button expected', await btn.count())
            elif not await btn.count(): errs.append(f'{label}: no button to load the contract goods')
            else:
                before = await J(f"() => window.helmline.state.cargo['{c['good']}']")
                free = await J("() => { const s = window.helmline.state; return 25 - Object.values(s.cargo).reduce((a, b) => a + b, 0); }")  # a barca's hold
                await btn.first.click(); await pg.wait_for_timeout(150)
                if await J("() => !document.getElementById('modal').hidden"): await pg.click('#modal-ok')  # one unit is bought without asking
                await pg.wait_for_timeout(200)
                have = await J(f"() => window.helmline.state.cargo['{c['good']}']")
                want = c['qty'] + c.get('spare', 0) - before
                print(label, f'loaded for the contract: {before} -> {have} (wanted {want} more, {free} free in the hold)')
                if have - before < min(want, free): errs.append(f'{label}: the contract goods were not loaded')
        await pg.screenshot(path=f'{SP}/planner-{label}-3-contracts.png')
    # the plain list, remembered
    await pg.click('[data-sail-view="list"]'); await pg.wait_for_timeout(150)
    h = await J("() => document.querySelector('#panel h2')?.textContent")
    n = await J("() => document.querySelectorAll('.dests button.dest').length")
    print(label, 'plain list:', h, n, 'ports')
    if h != 'Set a course' or not n: errs.append(f'{label}: the plain list did not come back')
    await J("() => { document.querySelector('[data-tab=\"port\"]').click(); document.querySelector('[data-tab=\"sail\"]').click(); }"); await pg.wait_for_timeout(150)
    if await J("() => document.querySelector('#panel h2')?.textContent") != 'Set a course': errs.append(f'{label}: the switch was not remembered')
    await pg.click('[data-sail-view="planner"]'); await pg.wait_for_timeout(150)
    # speed, with every port charted
    await J("() => { const s = window.helmline.state; for (const k of Object.keys(s.discovered)) s.discovered[k] = true; const m = window.helmline.market(); for (const k of Object.keys(s.discovered)) s.seen[k] = { day: s.day, prices: m.observe(k) }; }")
    for i in range(3):
        ms = await J("() => { const t = performance.now(); document.querySelector('[data-tab=\"port\"]').click(); document.querySelector('[data-tab=\"sail\"]').click(); return Math.round(performance.now() - t); }")
        print(label, f'planner with every port charted, open #{i + 1}: {ms} ms')
    if ms > 400: errs.append(f'{label}: the planner takes {ms} ms to open')
    await pg.screenshot(path=f'{SP}/planner-{label}-2-all.png')
    await pg.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        await run(b, 'desktop', {'width': 1280, 'height': 860}, False, errs)
        await run(b, 'phone', {'width': 390, 'height': 800}, True, errs)
        print('ERRORS', errs); await b.close()

asyncio.run(main())

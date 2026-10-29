# The story, Act I: the prologue card (and the family name), Salvago's debt paid in Lisbon, a
# letter from home, Prince Henry, Mestre Alvaro at Lagos, the rutter's first page at the Gambia
# (Cantor charted), Salvago's offer (a choice), Cadamosto, and the end of Act I. Old saves join
# without the prologue. Phone and desktop.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def run(b, label, vp, mobile, errs):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
    await ctx.add_init_script("window.helmlineStory = true")
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'{label}: {e}'))
    J = lambda js: pg.evaluate(js)
    title = lambda: J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.click('#intro-new'); await pg.wait_for_timeout(1200)
    await J("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmline.state.tips.off = true; }")
    t = await title(); print(label, 'opening:', t)
    if t != 'Lisbon, March 1451': errs.append(f'{label}: no prologue card')
    await pg.screenshot(path=f'{SP}/story-{label}-1-prologue.png')
    await pg.fill('#story-house', 'Teixeira'); await pg.click('#modal-ok'); await pg.wait_for_timeout(300)
    st = await J("() => window.helmline.state.story")
    print(label, 'house:', st['house'], 'debt:', st['debt'])
    if st['house'] != 'Teixeira' or not st['debt']: errs.append(f'{label}: name or debt not set')
    async def read_all(n=6):
        seen = []
        for _ in range(n):
            await pg.wait_for_timeout(700)
            t = await title()
            if not t: break
            seen.append(t)
            if await J("() => !document.getElementById('modal-ok').hidden"): await pg.click('#modal-ok')
            else: await pg.click('#modal-body button.primary')
        return seen
    # pay the debt at the Lisbon market
    await J("() => { window.helmline.state.purse = 700; window.helmline.state.voyages = 1; }")
    await J("() => document.getElementById('btn-port') && (window.helmline.state.ship.docked && null)")
    print(label, 'letters:', await read_all())  # Ines, and Henry once contracts open
    await J("() => { if (!document.querySelector('[data-pay-debt]')) { window.helmline.dockAt('lisbon'); } }"); await pg.wait_for_timeout(300)
    await read_all()
    btn = pg.locator('[data-pay-debt]')
    if not await btn.count(): errs.append(f'{label}: no debt box at Lisbon')
    else:
        await btn.scroll_into_view_if_needed(); await pg.screenshot(path=f'{SP}/story-{label}-2-debt.png'); await btn.click(); await pg.wait_for_timeout(200)
    st = await J("() => window.helmline.state.story")
    print(label, 'debt now:', st['debt'], 'relation', st['relation'])
    if not st['debt'].get('paid'): errs.append(f'{label}: debt not paid')
    # Lagos: Mestre Alvaro
    await J("() => window.helmline.dockAt('lagos')"); seen = await read_all(); print(label, 'at Lagos:', seen)
    if 'An old pilot of Lagos' not in seen: errs.append(f'{label}: no Alvaro at Lagos')
    # the Gambia: the first page, and Cantor charted
    await J("() => { window.helmline.state.discovered.gambia = true; window.helmline.dockAt('gambia'); }"); seen = await read_all(); print(label, 'at the Gambia:', seen)
    if 'The rutter: the river of gold' not in seen: errs.append(f'{label}: no rutter page at the Gambia')
    if not await J("() => window.helmline.state.discovered.cantor"): errs.append(f'{label}: Cantor not charted')
    # Lisbon: Salvago's offer, a choice
    await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(900)
    t = await title()
    for _ in range(4):  # letters first (Prince Henry, once the chart reward opens contracts)
        if t in (None, 'An offer for the book'): break
        print(label, 'in Lisbon, first:', t); await pg.click('#modal-ok'); await pg.wait_for_timeout(900); t = await title()
    print(label, 'in Lisbon:', t)
    if t != 'An offer for the book': errs.append(f'{label}: no offer from Salvago')
    else:
        await pg.screenshot(path=f'{SP}/story-{label}-3-offer.png')
        p0 = await J("() => window.helmline.state.purse")
        await pg.click('#modal-body [data-modal-action="partner"]'); await pg.wait_for_timeout(200)
        p1 = await J("() => window.helmline.state.purse")
        print(label, 'partner:', p0, '->', p1)
        if p1 - p0 != 400: errs.append(f'{label}: partner money not paid')
    # the end of Act I
    await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1460) + 320; }"); seen = await read_all(); print(label, 'Nov 1460:', seen)
    if not any('end of Act I' in x for x in seen): errs.append(f'{label}: no end of Act I')
    # the Rutter panel
    await J("() => { window.helmline.state.story.fired.henry_dies = 1; document.querySelector('[data-tab=\"rutter\"]')?.click() || document.getElementById('btn-port').click(); }"); await pg.wait_for_timeout(200)
    if not await J("() => !!document.querySelector('[data-tab=\"rutter\"]')"): errs.append(f'{label}: no Rutter tab')
    await J("() => document.querySelector('[data-tab=\"rutter\"]')?.click()"); await pg.wait_for_timeout(200)
    h = await J("() => document.querySelector('#panel h2')?.textContent")
    print(label, 'panel:', h, '| log lines', await J("() => document.querySelectorAll('.story-log li').length"))
    if h != 'The rutter of João Vaz': errs.append(f'{label}: Rutter panel did not open')
    await pg.screenshot(path=f'{SP}/story-{label}-4-rutter.png')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        await run(b, 'desktop', {'width': 1280, 'height': 860}, False, errs)
        await run(b, 'phone', {'width': 390, 'height': 800}, True, errs)
        # an old save (no story) joins without the prologue or the debt
        ctx = await b.new_context(); await ctx.add_init_script("window.helmlineStory = true"); pg = await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new')
        await pg.evaluate("() => { const s = window.helmline.state; delete s.story; s.day = 400; }")
        await pg.wait_for_timeout(1500)
        old = await pg.evaluate("() => { const s = window.helmline.state; return [!!s.story, !!s.story?.fired?.prologue, s.story?.debt, document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent]; }")
        print('old save joins the story:', old)
        if not old[0] or not old[1] or old[2] or old[3] == 'Lisbon, March 1451': errs.append('an old save got the prologue or the debt')
        await ctx.close()
        print('ERRORS', errs); await b.close()

asyncio.run(main())

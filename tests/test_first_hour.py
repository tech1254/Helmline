# The first hour, played through the real buttons on a desktop and on a phone: a sensible new
# player buys what the next port wants, sails, sells, and goes again until contracts open, then
# takes one. Every dialog and note on the way is logged, so a confusing first hour shows up here.
#
# Trades go through the market buttons and their confirm dialogs; voyages through the voyage
# dialog. Time at sea is advanced from script (a real hour of sailing would take an hour).
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

# a new player's plan: buy here what sells for the most, relative to its price, in a port the barca can reach
PLAN = """() => {
  const h = window.helmline, s = h.state, m = h.market(), here = s.ship.docked;
  let best = null;
  for (const p of h.ports) {
    if (p.id === here || !s.discovered[p.id]) continue;
    for (const g of new Set([...document.querySelectorAll('#panel [data-buy]')].map((e) => e.dataset.buy))) {
      const r = m.sellPrice(p.id, g) / m.buyPrice(here, g);
      if (!best || r > best.r) best = { port: p.id, good: g, r };
    }
  }
  return best;
}"""

async def play(b, label, viewport, mobile):
    pg = await b.new_page(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    errs, log = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#intro', state='visible')
    await pg.screenshot(path=f'{SP}/first-{label}-0-intro.png')
    await pg.click('#intro-new'); await pg.wait_for_timeout(300)
    await J("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmline.setSpeed(0); }")  # corsairs have their own tests
    seen_tips = []

    async def notes():
        t = await J("() => document.getElementById('tip').hidden ? null : document.getElementById('tip-text').innerText")
        if t and t not in seen_tips: seen_tips.append(t); log.append(f'  note: {t}')
        if t:  # is the note on screen and not under anything?
            ok = await J("""() => { const r = document.getElementById('tip').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 20, r.top + 10);
                return r.bottom <= innerHeight && r.right <= innerWidth && !!e && !!e.closest('#tip'); }""")
            if not ok: errs.append(f'{label}: note hidden or off screen: {t[:40]}')

    async def dialogs():
        for _ in range(8):
            if await J("() => document.getElementById('modal').hidden"): return
            t = await J("() => document.getElementById('modal-title').textContent + ': ' + document.getElementById('modal-body').innerText.replace(/\\s+/g, ' ').slice(0, 110)")
            log.append(f'  dialog: {t}')
            await pg.click('#modal-ok'); await pg.wait_for_timeout(150)

    async def market_open():
        if not await J("() => !!document.querySelector('#panel [data-tab=\"port\"]')"):
            await J("() => document.getElementById('btn-port').click()"); await pg.wait_for_timeout(150)
        await J("() => document.querySelector('#panel [data-tab=\"port\"]')?.click()"); await pg.wait_for_timeout(150)

    shots = 0
    for voyage in range(1, 41):
        await dialogs(); await notes()
        here = await J("() => window.helmline.state.ship.docked")
        await market_open()
        # sell everything aboard, through the All buttons
        for g in await J("() => Object.entries(window.helmline.state.cargo).filter(([, n]) => n > 0).map(([g]) => g)"):
            btn = pg.locator(f'#panel [data-sell="{g}"][data-n="all"]')
            if await btn.count():
                await btn.scroll_into_view_if_needed(); await btn.click(); await pg.wait_for_timeout(100)
                if not await J("() => document.getElementById('modal').hidden"): await pg.click('#modal-ok')
                await pg.wait_for_timeout(100)
        await notes()
        plan = await J(PLAN)
        if not plan:  # nothing for sale here (Ceuta is a garrison): on, empty, to Lisbon
            plan = {'port': 'lisbon' if here != 'lisbon' else 'lagos', 'good': '-', 'r': 0}
        btn = pg.locator(f'#panel [data-buy="{plan["good"]}"][data-n="max"]')
        if await btn.count() and await btn.is_enabled():
            await btn.scroll_into_view_if_needed(); await btn.click(); await pg.wait_for_timeout(100)
            if not await J("() => document.getElementById('modal').hidden"): await pg.click('#modal-ok')
            await pg.wait_for_timeout(100)
        await notes()
        if shots < 2: await pg.screenshot(path=f'{SP}/first-{label}-{voyage}-{here}.png'); shots += 1
        st = await J("() => { const s = window.helmline.state; return { purse: Math.round(s.purse), hold: Object.values(s.cargo).reduce((a, b) => a + b, 0), day: Math.round(s.day) }; }")
        # set sail: the voyage dialog
        ok = await J(f"() => window.helmline.sail('{plan['port']}')")
        if not ok: errs.append(f'{label}: no course to {plan["port"]}'); break
        t = await J("() => document.getElementById('modal-title').textContent")
        await pg.click('#modal-ok'); await pg.wait_for_timeout(100)
        log.append(f'{voyage:2}. {here} → {plan["port"]} with {st["hold"]} {plan["good"]} (×{plan["r"]:.2f}), purse {st["purse"]}  [{t}]')
        await notes()
        for _ in range(150):
            if await J(f"() => window.helmline.state.ship.docked === '{plan['port']}'"): break
            await J("() => window.helmline.sailFor(2)")
            await dialogs()
        else:
            errs.append(f'{label}: never reached {plan["port"]}'); break
        if await J("() => window.helmline.state.contracts.unlocked"):
            log.append(f'  contracts open after {voyage} voyages, day {await J("() => Math.round(window.helmline.state.day)")}')
            break
    await dialogs(); await notes()
    # take a contract, through the Contracts tab
    await J("() => { const t = document.querySelector('#panel [data-tab=\"contracts\"]'); if (t) t.click(); else document.getElementById('btn-contracts').click(); }"); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{SP}/first-{label}-contracts.png')
    acc = pg.locator('#panel [data-accept]').first
    if await acc.count():
        await acc.scroll_into_view_if_needed(); await acc.click(); await pg.wait_for_timeout(150)
        await dialogs()
        n = await J("() => window.helmline.state.contracts.active.length")
        log.append(f'  took a contract: {n} active')
        if n < 1: errs.append(f'{label}: contract not taken')
    else:
        errs.append(f'{label}: no contract to accept')
    await notes()
    await pg.screenshot(path=f'{SP}/first-{label}-end.png')
    # anything on the screen running off its edge?
    over = await J("() => document.documentElement.scrollWidth > innerWidth")
    if over: errs.append(f'{label}: page scrolls sideways')
    print(f'--- {label}'); print('\n'.join(log))
    await pg.close()
    return errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = await play(b, 'desktop', {'width': 1280, 'height': 800}, False)
        errs += await play(b, 'phone', {'width': 390, 'height': 800}, True)
        print('ERRORS', errs); await b.close()

asyncio.run(main())

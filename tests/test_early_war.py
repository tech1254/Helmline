# The crown's call to arms (callarms.js): from the first voyage, real 1450s campaign work that
# pays early. Portugal: supply Ceuta (the king's guns go aboard), patrol the Strait (a corsair
# comes out to fight at the mark), the raid on Alcácer Ceguer. Castile: the Granada frontier, the
# same three stages through Cádiz, Gibraltar and Málaga. Paying tribute earns nothing and the
# stage stays to do.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(12):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def finish_fight(pg):
    for _ in range(14):
        acts = await pg.evaluate("() => document.getElementById('modal').hidden ? [] : [...document.querySelectorAll('#modal-body [data-modal-action]')].map(b => b.dataset.modalAction)")
        if 'done' in acts: await pg.click('#modal-body [data-modal-action="done"]'); await pg.wait_for_timeout(200); return True
        if 'auto' in acts: await pg.click('#modal-body [data-modal-action="auto"]'); await pg.wait_for_timeout(200); continue
        if 'fight' in acts: await pg.click('#modal-body [data-modal-action="fight"]'); await pg.wait_for_timeout(200); continue
        return False
    return False

async def fresh(pg, nation):
    J = lambda js: pg.evaluate(js)
    await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#intro', state='visible')
    await pg.click('#intro-new'); await pg.wait_for_timeout(200)
    if await J("() => !document.getElementById('intro-nation').hidden"):
        await pg.click(f'#intro-nation [data-nation="{nation}"]'); await pg.wait_for_timeout(1200)
    await ok_modals(pg)
    await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.skipOffered = true; if (s.story) s.story.off = true; }")

async def sail_to_fight(pg, errs, label):
    """Set course for the mark from the box, sail until the crown's fight finds us, and win it."""
    J = lambda js: pg.evaluate(js)
    await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
    if not await J("() => !!document.querySelector('[data-call-sail]')"):
        errs.append(f'{label}: no course button in the box'); return None
    await pg.click('[data-call-sail]'); await pg.wait_for_timeout(300)
    title = None
    for _ in range(40):
        title = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title')?.textContent")
        if title and ('galley off' in title or 'raid' in title): break
        if title: await pg.click('#modal-ok'); await pg.wait_for_timeout(150); continue  # the voyage confirm, the pause after
        await J("() => window.helmline.sailFor(1)")
        await pg.wait_for_timeout(60)
    print(label, 'met:', title, 'at', await J("() => [window.helmline.state.ship.lon.toFixed(2), window.helmline.state.ship.lat.toFixed(2)]"))
    if not title: errs.append(f'{label}: no fight at the mark'); return None
    print('  modal:', await J("() => [document.getElementById('modal-ok').hidden, document.getElementById('modal-body').innerText.slice(0, 200), [...document.querySelectorAll('#modal-body [data-modal-action]')].map(b => b.dataset.modalAction)]"))
    if await J("() => document.getElementById('modal-ok').hidden"): errs.append(f'{label}: the fight opened without its call'); return title
    await pg.click('#modal-ok'); await pg.wait_for_timeout(250)  # into the fight
    await J("() => { if (window.helmline.ui.fight) window.helmline.ui.fight.foe.morale = 3; }")
    if not await finish_fight(pg): errs.append(f'{label}: the fight did not finish')
    await pg.wait_for_timeout(200)
    # plunder her, if offered; then the pause after the encounter
    if await J("() => !!document.querySelector('[data-modal-action=\"plunder\"]')"):
        await pg.click('[data-modal-action="plunder"]'); await pg.wait_for_timeout(200)
    await ok_modals(pg)
    return title

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script("window.helmlineNations = true; window.helmlineCall = true;")
        J = lambda js: pg.evaluate(js)

        # 1. Portugal: nothing before the first voyage; the call after it
        await fresh(pg, 'portugal')
        await J("() => window.helmline.advance(2)")
        if await J("() => window.helmline.state.call?.stage"): errs.append('the call came before the first voyage')
        purse0 = await J("() => Math.round(window.helmline.state.purse)")
        await J("() => { const s = window.helmline.state; s.voyages = 1; }")
        await J("() => window.helmline.advance(1)"); await pg.wait_for_timeout(200)
        st = await J("() => window.helmline.state.call?.stage")
        print('after the first voyage:', st)
        if st != 'supply': errs.append(f'the call did not begin: {st}')
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        box = await J("() => document.querySelector('section.call')?.innerText || ''")
        print('box:', box[:160].replace('\n', ' | '))
        if 'king' not in box.lower() or 'Ceuta' not in box: errs.append('no call box in Lisbon')
        await pg.screenshot(path=f'{SP}/early_war_box.png')

        # 2. supply Ceuta: paid above the market, the guns go aboard, the patrol is next
        await J("() => { const s = window.helmline.state; s.cargo.wheat = 12; s.paid.wheat = 168; s.cargo.wine = 8; s.paid.wine = 72; }")
        await J("() => window.helmline.dockAt('ceuta')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        p1 = await J("() => window.helmline.state.purse")
        if not await J("() => !!document.querySelector('[data-call-deliver]')"): errs.append('no deliver button at Ceuta')
        else: await pg.click('[data-call-deliver]'); await pg.wait_for_timeout(300)
        r = await J(f"() => {{ const s = window.helmline.state; return {{ paid: Math.round(s.purse - {p1}), stage: s.call.stage, guns: s.ship.fit.guns, wheat: s.cargo.wheat || 0 }}; }}")
        print('Ceuta supplied:', r)
        if r['paid'] != 12 * 24 + 8 * 20 + 300: errs.append(f'the supply paid {r["paid"]}')
        if r['stage'] != 'patrol' or r['guns'] != 'bercos' or r['wheat']: errs.append(f'after the supply: {r}')
        mark = await J("() => window.helmline.call().mark(window.helmline.state)")
        if not mark or mark['name'] != 'the Strait': errs.append(f'no patrol mark: {mark}')
        await J(f"() => {{ window.helmline.panel(null); window.helmline.look({mark['lon']}, {mark['lat']}, 2); }}"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/early_war_mark.png')

        # 3. the patrol: the fight finds you at the mark
        p2 = await J("() => window.helmline.state.purse")
        await sail_to_fight(pg, errs, 'patrol')
        r = await J(f"() => {{ const s = window.helmline.state; return {{ stage: s.call.stage, gain: Math.round(s.purse - {p2}), result: s.call.results?.patrol }}; }}")
        print('after the patrol:', r)
        if r['stage'] != 'raid': errs.append(f'the patrol did not move on: {r}')
        if r['gain'] < 350 - 200: errs.append(f'the patrol paid too little: {r}')

        # 4. the raid on Alcácer Ceguer
        await J("() => window.helmline.dockAt('ceuta')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.state.hull = 100; }")
        p3 = await J("() => window.helmline.state.purse")
        await sail_to_fight(pg, errs, 'raid')
        r = await J(f"() => {{ const s = window.helmline.state; return {{ stage: s.call.stage, gain: Math.round(s.purse - {p3}), paid: s.call.paid, unlocked: s.contracts?.unlocked, total: Math.round(s.purse) }}; }}")
        print('after the raid:', r, 'purse began at', purse0)
        if r['stage'] != 'done': errs.append(f'the raid did not finish the call: {r}')
        if r['paid'] < 1500: errs.append(f'the call paid too little in all: {r}')
        if not r['unlocked']: errs.append('contracts not open after the call')
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        if await J("() => !!document.querySelector('section.call')"): errs.append('the box stays after the call is done')

        # 5. tribute earns nothing; the stage stays
        t = await J("() => { const C = window.helmline.call(), s = window.helmline.state; s.call.stage = 'patrol'; const p = s.purse; const m = C.settle(s, { call: 'patrol' }, 'paid'); return { stage: s.call.stage, gain: s.purse - p, said: m[0]?.html || '' }; }")
        print('tribute:', t)
        if t['stage'] != 'patrol' or t['gain'] != 0: errs.append(f'tribute was paid for: {t}')

        # 6. the 1458 crusade for Portugal: contracts for Ceuta
        camp = await J("() => { const s = window.helmline.state; const W = window.helmline.war(); s.day = window.helmline.yearDay(1458) + 100; return W.activeCampaigns(s).map((c) => c.id); }")
        print('1458 campaigns:', camp)
        if 'alcacer' not in camp: errs.append('no Alcácer campaign in 1458')

        # 7. Castile: the Granada frontier, through Cádiz
        await fresh(pg, 'castile')
        await J("() => { const s = window.helmline.state; s.voyages = 1; }")
        await J("() => window.helmline.advance(1)"); await pg.wait_for_timeout(200)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        box = await J("() => document.querySelector('section.call')?.innerText || ''")
        print('Castile box:', box[:160].replace('\n', ' | '))
        if 'Granada' not in box or 'Cádiz' not in box: errs.append('no Granada frontier box for Castile')
        await J("() => { const s = window.helmline.state; s.cargo.wheat = 12; s.paid.wheat = 150; s.cargo.wine = 8; s.paid.wine = 70; }")
        await J("() => window.helmline.dockAt('cadiz')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(200)
        if await J("() => !!document.querySelector('[data-call-deliver]')"): await pg.click('[data-call-deliver]'); await pg.wait_for_timeout(300)
        r = await J("() => ({ stage: window.helmline.state.call.stage, mark: window.helmline.call().mark(window.helmline.state)?.name })")
        print('Castile supplied:', r)
        if r != {'stage': 'patrol', 'mark': 'Gibraltar'}: errs.append(f'Castile after supplying Cádiz: {r}')

        # 8. the call lapses when the real campaign sails
        l = await J("() => { const s = window.helmline.state; s.day = window.helmline.yearDay(1458) + 2; window.helmline.advance(1); return s.call.stage; }")
        if l != 'lapsed': errs.append(f'the call did not lapse in 1458: {l}')

        print('ERRORS', errs); await b.close()

asyncio.run(main())

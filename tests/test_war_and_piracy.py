# War and piracy (phase 4): the round-based fight, hunting a rival house's ship, prizes and the
# law (piracy, havens, the hidden cove, ports shut, pardons, hunters), a pirate crew's mutiny,
# the time skip at the act break, and the 1475 war (marque, lawful prizes, the prize court,
# enemy ports shut, the peace). Desktop and phone.
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def ok_modals(pg):
    for _ in range(6):
        if await pg.evaluate("() => !document.getElementById('modal').hidden && !document.getElementById('modal-ok').hidden"):
            await pg.click('#modal-ok'); await pg.wait_for_timeout(120)
        else: break

async def acts(pg):
    return await pg.evaluate("() => document.getElementById('modal').hidden ? [] : [...document.querySelectorAll('#modal-body [data-modal-action]')].map(b => b.dataset.modalAction)")

async def title(pg):
    return await pg.evaluate("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_timeout(400); await J("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('#intro-new'); await pg.wait_for_timeout(500); await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.voyages = 4; s.purse = 30000; s.contracts.unlocked = true; s.contracts.standing = 40; s.ship.hull = 'nau'; s.ship.fit = { guns: 'bombards', crew: 'menatarms' }; }")

        # 1. Hunting: chase a Salvago ship (Genoa: at peace, so this is piracy)
        prey = await J("() => window.helmline.prey().filter((v) => v.house === 'salvago')")
        v = next((x for x in prey if -20 < x['lon'] < 0 and 30 < x['lat'] < 45), prey[0])
        await J("() => window.helmline.sail('lagos')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J(f"() => {{ const s = window.helmline.state; s.ship.lon = {v['lon']} - 0.7; s.ship.lat = {v['lat']} - 0.35; s.ship.route = []; window.helmline.reveal(s.ship.lon, s.ship.lat); window.helmline.look(s.ship.lon, s.ship.lat, 2); }}")
        await pg.wait_for_timeout(300)
        # tap her on the chart
        sx, sy = await J(f"() => window.helmline.screenOf(...(() => {{ const q = window.helmline.prey().find((x) => x.key === '{v['key']}'); return [q.lon, q.lat]; }})())")
        await J("() => { window.helmline.panel(null); }")
        await pg.mouse.click(sx, sy); await pg.wait_for_timeout(300)
        t = await title(pg)
        print('tapped her:', t)
        if not t or 'Salvago' not in t: errs.append(f'tapping a rival ship did not open her: {t}')
        await pg.screenshot(path=f'{SP}/war-1-ship.png')
        if 'chase' in await acts(pg): await pg.click('[data-modal-action="chase"]'); await pg.wait_for_timeout(200)
        else: await J(f"() => window.helmline.chase('{v['key']}')"); await pg.keyboard.press('Escape')
        await J("() => window.helmline.sailFor(10)"); await pg.wait_for_timeout(500)
        t = await title(pg)
        print('after the chase:', t)
        if not t or 'run down' not in t: errs.append(f'the chase did not catch her: {t}')
        await pg.click('[data-modal-action="attack"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/war-2-fight.png')
        a = await acts(pg)
        print('attack actions:', a)
        if not {'fire', 'board', 'demand', 'rigging'} <= set(a): errs.append(f'attacking actions missing: {a}')
        intent = await J("() => document.querySelector('.fintent')?.textContent")
        if not intent: errs.append('her intent is not shown')
        await J("() => { window.helmline.ui.fight.foe.morale = 8; }")
        await pg.click('[data-modal-action="fire"]'); await pg.wait_for_timeout(300)
        t = await title(pg); print('fight over:', t)
        await pg.click('[data-modal-action="done"]'); await pg.wait_for_timeout(300)
        t = await title(pg); print('spoils:', t)
        if not t or 'is yours' not in t: errs.append(f'no spoils after taking her: {t}')
        await pg.screenshot(path=f'{SP}/war-3-spoils.png')
        piracy = await J("() => document.getElementById('modal-body').innerText.includes('piracy')")
        if not piracy: errs.append('the spoils do not say this is piracy')
        await pg.click('[data-modal-action="prize"]'); await pg.wait_for_timeout(300); await ok_modals(pg)
        L = await J("() => window.helmline.state.law")
        print('law after taking her:', {k: L[k] for k in ('infamy', 'taken', 'pirated', 'shares')}, 'prizes', [x['name'] for x in L['prizes']])
        if not L['prizes'] or L['prizes'][0]['lawful']: errs.append('no unlawful prize sent in')
        if (L['infamy'].get('genoa') or 0) < 5: errs.append('piracy did not make Genoa remember')
        h = await J("() => window.helmline.state.houses.h.salvago")
        if not h.get('raids'): errs.append('the raided house does not know it')

        # 2. Lisbon will not condemn a pirate's prize; Salé fences it, and tells of the cove
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        if await J("() => !!document.querySelector('[data-prize-sell]')"): errs.append('Lisbon offered to condemn a pirate prize')
        await J("() => window.helmline.dockAt('sale')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        purse0 = await J("() => window.helmline.state.purse")
        await pg.screenshot(path=f'{SP}/war-4-fence.png')
        if not await J("() => !!document.querySelector('[data-prize-sell]')"): errs.append('Salé does not fence the prize')
        else:
            await J("() => document.querySelector('[data-prize-sell]').click()"); await pg.wait_for_timeout(200)
        gain = await J("() => window.helmline.state.purse") - purse0
        print('fenced at Salé for', round(gain))
        if gain <= 0: errs.append('fencing paid nothing')
        cove = await J("() => !!window.helmline.state.discovered.cove")
        print('heard of the cove:', cove)
        if not cove: errs.append('no word of the hidden cove at Salé')

        # 3. The cove: build the stockade (your own haven)
        await J("() => window.helmline.dockAt('cove')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('works'); }"); await pg.wait_for_timeout(200)
        offered = await J("() => [...document.querySelectorAll('[data-build]')].map((x) => x.dataset.build)")
        print('can build at the cove:', offered)
        if 'stockade' not in offered or 'fort' in offered: errs.append(f'wrong works at the cove: {offered}')
        await J("() => document.querySelector('[data-build=\"stockade\"]').click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J("() => window.helmline.advance(65)"); await ok_modals(pg)
        own = await J("() => import('./js/works.js').then((W) => W.has(window.helmline.state, 'cove', 'stockade'))")
        if not own: errs.append('the stockade was not built')

        # 4. Infamy: Castile shuts its ports and sends hunters; the pardon at Seville
        await J("() => { const L = window.helmline.state.law; L.infamy.castile = 20; }")
        await J("() => window.helmline.dockAt('cadiz')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        shut = await J("() => ({ banner: !!([...document.querySelectorAll('.banner.warn')].find((x) => x.textContent.includes('Shut to you'))), buy: document.querySelectorAll('[data-buy]').length })")
        print('Cádiz while wanted:', shut)
        if not shut['banner'] or shut['buy']: errs.append('a wanted pirate can still trade in Cádiz')
        await J("() => window.helmline.dockAt('seville')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        if not await J("() => !!document.querySelector('[data-pardon=\"castile\"]')"): errs.append('no pardon offered at Seville')
        else:
            await J("() => document.querySelector('[data-pardon=\"castile\"]').click()"); await pg.wait_for_timeout(200); await ok_modals(pg)
        if await J("() => window.helmline.state.law.infamy.castile || 0") > 0.5: errs.append('the pardon did not clear Castile')
        # hunters: the crown's armed caravel; strike, and pay the fine
        await J("() => { window.helmline.state.law.infamy.genoa = 15; window.helmline.state.law.prizes.push({ id: 99, name: 'a test prize', value: 1000, lawful: false, crown: 'genoa' }); }")
        await J("() => window.helmline.sail('lisbon')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J("() => window.helmline.defend('hunter', 'genoa')"); await pg.wait_for_timeout(400)
        t = await title(pg); print('hunters:', t)
        await pg.screenshot(path=f'{SP}/war-5-hunters.png')
        purse0 = await J("() => window.helmline.state.purse")
        await pg.click('[data-modal-action="strike"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-modal-action="done"]'); await pg.wait_for_timeout(200)
        fined = purse0 - await J("() => window.helmline.state.purse")
        L = await J("() => window.helmline.state.law")
        print('struck to the hunters: fined', round(fined), 'prizes', len(L['prizes']), 'genoa infamy', round(L['infamy'].get('genoa', 0)))
        if fined <= 0 or L['prizes']: errs.append('striking to the hunters did not fine you or take the prizes')
        await ok_modals(pg)

        # a raided house hits back: its armed merchantman comes after you
        await J("() => { window.helmline.ui.pendingEncounter = { kind: 'reprisal', house: 'salvago', crown: 'genoa', armed: 1, where: 'Salvago' }; }"); await pg.wait_for_timeout(500)
        t = await J("() => document.getElementById('modal').hidden ? null : document.getElementById('modal-title').textContent")
        print('reprisal:', t)
        if not t or 'Salvago' not in t: errs.append(f'no reprisal fight: {t}')
        else:
            await pg.click('[data-modal-action="auto"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-modal-action="done"]'); await pg.wait_for_timeout(300)
        await ok_modals(pg)

        # 5. A pirate crew on shares mutinies after long without a prize
        await J("() => { const L = window.helmline.state.law; L.shares = true; L.dry = 139; }")
        await J("() => window.helmline.sailFor(2)"); await pg.wait_for_timeout(600)
        t = await title(pg); print('dry too long:', t)
        if t != 'Mutiny!': errs.append(f'no mutiny: {t}')
        else:
            await pg.click('[data-modal-action="pay"]'); await pg.wait_for_timeout(200)
        await ok_modals(pg)

        # 6. The act break: the years pass to 1474
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { const s = window.helmline.state; s.law.prizes = []; s.day = window.helmline.yearDay(1461) + 10; s.story.fired.henry_dies = s.day; window.helmline.ui.arrival = null; window.helmline.panel('houses'); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/war-6-houses.png')
        if not await J("() => !!document.querySelector('[data-timeskip]')"): errs.append('no time skip in the Houses tab')
        else:
            await J("() => document.querySelector('[data-timeskip]').click()"); await pg.wait_for_timeout(200)
            await pg.click('#modal-ok'); await pg.wait_for_timeout(400)
            t = await title(pg); print('time skip:', t)
            await pg.screenshot(path=f'{SP}/war-7-skip.png')
            if not t or 'the house grows' not in t: errs.append(f'no time skip summary: {t}')
            await ok_modals(pg)
        year = await J("() => import('./js/ships.js').then((M) => M.yearOf(window.helmline.state.day))")
        print('now', year)
        if year != 1474: errs.append(f'the skip did not reach 1474: {year}')

        # 7. The war: the marque, a Castilian ship is lawful prize, the prize court, the peace
        await J("() => window.helmline.advance(450)"); await pg.wait_for_timeout(1000)
        t = await title(pg); print('war:', t)
        await pg.screenshot(path=f'{SP}/war-8-marque.png')
        if not t or 'War with Castile' not in t: errs.append(f'no war with Castile in 1475: {t}')
        else: await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        await ok_modals(pg)
        marque = await J("() => window.helmline.war().hasMarque(window.helmline.state)")
        if not marque: errs.append('no letter of marque')
        lawful = await J("() => window.helmline.law().lawful(window.helmline.state, 'castile', 37)")
        print('a Castilian ship now:', lawful)
        if not lawful['ok']: errs.append('a Castilian ship is not lawful prize in the war')
        await J("() => window.helmline.dockAt('cadiz')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        if await J("() => document.querySelectorAll('[data-buy]').length"): errs.append('Cádiz trades with the enemy in wartime')
        # a lawful prize, condemned at Lisbon
        await J("() => window.helmline.law().addPrize(window.helmline.state, { name: 'the Santángel nau', hull: 'nau', value: 5000, lawful: true, crown: 'castile', house: 'santangel', war: true })")
        await J("() => window.helmline.dockAt('lisbon')"); await pg.wait_for_timeout(300); await ok_modals(pg)
        await J("() => { window.helmline.ui.arrival = null; window.helmline.panel('port'); }"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SP}/war-9-court.png')
        purse0 = await J("() => window.helmline.state.purse")
        if not await J("() => !!document.querySelector('[data-prize-sell]')"): errs.append('the Lisbon prize court will not condemn a lawful prize')
        else: await J("() => document.querySelector('[data-prize-sell]').click()"); await pg.wait_for_timeout(200)
        got = await J("() => window.helmline.state.purse") - purse0
        print('condemned at Lisbon for', round(got), '(of 5000, less the crown\'s fifth)')
        if round(got) != 4000: errs.append(f'the prize court paid {got}, not 4000')
        await J("() => window.helmline.war().serve(window.helmline.state, 3)")
        purse0 = await J("() => window.helmline.state.purse")
        await J("() => window.helmline.advance(1580)"); await pg.wait_for_timeout(800)
        W = await J("() => window.helmline.state.war")
        print('after the war:', {k: W[k] for k in ('peace', 'marque')}, 'reward', await J("() => window.helmline.state.accounts.totals.war"))
        if not W['peace'].get('succession'): errs.append('no peace in 1479')
        if not await J("() => window.helmline.state.accounts.totals.war"): errs.append('no reward for service in the war')
        await ok_modals(pg)

        # 8. Phone: the fight fits
        await pg.set_viewport_size({'width': 390, 'height': 800})
        await J("() => window.helmline.sail('lagos')"); await pg.wait_for_timeout(200); await ok_modals(pg)
        await J("() => window.helmline.encounter(true)"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SP}/war-10-phone.png')
        wide = await J("() => document.getElementById('modal-body').scrollWidth > document.getElementById('modal-body').clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 1")
        if wide: errs.append('the fight scrolls sideways on a phone')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

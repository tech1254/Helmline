# Money and patrons: a sea loan in Lisbon or Lagos (borrow, the premium fixed, corsair losses taken
# off the debt, repay; late, a tenth more and the agents take the purse), the pilots' directions in
# Lagos (marked on the chart), and the commission for discovery (advance, fulfilled, reward paid).
import asyncio, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        J = lambda js: pg.evaluate(js)
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await J("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.tips.off = true; s.purse = 100; window.helmline.setSpeed(0); window.helmline.dockAt('lagos'); window.helmline.panel('port'); }")
        await pg.wait_for_timeout(300)
        box = await J("() => document.querySelector('.money-box')?.innerText || ''")
        print('money box at Lagos:', box.replace('\n', ' | ')[:300])
        if 'A sea loan' not in box: errs.append('no sea loan offered at Lagos')
        if 'pilots of Lagos' not in box: errs.append('no pilots\' directions at Lagos')
        opened = await J("() => document.querySelector('.money-box')?.open")
        if not opened: errs.append('the money box is closed though the purse is low')
        await pg.screenshot(path=f'{SP}/lending-1-lagos.png')
        # borrow 200 for Guinea
        await pg.click('[data-loan-ask]'); await pg.wait_for_timeout(200)
        await pg.select_option('#loan-sum', '200')
        await pg.check('input[name="loan-water"][value="guinea"]')
        total = await J("() => document.getElementById('loan-total').textContent")
        print('dialog:', total)
        if '250 cz' not in total: errs.append(f'wrong total in the dialog: {total}')
        await pg.screenshot(path=f'{SP}/lending-2-dialog.png')
        await pg.click('#modal-ok'); await pg.wait_for_timeout(200)
        st = await J("() => ({ purse: window.helmline.state.purse, loan: window.helmline.state.lending.loan })")
        print('after borrowing:', st['purse'], st['loan'])
        if st['purse'] != 300 or not st['loan'] or st['loan']['premium'] != 0.25: errs.append('the loan was not made as asked')
        # corsairs take goods worth 80 off Arguin: the debt falls by 80 and its premium
        owed = await J("""async () => { const L = await import('/js/lending.js'); const s = window.helmline.state;
            const off = L.seaLoss(s, 80, 20.5); return { off, owed: L.owedOf(s.lending.loan) }; }""")
        print('after a corsair loss of 80 off Arguin:', owed)
        if owed['off'] != 100 or owed['owed'] != 150: errs.append(f'the sea loss was not taken off: {owed}')
        # out of its waters (beyond Guinea, lat 4): nothing
        far = await J("async () => { const L = await import('/js/lending.js'); return L.seaLoss(window.helmline.state, 50, 4); }")
        if far != 0: errs.append('a loss outside the loan\'s waters was covered')
        # directions for Arguin: marked
        await J("() => window.helmline.panel('port')"); await pg.wait_for_timeout(150)
        await J("() => document.querySelector('.money-box').open = true")
        await pg.click('[data-directions="arguin"]'); await pg.wait_for_timeout(200)
        d = await J("() => window.helmline.state.directions")
        print('directions:', d)
        if 'arguin' not in d: errs.append('directions not bought')
        await J("() => { window.helmline.panel(null); window.helmline.look(-16.5, 22, 0.4); }"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{SP}/lending-3-chart.png')
        # repay
        await J("() => { window.helmline.state.purse = 400; window.helmline.panel('port'); }"); await pg.wait_for_timeout(150)
        await J("() => document.querySelector('.money-box').open = true")
        await pg.click('[data-loan-repay]'); await pg.wait_for_timeout(200)
        st = await J("() => ({ purse: window.helmline.state.purse, loan: window.helmline.state.lending.loan })")
        print('after repaying:', st)
        if st['loan'] is not None or st['purse'] != 250: errs.append('repaying did not clear the loan')
        # a late loan: a tenth more, standing falls, the agents take the purse in Lisbon
        await J("""() => { const h = window.helmline, s = h.state; s.contracts.unlocked = true; s.contracts.standing = 10; s.purse = 500; h.dockAt('lisbon'); h.panel('port'); }""")
        await pg.wait_for_timeout(150)
        await J("() => document.querySelector('.money-box').open = true")
        await pg.click('[data-loan-ask]'); await pg.wait_for_timeout(150)
        await pg.select_option('#loan-sum', '300'); await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
        await J("() => { const s = window.helmline.state; s.purse = 100; s.day = s.lending.loan.due + 1; window.helmline.advance(1); }"); await pg.wait_for_timeout(200)
        st = await J("async () => { const L = await import('/js/lending.js'); const s = window.helmline.state; return { late: s.lending.loan?.late, owed: s.lending.loan ? L.owedOf(s.lending.loan) : 0, purse: s.purse, standing: s.contracts.standing }; }")
        print('late:', st)
        if not st['late'] or st['purse'] > 0 or st['standing'] != 7: errs.append(f'a late loan was not handled: {st}')
        # commission at Lisbon after Henry? It is 1451: Prince Henry's, at Lagos
        await J("() => { const h = window.helmline, s = h.state; s.purse = 50; s.lending.loan = null; s.lending.barredUntil = null; h.dockAt('lagos'); h.panel('port'); }"); await pg.wait_for_timeout(150)
        await J("() => { const m = document.querySelector('.money-box'); if (m) m.open = true; }")
        c = await J("() => !!document.querySelector('[data-commission]')")
        print('commission offered at Lagos:', c)
        if not c: errs.append('no commission offered at Lagos')
        else:
            await pg.click('[data-commission]'); await pg.wait_for_timeout(150)
            a = await J("() => window.helmline.state.commission.active")
            if not a or await J("() => window.helmline.state.purse") != 200: errs.append('the commission advance was not paid')
            before = await J("() => window.helmline.state.purse")
            await J("() => { const s = window.helmline.state; s.discovered.gambia = true; window.helmline.advance(1); }"); await pg.wait_for_timeout(100)
            after = await J("() => window.helmline.state.purse")
            print('commission reward:', before, '->', after)
            if after - before < 250: errs.append('the commission reward was not paid')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

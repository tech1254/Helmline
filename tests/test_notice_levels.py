"""Notice levels with a busy fleet: two hired captains for a year. Their port-by-port reports go
to the feed only (hidden unless asked for, not counted as unread); what pops up is news, alerts
and each captain's round of his route with what it made."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro:not([hidden])'); await pg.evaluate('localStorage.clear()'); await pg.reload()
        await pg.wait_for_selector('#intro:not([hidden])'); await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        J = lambda js: pg.evaluate(js)
        await J("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.contracts.unlocked = true; s.contracts.standing = 25; s.purse = 20000; for (const k in s.discovered) s.discovered[k] = true; }")
        await pg.click('#btn-port'); await pg.click('#btn-port')
        for i in range(2):
            await pg.click('[data-tab="fleet"]'); await pg.click('[data-hire]:not([disabled])'); await pg.click('#modal-ok'); await pg.wait_for_timeout(150)
            await pg.click('[data-tab="fleet"]')
            await J(f"() => {{ const d = document.querySelectorAll('[data-ship] details.route-edit')[{i}]; if (d) d.open = true; }}")
            await pg.locator('[data-ship]').nth(i).locator('[data-route]').click(); await pg.wait_for_timeout(150)
        await J("""() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) window.__toasts.push(n.className + ' | ' + n.textContent.slice(0, 90)); }).observe(document.getElementById('toast'), { childList: true }); }""")
        n0 = await J("() => window.helmline.state.noticeSeq || 0")
        await J("() => window.helmline.advance(365)")
        st = await J(f"() => {{ const ns = window.helmline.state.notices.filter(n => n.id > {n0}); return {{ all: ns.length, routine: ns.filter(n => n.routine).length, unread: ns.filter(n => !n.routine).length }}; }}")
        toasts = await J("() => window.__toasts")
        print('a year with two captains: notices', st['all'], '| routine (feed only)', st['routine'], '| pop-ups', len(toasts))
        rounds = [t for t in toasts if 'of her route' in t]
        print('round outcomes:', len(rounds)); [print('  ', t) for t in rounds[:6]]
        print('other pop-ups:'); [print('  ', t) for t in toasts if 'of her route' not in t][:8]
        await pg.click('#btn-notices'); await pg.wait_for_timeout(200)
        print('feed shows', await pg.locator('.notices li.n').count(), 'items;', await pg.inner_text('.notice-filter'))
        await pg.screenshot(path=f'{OUT}/notices_levels.png')
        await pg.check('[data-notices-all]'); await pg.wait_for_timeout(150)
        print('with port reports:', await pg.locator('.notices li.n').count(), 'items')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

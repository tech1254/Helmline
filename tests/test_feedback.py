# Feedback: report a bug or suggest an idea from the Help panel; typing does not trigger the
# game's shortcuts; the draft survives a reload; reports reach the database with game details.
import asyncio, sys, os, json, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
def stored():
    return json.loads(urllib.request.urlopen(URL + '__test/feedback').read())
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('#intro', state='visible'); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const p = window.helmline?.state?.pirates; if (p) p.cooldown = 1e9; }")  # calm seas
        J = lambda js: pg.evaluate(js)
        before = len(stored())
        await pg.click('#btn-help'); await pg.click('[data-feedback="bug"]'); await pg.wait_for_timeout(150)
        print('form:', await J("() => document.querySelector('#panel h2').textContent"), '| paused:', await J("() => document.querySelector('[data-speed=\"0\"]').classList.contains('on')"))
        # Shortcut letters and space typed into the report must stay in the report.
        await pg.click('textarea[name="message"]')
        await pg.keyboard.type('Pressing L and P while typing opened panels; space paused.')
        state = await J("() => ({ panel: document.querySelector('#panel h2').textContent, text: document.querySelector('textarea').value })")
        print('after typing:', state)
        if state['panel'] != 'Feedback' or 'space paused' not in state['text']: errs.append('typing triggered shortcuts or lost text')
        await pg.fill('input[name="contact"]', 'tester@example.com')
        await pg.reload(); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
        await pg.click('#btn-help'); await pg.click('[data-feedback="bug"]'); await pg.wait_for_timeout(150)
        kept = await J("() => document.querySelector('textarea').value")
        print('draft kept after reload:', kept[:40])
        if 'space paused' not in kept: errs.append('draft lost on reload')
        await pg.click('button[type="submit"]'); await pg.wait_for_timeout(500)
        print('after send:', await J("() => document.getElementById('panel').innerText.replace(/\\s+/g, ' ').slice(0, 120)"))
        rows = stored()[before:]
        print('stored:', [(r['kind'], r['message'][:30], r['contact'], json.loads(r['context'] or '{}').get('place')) for r in rows])
        if len(rows) != 1 or rows[0]['kind'] != 'bug' or not rows[0]['context']: errs.append('bug report not stored with context')
        await pg.click('[data-feedback-close] >> nth=-1'); await pg.wait_for_timeout(100)
        print('resumed after closing:', await J("() => !document.querySelector('[data-speed=\"0\"]').classList.contains('on')"))
        # Too short is refused in the game, before sending.
        await pg.click('#btn-help'); await pg.click('[data-feedback="idea"]'); await pg.fill('textarea', 'ok'); await pg.click('button[type="submit"]'); await pg.wait_for_timeout(200)
        print('too short stays unsent:', len(stored()) == before + 1)
        # An idea from a phone, without game details.
        ph = await (await b.new_context(viewport={'width': 360, 'height': 640}, has_touch=True, is_mobile=True)).new_page(); ph.on('pageerror', lambda e: errs.append(str(e)))
        await ph.goto(URL); await ph.wait_for_selector('#intro', state='visible'); await ph.tap('#intro-new'); await ph.wait_for_timeout(300)
        await ph.tap('#btn-help'); await ph.tap('[data-feedback="idea"]'); await ph.wait_for_timeout(150)
        await ph.fill('textarea', 'Let captains carry letters between ports.')
        await ph.tap('input[name="details"]')
        await ph.screenshot(path=(sys.argv[1] if len(sys.argv) > 1 else '.') + '/46-phone-feedback.png')
        await ph.tap('button[type="submit"]'); await ph.wait_for_timeout(500)
        last = stored()[-1]
        print('idea from phone:', last['kind'], last['message'], '| context sent:', last['context'] is not None)
        if last['kind'] != 'idea' or last['context'] is not None: errs.append('idea not stored as sent')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

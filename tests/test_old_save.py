import asyncio, json
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        # simulate a save from the previous version: strip the new fields
        await pg.evaluate("""() => { const raw = JSON.parse(localStorage.getItem('helmline-proto0-v1') || 'null'); if (!raw) return;
          delete raw.S.events; delete raw.S.fleet; delete raw.S.rot; delete raw.S.tips; localStorage.setItem('helmline-proto0-v1', JSON.stringify(raw)); }""")
        await pg.reload(); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
        print('old save loads:', await pg.evaluate("() => ({events: !!window.helmline.state.events, fleet: !!window.helmline.state.fleet, day: Math.round(window.helmline.state.day)})"))
        print('ERRORS', errs); await b.close()
asyncio.run(main())

import asyncio
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1280,'height':820})
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.click('#intro-new'); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const s = window.helmline.state; for (const k of Object.keys(s.discovered)) s.discovered[k] = true; }")
        await pg.reload(); await pg.wait_for_timeout(2500); await pg.click('#intro-continue'); await pg.wait_for_timeout(300)
        for i in range(2):
            ms = await pg.evaluate("() => { const t = performance.now(); document.querySelector('[data-tab=sail]').click(); const d = performance.now() - t; document.querySelector('[data-tab=port]').click(); return Math.round(d); }")
            print(f'Sail to… list with 8 destinations, open #{i+1}: {ms} ms')
        await b.close()
asyncio.run(main())

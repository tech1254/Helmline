import asyncio, sys
from playwright.async_api import async_playwright
import os
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 360, 'height': 740}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.evaluate("() => localStorage.clear()"); await pg.reload()
        await pg.tap('#intro-new'); await pg.wait_for_timeout(400)
        await pg.tap('[data-close]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=sys.argv[1]+'/23-phone.png')
        await pg.tap('#btn-help'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=sys.argv[1]+'/24-phone-help.png')
        print('ERRORS', errs); await b.close()
asyncio.run(main())

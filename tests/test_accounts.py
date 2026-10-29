# Accounts and saves: create an account, keep a voyage in it, sign in on a second device and
# load it, start a new voyage there (a second save, the first untouched), rename and delete,
# and the wrong-password and taken-name errors. Settings switched on for an account come back
# with it.
import asyncio, sys, os, json, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
SP = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')
NAME = 'Captain Test'

async def device(b, label, vp, mobile):
    ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page()
    return ctx, pg

async def toast_with(pg, words, tries=25):
    t = ''
    for _ in range(tries):
        await pg.wait_for_timeout(200)
        t = await pg.evaluate("() => [...document.querySelectorAll('#toast .t')].map((x) => x.innerText).join(' | ')")
        if words in t: break
    return t

async def open_saves(pg):
    await pg.evaluate("() => { if (document.querySelector('#panel h2')?.textContent !== 'Saves') document.getElementById('btn-cloud').click(); }")
    await pg.wait_for_timeout(250)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        A, pa = await device(b, 'desktop', {'width': 1280, 'height': 860}, False)
        pa.on('pageerror', lambda e: errs.append(f'A: {e}'))
        JA = lambda js: pa.evaluate(js)
        await pa.goto(URL); await pa.wait_for_selector('#intro', state='visible'); await JA("() => localStorage.clear()"); await pa.reload()
        await pa.click('#intro-new'); await pa.wait_for_timeout(300)
        await JA("() => { const s = window.helmline.state; s.pirates.cooldown = 1e9; s.purse = 1234; s.day = 40; }")
        # create an account
        await open_saves(pa)
        await pa.fill('[data-account-form] [name=name]', NAME); await pa.fill('[data-account-form] [name=password]', 'short')
        await pa.click('[data-account-act="register"]')
        toast = await toast_with(pa, 'at least 8')
        print('short password:', toast)
        if 'at least 8' not in toast: errs.append('a short password was accepted')
        await pa.fill('[data-account-form] [name=password]', 'correct horse'); await pa.click('[data-account-act="register"]')
        for _ in range(25):
            await pa.wait_for_timeout(200)
            if await JA("() => !!window.helmline.cloud().account.name"): break
        name = await JA("() => window.helmline.cloud().account.name")
        print('signed in as:', name)
        if name != NAME: errs.append('account not created')
        await pa.screenshot(path=f'{SP}/accounts-1-signed-in.png')
        # keep this voyage in the account
        await pa.click('[data-slot-new]'); await pa.wait_for_timeout(800)
        acc = await JA("() => window.helmline.cloud()")
        print('saves:', [(s['name'], s['day']) for s in acc['account']['slots']], '| playing', acc['cloud']['slot'])
        if len(acc['account']['slots']) != 1 or not acc['cloud']['slot']: errs.append('voyage not saved to the account')
        first = acc['cloud']['slot']
        # it keeps in step: play on, sync
        await JA("() => { window.helmline.state.purse = 2222; window.helmline.state.day = 90; }")
        await JA("() => window.helmline.sync()"); await pa.wait_for_timeout(600)
        # a second device: sign in, load it
        B, pb = await device(b, 'phone', {'width': 390, 'height': 800}, True)
        pb.on('pageerror', lambda e: errs.append(f'B: {e}'))
        JB = lambda js: pb.evaluate(js)
        await pb.goto(URL); await pb.wait_for_selector('#intro', state='visible'); await JB("() => localStorage.clear()"); await pb.reload()
        await pb.click('#intro-code'); await pb.wait_for_timeout(300)
        await pb.fill('[data-account-form] [name=name]', 'captain test'); await pb.fill('[data-account-form] [name=password]', 'wrong password')
        await pb.click('[data-account-act="login"]')
        t = await toast_with(pb, 'do not match')
        print('wrong password:', t)
        if 'do not match' not in t: errs.append('wrong password not refused')
        await pb.fill('[data-account-form] [name=password]', 'correct horse'); await pb.click('[data-account-act="login"]')
        await pb.wait_for_selector(f'[data-slot-load="{first}"]', timeout=10000)
        await pb.screenshot(path=f'{SP}/accounts-2-phone-saves.png')
        await pb.click(f'[data-slot-load="{first}"]'); await pb.wait_for_timeout(500)
        await pb.click('#modal-ok'); await pb.wait_for_timeout(500)
        st = await JB("() => [Math.round(window.helmline.state.purse), Math.round(window.helmline.state.day), window.helmline.cloud().cloud.slot]")
        print('phone loaded:', st)
        if st != [2222, 90, first]: errs.append('the save did not load on the second device')
        # a new voyage on the phone: a second save; the first is untouched
        await JB("() => { localStorage.setItem('x', 1); }")
        await pb.reload(); await pb.wait_for_selector('#intro', state='visible')
        pb.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pb.click('#intro-new'); await pb.wait_for_timeout(1200)
        acc = await JB("() => window.helmline.cloud()")
        print('after a new voyage:', [(s['name'], round(s['day'] or 0)) for s in acc['account']['slots']], '| playing', acc['cloud']['slot'])
        if len(acc['account']['slots']) != 2 or acc['cloud']['slot'] == first: errs.append('a new voyage did not get its own save')
        r = json.loads(urllib.request.urlopen(f'{URL}__test/slot?id={first}').read())
        if round(r['game_day']) != 90: errs.append(f'the first save was changed: {r}')
        # rename and delete, on the desktop
        await JA("() => window.helmline.refreshAccount()"); await pa.wait_for_timeout(400)
        await open_saves(pa); await JA("() => window.helmline.refreshAccount()"); await pa.wait_for_timeout(300)
        await pa.click(f'[data-slot-rename="{first}"]'); await pa.fill('#slot-name', 'The Gambia run'); await pa.click('#modal-ok')
        for _ in range(20):
            await pa.wait_for_timeout(200)
            names = await JA("() => window.helmline.cloud().account.slots.map((s) => s.name)")
            if 'The Gambia run' in names: break
        print('names:', names)
        if 'The Gambia run' not in names: errs.append('rename failed')
        other = [s['id'] for s in (await JA("() => window.helmline.cloud().account.slots")) if s['id'] != first][0]
        await pa.click(f'[data-slot-delete="{other}"]'); await pa.click('#modal-ok'); await pa.wait_for_timeout(500)
        n = await JA("() => window.helmline.cloud().account.slots.length")
        if n != 1: errs.append('delete failed')
        # settings switched on for the account come back with it
        urllib.request.urlopen(urllib.request.Request(f'{URL}__test/flags', data=json.dumps({'name': NAME, 'flags': {'timeScale': 4}}).encode(), method='POST'))
        await JA("() => window.helmline.refreshAccount()"); await pa.wait_for_timeout(300)
        fl = await JA("() => window.helmline.cloud().account.flags")
        print('flags:', fl)
        if fl.get('timeScale') != 4: errs.append('account flags not returned')
        # a taken name
        C, pc = await device(b, 'other', {'width': 1000, 'height': 800}, False)
        await pc.goto(URL); await pc.wait_for_selector('#intro', state='visible'); await pc.click('#intro-code'); await pc.wait_for_timeout(300)
        await pc.fill('[data-account-form] [name=name]', 'CAPTAIN TEST'); await pc.fill('[data-account-form] [name=password]', 'another password')
        await pc.click('[data-account-act="register"]')
        t = await toast_with(pc, 'taken')
        print('taken name:', t)
        if 'taken' not in t: errs.append('a taken name was accepted')
        # signed in there, time runs four times as fast at sea
        await pc.fill('[data-account-form] [name=name]', NAME); await pc.fill('[data-account-form] [name=password]', 'correct horse')
        await pc.click('[data-account-act="login"]')
        for _ in range(25):
            await pc.wait_for_timeout(200)
            if await pc.evaluate("() => !!window.helmline.cloud().account.name"): break
        await pc.evaluate("() => { const h = window.helmline; h.state.pirates.cooldown = 1e9; h.state.tips.off = true; h.sail('porto'); document.getElementById('modal-ok').click(); h.setSpeed(1); }")
        d0 = await pc.evaluate("() => window.helmline.state.day"); await pc.wait_for_timeout(2000); d1 = await pc.evaluate("() => window.helmline.state.day")
        status = await pc.evaluate("() => document.getElementById('status').textContent")
        print(f'at x4: {d1 - d0:.2f} days in 2 s (1x would be about 0.8) | ...{status[-28:]}')
        if not (d1 - d0 > 2.0): errs.append('the account multiplier did not speed up time')
        if 'time ×4' not in status: errs.append('the multiplier is not shown')
        await open_saves(pa); await pa.screenshot(path=f'{SP}/accounts-3-desktop-saves.png')
        print('ERRORS', errs); await b.close()

asyncio.run(main())

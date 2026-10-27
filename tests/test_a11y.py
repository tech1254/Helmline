"""Accessibility (WCAG 2.2 AA) on the main screens, desktop and phone:
- text contrast over the photographed materials (vellum, leather, oak), measured the way the design
  doc sets out: against the worst 2% of the background pixels behind each piece of text, not their
  average, so a dark knot in the oak or a pale crease in the leather counts;
- every image has alt text (or is marked decorative), every button and form field has a name.
Disabled controls are exempt from contrast (WCAG 1.4.3). Prints FAIL lines and an ERRORS line."""
import asyncio, io, os, sys
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
URL = os.environ.get('HELMLINE_URL', 'http://localhost:8787/')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HELMLINE_OUT', '.')

COLLECT = r"""(root) => {
  const out = [];
  const els = (root ? document.querySelector(root) : document.body).querySelectorAll('*');
  for (const el of els) {
    if (el.closest('svg, .afloat, .stocks, .yard-photo, canvas, #chart-skin')) continue;
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!texts.length) continue;
    // the box of the letters themselves, not the element's padding and borders
    const range = document.createRange(); range.setStartBefore(texts[0]); range.setEndAfter(texts[texts.length - 1]);
    const rr = range.getBoundingClientRect();
    // only what is on screen: clipped by every scrolling box around it, and the middle of the line
    // (the line box's leading can reach into a neighbour)
    let L = rr.left + 1, T = rr.top + rr.height * 0.2, R = rr.right - 1, B = rr.bottom - rr.height * 0.2;
    let cut = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflow;
      if (o === 'visible') continue;
      const q = p.getBoundingClientRect();
      // a line part scrolled out of its box sits under the box's frame: not a contrast problem
      if (rr.top < q.top - 1 || rr.bottom > q.bottom + 1) cut = true;
      L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom);
    }
    if (cut) continue;
    if (R - L < 2 || B - T < 2) continue;
    const r = { left: L, top: T, width: R - L, height: B - T, right: R, bottom: B };
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    // skip text covered by something else, or scrolled out of its box
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    let hidden = false, dis = false;
    for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (+c.opacity === 0 || c.display === 'none') hidden = true; if (p.disabled || p.getAttribute?.('aria-disabled') === 'true') dis = true; }
    if (hidden) continue;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    out.push({ text: el.textContent.trim().slice(0, 40), color: cs.color, x: r.left, y: r.top, w: r.width, h: r.height,
      large: size >= 24 || (bold && size >= 18.66), disabled: dis, sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') });
  }
  return out;
}"""

NAMES = r"""() => {
  const bad = [];
  const vis = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  for (const img of document.querySelectorAll('img')) if (vis(img) && !img.hasAttribute('alt')) bad.push('img without alt: ' + img.src.split('/').pop());
  for (const b of document.querySelectorAll('button, [role=button], [role=tab], [role=radio]')) {
    if (!vis(b)) continue;
    const name = (b.getAttribute('aria-label') || b.textContent || b.title || '').trim();
    if (!name) bad.push('button without a name: ' + b.outerHTML.slice(0, 80));
  }
  for (const f of document.querySelectorAll('input, select, textarea')) {
    if (!vis(f) || f.type === 'hidden') continue;
    const named = f.getAttribute('aria-label') || f.closest('label') || (f.id && document.querySelector(`label[for="${f.id}"]`));
    if (!named) bad.push('field without a label: ' + f.outerHTML.slice(0, 80));
  }
  return bad;
}"""


def lum(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def parse(color):
    v = color[color.index('(') + 1:-1].replace('/', ',').split(',')
    return [float(x) for x in v[:3]], (float(v[3]) if len(v) > 3 else 1.0)


async def check(pg, name, root=None):
    items = await pg.evaluate(COLLECT, root)
    await pg.add_style_tag(content='* { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } input, select, textarea { -webkit-text-fill-color: transparent !important; }')
    await pg.wait_for_timeout(120)
    shot = np.asarray(Image.open(io.BytesIO(await pg.screenshot())).convert('RGB'))
    await pg.evaluate("() => document.head.lastElementChild.remove()")
    dpr = shot.shape[1] / await pg.evaluate('innerWidth')
    fails = []
    for it in items:
        if it['disabled']:
            continue
        rgb, alpha = parse(it['color'])
        x0, y0 = int(max(0, it['x']) * dpr), int(max(0, it['y']) * dpr)
        x1, y1 = int(min(shot.shape[1] / dpr, it['x'] + it['w']) * dpr), int(min(shot.shape[0] / dpr, it['y'] + it['h']) * dpr)
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue
        bg = shot[y0:y1, x0:x1].reshape(-1, 3)
        if alpha < 1:  # text drawn translucent: blend it over the median background
            rgb = list(np.asarray(rgb) * alpha + np.median(bg, axis=0) * (1 - alpha))
        L = lum(bg)
        lt = lum(np.array(rgb))
        worst = np.percentile(L, 98) if lt > np.median(L) else np.percentile(L, 2)  # light text: brightest background
        ratio = (max(lt, worst) + 0.05) / (min(lt, worst) + 0.05)
        need = 3.0 if it['large'] else 4.5
        if ratio < need:
            fails.append((round(ratio, 2), need, it['sel'], it['text']))
    names = await pg.evaluate(NAMES)
    for f in sorted(fails)[:25]:
        print(f'FAIL contrast {name}: {f[0]} (needs {f[1]}) {f[2]} "{f[3]}"')
    for n in names:
        print(f'FAIL names {name}: {n}')
    print(f'{name}: {len(items)} pieces of text, {len(fails)} below AA, {len(names)} unnamed')
    return len(fails) + len(names)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        total = 0
        errs = []
        for tag, vp in (('desktop', {'width': 1360, 'height': 860}), ('phone', {'width': 390, 'height': 844})):
            pg = await b.new_page(viewport=vp)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_selector('#intro:not([hidden])'); await pg.evaluate('localStorage.clear()'); await pg.reload()
            await pg.wait_for_selector('#intro:not([hidden])'); await pg.wait_for_timeout(300)
            total += await check(pg, f'{tag} intro', '#intro')
            await pg.click('#intro-new'); await pg.wait_for_timeout(500)
            await pg.evaluate("() => { window.helmline.state.pirates.cooldown = 1e9; window.helmline.setSpeed(0); }")
            if tag == 'desktop':
                await pg.click('#btn-port')
            await pg.wait_for_timeout(400)
            total += await check(pg, f'{tag} chart and market')
            await pg.evaluate("""() => { const S = window.helmline.state; S.purse = 30000; S.contracts.unlocked = true; S.contracts.standing = 45; S.day = window.helmline.yearDay(1472) + 10; }""")
            await pg.evaluate('document.activeElement?.blur()'); await pg.keyboard.press('s'); await pg.wait_for_selector('.register'); await pg.wait_for_timeout(600)
            total += await check(pg, f'{tag} register', '#yard')
            await pg.click('[data-yard="open-yard"]'); await pg.wait_for_selector('.shipyard'); await pg.wait_for_timeout(500)
            total += await check(pg, f'{tag} shipyard', '#yard')
            await pg.click('[data-yard-tab="new"]'); await pg.wait_for_timeout(400)
            total += await check(pg, f'{tag} new ship', '#yard')
            await pg.screenshot(path=f'{OUT}/a11y_{tag}.png')
            await pg.close()
        print('ERRORS', errs)
        print('total problems', total)
        await b.close()
        if total: sys.exit(1)

asyncio.run(main())

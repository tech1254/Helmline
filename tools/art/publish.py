"""Turn the chosen art (tools/art/picks.json) into the game's images in public/img, and write
public/js/photos-data.js listing them.

    git archive origin/art art | tar x -C /tmp/artall
    python3 tools/art/publish.py /tmp/artall/art

Ships (cut-outs on transparency) are cut at their waterline with a soft, wavy edge so the game can
sit them in the water, cleared of green fringe on thin rigging, and warmed a little toward the
light of the harbour photographs. Interface textures are calmed so text over them keeps WCAG AA
contrast (see the design doc: vellum washed 65% toward #f6eedb, oak darkened 30%).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(ROOT, 'public', 'img')


def save_webp(im, path, q=74):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6)
    return os.path.getsize(path)


def fit(im, w):
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    return im


def order_of_christ_flag(im):
    """The image model kept drawing an English cross on Arguin's fort; repaint the flag by hand:
    take out the red ringed cross and paint the cross of the Order of Christ (red, flared arms,
    a thin white cross inside). Coordinates are for production-2/arguin-flag.png."""
    import cv2
    a = np.asarray(im.convert('RGB')).copy()
    x0, y0, x1, y1 = 826, 66, 1010, 176
    reg = a[y0:y1, x0:x1].astype(np.int32)
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    red = ((r - g > 35) & (r - b > 25)) | ((abs(r - g) < 60) & (b - r > 10) & (b > 90) & (g < 200))
    cy, cx = 124 - y0, 919 - x0
    yy, xx = np.mgrid[:reg.shape[0], :reg.shape[1]]
    red &= ((yy - cy) ** 2 / 45 ** 2 + (xx - cx) ** 2 / 46 ** 2) < 1
    mask = cv2.dilate(red.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    clean = cv2.inpaint(np.ascontiguousarray(a[y0:y1, x0:x1]), mask, 7, cv2.INPAINT_TELEA).astype(np.float32)
    m = (cv2.GaussianBlur(mask, (0, 0), 2) / 255.0)[..., None]
    lum = clean.mean(-1)
    flag = (lum > 150) & (mask == 0)
    ref = np.median(lum[flag])
    shade = (cv2.GaussianBlur(np.where(mask > 0, ref, lum), (0, 0), 2.5) / ref)[..., None].clip(.82, 1.05)
    clean = np.where(mask[..., None] > 0, np.median(clean[flag], axis=0) * shade, clean)
    clean = clean * (1 - m) + cv2.GaussianBlur(clean, (0, 0), 1.2) * m
    S = 4
    H, W = clean.shape[:2]
    art = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    c = (cx * S, cy * S); L = 37 * S; w0 = 5 * S; w1 = 17 * S
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        px, py = -dy, dx
        d.polygon([(c[0] + px * w0, c[1] + py * w0), (c[0] + dx * L + px * w1, c[1] + dy * L + py * w1),
                   (c[0] + dx * L - px * w1, c[1] + dy * L - py * w1), (c[0] - px * w0, c[1] - py * w0)], fill=(158, 36, 34, 255))
    d.rectangle([c[0] - w0, c[1] - w0, c[0] + w0, c[1] + w0], fill=(158, 36, 34, 255))
    t = int(1.2 * S); l = int(L * .8)
    d.rectangle([c[0] - l, c[1] - t, c[0] + l, c[1] + t], fill=(232, 228, 214, 255))
    d.rectangle([c[0] - t, c[1] - l, c[0] + t, c[1] + l], fill=(232, 228, 214, 255))
    art = art.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
    p = np.asarray(art).astype(np.float32)
    al = p[..., 3:] / 255
    col = p[..., :3] * shade + np.random.default_rng(1).normal(0, 3, p[..., :3].shape)
    a[y0:y1, x0:x1] = (clean * (1 - al) + col * al).clip(0, 255).astype(np.uint8)
    return Image.fromarray(a)


FIXES = {'order-of-christ-flag': order_of_christ_flag}


def ship(im, waterline, light):
    """Cut a ship at her waterline and tidy her for the water."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    wl = int(a.shape[0] * (1 - waterline))
    a = a[:wl + 4]
    m = a[..., 3] > 128
    mean = a[m][:, :3].mean(0)
    gain = (light / light.mean()) / (mean / mean.mean())
    a[..., :3] = np.clip(a[..., :3] * (1 + 0.4 * (gain - 1)), 0, 255)
    edge = (a[..., 3] > 8) & (a[..., 3] < 235)          # green fringe on thin rigging and spars
    a[..., 1] = np.where(edge, np.minimum(a[..., 1], 0.5 * (a[..., 0] + a[..., 2])), a[..., 1])
    xs = np.arange(a.shape[1])
    line = wl - 1 + 2.0 * np.sin(xs * .21) + 1.2 * np.sin(xs * .067 + 1)   # water lapping the hull
    rows = np.arange(a.shape[0])[:, None]
    a[..., 3] *= np.clip((line[None, :] + 2 - rows) / 4, 0, 1)
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')
    box = out.getbbox()
    return out.crop((box[0], box[1], box[2], out.height)) if box else out


def main():
    src = sys.argv[1]
    picks = json.load(open(os.path.join(ROOT, 'tools', 'art', 'picks.json')))
    load = lambda p: Image.open(os.path.join(src, p))
    data = {'ports': [], 'ships': {}, 'stocks': [], 'yards': [], 'ui': []}
    total = 0
    lows = []
    for pid, p in picks['ports'].items():
        p = p if isinstance(p, dict) else {'src': p}
        im = load(p['src']).convert('RGB')
        if p.get('fix'): im = FIXES[p['fix']](im)
        lows.append(np.asarray(im.resize((160, 90)))[45:].reshape(-1, 3).mean(0))
        total += save_webp(fit(im, 1600), f'{IMG}/ports/{pid}.webp', 72)
        data['ports'].append(pid)
        if pid in picks.get('light', {}):
            a = np.asarray(im).astype(np.float32)
            haze = a[int(a.shape[0] * .46):int(a.shape[0] * .52)].reshape(-1, 3).mean(0)   # just under the horizon
            data.setdefault('light', {})[pid] = {**picks['light'][pid], 'hazeColour': [round(float(x)) for x in haze]}
    light = np.mean(lows, axis=0)
    for sid, p in picks['ships'].items():
        im = ship(load(p['src']), p['waterline'], light)
        im = fit(im, 900)
        total += save_webp(im, f'{IMG}/ships/{sid}.webp', 80)
        px = np.asarray(im).astype(np.float32)
        px = px[px[..., 3] > 200][:, :3]
        L = px @ np.array([.2126, .7152, .0722])
        lo = px[L <= np.percentile(L, 3)].mean(0)                      # her deepest shadows
        hi = px[L >= np.percentile(L, 92)]
        hi = hi[(hi.max(1) - hi.min(1)) <= np.percentile(hi.max(1) - hi.min(1), 40)].mean(0)   # her sailcloth in full light
        data['ships'][sid] = {'w': im.width, 'h': im.height, 'length': p['length'],
                              'lo': [round(float(x), 1) for x in lo], 'hi': [round(float(x), 1) for x in hi]}
    for kind in ('stocks', 'yards'):
        for k, p in picks[kind].items():
            total += save_webp(fit(load(p).convert('RGB'), 1280), f'{IMG}/{kind}/{k}.webp', 72)
            data[kind].append(k)
    for k, p in picks['ui'].items():
        im = load(p['src']).convert('RGB')
        a = np.asarray(im).astype(np.float32)
        if 'wash' in p:
            to = np.array([int(p['toward'][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
            a = a + (to - a) * p['wash']
        if 'darken' in p:
            a = a * (1 - p['darken'])
        total += save_webp(fit(Image.fromarray(a.clip(0, 255).astype(np.uint8)), 1200), f'{IMG}/ui/{k}.webp', 70)
        data['ui'].append(k)
    with open(os.path.join(ROOT, 'public', 'js', 'photos-data.js'), 'w') as f:
        f.write('// Written by tools/art/publish.py from tools/art/picks.json. Do not edit by hand.\n')
        f.write(f'export const PHOTOS = {json.dumps(data, indent=2)};\n')
    print(f'{total / 1e6:.1f} MB in public/img')


if __name__ == '__main__':
    main()

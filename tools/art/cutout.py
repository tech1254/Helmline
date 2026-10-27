"""Cut ships (or anything) out of a flat chroma-green background, for items marked "cutout": true.

    python3 tools/art/cutout.py art/<batch>
    python3 tools/art/cutout.py - --files a.png b.png

For each such item in art/<batch>/manifest.json, writes <id>-cut.png: the subject on a transparent
background, trimmed to its edges. Prompts ask for a flat chroma-green background, so the cut is a
colour key measured against that picture's own green:

- alpha follows how green each pixel is, with a soft edge, so thin rigging and flagpoles survive;
- specks far from the subject are dropped (small blobs not near the main body);
- holes enclosed by the subject are filled where their colour is tinted cloth (thin sails let some
  green through) and left open where they are pure background (sky seen between mast and sail);
- green spill is taken out of the edges.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage


def cut(img):
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    spill = g - np.maximum(r, b)                                   # how green a pixel is
    border = np.concatenate([spill[:6].ravel(), spill[-6:].ravel(), spill[:, :6].ravel(), spill[:, -6:].ravel()])
    bg = max(80.0, float(np.median(border)))                       # this picture's background green
    lo, hi = 0.18 * bg, 0.5 * bg
    key = np.clip(1 - (spill - lo) / (hi - lo), 0, 1)              # 1 = subject, 0 = background

    core = key > 0.5
    labels, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, labels, range(1, n + 1))
        main = labels == (int(np.argmax(sizes)) + 1)
        reach = ndimage.binary_dilation(main, iterations=40)
        keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= 150 or reach[labels == i + 1].any()]
        core = np.isin(labels, keep_ids)
    near = ndimage.binary_dilation(core, iterations=6)
    alpha = key * near

    # enclosed holes: fill tinted cloth, keep pure background open
    holes = ndimage.binary_fill_holes(core) & ~core
    cloth = np.clip((0.75 * bg - spill) / (0.25 * bg), 0, 1)
    alpha = np.where(holes, np.maximum(alpha, cloth), alpha)
    alpha = np.where(alpha < 0.04, 0, alpha)

    g2 = np.minimum(g, np.maximum(r, b))                           # despill
    fg = np.dstack([r, g2, b]).clip(0, 255)
    out = Image.fromarray(np.dstack([fg, alpha * 255]).astype(np.uint8), 'RGBA')
    box = out.getbbox()
    return out.crop(box) if box else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--files', nargs='*', help='cut these images instead of the manifest items')
    args = ap.parse_args()
    if args.files:
        jobs = [(f, os.path.splitext(f)[0] + '-cut.png') for f in args.files]
    else:
        path = os.path.join(args.folder, 'manifest.json')
        if not os.path.exists(path):
            print('no manifest: nothing was generated'); return
        man = json.load(open(path))
        jobs = [(os.path.join(args.folder, i['file']), os.path.join(args.folder, i['id'] + '-cut.png'))
                for i in man['items'] if i.get('cutout') and i.get('file')]
    if not jobs:
        print('nothing to cut out'); return
    for src, dst in jobs:
        out = cut(Image.open(src))
        out.save(dst, optimize=True)
        print(f'cut  {os.path.basename(dst)} {out.size}', flush=True)


if __name__ == '__main__':
    sys.exit(main())

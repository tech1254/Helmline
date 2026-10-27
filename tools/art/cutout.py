"""Cut ships (or anything) out of their background, for items marked "cutout": true in a batch.

    python3 tools/art/cutout.py art/<batch> [--model birefnet|isnet] [--models-dir DIR]

For each such item in art/<batch>/manifest.json, writes <id>-cut.png: the subject on a transparent
background, trimmed to its edges. Pictures are generated on flat chroma green; the green
is keyed out, and a segmentation model (IS-Net or BiRefNet, ONNX builds published with rembg, run
with onnxruntime) decides what counts as the subject, so specks and floor shadows are dropped.
"""
import argparse, json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort

MODELS = {
    'birefnet': ('BiRefNet-general-epoch_244.onnx', (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), 'sigmoid'),
    'isnet': ('isnet-general-use.onnx', (0.5, 0.5, 0.5), (1.0, 1.0, 1.0), 'minmax'),
}
BASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/'


def load(model, models_dir):
    name = MODELS[model][0]
    path = os.path.join(models_dir, name)
    if not os.path.exists(path):
        os.makedirs(models_dir, exist_ok=True)
        print(f'downloading {name} ...', flush=True)
        urllib.request.urlretrieve(BASE + name, path)
    return ort.InferenceSession(path, providers=['CPUExecutionProvider'])


def mask_for(sess, model, img):
    _, mean, std, kind = MODELS[model]
    x = np.asarray(img.convert('RGB').resize((1024, 1024), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - mean) / std
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    if kind == 'sigmoid':
        out = 1 / (1 + np.exp(-out))
    else:
        out = (out - out.min()) / max(1e-6, out.max() - out.min())
    m = Image.fromarray((out * 255).clip(0, 255).astype(np.uint8)).resize(img.size, Image.BICUBIC)
    return np.asarray(m, dtype=np.float32) / 255.0


def _unused_background_colour(rgb):
    # the plain background: the median of a 4-pixel border
    edge = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def cut(img, sess, model):
    """Key the subject off a flat chroma-green background (as the prompts ask for), keep only what
    lies near the segmentation model's subject (so floor shadows and stray specks go), and take the
    green spill out of the edges. No erosion, so thin rigging and flagpoles survive."""
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    spill = g - np.maximum(r, b)                      # how green a pixel is
    key = np.clip(1 - (spill - 22) / 55, 0, 1)        # soft edge between 22 and 77
    m = mask_for(sess, model, img)
    near = np.asarray(Image.fromarray((m > 0.3).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(31)), dtype=np.float32) / 255.0
    near = np.asarray(Image.fromarray((near * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255.0
    alpha = key * near
    # Inside the subject, thin cloth lets some green through and would turn see-through. Where the
    # model is sure it is the ship and the pixel is not the pure background green, keep it solid.
    sure = np.asarray(Image.fromarray((m > 0.85).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(7)), dtype=np.float32) / 255.0
    solid = sure * np.clip(1 - (spill - 60) / 30, 0, 1)
    alpha = np.maximum(alpha, solid)
    alpha = np.where(alpha < 0.05, 0, alpha)
    g2 = np.minimum(g, np.maximum(r, b))              # despill: no channel greener than the others
    fg = np.dstack([r, g2, b]).clip(0, 255)
    out = Image.fromarray(np.dstack([fg, alpha * 255]).astype(np.uint8), 'RGBA')
    box = out.getbbox()
    return out.crop(box) if box else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--model', default='isnet', choices=list(MODELS))
    ap.add_argument('--models-dir', default=os.path.expanduser('~/.cache/helmline-models'))
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
    sess = load(args.model, args.models_dir)
    for src, dst in jobs:
        out = cut(Image.open(src), sess, args.model)
        out.save(dst, optimize=True)
        print(f'cut  {os.path.basename(dst)} {out.size}', flush=True)


if __name__ == '__main__':
    sys.exit(main())

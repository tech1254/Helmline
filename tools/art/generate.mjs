// Generate art with Cloudflare Workers AI, from a batch file of prompts.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node tools/art/generate.mjs <batch> [only-id ...]
//
// <batch> names tools/art/batches/<batch>.json:
//   { "note": "...", "items": [ { "id", "model", "prompt", "width", "height", "seed", "refs": ["tools/art/refs/x.png"], "cutout": true } ] }
// A ref of the form "art:<batch>/<file>" uses an earlier result from the art branch (to edit or clean it up).
// Images are written to art/<batch>/<id>.<ext>, with art/<batch>/manifest.json recording each prompt.
// Run by .github/workflows/generate-art.yml, which commits the results to the `art` branch.
//
// Two kinds of model:
//   "@cf/black-forest-labs/flux-2-klein-9b" and other @cf models: multipart form, reference images
//     sent as files (each under 512×512), the image comes back as base64.
//   "black-forest-labs/flux-2-pro-preview" and other partner models: JSON, reference images passed by
//     URL (raw.githubusercontent.com at this commit, since the repo is public), the image comes back
//     as a URL to download.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: TOKEN, GITHUB_REPOSITORY, GITHUB_SHA } = process.env;
const [batch, ...only] = process.argv.slice(2);

if (!batch || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(batch)) fail('Give a batch name: lowercase letters, digits and dashes.');
if (!ACCOUNT || !TOKEN) fail('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set (repository secrets in GitHub Actions).');

const BASE = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4'; // overridable for local tests
const API = `${BASE}/accounts/${ACCOUNT}/ai/run`;
const spec = JSON.parse(await readFile(path.join(ROOT, 'tools/art/batches', `${batch}.json`), 'utf8'));
const outDir = path.join(ROOT, 'art', batch);
await mkdir(outDir, { recursive: true });

const manifest = { batch, note: spec.note || '', commit: GITHUB_SHA || null, generated: new Date().toISOString(), items: [] };
let failures = 0;
for (const item of spec.items) {
  if (only.length && !only.includes(item.id)) continue;
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(item.id)) { console.error(`skipping bad id ${item.id}`); failures++; continue; }
  const started = Date.now();
  try {
    const { bytes, ext } = await generate(item);
    const file = `${item.id}.${ext}`;
    await writeFile(path.join(outDir, file), bytes);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`ok   ${item.id} (${item.model}, ${item.width}x${item.height}, ${Math.round(bytes.length / 1024)} KB, ${secs}s)`);
    manifest.items.push({ ...item, file, seconds: +secs });
  } catch (e) {
    failures++;
    console.error(`FAIL ${item.id}: ${e.message}`);
    manifest.items.push({ ...item, error: e.message });
  }
}
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.items.length - failures} of ${manifest.items.length} generated into art/${batch}/`);
if (failures === manifest.items.length) process.exit(1);

async function generate(item) {
  const refs = item.refs || [];
  if (item.model.startsWith('@cf/')) {
    const form = new FormData();
    form.append('prompt', item.prompt);
    if (item.width) form.append('width', String(item.width));
    if (item.height) form.append('height', String(item.height));
    if (item.seed != null) form.append('seed', String(item.seed));
    if (item.steps) form.append('steps', String(item.steps));
    for (const [i, ref] of refs.entries()) {
      if (ref.startsWith('art:')) throw new Error('art-branch references only work with the pro model');
      const buf = await readFile(path.join(ROOT, ref));
      form.append(`input_image_${i}`, new Blob([buf], { type: ref.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(ref));
    }
    const json = await call(`${API}/${item.model}`, { method: 'POST', body: form });
    const img = json.result?.image;
    if (!img) throw new Error(`no image in reply: ${JSON.stringify(json).slice(0, 300)}`);
    return { bytes: Buffer.from(img, 'base64'), ext: sniff(Buffer.from(img, 'base64')) };
  }
  const input = { prompt: item.prompt, output_format: item.format || 'png' };
  if (item.width) input.width = item.width;
  if (item.height) input.height = item.height;
  if (item.seed != null) input.seed = item.seed;
  if (refs.length) {
    if (!GITHUB_REPOSITORY || !GITHUB_SHA) throw new Error('reference images need GITHUB_REPOSITORY and GITHUB_SHA (run in Actions)');
    // "art:<batch>/<file>" points at an earlier result on the art branch (for edits and clean-ups)
    input.input_images = refs.map((r) => (r.startsWith('art:')
      ? `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/art/art/${r.slice(4)}`
      : `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_SHA}/${r}`));
  }
  const json = await call(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: item.model, input }) });
  const result = json.result || json;
  if (result.state && result.state !== 'Completed') throw new Error(`state ${result.state}: ${JSON.stringify(json).slice(0, 300)}`);
  const img = result.image || result.result?.image;
  if (!img) throw new Error(`no image in reply: ${JSON.stringify(json).slice(0, 300)}`);
  if (/^https?:/.test(img)) {
    const r = await fetch(img);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    return { bytes, ext: sniff(bytes) };
  }
  const bytes = Buffer.from(img.replace(/^data:[^,]+,/, ''), 'base64');
  return { bytes, ext: sniff(bytes) };
}

async function call(url, init, tries = 3) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(240000) });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (r.ok && json && json.success !== false) return json;
    const why = json?.errors?.map((e) => e.message).join('; ') || text.slice(0, 300);
    if (t >= tries || (r.status < 500 && r.status !== 429)) throw new Error(`HTTP ${r.status}: ${why}`);
    console.error(`  retry ${t} after HTTP ${r.status}: ${why}`);
    await new Promise((res) => setTimeout(res, 4000 * t));
  }
}

function sniff(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.slice(0, 4).toString() === 'RIFF') return 'webp';
  return 'bin';
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

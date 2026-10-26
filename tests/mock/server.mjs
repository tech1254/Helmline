// Local stand-in for Cloudflare: runs the real Worker with SQLite as D1 and the public/ folder as ASSETS.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const repo = path.resolve(process.argv[2] || '.');
const PORT = Number(process.env.PORT || 8787);
const worker = (await import(path.join(repo, 'src/worker.js'))).default;
const db = new DatabaseSync(':memory:');
db.exec(await readFile(path.join(repo, 'migrations/0001_saves.sql'), 'utf8'));
class Stmt {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
  async run() { const r = db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const env = {
  DB: { prepare: (sql) => new Stmt(sql) },
  ASSETS: { async fetch(req) {
    let p = new URL(req.url).pathname; if (p.endsWith('/')) p += 'index.html';
    try { const body = await readFile(path.join(repo, 'public', p)); return new Response(body, { headers: { 'content-type': types[path.extname(p)] || 'application/octet-stream' } }); }
    catch { return new Response('not found', { status: 404 }); }
  } },
};
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const r = await worker.fetch(request, env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`mock cloudflare on ${PORT}`));

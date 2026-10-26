// Helmline Worker: serves the game's static files, plus a small API for cloud saves.
//
// A cloud save is identified by a save code the player keeps (like a password).
// The database only stores a SHA-256 hash of the code, never the code itself.
//
//   POST /api/saves          { data, day }                       -> { code, version, updatedAt }
//   GET  /api/saves/:code                                         -> { data, version, day, updatedAt }
//   PUT  /api/saves/:code    { data, day, baseVersion, force? }  -> { version, updatedAt }
//                            409 { version, day, updatedAt } if another device saved first
//   POST /api/feedback       { kind: 'bug'|'idea', message, contact?, context? } -> { id }
//                            429 if one sender has sent too many in the last hour

const MAX_BYTES = 512 * 1024;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O or 1/I to mistype
const CODE_LENGTH = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/saves' || url.pathname.startsWith('/api/saves/')) {
      try {
        return await saves(request, env, url);
      } catch (err) {
        console.error('save API error', err);
        return json({ error: 'Something went wrong on the server.' }, 500);
      }
    }
    if (url.pathname === '/api/feedback') {
      try {
        return await feedback(request, env);
      } catch (err) {
        console.error('feedback API error', err);
        return json({ error: 'Something went wrong on the server.' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function saves(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'saves', code?]
  const code = parts[2] ? normalizeCode(decodeURIComponent(parts[2])) : null;
  const method = request.method;

  if (!code && method === 'POST') {
    const body = await readBody(request);
    if (body.error) return json({ error: body.error }, 400);
    const now = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const newCode = makeCode();
      const id = await hash(newCode);
      try {
        await env.DB.prepare('INSERT INTO saves (id, data, version, game_day, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)')
          .bind(id, body.data, body.day, now, now).run();
        return json({ code: formatCode(newCode), version: 1, updatedAt: now }, 201);
      } catch (err) {
        if (!String(err).includes('UNIQUE')) throw err; // vanishingly unlikely: try another code
      }
    }
    return json({ error: 'Could not create a save code. Try again.' }, 500);
  }

  if (!code || code.length !== CODE_LENGTH) return json({ error: 'That save code is not valid.' }, 400);
  const id = await hash(code);

  if (method === 'GET') {
    const row = await env.DB.prepare('SELECT data, version, game_day, updated_at FROM saves WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'No save found for that code.' }, 404);
    return json({ data: row.data, version: row.version, day: row.game_day, updatedAt: row.updated_at });
  }

  if (method === 'PUT') {
    const body = await readBody(request);
    if (body.error) return json({ error: body.error }, 400);
    const row = await env.DB.prepare('SELECT version, game_day, updated_at FROM saves WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'No save found for that code.' }, 404);
    if (!body.force && row.version !== body.baseVersion) {
      return json({ error: 'conflict', version: row.version, day: row.game_day, updatedAt: row.updated_at }, 409);
    }
    const now = Date.now();
    const version = row.version + 1;
    // Only write if nobody saved in between (compare-and-swap on the version).
    const res = await env.DB.prepare('UPDATE saves SET data = ?, version = ?, game_day = ?, updated_at = ? WHERE id = ? AND version = ?')
      .bind(body.data, version, body.day, now, id, row.version).run();
    if (!res.meta || res.meta.changes !== 1) {
      const latest = await env.DB.prepare('SELECT version, game_day, updated_at FROM saves WHERE id = ?').bind(id).first();
      return json({ error: 'conflict', version: latest.version, day: latest.game_day, updatedAt: latest.updated_at }, 409);
    }
    return json({ version, updatedAt: now });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ---- Feedback ---------------------------------------------------------------------
const FEEDBACK_PER_HOUR = 10;
const MESSAGE_MAX = 4000;

async function feedback(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const text = await request.text();
  if (text.length > 20000) return json({ error: 'That is too long to send.' }, 400);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Request is not valid JSON.' }, 400); }
  const kind = body.kind === 'bug' || body.kind === 'idea' ? body.kind : null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!kind) return json({ error: 'Say whether this is a bug or an idea.' }, 400);
  if (message.length < 5) return json({ error: 'Please describe it in a few words.' }, 400);
  if (message.length > MESSAGE_MAX) return json({ error: `Please keep it under ${MESSAGE_MAX} characters.` }, 400);
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 200) || null : null;
  let context = null;
  if (body.context && typeof body.context === 'object') {
    context = JSON.stringify(body.context);
    if (context.length > 8000) context = context.slice(0, 8000);
  }
  // Only a hash of the sender's address is kept, to stop one sender flooding the backlog.
  const sender = (await hash(`feedback:${request.headers.get('cf-connecting-ip') || 'unknown'}`)).slice(0, 16);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE sender = ? AND created_at > ?')
    .bind(sender, now - 3600000).first();
  if (recent && recent.n >= FEEDBACK_PER_HOUR) return json({ error: 'Thank you! That is plenty for one hour; please send more later.' }, 429);
  const res = await env.DB.prepare('INSERT INTO feedback (kind, message, contact, context, sender, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(kind, message, contact, context, sender, now).run();
  return json({ id: res.meta?.last_row_id ?? null }, 201);
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BYTES * 1.1) return { error: 'Save is too large.' };
  let body;
  try { body = JSON.parse(text); } catch { return { error: 'Request is not valid JSON.' }; }
  if (typeof body.data !== 'string' || body.data.length > MAX_BYTES) return { error: 'Save data missing or too large.' };
  try {
    const parsed = JSON.parse(body.data);
    if (!parsed || typeof parsed !== 'object' || !parsed.S) return { error: 'Save data is not a Helmline save.' };
  } catch { return { error: 'Save data is not valid JSON.' }; }
  return {
    data: body.data,
    day: Number.isFinite(body.day) ? body.day : null,
    baseVersion: Number.isInteger(body.baseVersion) ? body.baseVersion : null,
    force: body.force === true,
  };
}

function makeCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length]; // 256 is a multiple of 32: no bias
  return s;
}

export function normalizeCode(input) {
  return String(input).toUpperCase().replace(/[^A-Z0-9]/g, ''); // ignore spaces, dashes and case
}

function formatCode(code) {
  return code.match(/.{1,4}/g).join('-');
}

async function hash(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`helmline:${code}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

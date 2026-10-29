// Helmline Worker: serves the game's static files, plus a small API for cloud saves.
//
// A cloud save is identified by a save code the player keeps (like a password).
// The database only stores a SHA-256 hash of the code, never the code itself.
//
//   POST /api/saves          { data, day }                       -> { code, version, updatedAt }
//   GET  /api/saves/:code                                         -> { data, version, day, updatedAt }
//   PUT  /api/saves/:code    { data, day, baseVersion, force? }  -> { version, updatedAt }
//                            409 { version, day, updatedAt } if another device saved first
//
// Accounts: a name and password; each account keeps up to MAX_SLOTS named saves, and settings
// switched on for it alone (flags). The session token goes in `authorization: Bearer <token>`.
//   POST   /api/account/register  { name, password }          -> { token, account }
//   POST   /api/account/login     { name, password }          -> { token, account }
//   POST   /api/account/logout                                 -> {}
//   GET    /api/account                                        -> { account }   (with its slots)
//   POST   /api/account/slots     { name, data, day }         -> { id, version, updatedAt }
//   GET    /api/account/slots/:id                              -> { data, version, day, updatedAt, name }
//   PUT    /api/account/slots/:id { data, day, baseVersion, force?, name? } -> { version, updatedAt }  (409 as above)
//   PATCH  /api/account/slots/:id { name }                     -> {}
//   DELETE /api/account/slots/:id                              -> {}
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
    if (url.pathname === '/api/account' || url.pathname.startsWith('/api/account/')) {
      try {
        return await account(request, env, url);
      } catch (err) {
        console.error('account API error', err);
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

// ---- Accounts ---------------------------------------------------------------------
const MAX_SLOTS = 10;
const SESSION_DAYS = 90;
const PBKDF2_ITERATIONS = 100000; // the most Workers allow
const LOCK_AFTER = 8; // wrong passwords in a row before a wait
const LOCK_MS = 10 * 60 * 1000;
const NAME_RE = /^[A-Za-z0-9 _.\-]{3,24}$/;

async function account(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'account', action?, id?]
  const action = parts[2] || null;
  const method = request.method;

  if (action === 'register' && method === 'POST') {
    const b = await readJson(request);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!NAME_RE.test(name)) return json({ error: 'Choose a name of 3 to 24 letters, numbers, spaces, dots or dashes.' }, 400);
    if (password.length < 8 || password.length > 200) return json({ error: 'Choose a password of at least 8 characters.' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM accounts WHERE name = ?').bind(name).first();
    if (exists) return json({ error: 'That name is taken. Try another, or sign in.' }, 409);
    const salt = randomHex(16);
    const passHash = await pbkdf2(password, salt);
    const now = Date.now();
    const res = await env.DB.prepare('INSERT INTO accounts (name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)').bind(name, passHash, salt, now).run();
    const id = res.meta?.last_row_id;
    const token = await newSession(env, id);
    return json({ token, account: await accountInfo(env, id) }, 201);
  }

  if (action === 'login' && method === 'POST') {
    const b = await readJson(request);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const row = await env.DB.prepare('SELECT id, pass_hash, salt, failed, failed_at FROM accounts WHERE name = ?').bind(name).first();
    const wrong = { error: 'That name and password do not match.' };
    if (!row) { await pbkdf2(password, 'no-such-account'); return json(wrong, 401); } // same time either way
    const now = Date.now();
    if (row.failed >= LOCK_AFTER && now - (row.failed_at || 0) < LOCK_MS) return json({ error: 'Too many wrong passwords. Wait ten minutes and try again.' }, 429);
    const ok = timingSafeEqual(await pbkdf2(password, row.salt), row.pass_hash);
    if (!ok) {
      await env.DB.prepare('UPDATE accounts SET failed = ?, failed_at = ? WHERE id = ?').bind(row.failed >= LOCK_AFTER ? 1 : row.failed + 1, now, row.id).run();
      return json(wrong, 401);
    }
    await env.DB.prepare('UPDATE accounts SET failed = 0, failed_at = NULL WHERE id = ?').bind(row.id).run();
    const token = await newSession(env, row.id);
    return json({ token, account: await accountInfo(env, row.id) });
  }

  // Everything else needs a signed-in device.
  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!auth) return json({ error: 'Sign in first.' }, 401);
  const sid = await hash(`session:${auth}`);
  const sess = await env.DB.prepare('SELECT account_id, expires_at FROM sessions WHERE id = ?').bind(sid).first();
  if (!sess || sess.expires_at < Date.now()) return json({ error: 'Your sign-in has expired. Sign in again.' }, 401);
  const acct = sess.account_id;

  if (action === 'logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
    return json({});
  }
  if (!action && method === 'GET') return json({ account: await accountInfo(env, acct) });

  if (action === 'slots') {
    const slotId = parts[3] ? decodeURIComponent(parts[3]) : null;
    if (!slotId && method === 'POST') {
      const body = await readBody(request);
      if (body.error) return json({ error: body.error }, 400);
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves WHERE account_id = ?').bind(acct).first();
      if (n && n.n >= MAX_SLOTS) return json({ error: `An account keeps at most ${MAX_SLOTS} saves. Delete one first.` }, 409);
      const id = `a${acct}-${randomHex(8)}`;
      const now = Date.now();
      await env.DB.prepare('INSERT INTO saves (id, data, version, game_day, created_at, updated_at, account_id, name) VALUES (?, ?, 1, ?, ?, ?, ?, ?)')
        .bind(id, body.data, body.day, now, now, acct, slotName(body.name)).run();
      return json({ id, version: 1, updatedAt: now }, 201);
    }
    if (!slotId) return json({ error: 'Method not allowed' }, 405);
    const row = await env.DB.prepare('SELECT data, version, game_day, updated_at, name FROM saves WHERE id = ? AND account_id = ?').bind(slotId, acct).first();
    if (!row) return json({ error: 'No such save in your account.' }, 404);
    if (method === 'GET') return json({ data: row.data, version: row.version, day: row.game_day, updatedAt: row.updated_at, name: row.name });
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM saves WHERE id = ? AND account_id = ?').bind(slotId, acct).run();
      return json({});
    }
    if (method === 'PATCH') {
      const b = await readJson(request);
      await env.DB.prepare('UPDATE saves SET name = ? WHERE id = ? AND account_id = ?').bind(slotName(b.name), slotId, acct).run();
      return json({});
    }
    if (method === 'PUT') {
      const body = await readBody(request);
      if (body.error) return json({ error: body.error }, 400);
      if (!body.force && row.version !== body.baseVersion) return json({ error: 'conflict', version: row.version, day: row.game_day, updatedAt: row.updated_at }, 409);
      const now = Date.now();
      const version = row.version + 1;
      const res = await env.DB.prepare('UPDATE saves SET data = ?, version = ?, game_day = ?, updated_at = ? WHERE id = ? AND account_id = ? AND version = ?')
        .bind(body.data, version, body.day, now, slotId, acct, row.version).run();
      if (!res.meta || res.meta.changes !== 1) {
        const latest = await env.DB.prepare('SELECT version, game_day, updated_at FROM saves WHERE id = ?').bind(slotId).first();
        return json({ error: 'conflict', version: latest.version, day: latest.game_day, updatedAt: latest.updated_at }, 409);
      }
      return json({ version, updatedAt: now });
    }
  }
  return json({ error: 'Not found' }, 404);
}

async function accountInfo(env, id) {
  const a = await env.DB.prepare('SELECT name, flags FROM accounts WHERE id = ?').bind(id).first();
  const slots = await env.DB.prepare('SELECT id, name, game_day, updated_at FROM saves WHERE account_id = ? ORDER BY updated_at DESC').bind(id).all();
  let flags = {};
  try { flags = JSON.parse(a.flags || '{}'); } catch { /* bad flags: none */ }
  return { name: a.name, flags, slots: (slots.results || []).map((r) => ({ id: r.id, name: r.name, day: r.game_day, updatedAt: r.updated_at })) };
}

async function newSession(env, accountId) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await hash(`session:${token}`), accountId, now, now + SESSION_DAYS * 86400000).run();
  return token;
}

const slotName = (n) => (typeof n === 'string' && n.trim() ? n.trim().replace(/[<>]/g, '').slice(0, 40) : 'A voyage');

async function readJson(request) {
  const text = await request.text();
  if (text.length > 4000) return {};
  try { return JSON.parse(text) || {}; } catch { return {}; }
}

function randomHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
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
    name: typeof body.name === 'string' ? body.name : null,
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

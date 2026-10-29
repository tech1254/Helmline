// Cloud saves: keep one voyage in sync across devices, either with a save code (the code is the
// only key to the save, so it is kept on this device and shown to the player) or as one of the
// named saves of an account (signed in with a name and password; see account below).

const META_KEY = 'helmline-cloud-v1';
const ACCOUNT_KEY = 'helmline-account-v1';

// The signed-in account: its session token (kept on this device), name, settings and saves.
export const account = { token: null, name: null, flags: {}, slots: [] };

export const cloud = {
  code: null, // e.g. "7KQ2-MX9P-4TRD"
  slot: null, // or: the id of the account save this game is kept in
  slotName: null,
  version: 0, // the cloud version this device last saw or wrote
  lastSync: 0, // ms timestamp of the last successful sync
  status: 'off', // off | idle | syncing | error | conflict
  error: '',
};

export function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (m?.code) Object.assign(cloud, { code: m.code, version: m.version || 0, lastSync: m.lastSync || 0, status: 'idle' });
    if (m?.slot) Object.assign(cloud, { slot: m.slot, slotName: m.slotName || null, version: m.version || 0, lastSync: m.lastSync || 0, status: 'idle' });
  } catch (e) { /* no meta: cloud saves are off */ }
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
    if (a?.token) Object.assign(account, { token: a.token, name: a.name || null, flags: a.flags || {} });
  } catch (e) { /* not signed in */ }
}

function saveMeta() {
  try {
    if (cloud.code || cloud.slot) localStorage.setItem(META_KEY, JSON.stringify({ code: cloud.code, slot: cloud.slot, slotName: cloud.slotName, version: cloud.version, lastSync: cloud.lastSync }));
    else localStorage.removeItem(META_KEY);
  } catch (e) { /* storage unavailable */ }
}

function saveAccount() {
  try {
    if (account.token) localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ token: account.token, name: account.name, flags: account.flags }));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch (e) { /* storage unavailable */ }
}

async function call(method, path, body) {
  const headers = body ? { 'content-type': 'application/json' } : {};
  if (account.token && path.startsWith('/api/account')) headers.authorization = `Bearer ${account.token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

// Start a cloud save from this device's game.
export async function create(payload, day) {
  cloud.status = 'syncing';
  const r = await call('POST', '/api/saves', { data: payload, day });
  if (!r.ok) return fail(r);
  Object.assign(cloud, { code: r.data.code, version: r.data.version, lastSync: Date.now(), status: 'idle', error: '' });
  saveMeta();
  return { ok: true, code: r.data.code };
}

// Upload this device's game. On a conflict, returns { conflict: {version, day, updatedAt} }.
export async function push(payload, day, force = false) {
  if (!cloud.code && !cloud.slot) return { ok: false };
  cloud.status = 'syncing';
  const r = cloud.slot
    ? await call('PUT', `/api/account/slots/${encodeURIComponent(cloud.slot)}`, { data: payload, day, baseVersion: cloud.version, force })
    : await call('PUT', `/api/saves/${encodeURIComponent(cloud.code)}`, { data: payload, day, baseVersion: cloud.version, force });
  if (r.status === 401 && cloud.slot) { signedOut(); return fail(r); }
  if (r.status === 409) {
    cloud.status = 'conflict';
    return { ok: false, conflict: r.data };
  }
  if (!r.ok) return fail(r);
  Object.assign(cloud, { version: r.data.version, lastSync: Date.now(), status: 'idle', error: '' });
  saveMeta();
  return { ok: true };
}

// Read a save by code (this device's, or one typed in from another device).
export async function fetchSave(code = cloud.code) {
  const r = await call('GET', `/api/saves/${encodeURIComponent(code)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data.error || 'Could not reach the cloud save.' };
  return { ok: true, ...r.data };
}

// Link this device to a save that was fetched with `fetchSave`.
export function link(code, version) {
  Object.assign(cloud, { code: code.toUpperCase(), version, lastSync: Date.now(), status: 'idle', error: '' });
  saveMeta();
}

export function unlink() {
  Object.assign(cloud, { code: null, slot: null, slotName: null, version: 0, lastSync: 0, status: 'off', error: '' });
  saveMeta();
}

// ---- Accounts ----------------------------------------------------------------------
// Settings switched on for one account (by us, in the database), e.g. faster time for a playtester.
export function timeScale() {
  const k = Number(account.flags?.timeScale);
  return Number.isFinite(k) && k > 0 ? Math.min(20, k) : 1;
}

function signedIn(r) {
  Object.assign(account, { token: r.data.token || account.token, name: r.data.account.name, flags: r.data.account.flags || {}, slots: r.data.account.slots || [] });
  saveAccount();
  return { ok: true };
}
function signedOut() {
  Object.assign(account, { token: null, name: null, flags: {}, slots: [] });
  saveAccount();
  if (cloud.slot) unlink();
}

export async function register(name, password) {
  const r = await call('POST', '/api/account/register', { name, password });
  return r.ok ? signedIn(r) : { ok: false, error: r.data.error || 'Could not create the account.' };
}
export async function login(name, password) {
  const r = await call('POST', '/api/account/login', { name, password });
  return r.ok ? signedIn(r) : { ok: false, error: r.data.error || 'Could not sign in.' };
}
export async function logout() {
  if (account.token) { try { await call('POST', '/api/account/logout', {}); } catch (e) { /* signed out here anyway */ } }
  signedOut();
}
// The account's saves and settings, fresh from the server.
export async function refreshAccount() {
  if (!account.token) return { ok: false };
  const r = await call('GET', '/api/account');
  if (r.status === 401) { signedOut(); return { ok: false, error: r.data.error }; }
  return r.ok ? signedIn(r) : { ok: false, error: r.data.error };
}

// Keep this game as a new save in the account, and sync to it from now on.
export async function createSlot(name, payload, day) {
  cloud.status = 'syncing';
  const r = await call('POST', '/api/account/slots', { name, data: payload, day });
  if (!r.ok) return fail(r);
  Object.assign(cloud, { code: null, slot: r.data.id, slotName: name, version: r.data.version, lastSync: Date.now(), status: 'idle', error: '' });
  saveMeta();
  await refreshAccount();
  return { ok: true };
}
export async function fetchSlot(id) {
  const r = await call('GET', `/api/account/slots/${encodeURIComponent(id)}`);
  if (!r.ok) return { ok: false, status: r.status, error: r.data.error || 'Could not reach your saves.' };
  return { ok: true, ...r.data };
}
export function linkSlot(id, name, version) {
  Object.assign(cloud, { code: null, slot: id, slotName: name, version, lastSync: Date.now(), status: 'idle', error: '' });
  saveMeta();
}
export async function renameSlot(id, name) {
  const r = await call('PATCH', `/api/account/slots/${encodeURIComponent(id)}`, { name });
  if (r.ok && cloud.slot === id) { cloud.slotName = name; saveMeta(); }
  await refreshAccount();
  return r.ok ? { ok: true } : { ok: false, error: r.data.error };
}
export async function deleteSlot(id) {
  const r = await call('DELETE', `/api/account/slots/${encodeURIComponent(id)}`);
  if (r.ok && cloud.slot === id) unlink();
  await refreshAccount();
  return r.ok ? { ok: true } : { ok: false, error: r.data.error };
}

function fail(r) {
  cloud.status = 'error';
  cloud.error = r.data?.error || (r.status ? `The server answered ${r.status}.` : 'Could not reach the server.');
  return { ok: false, error: cloud.error };
}

export function markFailed(err) {
  cloud.status = 'error';
  cloud.error = err?.message || 'Could not reach the server.';
}

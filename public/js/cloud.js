// Cloud saves: keep one voyage in sync across devices with a save code.
// The code is the only key to the save, so it is kept on this device and shown to the player.

const META_KEY = 'helmline-cloud-v1';

export const cloud = {
  code: null, // e.g. "7KQ2-MX9P-4TRD"
  version: 0, // the cloud version this device last saw or wrote
  lastSync: 0, // ms timestamp of the last successful sync
  status: 'off', // off | idle | syncing | error | conflict
  error: '',
};

export function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (m?.code) Object.assign(cloud, { code: m.code, version: m.version || 0, lastSync: m.lastSync || 0, status: 'idle' });
  } catch (e) { /* no meta: cloud saves are off */ }
}

function saveMeta() {
  try {
    if (cloud.code) localStorage.setItem(META_KEY, JSON.stringify({ code: cloud.code, version: cloud.version, lastSync: cloud.lastSync }));
    else localStorage.removeItem(META_KEY);
  } catch (e) { /* storage unavailable */ }
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
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
  if (!cloud.code) return { ok: false };
  cloud.status = 'syncing';
  const r = await call('PUT', `/api/saves/${encodeURIComponent(cloud.code)}`, { data: payload, day, baseVersion: cloud.version, force });
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
  Object.assign(cloud, { code: null, version: 0, lastSync: 0, status: 'off', error: '' });
  saveMeta();
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

// Client side of server persistence (/api/data).
//
// The important distinction here is between "this deployment has no data store"
// and "it has one but the request failed". Collapsing those two into a single
// falsy value used to mean a transient network blip silently downgraded the
// session to localStorage-only, with the user still happily editing and nothing
// reaching the server — and a later save could then overwrite good server data
// with a stale local copy. So every result says which case it is, and the app
// refuses to write until it has successfully read.

import { apiFetch } from './auth.js';

/**
 * @returns {Promise<{ configured: boolean, ok: boolean, properties: Array|null,
 *                     error: string }>}
 *   configured — a server store exists for this deployment
 *   ok         — we actually got its contents (safe to start writing)
 */
export async function loadRemote() {
  try {
    const res = await apiFetch('/api/data');
    // Read the body even on a non-2xx: dataGet answers 502 with
    // { configured: true, error } when the store exists but is unreachable,
    // and that distinction is the whole point of this function.
    const data = await res.json().catch(() => null);

    if (data && typeof data.configured === 'boolean') {
      if (!data.configured) {
        return { configured: false, ok: true, properties: null, error: '' };
      }
      if (res.ok) {
        return {
          configured: true,
          ok: true,
          properties: Array.isArray(data.properties) ? data.properties : null,
          error: '',
        };
      }
      return {
        configured: true,
        ok: false,
        properties: null,
        error: data.error || `server returned ${res.status}`,
      };
    }

    // Unparseable / unexpected response. Assume a store may exist and refuse to
    // write rather than risk clobbering it.
    return {
      configured: true,
      ok: false,
      properties: null,
      error: `unexpected response (${res.status})`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      properties: null,
      error: err?.message || 'network error',
    };
  }
}

/** @returns {Promise<{ ok: boolean, error: string }>} */
export async function saveRemote(properties) {
  try {
    const res = await apiFetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });
    if (res.ok) return { ok: true, error: '' };
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error || `server returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: err?.message || 'network error' };
  }
}

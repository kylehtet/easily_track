// Client side of optional server-side persistence (/api/data). When a store is
// configured, the app loads from it on start and pushes every change back, so
// data survives redeploys and follows you across devices. localStorage stays as
// an offline cache / fallback either way. See server/dataStore.js.

/** @returns {Promise<{ configured: boolean, properties: Array|null }>} */
export async function loadRemote() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return { configured: false, properties: null };
    const data = await res.json();
    return {
      configured: Boolean(data?.configured),
      properties: Array.isArray(data?.properties) ? data.properties : null,
    };
  } catch {
    return { configured: false, properties: null };
  }
}

/** @returns {Promise<boolean>} true on a confirmed save */
export async function saveRemote(properties) {
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

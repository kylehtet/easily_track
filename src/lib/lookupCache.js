// localStorage cache for Rentcast lookups. A property's value/beds/last-sale
// don't change hour to hour, so re-opening the modal for the same address (or
// re-adding it) should cost 0 API quota.

const KEY = 'the-ledger:lookupcache:v1';
const TTL_MS = 14 * 864e5; // 14 days

const norm = (a = {}) =>
  [a.street, a.zip || a.city]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode — cache is best-effort */
  }
}

/** @returns {{ data, ts } | null} — null when absent or stale */
export function getCached(address) {
  const k = norm(address);
  if (!k) return null;
  const entry = readAll()[k];
  if (!entry || Date.now() - entry.ts > TTL_MS) return null;
  return entry;
}

export function setCached(address, data) {
  const k = norm(address);
  if (!k) return;
  const all = readAll();
  all[k] = { data, ts: Date.now() };
  // keep it small: drop anything already expired
  for (const [key, e] of Object.entries(all)) {
    if (Date.now() - e.ts > TTL_MS) delete all[key];
  }
  writeAll(all);
}

export function clearCached(address) {
  const k = norm(address);
  const all = readAll();
  if (all[k]) {
    delete all[k];
    writeAll(all);
  }
}

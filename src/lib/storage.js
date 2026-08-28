// Per-browser cache of the property list.
//
// The key is namespaced by account id, because a browser can see more than one
// account over its life (sign out, someone else signs in). A single shared key
// would hand the next person the previous one's portfolio for the moment before
// the server responds. `null` — nobody signed in — gets its own namespace too.

const PREFIX = 'the-ledger-v1';

const keyFor = (accountId) => (accountId ? `${PREFIX}:${accountId}` : PREFIX);

/** Returns an array of properties, or null if nothing is cached for this account. */
export function loadList(accountId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(accountId)));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveList(accountId, list) {
  try {
    localStorage.setItem(keyFor(accountId), JSON.stringify(list));
  } catch {
    // Quota exceeded or private-mode restrictions — nothing useful to do here.
  }
}

/** Drops one account's cache. Called on sign-out so nothing is left behind. */
export function clearList(accountId) {
  try {
    localStorage.removeItem(keyFor(accountId));
  } catch {
    /* ignore */
  }
}

/** Removes every cached ledger in this browser, whoever it belonged to. */
export function clearAllLists() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === PREFIX || k?.startsWith(`${PREFIX}:`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

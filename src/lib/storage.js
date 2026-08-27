// Per-browser persistence. No login required.

const KEY = 'the-ledger-v1';

/** Returns an array of properties, or null if nothing has been stored yet. */
export function loadList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveList(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or private-mode restrictions — nothing useful to do here.
  }
}

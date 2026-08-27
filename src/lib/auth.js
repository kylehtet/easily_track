// Client auth: step 1 Firebase email/password, step 2 an authenticator-app
// code, then a session token that every /api/* call carries.

import { getFirebaseAuth } from './firebase.js';

const TOKEN_KEY = 'the-ledger:session';

export function sessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setSession(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function logout() {
  setSession('');
}

/** @returns {Promise<{ configured: boolean, mode: 'firebase'|'dev'|null }>} */
export async function authRequired() {
  try {
    const res = await fetch('/api/auth');
    if (!res.ok) return { configured: false, mode: null };
    const d = await res.json();
    return { configured: Boolean(d?.configured), mode: d?.mode || null };
  } catch {
    return { configured: false, mode: null };
  }
}

/** Step 1 — returns a fresh Firebase ID token, or throws (err.code set). */
export async function passwordSignIn(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user.getIdToken();
}

async function exchange(payload) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Verification failed.');
  }
  setSession(data.token);
}

/** Step 2, firebase mode — ID token + TOTP code → session token. */
export const verifyCode = (idToken, code) => exchange({ idToken, code });

/** Step 2, dev mode — password + TOTP code → session token. */
export const verifyDev = (devPassword, code) => exchange({ devPassword, code });

/** fetch() wrapper: attaches the session token; on 401 clears it and reloads. */
export async function apiFetch(url, opts = {}) {
  const token = sessionToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    logout();
    if (typeof location !== 'undefined') location.reload();
  }
  return res;
}

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

/** Is the login gate active on this deployment? */
export async function authRequired() {
  try {
    const res = await fetch('/api/auth');
    if (!res.ok) return false;
    return Boolean((await res.json())?.configured);
  } catch {
    return false;
  }
}

/** Step 1 — returns a fresh Firebase ID token, or throws (err.code set). */
export async function passwordSignIn(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user.getIdToken();
}

/** Step 2 — exchange the ID token + TOTP code for a session token. */
export async function verifyCode(idToken, code) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Verification failed.');
  }
  setSession(data.token);
}

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

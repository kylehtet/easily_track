// Client auth. Firebase email/password (production) or a dev password (local),
// then a session token every /api/* call carries. Email verification is the
// only setup step — no authenticator app.

import { getFirebaseAuth, getCurrentUser } from './firebase.js';

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

async function exchange(payload) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Sign-in failed.');
  }
  setSession(data.token);
}

const friendly = (err) => {
  const c = err?.code || '';
  if (/wrong-password|user-not-found|invalid-credential|invalid-email/.test(c))
    return 'Wrong email or password.';
  if (/email-already-in-use/.test(c)) return 'That email already has an account — sign in.';
  if (/weak-password/.test(c)) return 'Password is too weak (use 6+ characters).';
  if (/too-many-requests/.test(c)) return 'Too many attempts — wait a bit and retry.';
  return err?.message || 'Something went wrong.';
};

// ---- firebase mode ----------------------------------------------------

export async function signIn(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw new Error(friendly(err));
  }
  if (!cred.user.emailVerified) {
    const err = new Error('Verify your email first — check your inbox.');
    err.needsVerification = true;
    throw err;
  }
  await exchange({ idToken: await cred.user.getIdToken() });
}

export async function signUp(email, password) {
  const auth = await getFirebaseAuth();
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import(
    'firebase/auth'
  );
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(cred.user);
  } catch (err) {
    throw new Error(friendly(err));
  }
}

export async function resendVerification(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword, sendEmailVerification } = await import(
    'firebase/auth'
  );
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(cred.user);
  } catch (err) {
    throw new Error(friendly(err));
  }
}

export async function resetPassword(email) {
  const auth = await getFirebaseAuth();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(friendly(err));
  }
}

export async function changePassword(currentPassword, newPassword) {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in.');
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } =
    await import('firebase/auth');
  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword)
    );
    await updatePassword(user, newPassword);
  } catch (err) {
    throw new Error(friendly(err));
  }
}

export async function firebaseSignOut() {
  try {
    const auth = await getFirebaseAuth();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  } catch {
    /* ignore */
  }
}

// ---- dev mode -------------------------------------------------------

export const devSignIn = (devPassword) => exchange({ devPassword });

// ---- fetch wrapper --------------------------------------------------

/** fetch() that attaches the session token; on 401 clears it and reloads. */
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

// Client auth. Firebase email/password (production) or a dev password (local),
// then a session token every /api/* call carries. Email verification is the
// only setup step — no authenticator app.

import { getFirebaseAuth, getCurrentUser } from './firebase.js';
import { clearAllLists } from './storage.js';

const TOKEN_KEY = 'the-ledger:session';
const ACCOUNT_KEY = 'the-ledger:account';

export function sessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Which account this browser is signed in as: `{ uid, email, name }`, or null.
 * The uid namespaces the cached property list (see lib/storage.js), so it has
 * to be read before any data is loaded.
 */
export function currentAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.uid ? parsed : null;
  } catch {
    return null;
  }
}

function setSession(token, account) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      if (account?.uid) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ends the session and drops every cached ledger in this browser. The wipe is
 * deliberate: the next person to sign in here must not see the last one's
 * properties, not even for the moment before the server answers.
 */
export function logout() {
  setSession('');
  clearAllLists();
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
  const previous = currentAccount();
  if (previous && previous.uid !== data.uid) {
    // Different person on this browser — drop whatever the last one cached.
    clearAllLists();
  }
  setSession(data.token, {
    uid: data.uid,
    email: data.email || '',
    name: data.name || '',
  });
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

  // Clicking the verification link does not update a token this browser is
  // already holding — Firebase caches ID tokens for up to an hour, so a user
  // who just verified still looks unverified to both checks below. reload()
  // re-reads the account from Firebase; getIdToken(true) then mints a token
  // that actually carries email_verified: true for the server to see.
  try {
    await cred.user.reload();
  } catch {
    /* offline or transient — fall through to the check below */
  }
  const user = auth.currentUser || cred.user;
  if (!user.emailVerified) {
    const err = new Error('Verify your email first — check your inbox.');
    err.needsVerification = true;
    throw err;
  }
  await exchange({ idToken: await user.getIdToken(true) });
}

/**
 * Creates the account and stores the person's name on the Firebase profile as
 * `displayName`. Firebase is the source of truth for it: the name then rides
 * along in the `name` claim of every ID token, so the server gets it verified
 * rather than having to trust whatever the client posts.
 */
export async function signUp(email, password, firstName, lastName) {
  const auth = await getFirebaseAuth();
  const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } =
    await import('firebase/auth');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const displayName = [firstName, lastName]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(' ');
    if (displayName) await updateProfile(cred.user, { displayName });
    await sendEmailVerification(cred.user);
  } catch (err) {
    throw new Error(friendly(err));
  }
}

/**
 * Re-sends the verification link. Reloads first: if the address turns out to
 * already be verified, there's nothing to resend and saying so is more useful
 * than a second email.
 * @returns {Promise<boolean>} true if a mail went out, false if already verified
 */
export async function resendVerification(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword, sendEmailVerification } = await import(
    'firebase/auth'
  );
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    try {
      await cred.user.reload();
    } catch {
      /* transient — fall through and just resend */
    }
    if ((auth.currentUser || cred.user).emailVerified) return false;
    await sendEmailVerification(cred.user);
    return true;
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

/**
 * Updates the person's name. The name travels in the session token's `name`
 * claim, so changing it on the Firebase profile alone would leave the app
 * showing the old one until the 30-day session expired — we mint a fresh token
 * and re-exchange it so the header and the database both catch up immediately.
 */
export async function changeName(firstName, lastName) {
  const displayName = [firstName, lastName]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!displayName) throw new Error('Please enter your name.');

  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Please sign out and back in before changing your name.');
  }
  const { updateProfile } = await import('firebase/auth');
  try {
    await updateProfile(user, { displayName });
    await user.reload();
    await exchange({ idToken: await user.getIdToken(true) });
  } catch (err) {
    throw new Error(friendly(err));
  }
  return displayName;
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

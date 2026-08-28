// Auth for the whole app, then a signed session token the client sends on
// every /api/* call. The token carries the account's Firebase uid, which is
// what scopes every row in the database — see server/db.js.
//
// Three modes, picked by which vars are set:
//
//   'firebase' (production): FIREBASE_PROJECT_ID + SESSION_SECRET.
//     Login = Firebase email/password; the email must be verified (Firebase
//     sends the link at sign-up). Signup is open: anyone who verifies an email
//     gets an account, and their own private ledger scoped to their uid.
//
//   'dev' (local testing only): AUTH_DEV_PASSWORD + SESSION_SECRET. Login is
//     that plain password. Never set AUTH_DEV_PASSWORD in production.
//
//   off (neither): every request is allowed and shares one local account, for
//     `npm run dev` without any of this configured.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const SESSION_TTL_MS = 30 * 864e5; // 30 days
const DEV_USER = { uid: '__dev__', email: '__dev__', name: 'Local' };
const OPEN_USER = { uid: '__local__', email: '__local__', name: '' };

/** @returns {'firebase' | 'dev' | null} */
export function authMode() {
  if (!process.env.SESSION_SECRET) return null;
  if (process.env.FIREBASE_PROJECT_ID) return 'firebase';
  if (process.env.AUTH_DEV_PASSWORD) return 'dev';
  return null;
}

export function authConfigured() {
  return authMode() !== null;
}

function eq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function verifyFirebaseIdToken(idToken) {
  const pid = process.env.FIREBASE_PROJECT_ID;
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${pid}`,
    audience: pid,
  });
  return {
    uid: String(payload.sub || payload.user_id || ''),
    email: String(payload.email || '').toLowerCase(),
    name: String(payload.name || '').trim(),
    emailVerified: payload.email_verified === true,
  };
}

function signSession(claims) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const mac = createHmac('sha256', process.env.SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

function readSession(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expect = createHmac('sha256', process.env.SESSION_SECRET)
    .update(body)
    .digest('base64url');
  if (
    mac.length !== expect.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expect))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

export function authStatus() {
  return { status: 200, body: { configured: authConfigured(), mode: authMode() } };
}

/**
 * Turn a sign-in into a session token.
 *   dev mode:      { devPassword }
 *   firebase mode: { idToken }  (the email must be verified)
 * @returns {Promise<{ status: number, body: object, user?: { uid, email } }>}
 */
export async function authVerify({ idToken, devPassword }) {
  const mode = authMode();
  if (!mode) return { status: 200, body: { configured: false } };

  let user;
  if (mode === 'dev') {
    if (!eq(devPassword, process.env.AUTH_DEV_PASSWORD)) {
      return { status: 401, body: { error: 'wrong password' } };
    }
    user = DEV_USER;
  } else {
    let fb;
    try {
      fb = await verifyFirebaseIdToken(idToken);
    } catch {
      return { status: 401, body: { error: 'sign-in could not be verified' } };
    }
    if (!fb.uid) {
      return { status: 401, body: { error: 'sign-in could not be verified' } };
    }
    if (!fb.emailVerified) {
      return {
        status: 403,
        body: { error: 'verify your email first — check your inbox for the link' },
      };
    }
    user = { uid: fb.uid, email: fb.email, name: fb.name };
  }

  const token = signSession({ ...user, exp: Date.now() + SESSION_TTL_MS });
  return {
    status: 200,
    body: { token, uid: user.uid, email: user.email, name: user.name || '' },
    user,
  };
}

/**
 * Guard for the data routes.
 * @returns {{ uid: string, email: string, name: string } | null} the account, or
 *   null when the request should be rejected with a 401.
 */
export function sessionUser(authorizationHeader) {
  const mode = authMode();
  if (!mode) return OPEN_USER;
  const token = String(authorizationHeader || '').replace(/^Bearer\s+/i, '');
  const claims = readSession(token);
  if (!claims || !claims.uid || !claims.exp || claims.exp < Date.now()) return null;
  return {
    uid: claims.uid,
    email: String(claims.email || ''),
    name: String(claims.name || ''),
  };
}

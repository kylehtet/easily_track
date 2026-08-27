// Auth for the whole app, then a signed session token the client sends on
// every /api/* call.
//
// Two modes, picked by which vars are set (else auth is OFF — every request
// allowed, for local dev / an intentionally open deploy):
//
//   'firebase' (production): FIREBASE_PROJECT_ID + ALLOWED_EMAIL + SESSION_SECRET.
//     Login = Firebase email/password. The email must be verified (Firebase
//     sends the link at sign-up) and must equal ALLOWED_EMAIL. No 2FA at login.
//
//   'dev' (local testing only): AUTH_DEV_PASSWORD + SESSION_SECRET. Login is
//     that plain password. Never set AUTH_DEV_PASSWORD in production.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const SESSION_TTL_MS = 30 * 864e5; // 30 days
const DEV_EMAIL = '__dev__';

/** @returns {'firebase' | 'dev' | null} */
export function authMode() {
  if (!process.env.SESSION_SECRET) return null;
  if (process.env.FIREBASE_PROJECT_ID && process.env.ALLOWED_EMAIL) return 'firebase';
  if (process.env.AUTH_DEV_PASSWORD) return 'dev';
  return null;
}

export function authConfigured() {
  return authMode() !== null;
}

const allowedEmail = () => String(process.env.ALLOWED_EMAIL || '').toLowerCase();

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
    email: String(payload.email || '').toLowerCase(),
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
 * Turn first-factor proof into a session token.
 *   dev mode:      { devPassword }
 *   firebase mode: { idToken }  (email must be verified + == ALLOWED_EMAIL)
 */
export async function authVerify({ idToken, devPassword }) {
  const mode = authMode();
  if (!mode) return { status: 200, body: { configured: false } };

  let email;
  if (mode === 'dev') {
    if (!eq(devPassword, process.env.AUTH_DEV_PASSWORD)) {
      return { status: 401, body: { error: 'wrong password' } };
    }
    email = DEV_EMAIL;
  } else {
    let fb;
    try {
      fb = await verifyFirebaseIdToken(idToken);
    } catch {
      return { status: 401, body: { error: 'sign-in could not be verified' } };
    }
    if (fb.email !== allowedEmail()) {
      return { status: 403, body: { error: 'this account is not authorized' } };
    }
    if (!fb.emailVerified) {
      return {
        status: 403,
        body: { error: 'verify your email first — check your inbox for the link' },
      };
    }
    email = fb.email;
  }

  const token = signSession({ email, exp: Date.now() + SESSION_TTL_MS });
  return { status: 200, body: { token } };
}

/** Guard for the data routes. Returns true when the request may proceed. */
export function requireSession(authorizationHeader) {
  const mode = authMode();
  if (!mode) return true;
  const token = String(authorizationHeader || '').replace(/^Bearer\s+/i, '');
  const claims = readSession(token);
  if (!claims || !claims.exp || claims.exp < Date.now()) return false;
  return claims.email === (mode === 'dev' ? DEV_EMAIL : allowedEmail());
}

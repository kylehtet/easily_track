// Auth for the whole app: first factor + an authenticator-app TOTP code (second
// factor), then a signed session token the client sends on every /api/* call.
//
// Two modes, picked by which vars are set (else auth is OFF — every request
// allowed, for local dev / an intentionally open deploy):
//
//   'firebase' (production): FIREBASE_PROJECT_ID + ALLOWED_EMAIL + TOTP_SECRET
//     + SESSION_SECRET. First factor is Firebase email/password.
//
//   'dev' (local testing only): AUTH_DEV_PASSWORD + TOTP_SECRET + SESSION_SECRET.
//     First factor is a plain password — no Firebase project needed. Never set
//     AUTH_DEV_PASSWORD in production.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyTotp } from './totp.js';

const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const SESSION_TTL_MS = 30 * 864e5; // 30 days
const DEV_EMAIL = '__dev__';

/** @returns {'firebase' | 'dev' | null} */
export function authMode() {
  const hasTotp = process.env.TOTP_SECRET && process.env.SESSION_SECRET;
  if (hasTotp && process.env.FIREBASE_PROJECT_ID && process.env.ALLOWED_EMAIL) {
    return 'firebase';
  }
  if (hasTotp && process.env.AUTH_DEV_PASSWORD) return 'dev';
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
  return { email: String(payload.email || '').toLowerCase(), uid: payload.sub };
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
 * Exchange first-factor proof + TOTP code for a session token.
 * firebase mode: { idToken, code }.  dev mode: { devPassword, code }.
 */
export async function authVerify({ idToken, code, devPassword }) {
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
    email = fb.email;
  }

  if (!verifyTotp(code, process.env.TOTP_SECRET)) {
    return { status: 401, body: { error: 'invalid authenticator code' } };
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

// Auth for the whole app: Firebase email/password (first factor) + an
// authenticator-app TOTP code (second factor), then a signed session token the
// client sends on every /api/* call.
//
// Turned ON only when all four server vars are set; otherwise every request is
// allowed (local dev / an intentionally open deploy):
//   FIREBASE_PROJECT_ID  — same value as VITE_FIREBASE_PROJECT_ID
//   ALLOWED_EMAIL        — the single account permitted in
//   TOTP_SECRET          — from `npm run totp:setup`
//   SESSION_SECRET       — any long random string (signs session tokens)

import { createHmac, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyTotp } from './totp.js';

const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const SESSION_TTL_MS = 30 * 864e5; // 30 days

export function authConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.ALLOWED_EMAIL &&
      process.env.TOTP_SECRET &&
      process.env.SESSION_SECRET
  );
}

const allowedEmail = () => String(process.env.ALLOWED_EMAIL || '').toLowerCase();

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
  return { status: 200, body: { configured: authConfigured() } };
}

/** Exchange a Firebase ID token + TOTP code for a session token. */
export async function authVerify({ idToken, code }) {
  if (!authConfigured()) return { status: 200, body: { configured: false } };

  let fb;
  try {
    fb = await verifyFirebaseIdToken(idToken);
  } catch {
    return { status: 401, body: { error: 'sign-in could not be verified' } };
  }
  if (fb.email !== allowedEmail()) {
    return { status: 403, body: { error: 'this account is not authorized' } };
  }
  if (!verifyTotp(code, process.env.TOTP_SECRET)) {
    return { status: 401, body: { error: 'invalid authenticator code' } };
  }

  const token = signSession({ email: fb.email, exp: Date.now() + SESSION_TTL_MS });
  return { status: 200, body: { token } };
}

/** Guard for the data routes. Returns true when the request may proceed. */
export function requireSession(authorizationHeader) {
  if (!authConfigured()) return true;
  const token = String(authorizationHeader || '').replace(/^Bearer\s+/i, '');
  const claims = readSession(token);
  if (!claims || !claims.exp || claims.exp < Date.now()) return false;
  return claims.email === allowedEmail();
}

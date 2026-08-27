// RFC 6238 TOTP (authenticator-app codes) with node:crypto only — no deps.
// Used as the second factor after Firebase email/password sign-in.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30; // seconds
const DIGITS = 6;

/** Random base32 secret for enrolling an authenticator app. */
export function generateSecret(bytes = 20) {
  let bits = '';
  for (const b of randomBytes(bytes)) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secretBuf).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin =
    ((h[o] & 0x7f) << 24) |
    ((h[o + 1] & 0xff) << 16) |
    ((h[o + 2] & 0xff) << 8) |
    (h[o + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Current code for a secret (used by the setup script for a sanity check). */
export function totp(secret, t = Date.now()) {
  return hotp(base32Decode(secret), Math.floor(t / 1000 / STEP));
}

/** True if `code` matches within ±`window` steps (clock-skew tolerance). */
export function verifyTotp(code, secret, window = 1) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== DIGITS) return false;
  const buf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / STEP);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(buf, counter + w);
    if (timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) return true;
  }
  return false;
}

export function otpauthURL(secret, account = 'client', issuer = 'The Ledger') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// One-time: generate the authenticator-app secret.
//   npm run totp:setup -- client@example.com
// Then set TOTP_SECRET (locally in .env, and in your host's env vars) and add
// the account to your authenticator app via the otpauth:// URL (paste it, or
// turn it into a QR).

import { generateSecret, otpauthURL, totp } from '../server/totp.js';

const account = process.argv[2] || 'client';
const secret = generateSecret();

console.log('\n  TOTP_SECRET  (add to .env and your host)\n');
console.log('    ' + secret + '\n');
console.log('  otpauth URL  (add to your authenticator app)\n');
console.log('    ' + otpauthURL(secret, account) + '\n');
console.log('  current code (sanity check): ' + totp(secret) + '\n');

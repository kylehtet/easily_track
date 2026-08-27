# Deploying The Ledger for one client

Recommended host: **Vercel** (the `api/` folder is already in Vercel's function
format). Free "Hobby" tier is enough for a single user.

## 1. Deploy the app

1. Push to GitHub (already done).
2. vercel.com → **Add New… → Project** → import `kylehtet/easily_track`.
   Framework preset auto-detects as **Vite**. Deploy.

## 2. Data persistence (so nothing is lost on redeploy / new device)

Vercel dashboard → **Storage → Create Database → KV** (Upstash Redis) → connect
it to the project. Vercel injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`
automatically. Redeploy. The header's "synced" chip confirms it's live.

## 3. Autofill keys (optional)

Project → **Settings → Environment Variables**:

| Var | Value |
|---|---|
| `RENTCAST_API_KEY` | from app.rentcast.io (free tier ≈ 50 calls/mo) |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `LISTING_MODEL` | `claude-haiku-4-5` (cheap) |

## 4. Login gate (Firebase email/password + authenticator 2FA)

### 4a. Firebase project

1. console.firebase.google.com → **Add project** (Spark / free plan is fine —
   do **not** need Identity Platform).
2. **Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Authentication → Users → Add user** — the client's email + a strong
   password. (This is the only account; there is no sign-up page.)
4. **Project settings → General → Your apps → Web app (`</>`)** — register one.
   Copy the config values.
5. **Authentication → Settings → Authorized domains** — add your Vercel domain
   (e.g. `easily-track.vercel.app` and any custom domain).

### 4b. Generate the TOTP secret

```bash
npm run totp:setup -- client@example.com
```

Copy the `TOTP_SECRET`, and add the `otpauth://` URL to the client's
authenticator app (Google Authenticator / Authy / 1Password — paste the URL or
turn it into a QR for them to scan).

### 4c. Environment variables (Vercel → Settings → Environment Variables)

| Var | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | from 4a step 4 |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `<project-id>` |
| `VITE_FIREBASE_APP_ID` | from 4a step 4 |
| `FIREBASE_PROJECT_ID` | same as `VITE_FIREBASE_PROJECT_ID` |
| `ALLOWED_EMAIL` | the client's email, lowercase |
| `TOTP_SECRET` | from 4b |
| `SESSION_SECRET` | `openssl rand -hex 32` |

Redeploy. Visiting the site now shows the login page; after email/password +
the 6-digit code the client is in for 30 days per device.

To lock everyone out (rotate access): change `SESSION_SECRET` and redeploy —
every existing session token stops validating.

## Local development

With none of the auth vars set, there's no login gate and `/api/*` is open —
convenient for `npm run dev`. Put real values in a local `.env` (git-ignored)
to exercise the gate.

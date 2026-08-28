# Deploying EasyPort

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

## 4. Login gate (Firebase email/password, email-verified)

### 4a. Firebase project

1. console.firebase.google.com → **Add project** (Spark / free plan — no Identity
   Platform needed).
2. **Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Project settings → General → Your apps → Web app (`</>`)** — register one,
   copy the config values.
4. **Authentication → Settings → Authorized domains** — add your Vercel domain
   (e.g. `easily-track.vercel.app` and any custom domain).

Users create their own account from the app's **sign-up** page; Firebase emails
a verification link they must click before they can sign in. Each account gets
its own private ledger — see section 5.

Anyone with a verified email can sign up — there is no allowlist. Accounts are
separated by Firebase uid, so one user never sees another's properties.

### 4b. Environment variables (Vercel → Settings → Environment Variables)

| Var | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | from 4a step 3 |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `<project-id>` |
| `VITE_FIREBASE_APP_ID` | from 4a step 3 |
| `FIREBASE_PROJECT_ID` | same as `VITE_FIREBASE_PROJECT_ID` |
| `SESSION_SECRET` | `openssl rand -hex 32` |

Redeploy. The site now opens to the login page: sign up → click the email link
→ sign in. Good for 30 days per browser. In-app **Account** menu has change
password + sign out; the login page has forgot-password.

To lock everyone out (rotate access): change `SESSION_SECRET` and redeploy —
every existing session token stops validating.

## 5. Database (required for more than one user)

Each account's properties live in Postgres, keyed by their Firebase uid. Without
`DATABASE_URL` the app falls back to a single shared bucket (KV / JSON file) or
to per-browser `localStorage` — fine for one person, wrong once you publish.

1. Vercel → your project → **Storage** → **Create Database** → **Neon Postgres**
   (free tier). Attaching it injects `DATABASE_URL` into the project for you.
   Outside Vercel: sign up at [neon.tech](https://neon.tech), create a project,
   and copy its pooled connection string into `DATABASE_URL`.
2. Redeploy. That's it — the `users` and `properties` tables are created on the
   first request that touches them, so there's no migration step to run.

Schema (see `server/db.js`):

| Table | What's in it |
|---|---|
| `users` | `uid`, `email`, `created_at`, `last_seen` — one row per account |
| `properties` | `uid` + `id` primary key, the queryable columns (`street`, `city`, `state`, `zip`, `rent`, `value`), and the full nested record in a `data` JSONB column |

Every read and write is filtered by the `uid` carried in the session token, so
one account cannot reach another's rows.

## Local development

With none of the auth vars set, there's no login gate and `/api/*` is open —
convenient for `npm run dev`.

To see the login page locally without a Firebase project, put this in `.env`
(git-ignored) and restart:

```
AUTH_DEV_PASSWORD=letmein
SESSION_SECRET=any-long-random-string
```

That gives a password-only gate (`mode: "dev"`). Use the real `FIREBASE_*` +
`SESSION_SECRET` values to exercise the full Firebase flow.

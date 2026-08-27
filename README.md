# The Ledger

A plug-and-play webapp for tracking rental properties and seeing net income at a
glance. Add a property, enter its costs once, and the dashboard keeps a running
net income per property and across the portfolio.

UI implemented from the Claude Design canvas **The Ledger.dc.html** — a
paper-ledger aesthetic (Libre Caslon Text / Courier Prime / IBM Plex Sans,
double-rule borders, torn-paper edge on expanded ledgers, accounting-style
negatives). Red is the primary UI accent (buttons, focus, active toggles);
meaning colors are conventional — green = profit / paid / good, red = loss /
due / delete. Box corners are rounded.

## Stack

- Vite + React
- Plain CSS, no UI framework
- Persistence: `localStorage` by default; **optional server store** (`/api/data`)
  so data survives redeploys and syncs across devices — see below
- Optional API routes (`/api/*`) for autofill + persistence — dormant unless
  configured via `.env`

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
npm run preview  # serve the build locally
```

First load seeds three sample properties so the dashboard isn't empty. Delete
them once you add your own.

To turn on the optional autofill (below), copy `.env.example` to `.env` and fill
in the keys — `vite dev` picks them up automatically.

## Layout

```
api/                            deploy wrappers (Vercel-style) for the routes
├── property.js                 address → value/rent/details
├── extract-listing.js          listing text → fields (Claude)
└── data.js                     GET/PUT the property list (server store)
server/
├── handlers.js                 route logic — holds the API keys, Node-only
├── redfin.js                   Node port of the reteps/redfin unofficial client
└── dataStore.js                KV / JSON-file persistence backend
vite.config.js                  serves /api/* during `vite dev` via the same handlers
src/
├── App.jsx                     state, sort/filter, inline-edit + modal wiring, persistence
├── components/
│   ├── Header.jsx              title + month + "Add property"
│   ├── SummaryBar.jsx          portfolio stat bar (count / gross / net / value / appreciation)
│   ├── SortFilterBar.jsx       segmented sort (incl. value, appreciation) + manager filter
│   ├── PropertyCard.jsx        one card: net, trend, stale flag, review pill, value line
│   ├── LedgerBreakdown.jsx     itemized ledger + valuation block, expands from the card
│   ├── EditableAmount.jsx      click-a-number-to-edit cell
│   ├── ValueSparkline.jsx      dependency-free value-history sparkline
│   ├── AddressAutocomplete.jsx type-ahead address search for the form
│   └── PropertyModal.jsx       add / edit dialog: autofill, live preview
├── lib/
│   ├── calculations.js         the ONE place income + appreciation math lives
│   ├── format.js               fmt2 / fmt0 / fmtCompact / fmtPct
│   ├── mortgage.js             amortization (monthly P&I)
│   ├── estimates.js            state property-tax rates, insurance rate
│   ├── addressLookup.js        free geocoders (Nominatim, Census JSONP)
│   ├── realEstateData.js       client for /api/property (address lookup chain)
│   ├── lookupCache.js          14-day localStorage cache for lookups
│   ├── remoteStore.js          client for /api/data (optional server persistence)
│   ├── listingExtract.js       client for /api/extract-listing (Claude)
│   ├── listingParse.js         free local regex pass over pasted listing text
│   ├── storage.js              load / save to localStorage
│   ├── config.js               SHOW_ZERO_ROWS, STALE_DAYS, ADDRESS_PROVIDER
│   └── id.js                   unique id helper
├── data/sampleProperties.js    first-run seed data
└── styles/global.css
```

## Net income

`src/lib/calculations.js` is the single source of truth for both the income and
the asset side. Card, ledger, modal preview, and stat bar all import from it, so
the numbers can't drift apart.

```
net income = rent
           − sum of base monthly costs (mortgage, tax, insurance, repairs,
             utilities, PG&E, water, recology, HOA)
           − sum of additional line items
           − management fee

management fee = feeMode === 'pct'
  ? rent × (feeVal / 100)
  : feeVal
```

## Property value & appreciation

Value is **entered by you** and tracked over time — every change (in the modal or
by clicking the value in the expanded ledger) appends a point to `valueHistory`.
From that, `calculations.js` derives:

- **Equity gain** — `value − purchasePrice`
- **Appreciation %** and **annualized %** (CAGR since `purchaseDate`)
- **Cap rate** — unlevered: annualized NOI (net income with the mortgage added
  back) ÷ current value
- portfolio **value** and **appreciation** totals in the stat bar
- a small **sparkline** on the card, sortable by value or appreciation

## Autofill

The Add / Edit form can fill in fields for you. Two of the four mechanisms work
with no setup; two need an API key.

| Mechanism | Fills | Needs |
|---|---|---|
| **Mortgage calculator** | monthly mortgage (P&I) from price / down % / rate / term | nothing |
| **Estimate taxes & insurance** | property tax (`price × state effective rate`), insurance (`value × 0.35%/yr`) | nothing |
| **Address lookup** | value, rent estimate, last sale, tax, beds/baths/sqft — **fires automatically** when you enter/pick an address | `RENTCAST_API_KEY` (at least) |
| **Paste a listing** | price, rent, tax, HOA, beds/baths from listing text — regex first, Claude only for gaps | `ANTHROPIC_API_KEY` |

The address lookup chains sources and merges whatever each one has, tagging the
value/rent field with where it came from (`AVM`, `Zillow`, `assessed`, `area
median`):

1. **Rentcast** — AVM value + rent, plus the property record (beds/baths/sqft/
   last sale/tax). Its tax **assessment** is used as a value proxy if the AVM misses.
2. **RapidAPI Zillow** *(optional, `RAPIDAPI_KEY` + `RAPIDAPI_ZILLOW_HOST`)* —
   backfills value / rent / beds.
3. **Redfin** *(optional, `REDFIN_ENABLED=1`, no key)* — Redfin's **unofficial
   internal API** (a Node port of `github.com/reteps/redfin`): estimate, rent
   estimate, public record. Undocumented and against Redfin's ToS — personal,
   low-volume use only; can break or rate-limit at any time.
4. **US Census ACS area medians** *(optional, free `CENSUS_API_KEY`)* — last-resort
   ballpark for value / rent, clearly tagged "area median".

The mortgage and estimate figures are client-side math (`src/lib/mortgage.js`,
`src/lib/estimates.js`) — always available. Tax rates are rough state averages;
the real number is on your county assessor's site. **Nothing is a live
Zillow/Redfin scrape** — those have no API and block scraping. Rentcast is a
licensed data API; the paste path parses text *you* provide.

Autofill only fills **blank** fields — it never overwrites something you typed.
**Current value** is only ever set from a real estimate (AVM / Zestimate) —
never a stale sale price or a ZIP-level median.

### What updates itself each month

On the first visit of a new calendar month the dashboard, without you touching
anything:

- snapshots each property's net into `prevNet` so the "vs last month" trend is
  correct;
- **re-fetches every property's current value** from a fresh AVM (1 API call
  each) and appends a point to its value history — which keeps appreciation,
  annualized return, the sparkline, cap rate, and the portfolio value/gain
  totals current on their own;
- lets `reviewedMonth` / `rentPaidMonth` lapse, so the review reminder and the
  "Rent due" badges come back.

Everything else is a number only you know — **rent** (your lease amount),
**property tax** (your actual bill), and the personal monthly costs (utilities,
PG&E, water, recology, repairs, HOA). Those stay manual on purpose; an estimate
would be worse than the real figure you entered.

**Keeping API cost/quota down:**
- Rentcast results are cached in `localStorage` for 14 days (`src/lib/lookupCache.js`)
  and only fetched once per distinct address per session — re-opening the modal or
  re-adding the same address costs nothing.
- The paste path runs a local regex pass first (`src/lib/listingParse.js`); the
  Claude call happens only if fields are still missing, is told what's already
  known, and is capped at 256 output tokens. Set `LISTING_MODEL=claude-haiku-4-5`
  in `.env` to make that call ~5× cheaper.

### Enabling the keyed features

The two API routes live in `server/handlers.js` and hold the keys **server-side
only** (never bundled to the browser). Locally, `vite.config.js` serves them as
`/api/property` and `/api/extract-listing` during `vite dev`; on deploy, the
thin wrappers in `api/` run them as functions (Vercel signature — adapt for
other hosts).

```bash
cp .env.example .env
# then fill in:
#   RENTCAST_API_KEY   — app.rentcast.io, free tier ≈ 50 calls/mo; each address
#                        lookup is 3 calls, but cached 14 days + once per session
#   ANTHROPIC_API_KEY  — console.anthropic.com
#   LISTING_MODEL      — optional; default claude-opus-5, or claude-haiku-4-5 to cut cost
```

Without a key, that feature simply doesn't appear; the rest of the form
is unaffected.

### Address lookup

The form's "Find address" box is a free, keyless type-ahead: OpenStreetMap
Nominatim first, then the US Census geocoder (via JSONP, since it sends no CORS
header). Picking a result fills street / city / state / zip; all stay editable.
Provider is switchable via `ADDRESS_PROVIDER` in `src/lib/config.js`.

## Persistence

By default the property list lives in the browser's `localStorage` — which
**does** survive redeploys to the same domain (it's in your browser, not the
server), but is lost if the domain changes, you switch devices/browsers, or you
clear site data.

For durable, cross-device storage, configure a **server store** (`.env`) — the
app then loads from it on start and pushes every change back (debounced), with a
"synced" chip in the header. `localStorage` stays as an offline cache.

| Store | Env | Good for |
|---|---|---|
| KV / Redis over REST | `KV_REST_API_URL` + `KV_REST_API_TOKEN` | serverless (Upstash, Vercel KV — Vercel injects these when you attach a KV store) |
| JSON file | `DATA_FILE=/abs/path/store.json` | a host with a persistent disk (Railway/Render/Fly/VPS) or local use |

Single-user, last-write-wins. Code: `server/dataStore.js`, `src/lib/remoteStore.js`.

## Access (login gate)

Optional. Set to run it as a private site for one client. Every `/api/*` route
rejects requests without a session.

- **Firebase email/password** (free Spark plan — no Identity Platform / billing).
  The login page also has **sign-up**, **forgot password**, and a show/hide
  password toggle; an in-app **Account** menu has change-password + sign out.
- **Setup = email verification.** Sign-up sends a Firebase verification link;
  until it's clicked, that account can't get a session. No authenticator app,
  no 2FA at login.
- On a verified sign-in the server issues a 30-day signed session token
  (`SESSION_SECRET`, HMAC). `ALLOWED_EMAIL` is a hard allowlist — a valid
  Firebase account that isn't that address is refused.

Turn it on with `FIREBASE_PROJECT_ID` + `ALLOWED_EMAIL` + `SESSION_SECRET`
(server) plus the `VITE_FIREBASE_*` client config. Unset → open build (local
dev). `AUTH_DEV_PASSWORD` + `SESSION_SECRET` (no Firebase) gives a local
password-only gate for testing the flow. See `DEPLOY.md` and `.env.example`.

Code: `src/Root.jsx` (gate), `src/components/Login.jsx`,
`src/components/AccountMenu.jsx`, `src/lib/auth.js`, `src/lib/firebase.js`
(lazy-loaded), `server/auth.js`, `api/auth.js`.

## Data model

```
Property {
  id, street, city, state, zip, rent,
  base:  { mortgage, tax, insurance, repairs, utilities, pge, water, recology, hoa },
  extras: [ { label, amount } ],
  mgmt:  { type: 'ziprent' | 'personal',
           feeMode: 'pct' | 'flat',
           feeVal,
           payment: 'Ziprent direct deposit' | 'Zelle' | 'PayPal' | 'Personal cash/check' },
  prevNet,          // last month's net, for the trend line (null = first month);
                    //   auto-snapshotted on the first visit of a new month, when
                    //   `value` is also re-fetched from a fresh AVM
  updatedAt,        // timestamp; older than STALE_DAYS flags the card
  reviewedMonth,    // 'YYYY-MM' marked reviewed; a new month clears it and the
                    //   dashboard shows a "needs review" reminder bar
  rentPaidMonth,    // 'YYYY-MM' rent marked paid (✓/✕ badge on the card), else null

  purchasePrice,    // cost basis
  purchaseDate,     // 'YYYY-MM-DD'
  value,            // current estimated value (user-entered)
  valueHistory: [ { date: 'YYYY-MM-DD', value } ],   // appended on every change
  financing: { downPct, ratePct, termYears },        // feeds the mortgage calculator
  meta: { beds, baths, sqft, yearBuilt } | null,     // from a lookup / listing, display only
}
```

## Keeping real data private

Real rental figures never belong in the repo. `.gitignore` blocks `.env`
(so `RENTCAST_API_KEY` / `ANTHROPIC_API_KEY` stay out), `*.local.json`, and
`data/local/`. If this will ever hold real addresses, income, or mortgage
numbers, make the repo private.

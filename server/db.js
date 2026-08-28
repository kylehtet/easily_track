// Postgres (Neon) — the multi-user store. One row per property, scoped to the
// Firebase uid that owns it, so every account sees only its own portfolio.
//
// Enabled by DATABASE_URL. Without it the app falls back to the older
// single-bucket stores in dataStore.js (KV / JSON file / localStorage), which
// are fine for one user but cannot separate accounts.
//
// The columns that get queried or sorted on are promoted out of the JSON; the
// rest of the nested shape (base, extras, mgmt, financing, valueHistory, meta)
// rides along in `data`. That keeps calculations.js working unchanged while
// still giving us real SQL to aggregate over later.

import { neon } from '@neondatabase/serverless';

let sqlClient = null;
let schemaReady = null;

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function sql() {
  if (!sqlClient) {
    if (!dbConfigured()) throw new Error('DATABASE_URL is not set');
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

/** Creates the tables on first use. Runs at most once per warm instance. */
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();
      await q`
        CREATE TABLE IF NOT EXISTS users (
          uid          TEXT PRIMARY KEY,
          email        TEXT NOT NULL,
          display_name TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      // For databases created before names were captured at sign-up.
      await q`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`;
      await q`
        CREATE TABLE IF NOT EXISTS properties (
          uid         TEXT NOT NULL,
          id          TEXT NOT NULL,
          street      TEXT,
          city        TEXT,
          state       TEXT,
          zip         TEXT,
          rent        NUMERIC,
          value       NUMERIC,
          data        JSONB NOT NULL,
          position    INTEGER NOT NULL DEFAULT 0,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (uid, id)
        )`;
      await q`CREATE INDEX IF NOT EXISTS properties_uid_idx ON properties (uid)`;
      // Shared across every account: a paid address lookup is spent once and
      // then answers for everyone. Previously each browser had its own
      // localStorage cache, so N users looking up the same building cost N
      // times the quota.
      await q`
        CREATE TABLE IF NOT EXISTS lookup_cache (
          addr        TEXT PRIMARY KEY,
          payload     JSONB NOT NULL,
          fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
    })().catch((err) => {
      schemaReady = null; // let the next request retry
      throw err;
    });
  }
  return schemaReady;
}

/** Records the account on first sign-in and stamps last_seen after that. */
export async function upsertUser({ uid, email, name }) {
  await ensureSchema();
  await sql()`
    INSERT INTO users (uid, email, display_name)
    VALUES (${uid}, ${email}, ${name || null})
    ON CONFLICT (uid) DO UPDATE SET
      email = EXCLUDED.email,
      -- keep the stored name if this token happens to carry none
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      last_seen = now()`;
}

const numOrNull = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

/** @returns {Promise<Array>} this user's properties, in saved order */
export async function loadProperties(uid) {
  await ensureSchema();
  const rows = await sql()`
    SELECT data FROM properties WHERE uid = ${uid} ORDER BY position ASC, id ASC`;
  return rows.map((r) => r.data);
}

/**
 * Replaces the user's whole list — the client PUTs the full array, same as the
 * old store did. Deletes are handled by the NOT IN sweep at the end.
 */
export async function saveProperties(uid, properties) {
  await ensureSchema();
  const q = sql();

  const ids = properties.map((p) => String(p.id));
  await q.transaction([
    ...properties.map((p, i) =>
      q`
        INSERT INTO properties (uid, id, street, city, state, zip, rent, value, data, position, updated_at)
        VALUES (
          ${uid}, ${String(p.id)}, ${p.street || null}, ${p.city || null},
          ${p.state || null}, ${p.zip || null}, ${numOrNull(p.rent)},
          ${numOrNull(p.value)}, ${JSON.stringify(p)}, ${i}, now()
        )
        ON CONFLICT (uid, id) DO UPDATE SET
          street = EXCLUDED.street, city = EXCLUDED.city, state = EXCLUDED.state,
          zip = EXCLUDED.zip, rent = EXCLUDED.rent, value = EXCLUDED.value,
          data = EXCLUDED.data, position = EXCLUDED.position, updated_at = now()`
    ),
    ids.length
      ? q`DELETE FROM properties WHERE uid = ${uid} AND NOT (id = ANY(${ids}::text[]))`
      : q`DELETE FROM properties WHERE uid = ${uid}`,
  ]);
}

/** Wipes an account's data (used by the account menu's "delete my data"). */
export async function deleteAllProperties(uid) {
  await ensureSchema();
  await sql()`DELETE FROM properties WHERE uid = ${uid}`;
}

// ---- shared address-lookup cache -------------------------------------------

const LOOKUP_TTL_DAYS = 30;

/** Normalized cache key. Same address written differently must collide. */
export function addrCacheKey({ street, city, state, zip }) {
  return [street, city, state, zip]
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
    .replace(/\s+/g, ' ');
}

/** @returns {Promise<object|null>} a cached lookup, or null when absent/stale */
export async function getCachedLookup(key) {
  if (!key) return null;
  await ensureSchema();
  const rows = await sql()`
    SELECT payload FROM lookup_cache
    WHERE addr = ${key}
      AND fetched_at > now() - (${LOOKUP_TTL_DAYS} * INTERVAL '1 day')`;
  return rows[0]?.payload ?? null;
}

export async function setCachedLookup(key, payload) {
  if (!key) return;
  await ensureSchema();
  await sql()`
    INSERT INTO lookup_cache (addr, payload, fetched_at)
    VALUES (${key}, ${JSON.stringify(payload)}, now())
    ON CONFLICT (addr) DO UPDATE SET
      payload = EXCLUDED.payload, fetched_at = now()`;
}

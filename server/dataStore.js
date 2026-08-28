// Persistence for the property list. Backends, first configured wins:
//
//   1. Postgres (Neon)       — DATABASE_URL. The only backend that separates
//      accounts: rows are scoped by the signed-in user's uid. Use this one for
//      anything published to real users. See server/db.js.
//   2. KV / Redis over REST  — KV_REST_API_URL + KV_REST_API_TOKEN
//      (Upstash, Vercel KV).
//   3. Local JSON file       — DATA_FILE=/absolute/path/store.json
//      For hosts with a persistent disk (Railway/Render/Fly/VPS) or local use.
//
// Backends 2 and 3 predate multi-user and keep ONE shared bucket for everyone.
// They are kept for single-user deploys; they namespace by uid so two accounts
// on the same instance don't collide, but they were never meant to scale.
//
// With none set, the client just keeps using localStorage.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  dbConfigured,
  loadProperties,
  saveProperties,
  deleteAllProperties,
} from './db.js';

const bucketKey = (uid) => `the-ledger:properties:${uid}`;

export function dataStoreKind() {
  if (dbConfigured()) return 'postgres';
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'kv';
  if (process.env.DATA_FILE) return 'file';
  return null;
}

/** True when the active backend keeps each account's data separate. */
export function isMultiUserStore() {
  return dataStoreKind() === 'postgres';
}

// ---- KV / Redis REST ----------------------------------------------------
async function kvGet(uid) {
  const res = await fetch(
    `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(bucketKey(uid))}`,
    { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`kv get ${res.status}`);
  const { result } = await res.json();
  if (result == null) return null;
  return JSON.parse(typeof result === 'string' ? result : JSON.stringify(result));
}

async function kvSet(uid, value) {
  const res = await fetch(
    `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(bucketKey(uid))}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      body: JSON.stringify(value),
    }
  );
  if (!res.ok) throw new Error(`kv set ${res.status}`);
}

// ---- local JSON file --------------------------------------------------
// Shape on disk: { [uid]: Property[] }. Older single-user files held a bare
// array; those are read once and adopted by whoever asks first.
async function fileReadAll() {
  try {
    return JSON.parse(await readFile(process.env.DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fileGet(uid) {
  const all = await fileReadAll();
  if (all == null) return null;
  if (Array.isArray(all)) return all; // legacy single-user file
  return Array.isArray(all[uid]) ? all[uid] : null;
}

async function fileSet(uid, value) {
  const path = process.env.DATA_FILE;
  const existing = await fileReadAll();
  const all = Array.isArray(existing) || existing == null ? {} : existing;
  all[uid] = value;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(all, null, 2), 'utf8');
}

// ---- public API -----------------------------------------------------
/**
 * @param {string} uid the signed-in account
 * @returns {Promise<Array|null>} that account's property list, or null if none
 */
export async function loadData(uid) {
  const kind = dataStoreKind();
  if (kind === 'postgres') {
    const rows = await loadProperties(uid);
    return rows.length ? rows : null;
  }
  if (kind === 'kv') return kvGet(uid);
  if (kind === 'file') return fileGet(uid);
  return null;
}

export async function saveData(uid, properties) {
  const kind = dataStoreKind();
  if (!kind) throw new Error('no data store configured');
  if (!Array.isArray(properties)) throw new Error('expected an array');
  if (kind === 'postgres') return saveProperties(uid, properties);
  if (kind === 'kv') return kvSet(uid, properties);
  return fileSet(uid, properties);
}

export async function clearData(uid) {
  const kind = dataStoreKind();
  if (!kind) throw new Error('no data store configured');
  if (kind === 'postgres') return deleteAllProperties(uid);
  return saveData(uid, []);
}

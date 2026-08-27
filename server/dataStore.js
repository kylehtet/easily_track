// Optional server-side persistence for the property list, so data survives
// redeploys / new hosts / other devices. Two backends, first configured wins:
//
//   1. KV / Redis over REST  — KV_REST_API_URL + KV_REST_API_TOKEN
//      (Upstash, Vercel KV — both speak this protocol). Works on serverless.
//   2. Local JSON file       — DATA_FILE=/absolute/path/store.json
//      For hosts with a persistent disk (Railway/Render/Fly/VPS) or local use.
//
// With neither set, the client just keeps using localStorage.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const KEY = 'the-ledger:properties';

export function dataStoreKind() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'kv';
  if (process.env.DATA_FILE) return 'file';
  return null;
}

// ---- KV / Redis REST ----------------------------------------------------
async function kvGet() {
  const res = await fetch(
    `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(KEY)}`,
    { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`kv get ${res.status}`);
  const { result } = await res.json();
  if (result == null) return null;
  return JSON.parse(typeof result === 'string' ? result : JSON.stringify(result));
}

async function kvSet(value) {
  const res = await fetch(
    `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(KEY)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      body: JSON.stringify(value),
    }
  );
  if (!res.ok) throw new Error(`kv set ${res.status}`);
}

// ---- local JSON file --------------------------------------------------
async function fileGet() {
  try {
    return JSON.parse(await readFile(process.env.DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fileSet(value) {
  const path = process.env.DATA_FILE;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

// ---- public API -----------------------------------------------------
/** @returns {Promise<Array|null>} the stored property list, or null if none */
export async function loadData() {
  const kind = dataStoreKind();
  if (kind === 'kv') return kvGet();
  if (kind === 'file') return fileGet();
  return null;
}

export async function saveData(properties) {
  const kind = dataStoreKind();
  if (!kind) throw new Error('no data store configured');
  if (!Array.isArray(properties)) throw new Error('expected an array');
  if (kind === 'kv') return kvSet(properties);
  return fileSet(properties);
}

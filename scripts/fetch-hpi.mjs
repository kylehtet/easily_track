// Regenerates src/lib/hpi.js from the FHFA House Price Index.
//
//   node scripts/fetch-hpi.mjs
//
// FHFA publishes a new quarter about two months after it closes, so re-running
// this a few times a year is the whole maintenance story. The output is a plain
// JS module — no key, no API call at runtime, nothing to pay for.
//
// The purchase-only files are .xlsx served under a .csv name, so this reads the
// workbook directly (zip + inflate + a little XML), using only Node built-ins.

import { writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const STATE_URL =
  'https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_po_state.csv';
const US_URL =
  'https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_po_us_and_census.csv';
const OUT = new URL('../src/lib/hpi.js', import.meta.url);

// ---- minimal xlsx reader ---------------------------------------------------

/** Files out of a zip, by name. Reads the central directory, so sizes are real. */
function unzip(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Column letters from a cell ref ("C12" → 2, zero-based). */
function colOf(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Rows of the first worksheet, as arrays of strings, indexed by real column. */
function sheetRows(files) {
  const strings = [
    ...(files.get('xl/sharedStrings.xml')?.toString('utf8') || '').matchAll(
      /<t[^>]*>([\s\S]*?)<\/t>/g
    ),
  ].map((m) => m[1]);

  const xml = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, inner]) => {
    const cells = [];
    // Placed by cell reference, not by order: a blank cell is simply absent from
    // the XML, and reading positionally would shift every column after it.
    for (const [, attrs, val] of inner.matchAll(
      /<c([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g
    )) {
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const text = val == null ? '' : type === 's' ? strings[Number(val)] : val;
      cells[ref ? colOf(ref) : cells.length] = text;
    }
    return [...cells].map((c) => c ?? '');
  });
}

async function fetchSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return sheetRows(unzip(Buffer.from(await res.arrayBuffer())));
}

// ---- build the table -------------------------------------------------------

const series = new Map(); // code -> Map(quarterIndex -> index value)
const add = (code, year, qtr, value, startYear) => {
  if (!series.has(code)) series.set(code, new Map());
  series.get(code).set((year - startYear) * 4 + (qtr - 1), value);
};

// Column 4 is the seasonally adjusted index in both workbooks; SA is the one to
// compare across arbitrary quarters, which is exactly what we do.
const SA = 4;
const START_YEAR = 1991;

const stateRows = await fetchSheet(STATE_URL);
for (const r of stateRows.slice(1)) {
  const [code, year, qtr] = r;
  const v = Number(r[SA]);
  if (!/^[A-Z]{2}$/.test(code) || !Number.isFinite(v) || v <= 0) continue;
  add(code, Number(year), Number(qtr), v, START_YEAR);
}

const usRows = await fetchSheet(US_URL);
for (const r of usRows.slice(1)) {
  const [code, year, qtr] = r;
  const v = Number(r[SA]);
  if (code !== 'USA' || !Number.isFinite(v) || v <= 0) continue;
  add('US', Number(year), Number(qtr), v, START_YEAR);
}

if (!series.has('US')) throw new Error('no national series found');

// Every series must be gap-free from 1991 Q1 to the last quarter they all share.
const lastIdx = Math.min(...[...series.values()].map((m) => Math.max(...m.keys())));
const codes = [...series.keys()].sort();
for (const code of codes) {
  for (let i = 0; i <= lastIdx; i++) {
    if (!series.get(code).has(i)) throw new Error(`${code} is missing quarter ${i}`);
  }
}

const latest = { year: START_YEAR + Math.floor(lastIdx / 4), quarter: (lastIdx % 4) + 1 };
const body = codes
  .map((code) => {
    const nums = [];
    for (let i = 0; i <= lastIdx; i++) nums.push(Number(series.get(code).get(i).toFixed(1)));
    return `  ${code}: [${nums.join(',')}],`;
  })
  .join('\n');

const file = `// GENERATED — do not edit by hand. Run \`node scripts/fetch-hpi.mjs\` to refresh.
//
// FHFA House Price Index: purchase-only, seasonally adjusted, quarterly, with
// 1991 Q1 = 100 in every series. Public domain (US government work), and the
// reason this app can estimate what a property is worth today without paying
// anyone: index the purchase price forward. See estimates.js.
//
// Source:  ${STATE_URL}
//          ${US_URL}
// Fetched: ${new Date().toISOString().slice(0, 10)}
// Covers:  ${START_YEAR} Q1 → ${latest.year} Q${latest.quarter} (${lastIdx + 1} quarters, ${codes.length} series)

export const HPI_START_YEAR = ${START_YEAR};
export const HPI_LATEST = { year: ${latest.year}, quarter: ${latest.quarter} };

/** State code (plus 'US' for the national series) → index by quarter. */
export const HPI = {
${body}
};
`;

await writeFile(OUT, file);
console.log(
  `wrote src/lib/hpi.js — ${codes.length} series, ${START_YEAR} Q1 → ${latest.year} Q${latest.quarter}`
);

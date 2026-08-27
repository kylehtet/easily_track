// Free, keyless address autocomplete for the Add / Edit form.
//
// Primary source is OpenStreetMap Nominatim (CORS-clean, global). The US Census
// geocoder is a house-number-accurate fallback, but it sends no CORS header, so
// it has to be called via JSONP (<script> injection) rather than fetch.
//
// Everything fails soft: searchAddress() rejects only on abort and otherwise
// resolves to [], so the user can always just type the address by hand.
//
// This is deliberately NOT a Zillow/Redfin integration — those have no public
// API, block scraping, and can't be reached from a browser. Property value is
// entered manually; see src/lib/calculations.js for the appreciation math and
// src/lib/realEstateData.js for where a future data proxy would plug in.

import { ADDRESS_PROVIDER } from './config.js';

const DIRECTIONALS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

const STATE_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function titleCase(str) {
  return collapse(str)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      const up = w.toUpperCase();
      if (DIRECTIONALS.has(up)) return up;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

const buildLabel = ({ street, city, state, zip }) =>
  collapse(`${street}, ${city}, ${state} ${zip}`).replace(/,\s*(?=,|$)/g, '');

function mapCensusMatch(m) {
  const c = m.addressComponents || {};
  const street = titleCase(
    `${c.fromAddress || ''} ${c.preDirection || ''} ${c.streetName || ''} ` +
      `${c.suffixType || ''} ${c.suffixDirection || ''}`
  );
  const parts = {
    street,
    city: titleCase(c.city || ''),
    state: (c.state || '').toUpperCase(),
    zip: c.zip || '',
  };
  return { ...parts, label: buildLabel(parts) };
}

// ---- OpenStreetMap Nominatim (fetch, CORS-clean) -------------------------
async function nominatim(query, signal) {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6&countrycodes=us`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .map((m) => {
      const a = m.address || {};
      const stateFull = (a.state || '').toLowerCase();
      const parts = {
        street: collapse(`${a.house_number || ''} ${a.road || ''}`),
        city: a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '',
        state: STATE_ABBR[stateFull] || a.state || '',
        zip: a.postcode || '',
      };
      return { ...parts, label: buildLabel(parts) };
    })
    .filter((r) => r.street && r.city);
}

// ---- US Census geocoder (JSONP, no CORS header) --------------------------
function census(query, signal) {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const cb = `__censusCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    let done = false;

    const cleanup = () => {
      done = true;
      delete window[cb];
      script.remove();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (done) return;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    window[cb] = (data) => {
      if (done) return;
      cleanup();
      const matches = data?.result?.addressMatches ?? [];
      resolve(matches.map(mapCensusMatch).filter((r) => r.street));
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      reject(new Error('census jsonp failed'));
    };
    script.src =
      'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
      `?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current` +
      `&format=jsonp&callback=${cb}`;

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    document.body.appendChild(script);
  });
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const key = r.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{street,city,state,zip,label}>>}
 * Rejects only with AbortError; every other failure resolves to [].
 */
export async function searchAddress(query, { signal } = {}) {
  const q = collapse(query);
  if (q.length < 5) return [];

  const run = async (fn) => {
    try {
      return await fn(q, signal);
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      return null;
    }
  };

  if (ADDRESS_PROVIDER === 'census') return dedupe((await run(census)) || []);
  if (ADDRESS_PROVIDER === 'nominatim') return dedupe((await run(nominatim)) || []);

  // 'auto': Nominatim first (reliable from the browser), then Census.
  const first = await run(nominatim);
  if (first && first.length) return dedupe(first);
  return dedupe((await run(census)) || []);
}

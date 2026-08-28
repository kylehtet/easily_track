// Free, keyless property records straight from the government bodies that
// create them: county assessors publishing open data. No API key, no vendor,
// no scraping — these are public JSON endpoints meant to be queried.
//
// Two steps per lookup:
//   1. The US Census geocoder turns a typed address into a normalized address
//      plus the county FIPS code that owns the record (free, keyless).
//   2. That FIPS picks an adapter below, which knows one county's schema.
//
// Coverage is therefore county by county. An address in a county with no
// adapter simply returns null and the lookup chain moves on — the FHFA index,
// the state tax rate, and the mortgage math still work everywhere. Adding a
// county is one entry in ADAPTERS.

const GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

// Two of these run back to back (geocode, then the county API), and a Vercel
// Hobby function is killed at 10s — so the pair has to fit inside that with
// room to spare. A county portal that needs longer than this is a county portal
// we do without.
const TIMEOUT_MS = 4000;

const posNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} → ${res.status}`);
  return res.json();
}

/** SoQL is picky about quoting; assessor data is all upper case anyway. */
const soql = (s) => String(s).toUpperCase().replace(/'/g, "''");

const DIRECTION_WORD = {
  N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST',
  NE: 'NORTHEAST', NW: 'NORTHWEST', SE: 'SOUTHEAST', SW: 'SOUTHWEST',
};

/**
 * Splits "2436 Fulton St" into the parts every assessor roll agrees on: the
 * house number, an optional directional, and the first word of the street name.
 * Street *types* ("St" vs "Street" vs "ST") are where address matching goes to
 * die, so we never match on them.
 *
 * `name` drops the ordinal suffix on numbered streets — rolls store "5 AVENUE",
 * never "5th Avenue".
 */
function addressParts(street) {
  const m = String(street || '')
    .trim()
    .match(/^(\d+)\s+(?:(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST)\.?\s+)?([A-Za-z0-9']+)/i);
  if (!m) return null;
  const dir = (m[2] || '').toUpperCase().replace(/\.$/, '');
  return {
    number: m[1].replace(/^0+/, ''),
    dir,
    dirWord: DIRECTION_WORD[dir] || dir,
    name: m[3].toUpperCase().replace(/^(\d+)(ST|ND|RD|TH)$/, '$1'),
  };
}

// ---- county → FIPS -------------------------------------------------------

/**
 * @returns {Promise<{ fips, county, state, matchedAddress, zip } | null>}
 *   fips is the 5-digit state+county code ('06075' = San Francisco).
 */
export async function locateAddress({ street, city, state, zip }) {
  const line = [street, city, state, zip].filter(Boolean).join(', ');
  if (!line.trim()) return null;
  try {
    const url =
      `${GEOCODER}?address=${encodeURIComponent(line)}` +
      '&benchmark=Public_AR_Current&vintage=Current_Current&format=json';
    const d = await getJSON(url);
    const match = d?.result?.addressMatches?.[0];
    const county = match?.geographies?.Counties?.[0];
    if (!match || !county) return null;
    return {
      fips: `${county.STATE}${county.COUNTY}`,
      county: county.NAME,
      state: match.addressComponents?.state || state || '',
      matchedAddress: match.matchedAddress || '',
      zip: match.addressComponents?.zip || zip || '',
    };
  } catch {
    return null;
  }
}

// ---- adapters ------------------------------------------------------------

/**
 * San Francisco — Assessor secured property tax roll (Socrata, keyless).
 * https://data.sfgov.org/d/wv5m-vpq2
 *
 * One row per parcel per roll year; take the newest. Addresses here are
 * column-aligned with the house number zero-padded to four digits and the range
 * start in front of it ("1052 1048 FULTON              ST0000" is 1048–1052),
 * so the match is a LIKE on " 0988 FULTON" — the leading space is what stops
 * 988 from also matching 10988.
 */
async function sanFrancisco({ street }) {
  const parts = addressParts(street);
  if (!parts) return null;

  const num = parts.number.padStart(4, '0');
  const where = `property_location like '%25 ${soql(num)} ${soql(parts.name)}%25'`;
  const url =
    'https://data.sfgov.org/resource/wv5m-vpq2.json' +
    '?$select=closed_roll_year,property_location,number_of_bedrooms,' +
    'number_of_bathrooms,number_of_rooms,number_of_units,property_area,' +
    'year_property_built,assessed_land_value,assessed_improvement_value,' +
    'current_sales_date' +
    `&$where=${where}&$order=closed_roll_year DESC&$limit=1`;

  const rows = await getJSON(url.replace(/ /g, '%20'));
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return null;

  const assessed =
    (posNum(r.assessed_land_value) || 0) + (posNum(r.assessed_improvement_value) || 0);

  return {
    beds: posNum(r.number_of_bedrooms),
    baths: posNum(r.number_of_bathrooms),
    sqft: posNum(r.property_area),
    yearBuilt: posNum(r.year_property_built),
    assessedValue: assessed || null,
    // Prop 13: the roll is the purchase price plus ~2%/yr, so for a recent
    // buyer this tracks the real bill closely. 1.17% is the SF rate.
    taxAnnual: assessed ? Math.round(assessed * 0.0117) : null,
    lastSaleDate: r.current_sales_date ? String(r.current_sales_date).slice(0, 10) : null,
    recordSource: 'SF Assessor',
  };
}

/**
 * New York City — PLUTO, all five boroughs (Socrata, keyless).
 * https://data.cityofnewyork.us/d/64uk-42ks
 *
 * Lot-level, so figures cover the whole building: no bed/bath counts exist in
 * the city's published data, and `assesstot` is the lot's assessment, not an
 * apartment's. Tax is left alone — NYC's class system is not a percentage.
 */
async function newYorkCity({ street, zip, zips }) {
  const parts = addressParts(street);
  if (!parts) return null;

  const streetPattern = [parts.number, parts.dirWord, parts.name]
    .filter(Boolean)
    .join(' ');

  const url =
    'https://data.cityofnewyork.us/resource/64uk-42ks.json' +
    '?$select=address,zipcode,bldgarea,unitsres,numfloors,yearbuilt,assessland,assesstot' +
    `&$where=upper(address) like '${soql(streetPattern)}%25'&$limit=5`;

  const rows = await getJSON(url.replace(/ /g, '%20'));
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // ZIP breaks ties, it does not filter: buildings with a vanity ZIP (350 Fifth
  // Avenue is 10118) geocode to the surrounding one (10001), and either answer
  // is "right" depending on who you ask.
  const wanted = new Set([String(zip || ''), String(zips || '')].filter(Boolean));
  const r = rows.find((row) => wanted.has(String(row.zipcode))) || rows[0];

  return {
    beds: null,
    baths: null,
    sqft: posNum(r.bldgarea),
    yearBuilt: posNum(r.yearbuilt),
    assessedValue: posNum(r.assesstot),
    taxAnnual: null,
    lastSaleDate: null,
    recordSource: 'NYC PLUTO',
  };
}

/** County FIPS → adapter. Add a county by adding a line. */
const ADAPTERS = {
  '06075': sanFrancisco,
  '36005': newYorkCity, // Bronx
  '36047': newYorkCity, // Brooklyn
  '36061': newYorkCity, // Manhattan
  '36081': newYorkCity, // Queens
  '36085': newYorkCity, // Staten Island
};

/** Counties we can answer for, for the capabilities probe / docs. */
export const COVERED_COUNTIES = Object.keys(ADAPTERS);

/**
 * Public-record lookup for an address. Always safe to call: every failure —
 * no geocode, no adapter, county API down — resolves to null.
 *
 * @returns {Promise<{
 *   beds, baths, sqft, yearBuilt, assessedValue, taxAnnual, lastSaleDate,
 *   recordSource, county
 * } | null>}
 */
export async function fromPublicRecords(address) {
  const located = await locateAddress(address);
  if (!located) return null;

  const adapter = ADAPTERS[located.fips];
  if (!adapter) return null;

  try {
    const rec = await adapter({ ...address, zips: located.zip });
    return rec ? { ...rec, county: located.county } : null;
  } catch {
    // A county portal being slow or down is not this app's problem to surface.
    return null;
  }
}

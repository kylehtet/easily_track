// Framework-agnostic handlers for the two autofill endpoints.
// Used by the Vite dev middleware (vite.config.js) and the deploy wrappers
// (api/*.js). Every function returns { status, body } and reads secrets from
// process.env — nothing here is bundled into the client.

import Anthropic from '@anthropic-ai/sdk';

const RENTCAST_BASE = 'https://api.rentcast.io/v1';

export function capabilities() {
  const rentcast = Boolean(process.env.RENTCAST_API_KEY);
  const rapidapi = Boolean(
    process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_ZILLOW_HOST
  );
  return {
    rentcast,
    rapidapi,
    // any real per-property source — the free Census area-median fallback is
    // always available but too rough to trigger an automatic lookup on its own.
    propertyLookup: rentcast || rapidapi,
    listing: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

const settle = (p) => p.catch(() => null);
const posNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---- source 1: Rentcast --------------------------------------------------
async function rentcastGet(path, address, key) {
  const url = `${RENTCAST_BASE}${path}?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`rentcast ${path} → ${res.status}`);
  return res.json();
}

async function fromRentcast(full, wantEstimates) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return null;

  const [value, rent, record] = await Promise.all([
    wantEstimates ? settle(rentcastGet('/avm/value', full, key)) : Promise.resolve(null),
    wantEstimates
      ? settle(rentcastGet('/avm/rent/long-term', full, key))
      : Promise.resolve(null),
    settle(rentcastGet('/properties', full, key)),
  ]);

  const rec = Array.isArray(record) ? record[0] : record;
  const taxes = rec?.propertyTaxes ? Object.values(rec.propertyTaxes) : [];
  const latestTax = taxes.slice().sort((a, b) => (b?.year || 0) - (a?.year || 0))[0];
  const assess = rec?.taxAssessments ? Object.values(rec.taxAssessments) : [];
  const latestAssess = assess
    .slice()
    .sort((a, b) => (b?.year || 0) - (a?.year || 0))[0];

  return {
    value: posNum(value?.price),
    valueSource: posNum(value?.price) ? 'AVM' : null,
    valueRange: value
      ? { low: value.priceRangeLow ?? null, high: value.priceRangeHigh ?? null }
      : null,
    // an assessment isn't market value but it's a usable floor when the AVM misses
    assessedValue: posNum(latestAssess?.value),
    rentEstimate: posNum(rent?.rent),
    rentSource: posNum(rent?.rent) ? 'AVM' : null,
    lastSalePrice: posNum(rec?.lastSalePrice),
    lastSaleDate: rec?.lastSaleDate ? String(rec.lastSaleDate).slice(0, 10) : null,
    taxAnnual: posNum(latestTax?.total),
    beds: rec?.bedrooms ?? null,
    baths: rec?.bathrooms ?? null,
    sqft: rec?.squareFootage ?? null,
    yearBuilt: rec?.yearBuilt ?? null,
  };
}

// ---- source 2: unofficial Zillow API on RapidAPI (opt-in) ---------------
async function fromRapidApi(full) {
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.RAPIDAPI_ZILLOW_HOST;
  if (!key || !host) return null;
  try {
    const res = await fetch(
      `https://${host}/property?address=${encodeURIComponent(full)}`,
      { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host } }
    );
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    const p = (Array.isArray(d) ? d[0] : d?.property || d?.data || d) || {};
    return {
      value: posNum(p.zestimate ?? p.price ?? p.estimatedValue),
      rentEstimate: posNum(p.rentZestimate ?? p.rentEstimate),
      beds: p.bedrooms ?? p.beds ?? null,
      baths: p.bathrooms ?? p.baths ?? null,
      sqft: posNum(p.livingArea ?? p.squareFootage ?? p.sqft),
      yearBuilt: p.yearBuilt ?? null,
      lastSalePrice: posNum(p.lastSoldPrice ?? p.lastSalePrice),
      lastSaleDate: (p.dateSold || p.lastSaleDate)
        ? String(p.dateSold || p.lastSaleDate).slice(0, 10)
        : null,
    };
  } catch {
    return null;
  }
}

// ---- source 3: US Census ACS area medians (needs a free CENSUS_API_KEY) --
async function fromCensus(zip) {
  const key = process.env.CENSUS_API_KEY;
  if (!key || !/^\d{5}$/.test(String(zip || ''))) return null;
  try {
    const url =
      'https://api.census.gov/data/2022/acs/acs5' +
      `?get=B25077_001E,B25064_001E&for=zip%20code%20tabulation%20area:${zip}` +
      `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const rows = await res.json();
    const [homeVal, grossRent] = rows?.[1] || [];
    return { areaValue: posNum(homeVal), areaRent: posNum(grossRent) };
  } catch {
    return null;
  }
}

export async function propertyLookup({ street, city, state, zip, address, fields }) {
  const caps = capabilities();
  if (!caps.propertyLookup) {
    return { status: 501, body: { error: 'no property data source configured' } };
  }

  const full = (
    address || [street, city, state, zip].filter(Boolean).join(', ')
  ).trim();
  if (!full) return { status: 400, body: { error: 'address required' } };
  const wantEstimates = fields === 'all';

  const out = {
    value: null, valueSource: null, valueRange: null,
    rentEstimate: null, rentSource: null,
    lastSalePrice: null, lastSaleDate: null, taxAnnual: null,
    beds: null, baths: null, sqft: null, yearBuilt: null,
  };
  const fill = (src) => {
    if (!src) return;
    for (const k of Object.keys(out)) {
      if (out[k] == null && src[k] != null) out[k] = src[k];
    }
  };

  // 1. Rentcast (primary AVM + record)
  const rc = await fromRentcast(full, wantEstimates);
  fill(rc);

  // 2. RapidAPI Zillow — backfill whatever's still missing
  if (out.value == null || out.rentEstimate == null || out.beds == null) {
    const rapid = await fromRapidApi(full);
    fill(rapid);
    if (rapid?.value && out.valueSource == null) out.valueSource = 'Zillow';
    if (rapid?.rentEstimate && out.rentSource == null) out.rentSource = 'Zillow';
  }

  // 3. Assessed value (from the record already fetched) as a market-value proxy
  if (out.value == null && rc?.assessedValue) {
    out.value = rc.assessedValue;
    out.valueSource = 'assessed';
  }

  // 4. Census area medians — only for still-empty value / rent
  if (out.value == null || out.rentEstimate == null) {
    const area = await fromCensus(zip);
    if (area?.areaValue && out.value == null) {
      out.value = area.areaValue;
      out.valueSource = 'area median';
    }
    if (area?.areaRent && out.rentEstimate == null) {
      out.rentEstimate = area.areaRent;
      out.rentSource = 'area median';
    }
  }

  const gotSomething = [
    out.value, out.rentEstimate, out.lastSalePrice, out.taxAnnual, out.beds, out.sqft,
  ].some((v) => v != null);
  if (!gotSomething) {
    return { status: 502, body: { error: 'no data found for that address' } };
  }
  return { status: 200, body: out };
}

// ---- Claude listing extractor ---------------------------------------------

const LISTING_FIELDS = [
  'price',
  'monthlyRent',
  'propertyTaxAnnual',
  'hoaMonthly',
  'insuranceAnnual',
  'beds',
  'baths',
  'sqft',
  'yearBuilt',
];

const LISTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: LISTING_FIELDS,
  properties: Object.fromEntries(
    LISTING_FIELDS.map((f) => [f, { type: ['number', 'null'] }])
  ),
};

const LISTING_SYSTEM =
  'You extract structured facts from a real-estate listing the user pasted. ' +
  'Reply with ONLY a JSON object, no prose or code fences, with exactly these ' +
  `keys: ${LISTING_FIELDS.join(', ')}. Use a number when the value is explicitly ` +
  'stated in the text and null otherwise. Amounts are plain USD numbers (no "$" ' +
  'or commas). propertyTaxAnnual and insuranceAnnual are yearly; monthlyRent and ' +
  'hoaMonthly are monthly. If only a range is given, use the lower figure.';

function parseJsonLoose(str) {
  const s = String(str || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(s.slice(start, end + 1));
}

export async function extractListing({ text, known }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 501, body: { error: 'ANTHROPIC_API_KEY not set' } };

  // Strip HTML and cap length — key facts sit near the top of a listing and
  // every trimmed token is money.
  const body = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
  if (body.length < 20) return { status: 400, body: { error: 'listing text required' } };

  const client = new Anthropic({ apiKey: key });
  const model = process.env.LISTING_MODEL || 'claude-opus-5';

  // Caller already pulled some fields locally — tell the model to skip them.
  const knownNote =
    known && typeof known === 'object' && Object.keys(known).length
      ? ` Already known (do not re-extract, leave as given): ${JSON.stringify(known)}.`
      : '';

  const request = (withSchema) => {
    const req = {
      model,
      max_tokens: 256,
      system: LISTING_SYSTEM + knownNote,
      messages: [{ role: 'user', content: body }],
    };
    if (withSchema) {
      req.output_config = {
        format: { type: 'json_schema', name: 'listing', schema: LISTING_SCHEMA },
      };
    }
    return client.messages.create(req);
  };

  let response;
  try {
    response = await request(true);
  } catch {
    try {
      response = await request(false); // SDK/model without structured outputs
    } catch (err) {
      return { status: 502, body: { error: `extraction failed: ${err.message}` } };
    }
  }

  const raw = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed;
  try {
    parsed = parseJsonLoose(raw);
  } catch {
    return { status: 502, body: { error: 'model did not return usable JSON' } };
  }

  const clean = {};
  for (const f of LISTING_FIELDS) {
    const v = parsed[f];
    clean[f] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return { status: 200, body: clean };
}

// Framework-agnostic handlers for the two autofill endpoints.
// Used by the Vite dev middleware (vite.config.js) and the deploy wrappers
// (api/*.js). Every function returns { status, body } and reads secrets from
// process.env — nothing here is bundled into the client.

import Anthropic from '@anthropic-ai/sdk';

const RENTCAST_BASE = 'https://api.rentcast.io/v1';

export function capabilities() {
  return {
    rentcast: Boolean(process.env.RENTCAST_API_KEY),
    listing: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

// ---- Rentcast property lookup ------------------------------------------------

async function rentcastGet(path, address, key) {
  const url = `${RENTCAST_BASE}${path}?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`rentcast ${path} → ${res.status}`);
  return res.json();
}

export async function propertyLookup({ street, city, state, zip, address, fields }) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return { status: 501, body: { error: 'RENTCAST_API_KEY not set' } };

  const full = (
    address || [street, city, state, zip].filter(Boolean).join(', ')
  ).trim();
  if (!full) return { status: 400, body: { error: 'address required' } };

  // Default: 1 API call (property record — beds/baths/sqft/year/last sale/tax).
  // fields=all adds the AVM value + rent estimate (2 more calls / quota).
  const wantEstimates = fields === 'all';
  const settle = (p) => p.catch(() => null);
  const [value, rent, record] = await Promise.all([
    wantEstimates ? settle(rentcastGet('/avm/value', full, key)) : Promise.resolve(null),
    wantEstimates
      ? settle(rentcastGet('/avm/rent/long-term', full, key))
      : Promise.resolve(null),
    settle(rentcastGet('/properties', full, key)),
  ]);

  // Rentcast's exact shapes drift — optional-chain everything.
  const rec = Array.isArray(record) ? record[0] : record;
  const taxes = rec?.propertyTaxes ? Object.values(rec.propertyTaxes) : [];
  const latestTax = taxes
    .slice()
    .sort((a, b) => (b?.year || 0) - (a?.year || 0))[0];

  const out = {
    value: value?.price ?? null,
    valueRange: value
      ? { low: value.priceRangeLow ?? null, high: value.priceRangeHigh ?? null }
      : null,
    rentEstimate: rent?.rent ?? null,
    lastSalePrice: rec?.lastSalePrice ?? null,
    lastSaleDate: rec?.lastSaleDate
      ? String(rec.lastSaleDate).slice(0, 10)
      : null,
    taxAnnual: latestTax?.total ?? null,
    beds: rec?.bedrooms ?? null,
    baths: rec?.bathrooms ?? null,
    sqft: rec?.squareFootage ?? null,
    yearBuilt: rec?.yearBuilt ?? null,
  };

  const gotSomething = [
    out.value,
    out.rentEstimate,
    out.lastSalePrice,
    out.taxAnnual,
    out.beds,
    out.sqft,
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

// Free, local, zero-API extraction from pasted listing text. Run this first;
// only fall back to the Claude call (server/handlers.js) for fields it misses.

const FIELDS = [
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

function money(str) {
  if (str == null) return null;
  const m = String(str).match(/([\d,.]+)\s*([mMkK])?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'm') n *= 1e6;
  else if (suffix === 'k') n *= 1e3;
  return Math.round(n);
}

function first(text, patterns, transform = money) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] != null) {
      const v = transform(m[1]);
      if (v != null && v > 0) return v;
    }
  }
  return null;
}

/**
 * @param {string} raw  pasted listing text (HTML tolerated)
 * @returns {{ found: object, missing: string[] }}
 *   `found` has a subset of FIELDS as numbers; `missing` lists the rest.
 */
export function parseListing(raw) {
  const text = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');

  const found = {};

  found.price = first(text, [
    /(?:list(?:ed|ing)?\s*price|offered\s*at|asking(?:\s*price)?|price)[:\s]*\$?\s*([\d,]+(?:\.\d+)?\s*[mk]?)\b/i,
    /\$\s*(\d{1,3}(?:\.\d+)?\s*[mk])\b/i,
    /\$\s*([\d,]{6,}(?:\.\d+)?)\b/,
  ]);

  found.monthlyRent = first(text, [
    /rent(?:al)?\s*(?:zestimate|estimate|price)?[:\s]*\$?\s*([\d,]+)\s*(?:\/\s*mo|per\s*month|monthly|\/mo)/i,
    /\$\s*([\d,]{3,5})\s*(?:\/\s*mo|per\s*month|monthly)/i,
  ]);

  found.hoaMonthly = first(text, [
    /hoa[^$\d]{0,40}\$\s*([\d,]+)\s*(?:\/\s*mo|per\s*month|monthly|\/mo|a\s*month)/i,
    /hoa\s*(?:fee|dues)?[:\s]*\$?\s*([\d,]+)\s*(?:\/\s*mo|monthly|month)/i,
  ]);

  found.propertyTaxAnnual = first(text, [
    /(?:property\s*tax(?:es)?|annual\s*tax(?:es)?|tax\s*annual)[^$\d]{0,40}\$\s*([\d,]+)/i,
    /\$\s*([\d,]{4,})\s*(?:\/\s*yr|per\s*year|annually|a\s*year)\s*(?:in\s*)?(?:property\s*)?tax/i,
  ]);

  found.insuranceAnnual = first(text, [
    /insurance[^$\d]{0,40}\$\s*([\d,]+)\s*(?:\/\s*yr|per\s*year|annually|a\s*year)/i,
  ]);

  const int = (s) => {
    const n = parseFloat(String(s).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  found.beds = first(
    text,
    [/(\d+(?:\.\d+)?)\s*(?:beds?|bd|br|bedrooms?)\b/i],
    int
  );
  found.baths = first(
    text,
    [/(\d+(?:\.\d+)?)\s*(?:baths?|ba|bathrooms?)\b/i],
    int
  );
  found.sqft = first(
    text,
    [
      /([\d,]{3,})\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/i,
      /(?:sq\.?\s*ft\.?|sqft|square\s*feet)[:\s]*([\d,]{3,})/i,
    ],
    int
  );
  found.yearBuilt = first(
    text,
    [/(?:year\s*built|built\s*(?:in)?)[:\s]*((?:19|20)\d{2})\b/i],
    int
  );

  // sanity clamps — drop values that can't be what the field means
  if (found.yearBuilt && (found.yearBuilt < 1800 || found.yearBuilt > 2100))
    found.yearBuilt = null;
  if (found.beds && found.beds > 20) found.beds = null;
  if (found.baths && found.baths > 20) found.baths = null;
  if (found.price && found.price < 10000) found.price = null; // that's a rent, not a sale price
  if (found.monthlyRent && (found.monthlyRent < 100 || found.monthlyRent > 100000))
    found.monthlyRent = null;
  if (found.hoaMonthly && found.hoaMonthly > 10000) found.hoaMonthly = null;
  if (found.sqft && (found.sqft < 100 || found.sqft > 100000)) found.sqft = null;

  for (const k of Object.keys(found)) if (found[k] == null) delete found[k];

  return {
    found,
    missing: FIELDS.filter((k) => found[k] == null),
  };
}

export const LISTING_FIELDS = FIELDS;

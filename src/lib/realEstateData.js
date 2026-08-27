// Client side of the property-lookup feature. Talks to /api/property, which is
// served by the Vite dev middleware locally (see vite.config.js) and by
// api/property.js when deployed. Both are backed by server/handlers.js and hold
// the Rentcast key server-side — this file never sees it.
//
// This is NOT a Zillow/Redfin scraper: Rentcast is a licensed data API. Without
// RENTCAST_API_KEY the endpoint reports itself unconfigured and the UI hides
// the "Look up property" button.

/** @returns {Promise<{ rentcast: boolean, listing: boolean }>} */
export async function getCapabilities() {
  try {
    const res = await fetch('/api/property');
    if (!res.ok) return { rentcast: false, listing: false };
    const data = await res.json();
    return {
      rentcast: Boolean(data?.configured?.rentcast),
      listing: Boolean(data?.configured?.listing),
    };
  } catch {
    return { rentcast: false, listing: false };
  }
}

/**
 * @param {{ street?, city?, state?, zip? }} address
 * @param {{ signal?: AbortSignal, fields?: 'record' | 'all' }} [opts]
 *   fields='record' (default) → 1 API call: beds/baths/sqft/year/last sale/tax.
 *   fields='all' → +2 calls for the AVM value and rent estimate.
 * @returns {Promise<{
 *   value, valueRange, rentEstimate, lastSalePrice, lastSaleDate,
 *   taxAnnual, beds, baths, sqft, yearBuilt
 * }>}
 * @throws {Error} with a human-readable message on failure (incl. AbortError)
 */
export async function lookupProperty(address, { signal, fields = 'record' } = {}) {
  const qs = new URLSearchParams([
    ...Object.entries(address).filter(([, v]) => v),
    ['fields', fields],
  ]).toString();

  const res = await fetch(`/api/property?${qs}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `lookup failed (${res.status})`);
  }
  return data;
}

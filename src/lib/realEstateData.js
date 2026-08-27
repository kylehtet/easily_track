// Client side of the property-lookup feature. Talks to /api/property, which is
// served by the Vite dev middleware locally (see vite.config.js) and by
// api/property.js when deployed. Both are backed by server/handlers.js and hold
// the Rentcast key server-side — this file never sees it.
//
// This is NOT a Zillow/Redfin scraper: Rentcast is a licensed data API. Without
// RENTCAST_API_KEY the endpoint reports itself unconfigured and the UI hides
// the "Look up property" button.

/** @returns {Promise<{ propertyLookup, rentcast, rapidapi, redfin, listing: boolean }>} */
export async function getCapabilities() {
  const off = {
    propertyLookup: false,
    rentcast: false,
    rapidapi: false,
    redfin: false,
    listing: false,
  };
  try {
    const res = await fetch('/api/property');
    if (!res.ok) return off;
    const c = (await res.json())?.configured || {};
    return {
      propertyLookup: Boolean(c.propertyLookup),
      rentcast: Boolean(c.rentcast),
      rapidapi: Boolean(c.rapidapi),
      redfin: Boolean(c.redfin),
      listing: Boolean(c.listing),
    };
  } catch {
    return off;
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

// Client side of the property-lookup feature. Talks to /api/property, which is
// served by the Vite dev middleware locally (see vite.config.js) and by
// api/property.js when deployed. Both are backed by server/handlers.js and hold
// the Rentcast key server-side — this file never sees it.
//
// This is NOT a Zillow/Redfin scraper. The keyless path is county assessor open
// data (server/publicRecords.js); Rentcast, if a key is configured, is a
// licensed data API layered on top of it.

import { apiFetch } from './auth.js';

/** @returns {Promise<{ propertyLookup, rentcast, rapidapi, redfin, publicRecords, listing: boolean }>} */
export async function getCapabilities() {
  const off = {
    propertyLookup: false,
    rentcast: false,
    rapidapi: false,
    redfin: false,
    publicRecords: false,
    listing: false,
  };
  try {
    const res = await apiFetch('/api/property');
    if (!res.ok) return off;
    const c = (await res.json())?.configured || {};
    return {
      propertyLookup: Boolean(c.propertyLookup),
      rentcast: Boolean(c.rentcast),
      rapidapi: Boolean(c.rapidapi),
      redfin: Boolean(c.redfin),
      publicRecords: Boolean(c.publicRecords),
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

  const res = await apiFetch(`/api/property?${qs}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `lookup failed (${res.status})`);
  }
  return data;
}

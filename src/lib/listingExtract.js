// Client side of the paste-a-listing extractor. POSTs to /api/extract-listing,
// which runs one Claude call server-side (server/handlers.js) using the
// ANTHROPIC_API_KEY. Without that key the endpoint reports itself unconfigured
// and the UI hides the paste box.

import { apiFetch } from './auth.js';

/**
 * @param {string} text  raw listing text pasted by the user
 * @param {object|null} known  fields already found locally — model skips them
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{
 *   price, monthlyRent, propertyTaxAnnual, hoaMonthly, insuranceAnnual,
 *   beds, baths, sqft, yearBuilt
 * }>}  each field is a number or null
 * @throws {Error} with a human-readable message on failure
 */
export async function extractListing(text, known = null, { signal } = {}) {
  const res = await apiFetch('/api/extract-listing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, known: known || undefined }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `extraction failed (${res.status})`);
  }
  return data;
}

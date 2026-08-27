// Design-canvas props from "The Ledger.dc.html", surfaced as app-level config.

/** Show base-cost rows in the itemized ledger even when the amount is $0. */
export const SHOW_ZERO_ROWS = false;

/** Flag a property as "stale" once this many days pass without an update. */
export const STALE_DAYS = 45;

/**
 * Address-autocomplete provider for the Add / Edit form.
 *   'auto'      — OpenStreetMap Nominatim, then the US Census geocoder (JSONP)
 *   'nominatim' — OpenStreetMap Nominatim only
 *   'census'    — US Census geocoder only (JSONP; US, house-number accurate)
 * All are free and keyless. See src/lib/addressLookup.js.
 */
export const ADDRESS_PROVIDER = 'auto';

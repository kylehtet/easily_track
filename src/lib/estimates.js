import { num } from './calculations.js';

// Rough effective property-tax rates as a fraction of market value, paid
// annually. Published statewide averages, except CA — its statewide average
// (~0.7%) reflects decades-old Prop 13 assessments; a recent purchase is taxed
// near 1% base + local bonds, so ~1.1% is closer for a just-bought home.
// These are estimates only — the real number comes from the county assessor.
export const STATE_TAX_RATE = {
  AL: 0.004, AK: 0.0117, AZ: 0.006, AR: 0.0062, CA: 0.011, CO: 0.0049,
  CT: 0.0192, DE: 0.0055, DC: 0.0055, FL: 0.0086, GA: 0.0083, HI: 0.0028,
  ID: 0.0063, IL: 0.0208, IN: 0.0083, IA: 0.015, KS: 0.0134, KY: 0.0083,
  LA: 0.0055, ME: 0.0119, MD: 0.0102, MA: 0.0114, MI: 0.0131, MN: 0.0102,
  MS: 0.0075, MO: 0.0091, MT: 0.0074, NE: 0.0151, NV: 0.0055, NH: 0.0175,
  NJ: 0.0223, NM: 0.0073, NY: 0.0162, NC: 0.0078, ND: 0.0098, OH: 0.0155,
  OK: 0.0085, OR: 0.0086, PA: 0.0143, RI: 0.0135, SC: 0.0053, SD: 0.0114,
  TN: 0.0063, TX: 0.0163, UT: 0.0056, VT: 0.0183, VA: 0.0079, WA: 0.0087,
  WV: 0.0055, WI: 0.0161, WY: 0.0055,
};

/** National fallback when the state is unknown. */
export const DEFAULT_TAX_RATE = 0.011;

/** Homeowner's insurance as a fraction of dwelling value, annually. */
export const INSURANCE_RATE = 0.0035;

export function effectiveTaxRate(state) {
  return STATE_TAX_RATE[String(state || '').toUpperCase()] ?? DEFAULT_TAX_RATE;
}

/** Estimated monthly property tax from a purchase price and state. */
export function estimateMonthlyTax({ price, state }) {
  return (num(price) * effectiveTaxRate(state)) / 12;
}

/** Estimated monthly homeowner's insurance from the property value. */
export function estimateMonthlyInsurance({ value }) {
  return (num(value) * INSURANCE_RATE) / 12;
}

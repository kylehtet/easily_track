// Single source of truth for net-income math.
// Card, ledger breakdown, modal preview, and the stat bar all import from here so
// the numbers can never drift out of sync.

/** Base monthly cost fields: [dataKey, label], in display order. */
export const BASE_COSTS = [
  ['mortgage', 'Mortgage'],
  ['tax', 'Property tax'],
  ['insurance', 'Insurance'],
  ['repairs', 'Repairs'],
  ['utilities', 'Utilities'],
  ['pge', 'PG&E'],
  ['water', 'Water'],
  ['recology', 'Recology'],
  ['hoa', 'HOA'],
];

/** Coerce anything ("$1,200", "", undefined, NaN) to a finite number. */
export function num(v) {
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/** Management fee: percent of rent, or a flat monthly amount. */
export function managementFee(p) {
  const rent = num(p.rent);
  const feeVal = num(p.mgmt.feeVal);
  return p.mgmt.feeMode === 'pct' ? (rent * feeVal) / 100 : feeVal;
}

export function baseSum(p) {
  return BASE_COSTS.reduce((total, [k]) => total + num(p.base[k]), 0);
}

export function extraSum(p) {
  return (p.extras || []).reduce((total, x) => total + num(x.amount), 0);
}

/**
 * net income = rental income
 *            − sum of base monthly costs
 *            − sum of additional costs
 *            − management fee
 */
export function netIncome(p) {
  return num(p.rent) - baseSum(p) - extraSum(p) - managementFee(p);
}

// ---- asset side: value & appreciation ---------------------------------------

/** Dollar change in value since purchase. */
export function equityGain(p) {
  return num(p.value) - num(p.purchasePrice);
}

/** Total appreciation as a fraction of the purchase price (0.18 = +18%). */
export function appreciationPct(p) {
  const basis = num(p.purchasePrice);
  return basis > 0 ? equityGain(p) / basis : 0;
}

/** Years elapsed since the purchase date, or 0 if it isn't a usable date. */
function yearsHeld(p) {
  const t = Date.parse(p.purchaseDate);
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / (365.25 * 864e5);
}

/**
 * Annualized appreciation (CAGR) from purchase to today.
 * Needs a purchase price, a current value, and at least ~5 weeks of holding.
 */
export function annualizedAppreciation(p) {
  const basis = num(p.purchasePrice);
  const value = num(p.value);
  const years = yearsHeld(p);
  if (basis <= 0 || value <= 0 || years < 0.1) return 0;
  return (value / basis) ** (1 / years) - 1;
}

/**
 * Net operating income (monthly): income minus operating costs, with the
 * mortgage (debt service) added back — cap rate is an unlevered measure.
 */
export function noi(p) {
  return netIncome(p) + num(p.base?.mortgage);
}

/** Cap rate: annualized NOI as a fraction of current value. */
export function capRate(p) {
  const value = num(p.value);
  return value > 0 ? (noi(p) * 12) / value : 0;
}

/** Portfolio-wide roll-up for the stat bar. */
export function portfolioTotals(list = []) {
  return list.reduce(
    (acc, p) => ({
      count: acc.count + 1,
      gross: acc.gross + num(p.rent),
      net: acc.net + netIncome(p),
      value: acc.value + num(p.value),
      equityGain: acc.equityGain + equityGain(p),
    }),
    { count: 0, gross: 0, net: 0, value: 0, equityGain: 0 }
  );
}

import { num } from './calculations.js';

/**
 * Monthly principal + interest on a fixed-rate loan.
 *
 * @param {{ principal:number, annualRatePct:number, termYears:number }} p
 * @returns {number} monthly payment, or 0 if inputs are incomplete
 */
export function monthlyMortgage({ principal, annualRatePct, termYears }) {
  const p = num(principal);
  const years = num(termYears);
  const rate = num(annualRatePct);
  if (p <= 0 || years <= 0) return 0;

  const n = years * 12;
  const r = rate / 100 / 12;
  if (r === 0) return p / n;
  return (p * r) / (1 - (1 + r) ** -n);
}

/** Loan amount from a purchase price and a down-payment percentage. */
export function loanAmount({ price, downPct }) {
  const gross = num(price);
  const down = Math.min(Math.max(num(downPct), 0), 100);
  return gross * (1 - down / 100);
}

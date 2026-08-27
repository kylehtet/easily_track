/** Ledger-style amount: "$1,234.56", negatives in accounting parens "($1,234.56)". */
export function fmt2(n) {
  const a = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `($${a})` : `$${a}`;
}

/** Whole-dollar amount: "$1,234", negatives with a real minus sign "−$1,234". */
export function fmt0(n) {
  const a = Math.round(Math.abs(n)).toLocaleString('en-US');
  return n < 0 ? `−$${a}` : `$${a}`;
}

/** Compact dollars for tight spots: "$1.15M", "$180K", "$950", "−$40K". */
export function fmtCompact(n) {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

function trim(x) {
  // up to 2 decimals, no trailing zeros: 1.5 -> "1.5", 1.2 -> "1.2", 3 -> "3"
  return String(Number(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)));
}

/** Percentage: fmtPct(0.184) -> "18%", fmtPct(0.049) -> "4.9%". */
export function fmtPct(x) {
  const pct = x * 100;
  const digits = Math.abs(pct) < 10 ? 1 : 0;
  return `${pct.toFixed(digits)}%`;
}

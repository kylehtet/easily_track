// Tiny dependency-free sparkline of a property's value history.

const W = 92;
const H = 22;
const PAD = 2;

export default function ValueSparkline({ history }) {
  const points = (history || [])
    .map((h) => Number(h.value))
    .filter((n) => Number.isFinite(n));
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (points.length - 1);

  const d = points
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (H - PAD * 2) * (1 - (v - min) / span);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const up = points[points.length - 1] >= points[0];

  return (
    <svg
      className="sparkline"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Value history"
    >
      <path d={d} fill="none" stroke={`var(${up ? '--pos' : '--neg'})`} strokeWidth="1.5" />
    </svg>
  );
}

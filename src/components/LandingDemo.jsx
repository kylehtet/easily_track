import { useEffect, useRef, useState } from 'react';

// A self-playing loop of the core flow, so a visitor sees what EasyPort does
// instead of reading about it: an address types itself in, the property data
// fills, the ledger builds line by line, and the net counts up.
//
// Everything is local — no requests, no assets. The numbers match the worked
// example a real property would produce.

const ADDRESS = '1847 Fulton St';

const COSTS = [
  ['Mortgage', 2180],
  ['Property tax', 540],
  ['Insurance', 145],
  ['Repairs', 0],
  ['Ziprent fee (8%)', 336],
];

const RENT = 4200;
const NET = RENT - COSTS.reduce((sum, [, amount]) => sum + amount, 0);
const SPARK = [612, 628, 640, 634, 651, 668, 662, 684, 700, 712];

const money = (n) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Builds the sparkline path from the value series. */
function sparkPath(w, h) {
  const lo = Math.min(...SPARK);
  const hi = Math.max(...SPARK);
  return SPARK.map((v, i) => {
    const x = (i / (SPARK.length - 1)) * w;
    const y = h - ((v - lo) / (hi - lo || 1)) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function LandingDemo() {
  // step drives the whole reel; each tick reveals a little more
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [net, setNet] = useState(0);
  const timers = useRef([]);

  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setTyped(ADDRESS.length);
      setStep(99);
      setNet(NET);
      return;
    }

    let cancelled = false;
    const at = (ms, fn) => {
      const id = setTimeout(() => !cancelled && fn(), ms);
      timers.current.push(id);
    };

    const runCycle = () => {
      setStep(0);
      setTyped(0);
      setNet(0);

      // 1. the address types itself
      for (let i = 1; i <= ADDRESS.length; i += 1) {
        at(260 + i * 55, () => setTyped(i));
      }
      const afterTyping = 260 + ADDRESS.length * 55;

      // 2. lookup chip, then the property details land
      at(afterTyping + 320, () => setStep(1));
      at(afterTyping + 1250, () => setStep(2));

      // 3. ledger rows, one at a time
      COSTS.forEach((_, i) => {
        at(afterTyping + 1750 + i * 200, () => setStep(3 + i));
      });
      const afterRows = afterTyping + 1750 + COSTS.length * 200;

      // 4. net counts up, then the sparkline draws
      at(afterRows + 250, () => {
        setStep(3 + COSTS.length);
        const startedAt = Date.now();
        const tick = () => {
          if (cancelled) return;
          const t = Math.min(1, (Date.now() - startedAt) / 900);
          // ease-out so it decelerates into the final figure
          setNet(NET * (1 - Math.pow(1 - t, 3)));
          if (t < 1) {
            const id = setTimeout(tick, 32);
            timers.current.push(id);
          }
        };
        tick();
      });
      at(afterRows + 1200, () => setStep(90));

      // 5. hold, then run it again
      at(afterRows + 5200, () => {
        if (!cancelled) runCycle();
      });
    };

    runCycle();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduced]);

  const filled = step >= 2;
  const caret = typed < ADDRESS.length && step === 0;

  return (
    <div className="demo" aria-label="A demonstration of adding a property">
      <div className="demo-bar">
        <span className="demo-dot" />
        <span className="demo-dot" />
        <span className="demo-dot" />
        <span className="demo-bar-title">Add property</span>
      </div>

      <div className="demo-body">
        <div className="demo-field">
          <label>ADDRESS</label>
          <div className="demo-input">
            {ADDRESS.slice(0, typed)}
            {caret && <span className="demo-caret" />}
          </div>
        </div>

        <div className={`demo-status ${step >= 1 ? 'is-on' : ''}`}>
          {step === 1 ? (
            <span className="demo-loading">Looking up property…</span>
          ) : step >= 2 ? (
            <span className="demo-ok">✓ Filled value, rent, tax, beds/baths</span>
          ) : null}
        </div>

        <div className={`demo-chips ${filled ? 'is-in' : ''}`}>
          {[
            ['VALUE', '$712k'],
            ['RENT', '$4,200'],
            ['3 bd', '2 ba'],
            ['SQFT', '1,640'],
          ].map(([k, v], i) => (
            <div className="demo-chip" key={k} style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="demo-chip-k">{k}</span>
              <span className="demo-chip-v">{v}</span>
            </div>
          ))}
        </div>

        <div className="demo-ledger">
          <div className={`demo-row ${filled ? 'is-in' : ''}`}>
            <span>Rental income</span>
            <span className="demo-dots" />
            <span className="demo-amt">{money(RENT)}</span>
          </div>

          {COSTS.map(([label, amount], i) => (
            <div className={`demo-row ${step >= 3 + i ? 'is-in' : ''}`} key={label}>
              <span className="is-muted">{label}</span>
              <span className="demo-dots" />
              <span className="demo-amt">{money(amount)}</span>
            </div>
          ))}

          <div className={`demo-net ${step >= 3 + COSTS.length ? 'is-in' : ''}`}>
            <span>NET / MO</span>
            <span className="demo-dots" />
            <span className="demo-amt is-pos">{money(net)}</span>
          </div>
        </div>

        <div className={`demo-spark ${step >= 90 ? 'is-in' : ''}`}>
          <svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
            <path d={sparkPath(200, 36)} className="demo-spark-line" />
          </svg>
          <span className="demo-spark-cap">value · 10 mo</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import LandingDemo from './LandingDemo.jsx';

// The logged-out front door. Deliberately short on words: the self-playing
// demo above the fold does the explaining, and everything below it is a
// caption at most. Sections fade in as they scroll into view.

const STEPS = [
  ['01', 'Type the address', 'That is the whole setup.'],
  ['02', 'It fills itself in', 'Value, rent, tax, beds and baths.'],
  ['03', 'See your net', 'Rent in, every cost out, itemized.'],
  ['04', 'Watch it move', 'Value, equity and appreciation over time.'],
];

const FEATURES = [
  ['◈', 'Net per property'],
  ['◱', 'Portfolio totals'],
  ['⌖', 'Address autofill'],
  ['❏', 'Listing import'],
  ['✓', 'Rent tracking'],
  ['↻', 'Monthly review'],
  ['◠', 'Value history'],
  ['⚿', 'Private to you'],
];

/** Adds `is-in` once the element has scrolled into view, so sections fade up. */
function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, shown ? 'reveal is-in' : 'reveal'];
}

function Section({ cap, children }) {
  const [ref, cls] = useReveal();
  return (
    <section className={`landing-section ${cls}`} ref={ref}>
      {cap && <div className="landing-cap">{cap}</div>}
      {children}
    </section>
  );
}

export default function Landing({ onStart, signedIn = false }) {
  return (
    <div className="landing">
      <div className="landing-shell">
        <header className="landing-nav">
          <div className="landing-brand">EasyPort</div>
          <button className="link-btn" onClick={() => onStart('login')}>
            {signedIn ? '← Back to my portfolio' : 'Sign in'}
          </button>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1 className="landing-h1">
              Know what your rentals
              <br />
              actually earn you.
            </h1>
            <p className="landing-lede">
              Add an address. Get a live, itemized picture of your net income.
            </p>
            <div className="landing-cta">
              {signedIn ? (
                <button className="btn-primary" onClick={() => onStart('login')}>
                  Back to my portfolio
                </button>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => onStart('signup')}>
                    Create your account
                  </button>
                  <button className="btn-ghost" onClick={() => onStart('login')}>
                    Sign in
                  </button>
                </>
              )}
            </div>
            {!signedIn && (
              <div className="landing-fineprint">Free · about a minute to set up</div>
            )}
          </div>

          <div className="landing-hero-demo">
            <LandingDemo />
          </div>
        </section>

        <Section cap="HOW IT WORKS">
          <div className="landing-steps">
            {STEPS.map(([n, title, body], i) => (
              <div className="landing-step" key={n} style={{ '--i': i }}>
                <div className="landing-step-n">{n}</div>
                <div className="landing-step-title">{title}</div>
                <div className="landing-step-body">{body}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section cap="WHAT YOU GET">
          <div className="landing-features">
            {FEATURES.map(([glyph, label], i) => (
              <div className="landing-feature" key={label} style={{ '--i': i }}>
                <span className="landing-feature-glyph">{glyph}</span>
                {label}
              </div>
            ))}
          </div>
        </Section>

        {!signedIn && (
          <Section>
            <div className="landing-closer">
              <div className="landing-closer-title">Ready when you are.</div>
              <button className="btn-primary" onClick={() => onStart('signup')}>
                Create your account
              </button>
            </div>
          </Section>
        )}

        <footer className="landing-foot">EasyPort</footer>
      </div>
    </div>
  );
}

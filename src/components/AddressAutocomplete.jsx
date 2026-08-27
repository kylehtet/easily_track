import { useEffect, useRef, useState } from 'react';
import { searchAddress } from '../lib/addressLookup.js';

// Search box that sits above the street/city/zip fields in the property form.
// Picking a result calls onPick({ street, city, state, zip }); the fields below
// stay fully editable for manual correction.

export default function AddressAutocomplete({ onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);

  const boxRef = useRef(null);
  const abortRef = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 5) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await searchAddress(q, { signal: ctrl.signal });
        if (seq === seqRef.current) {
          setResults(r);
          setActive(-1);
          setOpen(true);
        }
      } catch {
        // AbortError from a superseded keystroke — ignore.
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (r) => {
    onPick(r);
    setQuery('');
    setResults([]);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="addr-auto" ref={boxRef}>
      <div className="addr-field">
        <label className="field">
          Find address
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Start typing a street address…"
            autoComplete="off"
            spellCheck="false"
          />
        </label>

        {open && (loading || results.length > 0) && (
          <div className="addr-menu">
            {loading && results.length === 0 && (
              <div className="addr-note">Searching…</div>
            )}
            {results.map((r, i) => (
              <button
                type="button"
                key={`${r.label}-${i}`}
                className={`addr-item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="addr-hint">
        Free US lookup (Census / OpenStreetMap). The fields below stay editable.
      </div>
    </div>
  );
}

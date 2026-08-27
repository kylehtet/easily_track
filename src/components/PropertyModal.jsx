import { useEffect, useRef, useState } from 'react';
import { BASE_COSTS, num, netIncome, managementFee } from '../lib/calculations.js';
import { fmt2, fmtPct } from '../lib/format.js';
import { monthlyMortgage, loanAmount } from '../lib/mortgage.js';
import {
  estimateMonthlyTax,
  estimateMonthlyInsurance,
  effectiveTaxRate,
} from '../lib/estimates.js';
import { getCapabilities, lookupProperty } from '../lib/realEstateData.js';
import { getCached, setCached } from '../lib/lookupCache.js';
import { extractListing } from '../lib/listingExtract.js';
import { parseListing } from '../lib/listingParse.js';
import AddressAutocomplete from './AddressAutocomplete.jsx';

const addrKey = (a) =>
  [a.street, a.zip || a.city]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const PAYMENTS = [
  'Ziprent direct deposit',
  'Zelle',
  'PayPal',
  'Personal cash/check',
];

// prettier-ignore
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];

/** Build a normalized preview / save object from the raw form strings. */
function normalize(f) {
  const base = {};
  BASE_COSTS.forEach(([k]) => {
    base[k] = num(f.base[k]);
  });
  return {
    rent: num(f.rent),
    base,
    extras: f.extras.map((x) => ({ label: x.label, amount: num(x.amount) })),
    mgmt: {
      type: f.mgmtType,
      feeMode: f.feeMode,
      feeVal: num(f.feeVal),
      payment: f.payment,
    },
  };
}

export default function PropertyModal({ mode, initialForm, onCancel, onSave }) {
  const [f, setF] = useState(initialForm);
  const [caps, setCaps] = useState({
    propertyLookup: false,
    rentcast: false,
    rapidapi: false,
    listing: false,
  });
  const [lookup, setLookup] = useState({ loading: false, error: '', note: '' });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [paste, setPaste] = useState({ loading: false, error: '', note: '' });
  const triedRef = useRef(new Set());

  useEffect(() => {
    let live = true;
    getCapabilities().then((c) => live && setCaps(c));
    return () => {
      live = false;
    };
  }, []);

  const patch = (p) => setF((cur) => ({ ...cur, ...p }));
  const setBase = (k, v) => patch({ base: { ...f.base, [k]: v } });
  const setFin = (k, v) => patch({ financing: { ...f.financing, [k]: v } });
  const setExtra = (i, key, v) =>
    patch({ extras: f.extras.map((x, j) => (j === i ? { ...x, [key]: v } : x)) });
  const addExtra = () => patch({ extras: f.extras.concat([{ label: '', amount: '' }]) });
  const removeExtra = (i) => patch({ extras: f.extras.filter((_, j) => j !== i) });

  const setMgmtType = (k) =>
    patch({
      mgmtType: k,
      payment:
        k === 'ziprent'
          ? 'Ziprent direct deposit'
          : f.payment === 'Ziprent direct deposit'
            ? 'Zelle'
            : f.payment,
    });

  const applyAddress = (r) => {
    const merged = {
      street: r.street || f.street,
      city: r.city || f.city,
      state: r.state || f.state,
      zip: r.zip || f.zip,
    };
    setF((cur) => ({ ...cur, ...merged }));
    maybeAutoLookup(merged);
  };

  // ---- autofill: fill only empty fields, never clobber user input -----------
  const fillBlanks = (updates) =>
    setF((cur) => {
      const next = { ...cur, base: { ...cur.base } };
      for (const [key, val] of Object.entries(updates)) {
        if (val == null || val === '' || val === 0) continue;
        if (key.startsWith('base.')) {
          const bk = key.slice(5);
          if (!num(next.base[bk])) next.base[bk] = String(val);
        } else if (!next[key]) {
          next[key] = String(val);
        }
      }
      return next;
    });

  const metaFrom = (d) =>
    d.beds || d.baths || d.sqft || d.yearBuilt
      ? {
          beds: d.beds ?? null,
          baths: d.baths ?? null,
          sqft: d.sqft ?? null,
          yearBuilt: d.yearBuilt ?? null,
        }
      : null;

  const applyLookup = (d, viaCache) => {
    fillBlanks({
      value: d.value ?? d.lastSalePrice ?? '',
      purchasePrice: d.lastSalePrice ?? '',
      purchaseDate: d.lastSaleDate ?? '',
      rent: d.rentEstimate ?? '',
      'base.tax': d.taxAnnual ? Math.round(d.taxAnnual / 12) : '',
    });
    const m = metaFrom(d);
    if (m) setF((cur) => ({ ...cur, meta: m }));

    const tag = (label, src) =>
      label + (src && src !== 'AVM' && src !== 'Zillow' ? ` (${src})` : '');
    const bits = [
      d.value && tag('value', d.valueSource),
      d.rentEstimate && tag('rent', d.rentSource),
      d.lastSalePrice && 'last sale',
      d.taxAnnual && 'tax',
      m && 'beds/baths',
    ].filter(Boolean);
    setLookup({
      loading: false,
      error: '',
      note: bits.length
        ? `Filled ${bits.join(', ')}${viaCache ? ' — cached' : ''}`
        : 'No property data found for that address',
    });
  };

  const doLookup = async (addr, { force } = {}) => {
    if (!force) {
      const hit = getCached(addr);
      if (hit) {
        applyLookup(hit.data, true);
        return;
      }
    }
    setLookup({ loading: true, error: '', note: '' });
    try {
      const d = await lookupProperty(
        { street: addr.street, city: addr.city, state: addr.state, zip: addr.zip },
        { fields: 'all' }
      );
      setCached(addr, d);
      applyLookup(d, false);
    } catch (e) {
      setLookup({ loading: false, error: e.message, note: '' });
    }
  };

  // Fires once per distinct address as soon as one is entered/picked.
  const maybeAutoLookup = (addr) => {
    if (!caps.propertyLookup) return;
    if (!addr.street || !(addr.zip || addr.city)) return;
    if (mode === 'edit' && num(f.value) > 0) return; // already has value
    const key = addrKey(addr);
    if (!key || triedRef.current.has(key)) return;
    triedRef.current.add(key);
    doLookup(addr);
  };

  // Paste path: local regex first (free), Claude only for what's still missing.
  const runExtract = async () => {
    setPaste({ loading: true, error: '', note: '' });
    const toFields = (d) => ({
      purchasePrice: d.price ?? '',
      value: d.price ?? '',
      rent: d.monthlyRent ?? '',
      'base.tax': d.propertyTaxAnnual ? Math.round(d.propertyTaxAnnual / 12) : '',
      'base.insurance': d.insuranceAnnual
        ? Math.round(d.insuranceAnnual / 12)
        : '',
      'base.hoa': d.hoaMonthly ? Math.round(d.hoaMonthly) : '',
    });

    const { found, missing } = parseListing(pasteText);
    fillBlanks(toFields(found));
    let m = metaFrom(found);
    const localCount = Object.keys(found).length;
    let claudeCount = 0;

    if (missing.length && caps.listing) {
      try {
        const d = await extractListing(pasteText, found);
        fillBlanks(toFields(d));
        claudeCount = missing.filter((k) => d[k] != null).length;
        m = m || metaFrom(d);
      } catch (e) {
        if (m) setF((cur) => ({ ...cur, meta: m }));
        setPaste({ loading: false, error: e.message, note: '' });
        return;
      }
    }
    if (m) setF((cur) => ({ ...cur, meta: m }));
    setPaste({
      loading: false,
      error: '',
      note: claudeCount
        ? `${localCount} from text · ${claudeCount} from Claude`
        : `${localCount} from text · no API call needed`,
    });
  };

  // ---- mortgage + estimates ------------------------------------------------
  const principal = loanAmount({ price: f.purchasePrice, downPct: f.financing.downPct });
  const computedMortgage = monthlyMortgage({
    principal,
    annualRatePct: f.financing.ratePct,
    termYears: f.financing.termYears,
  });

  const useMortgage = () =>
    setBase('mortgage', String(Math.round(computedMortgage)));

  const estimateTaxIns = () => {
    const tax = estimateMonthlyTax({
      price: f.purchasePrice || f.value,
      state: f.state,
    });
    const ins = estimateMonthlyInsurance({ value: f.value || f.purchasePrice });
    setF((cur) => ({
      ...cur,
      base: {
        ...cur.base,
        tax: tax ? String(Math.round(tax)) : cur.base.tax,
        insurance: ins ? String(Math.round(ins)) : cur.base.insurance,
      },
    }));
  };

  // ---- net-income preview ------------------------------------------------
  const pv = normalize(f);
  const pnet = netIncome(pv);
  const pfee = managementFee(pv);

  const previewRows = [];
  BASE_COSTS.forEach(([k, label]) => {
    if (pv.base[k]) previewRows.push({ label, amt: fmt2(pv.base[k]) });
  });
  pv.extras.forEach((x) => {
    if (x.amount) previewRows.push({ label: x.label || 'Misc', amt: fmt2(x.amount) });
  });
  if (f.mgmtType === 'ziprent' || pfee > 0) {
    previewRows.push({
      label:
        (f.mgmtType === 'ziprent' ? 'Ziprent fee' : 'Mgmt fee') +
        (f.feeMode === 'pct' ? ` (${num(f.feeVal)}%)` : ' (flat)'),
      amt: fmt2(pfee),
    });
  }

  const submit = () => {
    if (!f.street.trim()) {
      window.alert('Street address is required.');
      return;
    }
    onSave({
      street: f.street.trim(),
      city: f.city.trim(),
      state: f.state.trim().toUpperCase(),
      zip: f.zip.trim(),
      rent: pv.rent,
      base: pv.base,
      extras: f.extras
        .filter((x) => x.label.trim() || num(x.amount))
        .map((x) => ({ label: x.label.trim() || 'Misc', amount: num(x.amount) })),
      mgmt: pv.mgmt,
      purchasePrice: num(f.purchasePrice),
      purchaseDate: f.purchaseDate || '',
      value: num(f.value),
      financing: {
        downPct: num(f.financing.downPct),
        ratePct: num(f.financing.ratePct),
        termYears: num(f.financing.termYears) || 30,
      },
      meta: f.meta || null,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            {mode === 'edit' ? 'Edit property' : 'Add property'}
          </div>
          <button className="link-btn link-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <AddressAutocomplete onPick={applyAddress} />

        <div className="address-grid">
          <label className="field">
            Street
            <input
              value={f.street}
              onChange={(e) => patch({ street: e.target.value })}
              onBlur={() => maybeAutoLookup(f)}
              placeholder="1847 Fulton St"
            />
          </label>
          <label className="field">
            City
            <input
              value={f.city}
              onChange={(e) => patch({ city: e.target.value })}
              onBlur={() => maybeAutoLookup(f)}
              placeholder="San Francisco"
            />
          </label>
          <label className="field">
            State
            <select
              value={f.state}
              onChange={(e) => patch({ state: e.target.value })}
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            ZIP
            <input
              value={f.zip}
              onChange={(e) => patch({ zip: e.target.value })}
              onBlur={() => maybeAutoLookup(f)}
              placeholder="94117"
            />
          </label>
        </div>

        {caps.propertyLookup && (
          <div className="lookup-row">
            {lookup.loading && (
              <span className="est-note">Fetching property data…</span>
            )}
            {!lookup.loading && lookup.note && (
              <span className="est-note">✓ {lookup.note}</span>
            )}
            {lookup.error && <span className="lookup-err">{lookup.error}</span>}
            {!lookup.loading && f.street.trim() && (
              <button
                type="button"
                className="link-btn"
                onClick={() => doLookup(f, { force: true })}
              >
                ↻ Re-fetch
              </button>
            )}
          </div>
        )}

        {caps.listing && (
          <div className="paste-block">
            <button
              className="dashed-btn"
              onClick={() => setPasteOpen((o) => !o)}
            >
              {pasteOpen
                ? '− Paste a listing'
                : '+ Paste a Zillow/Redfin listing instead'}
            </button>
            {pasteOpen && (
              <>
                <textarea
                  className="paste-box"
                  rows={5}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste the listing text — parsed locally first, Claude only fills the gaps…"
                />
                <div className="lookup-row">
                  <button
                    className="btn-ghost"
                    onClick={runExtract}
                    disabled={paste.loading || pasteText.trim().length < 20}
                  >
                    {paste.loading ? 'Reading…' : 'Extract fields'}
                  </button>
                  {!paste.loading && paste.note && (
                    <span className="est-note">✓ {paste.note}</span>
                  )}
                  {paste.error && (
                    <span className="lookup-err">{paste.error}</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <label className="field field-narrow">
          Monthly rental income
          <input
            className="mono"
            value={f.rent}
            onChange={(e) => patch({ rent: e.target.value })}
            placeholder="4200"
            inputMode="decimal"
          />
        </label>

        <div className="section-cap">Property value</div>
        <div className="base-grid">
          <label className="field field-sm">
            Purchase price
            <input
              className="mono"
              value={f.purchasePrice}
              onChange={(e) => patch({ purchasePrice: e.target.value })}
              placeholder="1050000"
              inputMode="decimal"
            />
          </label>
          <label className="field field-sm">
            Purchase date
            <input
              type="date"
              value={f.purchaseDate}
              onChange={(e) => patch({ purchaseDate: e.target.value })}
            />
          </label>
          <label className="field field-sm">
            Current value
            <input
              className="mono"
              value={f.value}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder="1240000"
              inputMode="decimal"
            />
          </label>
        </div>

        <div className="finance-block">
          <div className="finance-fields">
            <label className="field field-sm">
              Down payment (%)
              <input
                className="mono"
                value={f.financing.downPct}
                onChange={(e) => setFin('downPct', e.target.value)}
                placeholder="20"
                inputMode="decimal"
              />
            </label>
            <label className="field field-sm">
              Interest rate (%)
              <input
                className="mono"
                value={f.financing.ratePct}
                onChange={(e) => setFin('ratePct', e.target.value)}
                placeholder="6.5"
                inputMode="decimal"
              />
            </label>
            <label className="field field-sm">
              Loan term (yrs)
              <input
                className="mono"
                value={f.financing.termYears}
                onChange={(e) => setFin('termYears', e.target.value)}
                placeholder="30"
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="calc-out">
            <span>
              Est. mortgage (P&amp;I):{' '}
              <strong>{computedMortgage ? fmt2(computedMortgage) : '—'}</strong> / mo
            </span>
            <button
              className="mini-btn"
              onClick={useMortgage}
              disabled={!computedMortgage}
            >
              Use as mortgage cost →
            </button>
          </div>
          <div className="calc-out">
            <button className="dashed-btn" onClick={estimateTaxIns}>
              Estimate taxes &amp; insurance
            </button>
            <span className="est-note">
              tax ≈ {fmtPct(effectiveTaxRate(f.state))} of price
              {f.state ? ` (${f.state})` : ''} · insurance ≈ 0.35% / yr of value
            </span>
          </div>
        </div>

        <div className="section-cap">Base monthly costs</div>
        <div className="base-grid">
          {BASE_COSTS.map(([k, label]) => (
            <label className="field field-sm" key={k}>
              {label}
              <input
                className="mono"
                value={f.base[k]}
                onChange={(e) => setBase(k, e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
          ))}
        </div>

        <div className="section-cap">Additional costs</div>
        <div className="extras-list">
          {f.extras.map((x, i) => (
            <div className="extra-row" key={i}>
              <input
                value={x.label}
                onChange={(e) => setExtra(i, 'label', e.target.value)}
                placeholder="HOA violation, roof patch…"
              />
              <input
                className="mono input-amt"
                value={x.amount}
                onChange={(e) => setExtra(i, 'amount', e.target.value)}
                placeholder="0"
                inputMode="decimal"
              />
              <button
                className="x-btn"
                title="Remove"
                onClick={() => removeExtra(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="dashed-btn" onClick={addExtra}>
            + Add line item
          </button>
        </div>

        <div className="section-cap">Management</div>
        <div className="mgmt-row">
          <div className="seg-group">
            {[
              ['ziprent', 'Ziprent'],
              ['personal', 'Personal'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`seg-btn ${f.mgmtType === k ? 'is-active' : ''}`}
                onClick={() => setMgmtType(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="seg-group">
            {[
              ['pct', '% of rent'],
              ['flat', 'Flat $/mo'],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`seg-btn ${f.feeMode === k ? 'is-active' : ''}`}
                onClick={() => patch({ feeMode: k })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field field-sm">
            Fee ({f.feeMode === 'pct' ? '%' : '$/mo'})
            <input
              className="mono fee-input"
              value={f.feeVal}
              onChange={(e) => patch({ feeVal: e.target.value })}
              inputMode="decimal"
            />
          </label>
          <label className="field field-sm">
            Rent received via
            <select
              value={f.payment}
              onChange={(e) => patch({ payment: e.target.value })}
            >
              {PAYMENTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="preview">
          <div className="preview-cap">PREVIEW</div>
          <div className="preview-rows">
            <div className="ledger-row">
              <span>Rental income</span>
              <span className="ledger-row-dots" />
              <span>{fmt2(pv.rent)}</span>
            </div>
            {previewRows.map((r, i) => (
              <div className="ledger-row" key={i}>
                <span className="is-muted">{r.label}</span>
                <span className="ledger-row-dots" />
                <span>{r.amt}</span>
              </div>
            ))}
            <div className="ledger-net">
              <span>NET / MO</span>
              <span className="spacer" />
              <span className={pnet < 0 ? 'is-neg' : 'is-pos'}>{fmt2(pnet)}</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            {mode === 'edit' ? 'Save changes' : 'Add to ledger'}
          </button>
        </div>
      </div>
    </div>
  );
}

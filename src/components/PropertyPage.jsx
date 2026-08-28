import {
  netIncome,
  num,
  equityGain,
  appreciationPct,
  capRate,
} from '../lib/calculations.js';
import { fmt0, fmtCompact, fmtPct } from '../lib/format.js';
import PropertyForm from './PropertyForm.jsx';
import ValueSparkline from './ValueSparkline.jsx';

const currentYM = () => new Date().toISOString().slice(0, 7);

const longDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/**
 * One property on its own page: what we know about it up top, the full form
 * below. Editing used to happen in an overlay stacked on the dashboard, which
 * meant the ledger behind it was both cluttered and unreachable.
 */
export default function PropertyPage({
  mode,
  property: p,
  initialForm,
  onBack,
  onSave,
  onDelete,
  onReview,
  onRentPaid,
  onDirtyChange,
}) {
  const isEdit = mode === 'edit' && p;

  const net = isEdit ? netIncome(p) : 0;
  const gain = isEdit ? equityGain(p) : 0;
  const cap = isEdit ? capRate(p) : 0;
  const hasValue = isEdit && num(p.value) > 0;
  const hasBasis = isEdit && num(p.purchasePrice) > 0;
  const ym = currentYM();
  const reviewed = isEdit && p.reviewedMonth === ym;
  const rentPaid = isEdit && p.rentPaidMonth === ym;

  const metaLine =
    isEdit && p.meta
      ? [
          p.meta.beds && `${p.meta.beds} bd`,
          p.meta.baths && `${p.meta.baths} ba`,
          p.meta.sqft && `${p.meta.sqft.toLocaleString('en-US')} sqft`,
          p.meta.yearBuilt && `built ${p.meta.yearBuilt}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <div className="prop-page">
      <button type="button" className="page-back" onClick={onBack}>
        <span>←</span> Back to ledger
      </button>

      <header className="pp-head">
        <div className="pp-head-main">
          <div className="pp-eyebrow">
            {isEdit ? 'Property' : 'New property'}
          </div>
          <h1 className="pp-title">
            {isEdit ? p.street : 'Add a property'}
          </h1>
          <div className="pp-sub">
            {isEdit
              ? [[p.city, p.state].filter(Boolean).join(', '), p.zip]
                  .filter(Boolean)
                  .join(' ') || 'address on file below'
              : 'Enter the address first — the rest fills itself in where we can.'}
          </div>
          {metaLine && <div className="pp-meta">{metaLine}</div>}
        </div>

        {isEdit && (
          <div className="pp-head-actions">
            <button
              type="button"
              className={`rent-badge ${rentPaid ? 'is-paid' : 'is-due'}`}
              onClick={onRentPaid}
            >
              {rentPaid ? '✓ Rent paid' : '✕ Rent due'}
            </button>
            <button
              type="button"
              className={`review-pill ${reviewed ? 'is-reviewed' : ''}`}
              onClick={onReview}
            >
              {reviewed ? '✓ Reviewed' : 'Mark reviewed'}
            </button>
            <span className="card-badge">
              {p.mgmt.type === 'ziprent' ? 'ZIPRENT' : 'SELF-MANAGED'}
            </span>
          </div>
        )}
      </header>

      {isEdit && (
        <div className="pp-stats">
          <div className="pp-stat">
            <div className="pp-stat-label">Net / mo</div>
            <div className={`pp-stat-value ${net < 0 ? 'is-neg' : 'is-pos'}`}>
              {fmt0(net)}
            </div>
          </div>
          <div className="pp-stat">
            <div className="pp-stat-label">Rent</div>
            <div className="pp-stat-value">{fmt0(num(p.rent))}</div>
          </div>
          {hasValue && (
            <div className="pp-stat">
              <div className="pp-stat-label">Current value</div>
              <div className="pp-stat-value">{fmtCompact(num(p.value))}</div>
              <ValueSparkline history={p.valueHistory} />
            </div>
          )}
          {hasValue && hasBasis && (
            <div className="pp-stat">
              <div className="pp-stat-label">Since purchase</div>
              <div className={`pp-stat-value ${gain < 0 ? 'is-neg' : 'is-pos'}`}>
                {fmtCompact(gain)}
              </div>
              <div className="pp-stat-note">{fmtPct(appreciationPct(p))}</div>
            </div>
          )}
          {cap > 0 && (
            <div className="pp-stat">
              <div className="pp-stat-label">Cap rate</div>
              <div className="pp-stat-value">{fmtPct(cap)}</div>
            </div>
          )}
        </div>
      )}

      {isEdit && (
        <div className="pp-updated">Last updated {longDate(p.updatedAt)}</div>
      )}

      <PropertyForm
        mode={mode}
        initialForm={initialForm}
        onCancel={onBack}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />

      {isEdit && (
        <div className="pp-danger">
          <button type="button" className="link-btn is-danger" onClick={onDelete}>
            Delete this property
          </button>
        </div>
      )}
    </div>
  );
}

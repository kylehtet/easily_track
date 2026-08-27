import {
  netIncome,
  num,
  equityGain,
  appreciationPct,
  capRate,
} from '../lib/calculations.js';
import { fmt0, fmtCompact, fmtPct } from '../lib/format.js';
import { STALE_DAYS } from '../lib/config.js';
import LedgerBreakdown from './LedgerBreakdown.jsx';
import ValueSparkline from './ValueSparkline.jsx';

const shortDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function trend(net, prevNet) {
  if (prevNet == null) return { text: 'first month on the books', cls: 'is-flat' };
  const delta = net - prevNet;
  if (Math.abs(delta) < 1) return { text: '— flat vs last month', cls: 'is-flat' };
  const amt = Math.round(Math.abs(delta)).toLocaleString('en-US');
  return {
    text: `${delta > 0 ? '▲' : '▼'} $${amt} vs last month`,
    cls: delta > 0 ? 'is-up' : 'is-down',
  };
}

export default function PropertyCard({
  property: p,
  monthUpper,
  expanded,
  edit,
  onToggle,
  onEdit,
  onDelete,
  onReview,
  onStartEdit,
  onChangeEdit,
  onCommitEdit,
  onCancelEdit,
}) {
  const net = netIncome(p);
  const neg = net < 0;
  const stale = (Date.now() - p.updatedAt) / 864e5 > STALE_DAYS;
  const reviewed = p.reviewedMonth === new Date().toISOString().slice(0, 7);
  const t = trend(net, p.prevNet);

  const hasValue = num(p.value) > 0;
  const gain = equityGain(p);
  const gainUp = gain >= 0;
  const cap = capRate(p);

  return (
    <div className="property-card">
      <div className="card-head" onClick={onToggle}>
        <div className="card-head-top">
          <div className="card-street">{p.street}</div>
          <div className="card-badge">
            {p.mgmt.type === 'ziprent' ? 'ZIPRENT' : 'SELF-MANAGED'}
          </div>
        </div>
        <div className="card-cityzip">
          {[p.city, p.state].filter(Boolean).join(', ')} {p.zip}
        </div>
        {p.meta && (p.meta.beds || p.meta.baths || p.meta.sqft) && (
          <div className="card-meta-line">
            {[
              p.meta.beds && `${p.meta.beds} bd`,
              p.meta.baths && `${p.meta.baths} ba`,
              p.meta.sqft && `${p.meta.sqft.toLocaleString('en-US')} sqft`,
              p.meta.yearBuilt && `built ${p.meta.yearBuilt}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}

        <div className="card-net-row">
          <div className={`card-net ${neg ? 'is-neg' : 'is-pos'}`}>{fmt0(net)}</div>
          <div className="card-net-cap">net / mo</div>
        </div>

        <div className={`card-trend ${t.cls}`}>{t.text}</div>

        {hasValue && (
          <div className="card-value-row">
            <span className="card-value-line">
              <span className="card-value">{fmtCompact(num(p.value))}</span>
              {num(p.purchasePrice) > 0 && (
                <span className={gainUp ? 'is-up' : 'is-down'}>
                  {' · '}
                  {gainUp ? '▲' : '▼'} {fmtCompact(Math.abs(gain))} (
                  {fmtPct(appreciationPct(p))})
                </span>
              )}
              {cap > 0 && <span className="card-cap"> · {fmtPct(cap)} cap</span>}
            </span>
            <ValueSparkline history={p.valueHistory} />
          </div>
        )}

        <div className="card-meta">
          <span className={`card-updated ${stale ? 'is-stale' : ''}`}>
            Updated {shortDate(p.updatedAt)}
          </span>
          <span className="spacer" />
          <button
            className={`review-pill ${reviewed ? 'is-reviewed' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onReview();
            }}
          >
            {reviewed ? '✓ Reviewed' : 'Mark reviewed'}
          </button>
          <button
            className="link-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            className="link-btn is-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="card-ledger-wrap">
          <LedgerBreakdown
            property={p}
            monthUpper={monthUpper}
            edit={edit}
            onStartEdit={onStartEdit}
            onChangeEdit={onChangeEdit}
            onCommitEdit={onCommitEdit}
            onCancelEdit={onCancelEdit}
          />
          <div className="torn-edge" />
        </div>
      )}
    </div>
  );
}

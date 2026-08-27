import { portfolioTotals } from '../lib/calculations.js';
import { fmt0 } from '../lib/format.js';

export default function SummaryBar({ list }) {
  const totals = portfolioTotals(list);
  const hasValue = totals.value > 0;

  return (
    <div className="stat-bar">
      <div className="stat">
        <div className="stat-label">Properties</div>
        <div className="stat-value">{totals.count}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Gross rent / mo</div>
        <div className="stat-value">{fmt0(totals.gross)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Net income / mo</div>
        <div className={`stat-value ${totals.net < 0 ? 'is-neg' : 'is-pos'}`}>
          {fmt0(totals.net)}
        </div>
      </div>
      {hasValue && (
        <>
          <div className="stat">
            <div className="stat-label">Portfolio value</div>
            <div className="stat-value">{fmt0(totals.value)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Appreciation</div>
            <div
              className={`stat-value ${totals.equityGain < 0 ? 'is-neg' : 'is-pos'}`}
            >
              {fmt0(totals.equityGain)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

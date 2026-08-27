import {
  BASE_COSTS,
  managementFee,
  netIncome,
  num,
  equityGain,
  annualizedAppreciation,
} from '../lib/calculations.js';
import { fmt2, fmt0, fmtPct } from '../lib/format.js';
import { SHOW_ZERO_ROWS } from '../lib/config.js';
import EditableAmount from './EditableAmount.jsx';

export default function LedgerBreakdown({
  property: p,
  monthUpper,
  edit,
  onStartEdit,
  onChangeEdit,
  onCommitEdit,
  onCancelEdit,
}) {
  const net = netIncome(p);
  const fee = managementFee(p);

  const showValuation = num(p.value) > 0 || num(p.purchasePrice) > 0;
  const gain = equityGain(p);
  const annual = annualizedAppreciation(p);
  const purchaseYear = (p.purchaseDate || '').slice(0, 4);

  const rows = [];
  BASE_COSTS.forEach(([k, label]) => {
    if (SHOW_ZERO_ROWS || p.base[k]) {
      rows.push({ key: `${p.id}:b:${k}`, label, amount: p.base[k] || 0, editValue: p.base[k] || 0 });
    }
  });
  (p.extras || []).forEach((x, i) => {
    rows.push({ key: `${p.id}:x:${i}`, label: x.label, amount: x.amount, editValue: x.amount });
  });
  if (p.mgmt.type === 'ziprent' || fee > 0) {
    const label =
      (p.mgmt.type === 'ziprent' ? 'Ziprent fee' : 'Mgmt fee') +
      (p.mgmt.feeMode === 'pct' ? ` (${p.mgmt.feeVal}%)` : ' (flat)');
    rows.push({ key: `${p.id}:fee`, label, amount: fee, editValue: p.mgmt.feeVal });
  }

  const amtProps = (key, cur) => ({
    editing: edit.key === key,
    value: edit.val,
    onStart: () => onStartEdit(key, cur),
    onChange: onChangeEdit,
    onCommit: onCommitEdit,
    onCancel: onCancelEdit,
  });

  return (
    <div className="ledger">
      <div className="ledger-cap">ITEMIZED — {monthUpper}</div>

      <div className="ledger-rows">
        <div className="ledger-row">
          <span className="ledger-row-label">Rental income</span>
          <span className="ledger-row-dots" />
          <EditableAmount
            {...amtProps(`${p.id}:rent`, p.rent)}
            display={fmt2(p.rent)}
          />
        </div>

        <div className="ledger-costs-cap">COSTS</div>

        {rows.map((r) => (
          <div className="ledger-row" key={r.key}>
            <span className="ledger-row-label is-muted">{r.label}</span>
            <span className="ledger-row-dots" />
            <EditableAmount {...amtProps(r.key, r.editValue)} display={fmt2(r.amount)} />
          </div>
        ))}

        <div className="ledger-net">
          <span>NET</span>
          <span className="spacer" />
          <span className={net < 0 ? 'is-neg' : 'is-pos'}>{fmt2(net)}</span>
        </div>
      </div>

      {showValuation && (
        <div className="ledger-rows ledger-valuation">
          <div className="ledger-costs-cap">VALUATION</div>

          {num(p.purchasePrice) > 0 && (
            <div className="ledger-row">
              <span className="is-muted">
                Purchased{purchaseYear ? ` · ${purchaseYear}` : ''}
              </span>
              <span className="ledger-row-dots" />
              <span>{fmt0(num(p.purchasePrice))}</span>
            </div>
          )}

          <div className="ledger-row">
            <span className="is-muted">Current value</span>
            <span className="ledger-row-dots" />
            <EditableAmount
              {...amtProps(`${p.id}:value`, num(p.value))}
              display={fmt0(num(p.value))}
            />
          </div>

          {num(p.purchasePrice) > 0 && num(p.value) > 0 && (
            <>
              <div className="ledger-row">
                <span className="is-muted">Gain</span>
                <span className="ledger-row-dots" />
                <span className={gain < 0 ? 'is-neg' : 'is-pos'}>{fmt0(gain)}</span>
              </div>
              {annual !== 0 && (
                <div className="ledger-row">
                  <span className="is-muted">Annualized</span>
                  <span className="ledger-row-dots" />
                  <span className={annual < 0 ? 'is-neg' : 'is-pos'}>
                    {annual > 0 ? '+' : ''}
                    {fmtPct(annual)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="ledger-payline">RENT VIA {p.mgmt.payment.toUpperCase()}</div>
    </div>
  );
}

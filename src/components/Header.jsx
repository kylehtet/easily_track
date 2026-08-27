export default function Header({ monthLabel, onAdd }) {
  return (
    <header className="ledger-header">
      <div>
        <div className="ledger-title">The Ledger</div>
        <div className="ledger-subtitle">rental property net income · {monthLabel}</div>
      </div>
      <button className="btn-primary" onClick={onAdd}>
        + Add property
      </button>
    </header>
  );
}

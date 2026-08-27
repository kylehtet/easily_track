import AccountMenu from './AccountMenu.jsx';

const SYNC_LABEL = {
  syncing: 'saving…',
  synced: 'synced',
  error: 'sync failed',
};

export default function Header({ monthLabel, onAdd, sync, showAccount }) {
  return (
    <header className="ledger-header">
      <div>
        <div className="ledger-title">The Ledger</div>
        <div className="ledger-subtitle">
          rental property net income · {monthLabel}
          {sync && (
            <span className={`sync-chip sync-${sync}`}>{SYNC_LABEL[sync]}</span>
          )}
        </div>
      </div>
      <div className="ledger-header-actions">
        {showAccount && <AccountMenu />}
        <button className="btn-primary" onClick={onAdd}>
          + Add property
        </button>
      </div>
    </header>
  );
}

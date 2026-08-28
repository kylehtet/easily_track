import AccountMenu from './AccountMenu.jsx';
import { currentAccount } from '../lib/auth.js';

const SYNC_LABEL = {
  syncing: 'saving…',
  synced: 'synced',
  error: 'sync failed',
};

/** "Kaung Htet" -> "Kaung"; falls back to the email's local part. */
function firstNameOf(account) {
  const name = String(account?.name || '').trim();
  if (name) return name.split(/\s+/)[0];
  const email = String(account?.email || '');
  if (email && !email.startsWith('__')) return email.split('@')[0];
  return '';
}

/** Possessive that reads right for names already ending in s (James' not James's). */
const possessive = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

export default function Header({ monthLabel, onAdd, sync, showAccount, onShowLanding }) {
  const who = firstNameOf(currentAccount());
  const title = who ? `${possessive(who)} Portfolio` : 'Your Portfolio';

  return (
    <header className="ledger-header">
      <div>
        <button
          type="button"
          className="ledger-eyebrow"
          onClick={onShowLanding}
          title="What is EasyPort?"
        >
          EasyPort
        </button>
        <div className="ledger-title">{title}</div>
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

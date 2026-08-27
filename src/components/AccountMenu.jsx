import { useEffect, useRef, useState } from 'react';
import { changePassword, firebaseSignOut, logout } from '../lib/auth.js';

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const signOut = async () => {
    logout();
    await firebaseSignOut();
    location.reload();
  };

  const doChange = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await changePassword(cur, next);
      setMsg('Password updated.');
      setCur('');
      setNext('');
    } catch (err) {
      setMsg(err.message || 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn"
        onClick={() => setOpen((o) => !o)}
      >
        Account ▾
      </button>

      {open && (
        <div className="account-panel">
          {!changing ? (
            <>
              <button className="link-btn" onClick={() => setChanging(true)}>
                Change password
              </button>
              <button className="link-btn" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <form className="account-form" onSubmit={doChange}>
              <input
                type="password"
                placeholder="Current password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                placeholder="New password (6+ chars)"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <div className="account-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setChanging(false);
                    setMsg('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !cur || next.length < 6}
                >
                  {busy ? '…' : 'Save'}
                </button>
              </div>
            </form>
          )}
          {msg && <div className="account-msg">{msg}</div>}
        </div>
      )}
    </div>
  );
}

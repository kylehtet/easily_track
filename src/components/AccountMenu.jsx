import { useEffect, useRef, useState } from 'react';
import {
  changeName,
  changePassword,
  currentAccount,
  firebaseSignOut,
  logout,
} from '../lib/auth.js';

const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
};

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('menu'); // menu | name | password
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);

  const account = currentAccount();
  const initial = splitName(account?.name);
  const [first, setFirst] = useState(initial.first);
  const [last, setLast] = useState(initial.last);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (v) => {
    setView(v);
    setMsg('');
    setErr('');
  };

  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    logout();
    await firebaseSignOut();
    location.reload();
  };

  const saveName = (e) => {
    e.preventDefault();
    run(async () => {
      await changeName(first, last);
      setMsg('Name updated.');
      // The header reads the name once at render, so reload to pick it up
      // everywhere at once rather than leaving parts of the UI stale.
      setTimeout(() => location.reload(), 600);
    });
  };

  const savePassword = (e) => {
    e.preventDefault();
    run(async () => {
      await changePassword(cur, next);
      setMsg('Password updated.');
      setCur('');
      setNext('');
    });
  };

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          go('menu');
        }}
      >
        Account ▾
      </button>

      {open && (
        <div className="account-panel">
          <div className="account-id">
            {account?.name && <div className="account-name">{account.name}</div>}
            {account?.email && <div className="account-email">{account.email}</div>}
          </div>

          {view === 'menu' && (
            <>
              <button className="link-btn" onClick={() => go('name')}>
                {account?.name ? 'Change name' : 'Add your name'}
              </button>
              <button className="link-btn" onClick={() => go('password')}>
                Change password
              </button>
              <button className="link-btn" onClick={signOut}>
                Sign out
              </button>
            </>
          )}

          {view === 'name' && (
            <form className="account-form" onSubmit={saveName}>
              <div className="name-row">
                <input
                  placeholder="First name"
                  autoComplete="given-name"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  autoFocus
                />
                <input
                  placeholder="Last name"
                  autoComplete="family-name"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                />
              </div>
              <div className="account-actions">
                <button type="button" className="link-btn" onClick={() => go('menu')}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !first.trim()}
                >
                  {busy ? '…' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {view === 'password' && (
            <form className="account-form" onSubmit={savePassword}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Current password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password (6+ chars)"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <div className="account-actions">
                <button type="button" className="link-btn" onClick={() => go('menu')}>
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

          {msg && <div className="account-msg is-ok">{msg}</div>}
          {err && <div className="account-msg is-err">{err}</div>}
        </div>
      )}
    </div>
  );
}

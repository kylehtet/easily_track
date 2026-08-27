import { useState } from 'react';
import {
  signIn,
  signUp,
  resendVerification,
  resetPassword,
  devSignIn,
} from '../lib/auth.js';

function PasswordInput({ value, onChange, placeholder = 'Password', autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  );
}

export default function Login({ mode, onDone }) {
  const dev = mode === 'dev';
  const [view, setView] = useState('login'); // login | signup | sent | forgot | forgot-sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsVerify, setNeedsVerify] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      if (err.needsVerification) setNeedsVerify(true);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (dev) return run(() => devSignIn(password).then(onDone));
    if (view === 'login')
      return run(() => signIn(email, password).then(onDone));
    if (view === 'signup')
      return run(() => signUp(email, password).then(() => setView('sent')));
    if (view === 'forgot')
      return run(() => resetPassword(email).then(() => setView('forgot-sent')));
  };

  const go = (v) => {
    setView(v);
    setError('');
    setNeedsVerify(false);
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">The Ledger</div>

        {dev && (
          <>
            <div className="login-sub">Local sign-in</div>
            <PasswordInput value={password} onChange={setPassword} autoFocus />
          </>
        )}

        {!dev && (view === 'login' || view === 'signup' || view === 'forgot') && (
          <>
            <div className="login-sub">
              {view === 'login'
                ? 'Sign in'
                : view === 'signup'
                  ? 'Create your account'
                  : 'Reset your password'}
            </div>
            <input
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {view !== 'forgot' && (
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder={view === 'signup' ? 'Choose a password' : 'Password'}
              />
            )}
          </>
        )}

        {!dev && view === 'sent' && (
          <>
            <div className="login-sub">Check your inbox</div>
            <p className="login-note">
              We sent a verification link to <strong>{email}</strong>. Click it,
              then come back and sign in.
            </p>
          </>
        )}

        {!dev && view === 'forgot-sent' && (
          <>
            <div className="login-sub">Check your inbox</div>
            <p className="login-note">
              If <strong>{email}</strong> has an account, a reset link is on its
              way.
            </p>
          </>
        )}

        {error && <div className="login-error">{error}</div>}

        {needsVerify && (
          <button
            type="button"
            className="link-btn"
            disabled={busy}
            onClick={() =>
              run(() =>
                resendVerification(email, password).then(() => {
                  setNeedsVerify(false);
                  setView('sent');
                })
              )
            }
          >
            Resend verification email
          </button>
        )}

        {(dev || ['login', 'signup', 'forgot'].includes(view)) && (
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : dev || view === 'login'
                ? 'Sign in'
                : view === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </button>
        )}

        {!dev && (
          <div className="login-links">
            {view === 'login' && (
              <>
                <button type="button" className="link-btn" onClick={() => go('forgot')}>
                  Forgot password?
                </button>
                <button type="button" className="link-btn" onClick={() => go('signup')}>
                  Create account
                </button>
              </>
            )}
            {view !== 'login' && (
              <button type="button" className="link-btn" onClick={() => go('login')}>
                ← Back to sign in
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

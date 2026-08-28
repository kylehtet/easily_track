import { useState } from 'react';
import {
  signIn,
  signUp,
  resendVerification,
  resetPassword,
  devSignIn,
} from '../lib/auth.js';
import PasswordInput from './PasswordInput.jsx';

export default function Login({ mode, onDone, initialView = 'login', onBack }) {
  const dev = mode === 'dev';
  const [view, setView] = useState(initialView); // login | signup | sent | forgot | forgot-sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    if (view === 'signup') {
      if (!firstName.trim()) {
        setError('Please enter your first name.');
        return;
      }
      return run(() =>
        signUp(email, password, firstName, lastName).then(() => setView('sent'))
      );
    }
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
      {!dev && onBack && (
        <button type="button" className="login-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back
        </button>
      )}
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">EasyPort</div>

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
            {view === 'signup' && (
              <div className="name-row">
                <input
                  autoComplete="given-name"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
                <input
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            )}
            <input
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={view !== 'signup'}
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
          <div className="verify-actions">
            <button
              type="button"
              className="link-btn"
              disabled={busy}
              onClick={() => run(() => signIn(email, password).then(onDone))}
            >
              I've verified — try again
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={busy}
              onClick={() =>
                run(() =>
                  resendVerification(email, password).then((sent) => {
                    setNeedsVerify(false);
                    if (sent) setView('sent');
                    else setError('Already verified — press Sign in.');
                  })
                )
              }
            >
              Resend verification email
            </button>
          </div>
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

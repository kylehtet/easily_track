import { useState } from 'react';
import { passwordSignIn, verifyCode } from '../lib/auth.js';

export default function Login({ onDone }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [idToken, setIdToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setIdToken(await passwordSignIn(email, password));
      setStep(2);
    } catch (err) {
      const bad = /wrong-password|user-not-found|invalid-credential|invalid-email/.test(
        err.code || ''
      );
      setError(bad ? 'Wrong email or password.' : err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const doCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifyCode(idToken, code);
      onDone();
    } catch (err) {
      setError(err.message || 'Invalid code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={step === 1 ? doPassword : doCode}>
        <div className="login-title">The Ledger</div>

        {step === 1 ? (
          <>
            <div className="login-sub">Sign in</div>
            <input
              type="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : (
          <>
            <div className="login-sub">
              Enter the 6-digit code from your authenticator app
            </div>
            <input
              className="login-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </>
        )}

        {error && <div className="login-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : step === 1 ? 'Continue' : 'Verify'}
        </button>
      </form>
    </div>
  );
}

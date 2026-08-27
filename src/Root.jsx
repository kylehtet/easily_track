import { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './components/Login.jsx';
import { authRequired, sessionToken } from './lib/auth.js';

// Gate wrapper: shows <Login> when this deployment has auth configured and
// there's no session yet; otherwise renders the app. A stale/expired session
// is caught by apiFetch (401 → clears + reloads → lands back here).
export default function Root() {
  const [phase, setPhase] = useState('checking');
  const [mode, setMode] = useState(null);

  useEffect(() => {
    authRequired().then(({ configured, mode: m }) => {
      setMode(m);
      setPhase(!configured || sessionToken() ? 'open' : 'locked');
    });
  }, []);

  if (phase === 'checking') return null;
  if (phase === 'locked') {
    return <Login mode={mode} onDone={() => setPhase('open')} />;
  }
  return <App authMode={mode} />;
}

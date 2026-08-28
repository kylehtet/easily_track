import { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './components/Login.jsx';
import Landing from './components/Landing.jsx';
import { authRequired, sessionToken, currentAccount } from './lib/auth.js';

// Gate wrapper. Logged out, a first-time visitor gets <Landing> — the login
// form on its own told them nothing about what this is. Choosing "sign in" or
// "create account" there swaps in <Login> at the matching view. A stale session
// is caught by apiFetch (401 -> clears + reloads -> lands back here).
export default function Root() {
  const [phase, setPhase] = useState('checking');
  const [mode, setMode] = useState(null);
  const [authView, setAuthView] = useState(null); // null = still on the landing
  const [showLanding, setShowLanding] = useState(false); // "about" while signed in
  const [account, setAccount] = useState(() => currentAccount());

  useEffect(() => {
    authRequired().then(({ configured, mode: m }) => {
      setMode(m);
      setPhase(!configured || sessionToken() ? 'open' : 'locked');
    });
  }, []);

  if (phase === 'checking') return null;

  // Signed in, but the user clicked the wordmark to revisit the landing page.
  if (showLanding) {
    return <Landing onStart={() => setShowLanding(false)} signedIn />;
  }

  if (phase === 'locked') {
    // Dev mode is a single local password — no landing page worth showing.
    if (mode !== 'dev' && authView === null) {
      return <Landing onStart={setAuthView} />;
    }
    return (
      <Login
        mode={mode}
        initialView={authView || 'login'}
        onBack={() => setAuthView(null)}
        onDone={() => {
          setAccount(currentAccount());
          setPhase('open');
        }}
      />
    );
  }

  // Keyed by account: signing in as someone else rebuilds App from scratch
  // rather than reusing the previous account's state.
  const accountId = account?.uid || null;
  return (
    <App
      key={accountId || 'local'}
      authMode={mode}
      accountId={accountId}
      onShowLanding={() => setShowLanding(true)}
    />
  );
}

// Firebase is loaded lazily — only when someone reaches the login screen or
// opens the account menu — so the ~90KB SDK stays out of the main bundle for
// the common case (an already-authenticated client). The web config is safe to
// expose; real enforcement is the verified-email check plus the signed session
// token in server/auth.js.

export const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID
);

let authPromise = null;

export function getFirebaseAuth() {
  if (!firebaseConfigured) {
    return Promise.reject(new Error('Firebase is not configured on this build.'));
  }
  if (!authPromise) {
    authPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]).then(([{ initializeApp }, { getAuth }]) =>
      getAuth(
        initializeApp({
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
        })
      )
    );
  }
  return authPromise;
}

/** Resolves the signed-in Firebase user (waits out the initial auth-state load). */
export async function getCurrentUser() {
  const auth = await getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;
  const { onAuthStateChanged } = await import('firebase/auth');
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resolve(user);
    });
  });
}

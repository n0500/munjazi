import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logout as firebaseLogout } from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    const unsubDoc = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        setProfile(snap.exists() ? { uid: firebaseUser.uid, ...snap.data() } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubDoc;
  }, [firebaseUser]);

  async function logout() {
    await firebaseLogout();
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

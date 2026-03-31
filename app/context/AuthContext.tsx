import { createContext, useContext, useEffect, useMemo, useState, PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from './types';

type AuthValue = {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('auth');
      if (saved) {
        const parsed = JSON.parse(saved);
        setToken(parsed.token);
        setUser(parsed.user);
      }
      setHydrated(true);
    })();
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      hydrated,
      setAuth: async (t: string, u: User) => {
        setToken(t);
        setUser(u);
        await AsyncStorage.setItem('auth', JSON.stringify({ token: t, user: u }));
      },
      logout: async () => {
        setToken(null);
        setUser(null);
        await AsyncStorage.removeItem('auth');
      },
    }),
    [token, user, hydrated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext not found');
  return ctx;
}

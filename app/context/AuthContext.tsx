import { createContext, useContext, useEffect, useMemo, useState, PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from './types';
import { API_BASE } from '../config/api';

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

  /**
   * 滑动续期：启动时若 token 快过期了就静默换一张新的。
   *
   * token 固定 7 天且原来不会续期，所以天天用的人也会在第 8 天被踢去重新登录、
   * 再收一次短信（短信要花钱）。后端 /auth/refresh 只在剩余不足 3 天时才真的换，
   * 所以这个请求绝大多数时候是廉价的 no-op。
   *
   * 只在启动时跑一次（依赖 hydrated 而不是 token）：
   * 若依赖 token，续期成功后 token 变化会再次触发，形成刷新循环。
   * 401 在这里**故意不处理** —— token 已过期时各页面自己的 401 分支会登出并跳转，
   * 由一处负责就够，这里静默失败即可。
   */
  useEffect(() => {
    if (!hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled || !d?.renewed || !d?.token) return;
        setToken(d.token);
        // user 不变，沿用已有的那份，避免覆盖成 undefined
        const saved = await AsyncStorage.getItem('auth');
        const prevUser = saved ? JSON.parse(saved).user : user;
        await AsyncStorage.setItem('auth', JSON.stringify({ token: d.token, user: prevUser }));
      } catch {
        // 网络不通就算了，下次启动再试；不要因此打断使用
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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
        // 先告诉后端吊销这张 token，再清本地。
        // 不 await 失败也无所谓：后端 /auth/logout 是幂等的，且本地必须清掉 ——
        // 网络不通时也不能把用户卡在登录态里出不去。
        const current = token;
        setToken(null);
        setUser(null);
        await AsyncStorage.removeItem('auth');
        if (current) {
          try {
            await fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' },
            });
          } catch {
            // 后端没收到就等它自然过期，本地已经登出了
          }
        }
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

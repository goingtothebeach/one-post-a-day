import { createContext, useContext, useEffect, useMemo, useState, PropsWithChildren } from 'react';
import dayjs from 'dayjs';
import { useAuth } from './AuthContext';

const API_BASE = 'http://localhost:4000';

type LotteryState = {
  hasWonToday: boolean;
  postedToday: boolean;
  status: any;
  refresh: () => Promise<void>;
};

const LotteryContext = createContext<LotteryState | undefined>(undefined);

export function LotteryProvider({ children }: PropsWithChildren) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [hasWonToday, setHasWonToday] = useState(false);
  const [postedToday, setPostedToday] = useState(false);

  const loadStatus = async () => {
    if (!token || !user) {
      setStatus(null);
      setHasWonToday(false);
      setPostedToday(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/lottery/today/status`);
      if (res.ok) {
        const data = await res.json();
        const lot = data?.lottery;
        const today = dayjs().startOf('day');
        const won = lot && lot.draw_date && dayjs(lot.draw_date).startOf('day').isSame(today) && lot.winner_user_id === user?.id;
        setStatus(lot || null);
        setHasWonToday(Boolean(won));
      }
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/post/feed`);
      if (res.ok) {
        const data = await res.json();
        const today = dayjs().startOf('day');
        const posted = (data.posts || []).some((p: any) => dayjs(p.publish_date || p.publishDate).startOf('day').isSame(today) && p.author?.id === user?.id);
        setPostedToday(Boolean(posted));
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadStatus();
  }, [token, user]);

  const value = useMemo(
    () => ({ hasWonToday, postedToday, status, refresh: loadStatus }),
    [hasWonToday, postedToday, status]
  );

  return <LotteryContext.Provider value={value}>{children}</LotteryContext.Provider>;
}

export function useLottery() {
  const ctx = useContext(LotteryContext);
  if (!ctx) throw new Error('LotteryContext not found');
  return ctx;
}

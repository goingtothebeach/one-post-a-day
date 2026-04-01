import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppInsets } from '@/hooks/use-app-insets';
import { useMemo, useState, useEffect } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { DesignSystem } from '@/constants/design-system';

const { colors, spacing, borderRadius, shadows, typography } = DesignSystem;

const AVATAR_COLORS = ['#ff6b8e', '#a78bfa', '#34d399', '#60a5fa', '#f59e0b', '#f97316'];
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

type LotteryStatus = {
  lottery?: {
    drawDate: string;
    winnerUserId?: number | null;
    status: string;
  } | null;
  winner_deadline?: string | null;
};

type TicketUser = { id: number; phone: string; name?: string | null; avatar?: string | null };

type TicketItem = {
  id: number;
  user: TicketUser;
};

export default function ExploreScreen() {
  const { token, user, hydrated } = useAuth();
  const insets = useAppInsets();

  useEffect(() => {
    if (hydrated && !token) {
      router.replace('/');
    }
  }, [hydrated, token]);
  const [status, setStatus] = useState<LotteryStatus | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [postCountdown, setPostCountdown] = useState('');
  const [nextDrawDate, setNextDrawDate] = useState<string | null>(null);

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const loadStatus = async () => {
    setLoading(true);
    const res = await fetch(`${API_BASE}/lottery/today/status`);
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  };

  const loadTickets = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/lottery/tickets`, { headers });
    const data = await res.json();
    setTickets(data.tickets || []);
    setNextDrawDate(data.draw_date || null);
  };

  const hasWon = useMemo(() => {
    if (!status?.lottery) return false;
    const drawDay = dayjs(status.lottery.drawDate).startOf('day');
    const today = dayjs().startOf('day');
    return drawDay.isSame(today) && status.lottery.winnerUserId === user?.id;
  }, [status, user]);

  useEffect(() => {
    if (!hasWon || !status?.winner_deadline) {
      setPostCountdown('');
      return;
    }
    const deadline = dayjs(status.winner_deadline);
    const tick = () => {
      const diff = deadline.diff(dayjs(), 'hour');
      if (diff <= 0) {
        setPostCountdown('已截止');
        return;
      }
      setPostCountdown(`${diff}小时`);
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [hasWon, status?.winner_deadline]);

  const isNextDrawTomorrow = useMemo(() => {
    if (!nextDrawDate) return false;
    return dayjs(nextDrawDate).startOf('day').isAfter(dayjs().startOf('day'));
  }, [nextDrawDate]);

  const hasJoined = useMemo(() => {
    if (!token || !tickets.length) return false;
    return tickets.some(t => t.user.id === user?.id);
  }, [tickets, user, token]);

  const joinLottery = async () => {
    if (!token) {
      setError('请先登录后再报名');
      return;
    }
    setError('');
    setJoining(true);
    const res = await fetch(`${API_BASE}/lottery/join`, { method: 'POST', headers });
    if (res.status === 401) {
      setError('登录已失效，请重新登录');
      router.replace('/');
    } else if (!res.ok) {
      const data = await res.json();
      setError(data.detail || '报名失败，请稍后再试');
    } else {
      await loadStatus();
      await loadTickets();
    }
    setJoining(false);
  };

  const runDraw = async () => {
    await fetch(`${API_BASE}/lottery/run`, { method: 'POST' });
    await loadStatus();
    await loadTickets();
  };

  useEffect(() => {
    loadStatus();
    if (token) loadTickets();
  }, [token]);

  const goPost = () => {
    router.push('/');
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      
      {/* 页面标题 */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>🎫 今日抽签</ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          {isNextDrawTomorrow ? '已报名将参与明日18:00抽签' : '每晚18:00抽签，获胜者独家发帖'}
        </ThemedText>
      </View>

      {/* 抽签状态卡片 */}
      <View style={styles.ticketCard}>
        <LinearGradient
          colors={[colors.primary[50], colors.secondary[50]]}
          style={styles.ticketGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* 票据锯齿边框装饰 */}
          <View style={styles.ticketNotch} />
          
          <View style={styles.ticketContent}>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <ThemedText style={styles.statusBadgeText}>
                  {status?.lottery?.status === 'completed' ? '已完成' : '待抽签'}
                </ThemedText>
              </View>
              {hasWon && (
                <View style={styles.winnerBadge}>
                  <ThemedText style={styles.winnerBadgeText}>🏆 Winner</ThemedText>
                </View>
              )}
            </View>

            {status?.lottery?.winnerUserId ? (
              <View style={styles.winnerSection}>
                <ThemedText style={styles.winnerLabel}>中奖用户</ThemedText>
                <ThemedText style={styles.winnerName}>
                  {hasWon ? '恭喜你！' : `用户 #${status.lottery.winnerUserId}`}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.waitingSection}>
                <ThemedText style={styles.waitingEmoji}>⏳</ThemedText>
                <ThemedText style={styles.waitingText}>等待揭晓</ThemedText>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>抽签时间</ThemedText>
                <ThemedText style={styles.infoValue}>每晚 18:00</ThemedText>
              </View>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>参与人数</ThemedText>
                <ThemedText style={styles.infoValue}>{tickets.length} 人</ThemedText>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* 参与按钮 */}
      {token && !hasJoined && (
        <TouchableOpacity 
          style={styles.joinButton} 
          onPress={joinLottery}
          disabled={joining || hasWon}
        >
          <LinearGradient
            colors={hasWon ? [colors.neutral[300], colors.neutral[400]] : [colors.primary[500], colors.primary[600]]}
            style={styles.joinButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText style={styles.joinButtonText}>
              {joining ? '报名中...' : hasWon ? '已获得发帖权' : '🎟️ 立即报名'}
            </ThemedText>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {hasJoined && !hasWon && (
        <View style={styles.joinedBadge}>
          <ThemedText style={styles.joinedText}>
            {isNextDrawTomorrow ? '✓ 已报名明日抽签，祝你好运！' : '✓ 已报名，祝你好运！'}
          </ThemedText>
        </View>
      )}

      {hasWon && (
        <TouchableOpacity style={styles.goPostButton} onPress={goPost}>
          <LinearGradient
            colors={[colors.secondary[400], colors.secondary[500]]}
            style={styles.goPostGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText style={styles.goPostText}>✨ 去发帖</ThemedText>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {hasWon && postCountdown ? (
        <View style={styles.countdownBadge}>
          <ThemedText style={styles.countdownText}>
            {postCountdown === '已截止' ? '⏰ 发帖已截止' : `⏳ 发帖截止还剩 ${postCountdown}`}
          </ThemedText>
        </View>
      ) : null}

      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

      {/* 报名列表 */}
      {token && tickets.length > 0 && (
        <View style={styles.participantsCard}>
          <ThemedText style={styles.participantsTitle}>👥 报名列表</ThemedText>
          <View style={styles.participantsGrid}>
            {tickets.slice(0, 12).map((ticket) => (
              <View
                key={ticket.id}
                style={[
                  styles.participantAvatar,
                  ticket.user.id === user?.id && styles.participantAvatarHighlight
                ]}
              >
                {ticket.user.avatar ? (
                  <Image
                    source={{ uri: ticket.user.avatar }}
                    style={styles.participantImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.participantImage, { backgroundColor: avatarColor(ticket.user.id) }]} />
                )}
              </View>
            ))}
            {tickets.length > 12 && (
              <View style={styles.participantMore}>
                <ThemedText style={styles.participantMoreText}>+{tickets.length - 12}</ThemedText>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 调试功能 */}
      {__DEV__ && (
        <View style={styles.debugCard}>
          <ThemedText style={styles.debugTitle}>🛠️ 调试工具</ThemedText>
          <TouchableOpacity style={styles.debugButton} onPress={runDraw}>
            <ThemedText style={styles.debugButtonText}>手动触发抽签</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugButton} onPress={loadStatus}>
            <ThemedText style={styles.debugButtonText}>刷新状态</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugButton} onPress={loadTickets}>
            <ThemedText style={styles.debugButtonText}>刷新列表</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    padding: spacing[4],
  },

  // 页头
  header: {
    marginBottom: spacing[6],
  },
  headerTitle: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
  },

  // 票据卡片
  ticketCard: {
    marginBottom: spacing[5],
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  ticketGradient: {
    padding: spacing[6],
    position: 'relative',
  },
  ticketNotch: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background.secondary,
    transform: [{ translateY: -8 }, { translateX: -8 }],
  },
  ticketContent: {
    gap: spacing[4],
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  winnerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  winnerBadgeText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  winnerSection: {
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  winnerLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginBottom: spacing[2],
  },
  winnerName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
  },
  waitingSection: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  waitingEmoji: {
    fontSize: 48,
    marginBottom: spacing[2],
  },
  waitingText: {
    fontSize: typography.fontSize.lg,
    color: colors.neutral[600],
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[600],
    marginBottom: spacing[1],
  },
  infoValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
  },

  // 按钮
  joinButton: {
    marginBottom: spacing[4],
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  joinButtonGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  joinButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },
  joinedBadge: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  joinedText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#ffffff',
  },
  goPostButton: {
    marginBottom: spacing[4],
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  goPostGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  goPostText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },
  countdownBadge: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  countdownText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  errorText: {
    textAlign: 'center',
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[4],
  },

  // 参与者列表
  participantsCard: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  participantsTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[4],
  },
  participantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  participantAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  participantAvatarHighlight: {
    borderColor: colors.primary[500],
    ...shadows.colored.pink,
  },
  participantImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  participantMore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantMoreText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[600],
  },

  // 调试工具
  debugCard: {
    backgroundColor: colors.neutral[100],
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  debugTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[700],
    marginBottom: spacing[2],
  },
  debugButton: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  debugButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[700],
  },
});

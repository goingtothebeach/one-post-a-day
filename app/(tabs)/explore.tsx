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
import { formatCountdown } from '../lib/countdown';

const { colors, spacing, borderRadius, shadows, typography } = DesignSystem;

const AVATAR_COLORS = ['#ff6b8e', '#a78bfa', '#34d399', '#60a5fa', '#f59e0b', '#f97316'];
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

type LotteryStatus = {
  lottery?: {
    draw_date: string;
    winner_user_id?: number | null;
    status: string;
  } | null;
  winner_deadline?: string | null;
  winner?: { id: number; name?: string | null; avatar?: string | null } | null;
  is_winner?: boolean;
  can_post?: boolean;
};

// 后端不再下发 phone（报名列表所有登录用户可见，无需暴露手机号）
type TicketUser = { id: number; name?: string | null; avatar?: string | null };

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

  const headers = useMemo<Record<string, string>>(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
    [token]
  );

  const loadStatus = async () => {
    setLoading(true);
    try {
      // 必须带 token：is_winner / can_post 是后端按当前用户算的
      const res = await fetch(`${API_BASE}/lottery/today/status`, { headers });
      if (res.ok) setStatus(await res.json());
      else setError('抽签状态加载失败，请下拉重试');
    } catch (e: any) {
      setError(`网络错误: ${e?.message || '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  };

  const loadTickets = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/lottery/tickets`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setTickets(data.tickets || []);
      setNextDrawDate(data.draw_date || null);
    } catch (e) {
      // 报名列表拉不到不阻塞主流程，静默失败
    }
  };

  // 中签态直接用后端下发的 is_winner。
  // 不能再拿 draw_date 和「今天」比：/today/status 在 18:00 前返回的是【前一天】那轮，
  // 那样比较会让中签者在自己发帖窗口的 00:00-18:00 整段时间里「掉签」。
  const hasWon = Boolean(status?.is_winner);

  useEffect(() => {
    if (!hasWon || !status?.winner_deadline) {
      setPostCountdown('');
      return;
    }
    const tick = () => setPostCountdown(formatCountdown(status.winner_deadline) || '');
    tick();
    // 30 秒一跳：分钟级文案下 60 秒的间隔会明显滞后
    const timer = setInterval(tick, 30000);
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
    try {
      const res = await fetch(`${API_BASE}/lottery/join`, { method: 'POST', headers });
      if (res.status === 401) {
        setError('登录已失效，请重新登录');
        router.replace('/');
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`${res.status}: ${data.detail || '报名失败，请稍后再试'}`);
      } else {
        await loadStatus();
        await loadTickets();
      }
    } catch (e: any) {
      setError(`网络错误: ${e?.message || '请检查网络连接'}`);
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    loadStatus();
    if (token) loadTickets();
  }, [token]);

  // 轮次会在 18:00 翻转，页面可能一直挂着，定期重新拉状态和名单
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      loadStatus();
      loadTickets();
    }, 60000);
    return () => clearInterval(timer);
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
          {isNextDrawTomorrow ? '当前报名参与明晚18:00抽签' : '每晚18:00抽签，中签者独家发帖'}
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

            {status?.lottery?.winner_user_id ? (
              <View style={styles.winnerSection}>
                {hasWon && (
                  <ThemedText style={styles.winnerCongrats}>🎉 恭喜你中签！</ThemedText>
                )}
                <View style={styles.winnerCard}>
                  <View style={styles.winnerAvatarWrap}>
                    {status.winner?.avatar ? (
                      <Image source={{ uri: status.winner.avatar }} style={styles.winnerAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.winnerAvatar, styles.winnerAvatarPlaceholder]}>
                        <ThemedText style={styles.winnerAvatarInitial}>
                          {(status.winner?.name || '?')[0].toUpperCase()}
                        </ThemedText>
                      </View>
                    )}
                    <LinearGradient
                      colors={[colors.primary[400], colors.secondary[400]]}
                      style={styles.winnerAvatarRing}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    />
                  </View>
                  <View style={styles.winnerInfo}>
                    <ThemedText style={styles.winnerName}>
                      {status.winner?.name || `用户 #${status.lottery.winner_user_id}`}
                    </ThemedText>
                    <ThemedText style={styles.winnerId}>ID · {status.lottery.winner_user_id}</ThemedText>
                  </View>
                </View>
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
                {/* 这里必须用 nextDrawDate（下一轮），不能用 status.lottery.draw_date：
                    后者是「当前活跃轮次」，18:00 前指的是昨天那轮，
                    而右边的「参与人数」统计的是下一轮的报名名单——
                    两个数据来自不同轮次并列展示会让人误解。 */}
                <ThemedText style={styles.infoLabel}>下次抽签</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {nextDrawDate ? dayjs(nextDrawDate).format('MM/DD 18:00') : '每晚 18:00'}
                </ThemedText>
              </View>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>已报名人数</ThemedText>
                <ThemedText style={styles.infoValue}>{tickets.length} 人</ThemedText>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* 参与按钮。
          注意不要用 hasWon 禁用它：hasWon 说的是【当前轮次】中签，
          而这个按钮报名的是【下一轮】。本轮中签者当然可以报名下一轮，
          之前用 hasWon 一禁，赢家在自己的发帖窗口里就错过了次日抽签的报名。 */}
      {token && !hasJoined && (
        <TouchableOpacity
          style={styles.joinButton}
          onPress={joinLottery}
          disabled={joining}
        >
          <LinearGradient
            colors={[colors.primary[500], colors.primary[600]]}
            style={styles.joinButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ThemedText style={styles.joinButtonText}>
              {joining ? '报名中...' : isNextDrawTomorrow ? '🎟️ 报名明晚抽签' : '🎟️ 报名今晚抽签'}
            </ThemedText>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {hasJoined && (
        <View style={styles.joinedBadge}>
          <ThemedText style={styles.joinedText}>
            {isNextDrawTomorrow ? '✓ 已报名明晚抽签，祝你好运！' : '✓ 已报名今晚抽签，祝你好运！'}
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
                  <View style={[styles.participantPlaceholder, { backgroundColor: avatarColor(ticket.user.id) }]}>
                    <ThemedText style={styles.participantInitial}>
                      {(ticket.user.name || '?')[0].toUpperCase()}
                    </ThemedText>
                  </View>
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
          {/* 手动触发抽签的按钮已移除：/lottery/run 需要 X-Cron-Secret，
              裸调只会 403/503，而且线上不该存在任何前端可点的重抽入口。
              本地要测抽签请用：
              curl -X POST localhost:4000/lottery/run -H "X-Cron-Secret: $CRON_SECRET" */}
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
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  winnerCongrats: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  winnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    width: '100%',
  },
  winnerAvatarWrap: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  winnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    position: 'absolute',
    top: 2,
    left: 2,
  },
  winnerAvatarPlaceholder: {
    backgroundColor: colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  winnerAvatarInitial: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  winnerAvatarRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    opacity: 0.6,
  },
  winnerInfo: {
    flex: 1,
    gap: spacing[1],
  },
  winnerName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
  },
  winnerId: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
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
  participantPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantInitial: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
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

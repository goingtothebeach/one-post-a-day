import { router } from 'expo-router';
import { Image } from 'expo-image';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppInsets } from '@/hooks/use-app-insets';
import DS, { text as T } from '@/constants/design-system';
import { Masthead, Seal, SectionLabel } from '@/components/editorial';
import { Perforation, Rule } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { formatCountdown } from '../lib/countdown';

const { colors, spacing, radius, typography } = DS;

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

// 后端不下发 phone（报名列表所有登录用户可见，无需暴露手机号）
type TicketUser = { id: number; name?: string | null; avatar?: string | null };
type TicketItem = { id: number; user: TicketUser };

export default function ExploreScreen() {
  const { token, user, hydrated } = useAuth();
  const insets = useAppInsets();

  useEffect(() => {
    if (hydrated && !token) router.replace('/');
  }, [hydrated, token]);

  const [status, setStatus] = useState<LotteryStatus | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [postCountdown, setPostCountdown] = useState('');
  const [drawCountdown, setDrawCountdown] = useState('');
  const [nextDrawDate, setNextDrawDate] = useState<string | null>(null);

  const headers = useMemo<Record<string, string>>(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
    [token]
  );

  const loadStatus = async () => {
    try {
      // 必须带 token：is_winner / can_post 是后端按当前用户算的
      const res = await fetch(`${API_BASE}/lottery/today/status`, { headers });
      if (res.ok) {
        setStatus(await res.json());
        setError('');
      } else setError('抽签状态加载失败');
    } catch (e: any) {
      setError(`网络错误：${e?.message || '请检查连接'}`);
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
      // 只有真正拉到过名单才允许判定「未报名」，否则请求失败会误放出报名按钮
      setTicketsLoaded(true);
    } catch {
      // 保持上一次的名单，不要把 hasJoined 打回 false
    }
  };

  const refreshAll = () => {
    loadStatus();
    loadTickets();
  };

  useEffect(() => {
    if (!token) return;
    refreshAll();
    // 轮次会在 18:00 翻转，页面可能一直挂着，定期重新拉
    const timer = setInterval(refreshAll, 60000);
    return () => clearInterval(timer);
  }, [token]);

  // 中签态与可发帖态都用后端下发的布尔值。
  // 不能拿 draw_date 和「今天」比：/today/status 在 18:00 前返回的是【前一天】那轮，
  // 那样比较会让中签者在自己发帖窗口的 00:00-18:00 整段时间里「掉签」。
  const hasWon = Boolean(status?.is_winner);
  const canPost = Boolean(status?.can_post);

  useEffect(() => {
    if (!hasWon || !status?.winner_deadline) {
      setPostCountdown('');
      return;
    }
    const tick = () => setPostCountdown(formatCountdown(status.winner_deadline) || '');
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [hasWon, status?.winner_deadline]);

  // 距下一次 18:00 抽签的倒计时
  useEffect(() => {
    if (!nextDrawDate) {
      setDrawCountdown('');
      return;
    }
    const target = dayjs(nextDrawDate).hour(18).minute(0).second(0).toISOString();
    const tick = () => setDrawCountdown(formatCountdown(target) || '');
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [nextDrawDate]);

  const hasJoined = useMemo(() => {
    if (!ticketsLoaded) return false;
    return tickets.some((t) => t.user.id === user?.id);
  }, [tickets, user, ticketsLoaded]);

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
        setError(data.detail === 'already joined' ? '你已报名本轮' : data.detail || '报名失败，请稍后再试');
        refreshAll();
      } else {
        refreshAll();
      }
    } catch (e: any) {
      setError(`网络错误：${e?.message || '请检查连接'}`);
    } finally {
      setJoining(false);
    }
  };

  const lot = status?.lottery;
  const drawn = Boolean(lot?.winner_user_id);
  // 抽签已跑但无人报名 → status='empty'，要和「还没抽」区分开
  const emptyRound = lot?.status === 'empty' || (lot && !lot.winner_user_id && lot.status === 'completed');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="dark-content" />
      <Masthead subtitle="抽　签" />

      {/* ── 本期结果 ───────────────────────── */}
      <SectionLabel style={{ marginTop: spacing[7], marginBottom: spacing[4] }}>
        本期结果
      </SectionLabel>

      <View style={styles.resultBlock}>
        {drawn ? (
          <>
            <View style={styles.winnerRow}>
              {status?.winner?.avatar ? (
                <Image source={{ uri: status.winner.avatar }} style={styles.winnerAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.winnerAvatar, styles.winnerAvatarEmpty]}>
                  <Text style={styles.winnerInitial}>
                    {(status?.winner?.name || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: spacing[4] }}>
                <Text style={T.label}>{hasWon ? '本期执笔者 · 你' : '本期执笔者'}</Text>
                <Text style={styles.winnerName}>
                  {status?.winner?.name || `用户 #${lot?.winner_user_id}`}
                </Text>
                <Text style={T.caption}>ID · {lot?.winner_user_id}</Text>
              </View>
              {hasWon ? <Seal size={58} /> : null}
            </View>

            {hasWon ? (
              <>
                <Rule style={{ marginVertical: spacing[5] }} />
                {canPost ? (
                  <>
                    <Text style={T.body}>
                      {postCountdown && postCountdown !== '已截止'
                        ? `距发表截止还有 ${postCountdown}`
                        : '发表时间已过'}
                    </Text>
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => router.push('/')}
                    >
                      <Text style={styles.primaryBtnText}>去 发 表</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  // 已经发过了就不要再放一个点进去没用的按钮
                  <Text style={T.meta}>你已完成本期发表，感谢执笔。</Text>
                )}
              </>
            ) : null}
          </>
        ) : emptyRound ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateMark}>—</Text>
            <Text style={T.body}>本期无人报名</Text>
            <Text style={[T.caption, { marginTop: spacing[2], textAlign: 'center' }]}>
              没有人抽中，今天没有帖子。报名下一期吧。
            </Text>
          </View>
        ) : (
          <View style={styles.stateBox}>
            <Text style={styles.stateMark}>?</Text>
            <Text style={T.body}>尚未开签</Text>
            <Text style={[T.caption, { marginTop: spacing[2], textAlign: 'center' }]}>
              每晚十八时开签
            </Text>
          </View>
        )}
      </View>

      {/* ── 下期报名（纸车票） ───────────────── */}
      <SectionLabel style={{ marginTop: spacing[8], marginBottom: spacing[4] }}>
        下期报名
      </SectionLabel>

      <View style={styles.ticket}>
        <View style={styles.ticketStub}>
          <Text style={styles.stubLabel}>开签</Text>
          <Text style={styles.stubTime}>18:00</Text>
          <Text style={styles.stubDate}>
            {nextDrawDate ? dayjs(nextDrawDate).format('M/D') : '—'}
          </Text>
        </View>

        <View style={styles.ticketPerf}>
          <Perforation orientation="vertical" />
        </View>

        <View style={styles.ticketMain}>
          <Text style={T.label}>入场券</Text>
          <Text style={styles.ticketTitle}>
            {hasJoined ? '已领取' : '尚未领取'}
          </Text>
          <Text style={[T.meta, { marginTop: spacing[1] }]}>
            {drawCountdown && drawCountdown !== '已截止'
              ? `距开签 ${drawCountdown}`
              : '即将开签'}
          </Text>

          <Rule style={{ marginVertical: spacing[4] }} />

          <View style={styles.ticketMeta}>
            <View>
              <Text style={T.label}>报名人数</Text>
              <Text style={styles.ticketNum}>{ticketsLoaded ? tickets.length : '—'}</Text>
            </View>
            <View style={{ flex: 1 }} />
            {hasJoined ? (
              <View style={styles.joinedMark}>
                <Text style={styles.joinedMarkText}>已报名</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.joinBtn, joining && { opacity: 0.5 }]}
                onPress={joinLottery}
                disabled={joining}
              >
                <Text style={styles.joinBtnText}>{joining ? '领取中…' : '领取入场券'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* ── 报名名单 ─────────────────────────── */}
      {tickets.length > 0 ? (
        <>
          <SectionLabel style={{ marginTop: spacing[8], marginBottom: spacing[4] }}>
            候选名单
          </SectionLabel>
          <View style={styles.roster}>
            {tickets.map((t) => (
              <View key={t.id} style={styles.rosterItem}>
                {t.user.avatar ? (
                  <Image source={{ uri: t.user.avatar }} style={styles.rosterAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.rosterAvatar, styles.rosterAvatarEmpty]}>
                    <Text style={styles.rosterInitial}>
                      {(t.user.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.rosterName,
                    t.user.id === user?.id && { color: colors.seal.base, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {t.user.id === user?.id ? '你' : t.user.name || `#${t.user.id}`}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.colophon}>
        每晚 18:00 抽签　中签者获当日唯一发表权　有效至次日 18:00
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper.base },
  content: {
    paddingHorizontal: spacing[5],
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },

  resultBlock: {
    backgroundColor: colors.paper.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
    borderRadius: radius.sm,
    padding: spacing[5],
  },
  winnerRow: { flexDirection: 'row', alignItems: 'center' },
  winnerAvatar: { width: 52, height: 52, borderRadius: radius.full },
  winnerAvatarEmpty: {
    backgroundColor: colors.paper.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerInitial: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.title,
    color: colors.ink[500],
  },
  winnerName: {
    ...T.title,
    marginTop: 2,
    marginBottom: 1,
  },
  stateBox: { alignItems: 'center', paddingVertical: spacing[8] },
  stateMark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 30,
    color: colors.rule.strong,
    marginBottom: spacing[3],
  },

  /* 纸车票 */
  ticket: {
    flexDirection: 'row',
    backgroundColor: colors.paper.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule.strong,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  ticketStub: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[5],
    backgroundColor: colors.paper.sunken,
  },
  stubLabel: {
    ...T.label,
    fontSize: 10,
  },
  stubTime: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 19,
    color: colors.ink[900],
    marginTop: spacing[1],
  },
  stubDate: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.caption,
    color: colors.ink[500],
    marginTop: 2,
  },
  ticketPerf: { width: 1, backgroundColor: colors.rule.base, position: 'relative' },
  ticketMain: { flex: 1, padding: spacing[5] },
  ticketTitle: { ...T.title, marginTop: 2 },
  ticketMeta: { flexDirection: 'row', alignItems: 'flex-end' },
  ticketNum: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 24,
    color: colors.ink[900],
    marginTop: 2,
  },
  joinBtn: {
    backgroundColor: colors.ink[900],
    borderRadius: radius.sm,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  joinBtnText: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.semibold,
    color: colors.paper.raised,
    letterSpacing: 2,
  },
  joinedMark: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.seal.base,
    backgroundColor: colors.seal.tint,
    borderRadius: radius.sm,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  joinedMarkText: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.footnote,
    color: colors.seal.deep,
    letterSpacing: 1.5,
  },

  primaryBtn: {
    marginTop: spacing[4],
    backgroundColor: colors.ink[900],
    borderRadius: radius.sm,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
    color: colors.paper.raised,
    letterSpacing: 4,
  },

  /* 名单 */
  roster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[4],
  },
  rosterItem: { alignItems: 'center', width: 56 },
  rosterAvatar: { width: 40, height: 40, borderRadius: radius.full },
  rosterAvatarEmpty: {
    backgroundColor: colors.paper.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterInitial: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.body,
    color: colors.ink[500],
  },
  rosterName: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.micro,
    color: colors.ink[500],
    marginTop: spacing[2],
    maxWidth: 56,
    textAlign: 'center',
  },

  errorText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.state.error,
    marginTop: spacing[4],
  },
  colophon: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.caption,
    color: colors.ink[400],
    textAlign: 'center',
    marginTop: spacing[12],
    letterSpacing: 1,
    lineHeight: 20,
  },
});

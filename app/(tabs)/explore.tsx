import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
} from 'react-native';
import { useAppInsets } from '@/hooks/use-app-insets';
import DS, { text as T } from '@/constants/design-system';
import {
  GradientAvatar,
  GradientButton,
  Masthead,
  Seal,
  SealTag,
  SectionLabel,
} from '@/components/editorial';
import { GlassCard, PageGradient } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { formatCountdown } from '../lib/countdown';

const { colors, gradient, spacing, radius, typography, elevation } = DS;

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

/** 头像堆叠里最多露出几个，多出来的收进「+N」。 */
const AVATAR_STACK_MAX = 8;

/**
 * 纯展示层的拆分：把 formatCountdown 的中文串拆成「时 / 分」两段，
 * 好让倒计时用大数字卡片呈现（数字是这套语言的情绪点）。
 *
 * 注意不要改 app/lib/countdown.ts —— 那里的向下取整问题是踩过的坑（会谎报已截止）。
 * 这里只认它的输出格式（`3小时20分` / `3小时` / `40分钟`），认不出来就返回 null，
 * 由调用方整体显示原字符串，绝不自己重算时间。
 */
function splitCountdown(value: string): { value: string; unit: string }[] | null {
  if (!value) return null;
  const m = value.match(/^(?:(\d+)小时)?(?:(\d+)分钟?)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const parts: { value: string; unit: string }[] = [];
  if (m[1]) parts.push({ value: m[1], unit: '时' });
  parts.push({ value: m[2] ?? '0', unit: '分' });
  return parts;
}

/** 倒计时：几个独立的毛玻璃小卡片，每个是大号玫粉数字 + 下方单位。 */
function CountdownCards({ value }: { value: string }) {
  const parts = splitCountdown(value);
  if (!parts) {
    // 认不出格式（例如「已截止」）就原样展示，仍然用大字号
    return (
      <View style={styles.countRow}>
        <GlassCard tone="fillStrong" style={styles.countCardWide}>
          <Text style={styles.countFallback}>{value}</Text>
        </GlassCard>
      </View>
    );
  }
  return (
    <View style={styles.countRow}>
      {parts.map((p) => (
        <GlassCard key={p.unit} tone="fillStrong" style={styles.countCard}>
          <Text style={styles.countNum}>{p.value}</Text>
          <Text style={styles.countUnit}>{p.unit}</Text>
        </GlassCard>
      ))}
    </View>
  );
}

/** 信息行：半透明白圆角条，左侧浅色 label，右侧玫粉粗体值。 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/**
 * 头像。有图用图，没图落到渐变圆 + 首字母（GradientAvatar 不收 children，
 * 所以需要首字母的地方在这里自己拼同一套 gradient.avatar）。
 */
function Avatar({
  uri,
  name,
  size,
  style,
}: {
  uri?: string | null;
  name?: string | null;
  size: number;
  /** 用 ImageStyle：它同时能喂给 Image 和 LinearGradient（ViewStyle 的 overflow 更宽，反过来不行） */
  style?: ImageStyle;
}) {
  const shape = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, elevation.lift, style]}
        contentFit="cover"
      />
    );
  }
  return (
    <LinearGradient
      colors={gradient.avatar}
      start={gradient.diagonal.start}
      end={gradient.diagonal.end}
      style={[shape, styles.avatarFallback, elevation.lift, style]}
    >
      <Text style={[styles.avatarInitial, { fontSize: Math.round(size * 0.36) }]}>
        {(name || '?')[0].toUpperCase()}
      </Text>
    </LinearGradient>
  );
}

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

  const stackShown = tickets.slice(0, AVATAR_STACK_MAX);
  const stackOverflow = tickets.length - stackShown.length;

  return (
    <View style={styles.screen}>
      <PageGradient />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StatusBar barStyle="dark-content" />
        <Masthead heading="今晚，谁来发声？" subtitle="抽签 · 每晚十八时开签" />

        {/* ── 本期结果 ───────────────────────── */}
        <SectionLabel style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>
          本期结果
        </SectionLabel>

        <GlassCard style={styles.card}>
          {drawn ? (
            <>
              {/* Seal 现在是「今日唯一」渐变胶囊（不再是右侧方印），
                  所以从行内挪到卡片顶部当徽标用 */}
              {hasWon ? <Seal style={{ marginBottom: spacing[4] }} /> : null}

              <View style={styles.winnerRow}>
                <Avatar uri={status?.winner?.avatar} name={status?.winner?.name} size={58} />
                <View style={styles.winnerCol}>
                  <Text style={T.label}>{hasWon ? '今日聚光灯 · 你' : '今日聚光灯'}</Text>
                  <Text style={styles.winnerName} numberOfLines={1}>
                    {status?.winner?.name || `用户 #${lot?.winner_user_id}`}
                  </Text>
                  <Text style={T.caption}>ID · {lot?.winner_user_id}</Text>
                </View>
              </View>

              {hasWon ? (
                <>
                  {canPost ? (
                    <>
                      {postCountdown && postCountdown !== '已截止' ? (
                        <>
                          <Text style={[T.label, styles.countLabel]}>距发表截止还有</Text>
                          <CountdownCards value={postCountdown} />
                        </>
                      ) : (
                        <Text style={[T.body, { marginTop: spacing[4] }]}>发表时间已过</Text>
                      )}

                      {status?.winner_deadline ? (
                        <InfoRow
                          label="可发帖至"
                          value={dayjs(status.winner_deadline).format('M月D日 HH:mm')}
                        />
                      ) : null}

                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => router.push('/')}
                        style={styles.ctaWrap}
                      >
                        <GradientButton label="去 发 表" rich />
                      </TouchableOpacity>
                    </>
                  ) : (
                    // 已经发过了就不要再放一个点进去没用的按钮
                    <Text style={[T.meta, { marginTop: spacing[3] }]}>
                      你已完成今天的发表。
                    </Text>
                  )}
                </>
              ) : null}
            </>
          ) : emptyRound ? (
            <View style={styles.stateBox}>
              <View style={styles.stateMarkWrap}>
                <Text style={styles.stateMark}>—</Text>
              </View>
              <Text style={T.title}>本期无人报名</Text>
              <Text style={[T.caption, styles.stateHint]}>
                没有人抽中，今天没有帖子。报名下一期吧。
              </Text>
            </View>
          ) : (
            <View style={styles.stateBox}>
              <View style={styles.stateMarkWrap}>
                <Text style={styles.stateMark}>?</Text>
              </View>
              <Text style={T.title}>尚未开签</Text>
              <Text style={[T.caption, styles.stateHint]}>每晚十八时开签</Text>
            </View>
          )}
        </GlassCard>

        {/* ── 下期报名 ─────────────────────────
            上一版这里是「纸车票 + 撕裂黛孔」，新语言里改成一张毛玻璃卡片：
            倒计时数字卡 + 信息行 + 渐变主 CTA。 */}
        <SectionLabel style={{ marginTop: spacing[7], marginBottom: spacing[3] }}>
          下期报名
        </SectionLabel>

        <GlassCard style={styles.card}>
          <Text style={[T.label, { marginBottom: spacing[3] }]}>距开签</Text>
          {drawCountdown && drawCountdown !== '已截止' ? (
            <CountdownCards value={drawCountdown} />
          ) : (
            <CountdownCards value="即将开签" />
          )}

          <InfoRow
            label="开签时间"
            value={`18:00 · ${nextDrawDate ? dayjs(nextDrawDate).format('M/D') : '—'}`}
          />
          <InfoRow label="报名人数" value={ticketsLoaded ? `${tickets.length} 人` : '—'} />
          {hasJoined && tickets.length > 0 ? (
            <InfoRow label="中签概率" value={`1 / ${tickets.length}`} />
          ) : null}
          <InfoRow label="入场券" value={hasJoined ? '已领取' : '尚未领取'} />

          {hasJoined ? (
            <View style={styles.joinedRow}>
              <SealTag>已报名</SealTag>
              <Text style={[T.caption, { flex: 1 }]}>等今晚 18:00 开签就好</Text>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={joinLottery}
              disabled={joining}
              style={styles.ctaWrap}
            >
              <GradientButton
                label={joining ? '领取中…' : '领取入场券'}
                rich
                disabled={joining}
              />
            </TouchableOpacity>
          )}
        </GlassCard>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── 报名名单 ─────────────────────────── */}
        {tickets.length > 0 ? (
          <>
            <SectionLabel style={{ marginTop: spacing[7], marginBottom: spacing[3] }}>
              候选名单
            </SectionLabel>
            <GlassCard style={styles.card}>
              <View style={styles.stack}>
                {stackShown.map((t, i) =>
                  t.user.avatar ? (
                    <Avatar
                      key={t.id}
                      uri={t.user.avatar}
                      name={t.user.name}
                      size={42}
                      style={i === 0 ? undefined : styles.stackOverlap}
                    />
                  ) : (
                    <GradientAvatar
                      key={t.id}
                      size={42}
                      style={i === 0 ? undefined : styles.stackOverlap}
                    />
                  )
                )}
                {stackOverflow > 0 ? (
                  <View style={[styles.stackMore, styles.stackOverlap]}>
                    <Text style={styles.stackMoreText}>+{stackOverflow}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.rosterNames} numberOfLines={3}>
                {tickets.map((t, i) => (
                  <Text
                    key={t.id}
                    style={t.user.id === user?.id ? styles.rosterNameSelf : undefined}
                  >
                    {(t.user.id === user?.id ? '你' : t.user.name || `#${t.user.id}`) +
                      (i < tickets.length - 1 ? '　·　' : '')}
                  </Text>
                ))}
              </Text>
            </GlassCard>
          </>
        ) : null}

        <Text style={styles.colophon}>
          每晚 18:00 抽签　中签者获当日唯一发表权　有效至次日 18:00
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 背景交给 PageGradient；paper.base 只做兜底，渐变铺在它上面
  screen: { flex: 1, backgroundColor: colors.paper.base },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: {
    paddingHorizontal: spacing[5],
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },

  /* 卡片：毛玻璃 + 大圆角，内边距统一 */
  card: { padding: spacing[5] },

  /* 中签者 */
  winnerRow: { flexDirection: 'row', alignItems: 'center' },
  winnerCol: { flex: 1, marginLeft: spacing[4] },
  winnerName: {
    ...T.title,
    marginTop: 3,
    marginBottom: 2,
  },

  /* 倒计时：一排独立的小卡片，数字是情绪点 */
  countLabel: { marginTop: spacing[5] },
  countRow: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  countCard: {
    width: 72,
    borderRadius: 19,
    paddingVertical: spacing[3],
    alignItems: 'center',
    ...elevation.lift,
  },
  countCardWide: {
    borderRadius: 19,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    ...elevation.lift,
  },
  // 注意：T.numeral / T.numeralSm 的 fontVariant 是 readonly 元组，直接展开进
  // StyleSheet.create 会让整张 styles 表的类型退化成联合类型（全文件报 TS2769）。
  // 展开后就地覆写成可变数组即可。
  countNum: {
    ...T.numeral,
    fontVariant: ['tabular-nums' as const],
    lineHeight: 36,
  },
  countUnit: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    color: colors.ink[400],
    marginTop: 2,
  },
  // 认不出格式时走这里，内容是中文状态词（「已截止」「即将开签」）而不是数字。
  // 所以不套 T.numeral 的玫粉大数字样式 —— 数字才是情绪点，中文状态词用标题样式就够，
  // 否则一张「数字卡」里塞四个中文字会很怪。
  countFallback: {
    ...T.title,
    color: colors.seal.deep,
    textAlign: 'center',
    lineHeight: 30,
  },

  /* 信息行 */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.glass.fillSoft,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginTop: spacing[3],
  },
  infoLabel: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.ink[400],
  },
  infoValue: {
    ...T.numeralSm,
    fontVariant: ['tabular-nums' as const],
    marginLeft: spacing[3],
  },

  /* 主 CTA：渐变胶囊 + 粉色发光（GradientButton 自带），外面只负责触摸与间距 */
  ctaWrap: { marginTop: spacing[5] },

  joinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[5],
  },

  /* 空态 / 未开签 */
  stateBox: { alignItems: 'center', paddingVertical: spacing[6] },
  stateMarkWrap: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    backgroundColor: colors.seal.tint,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  stateMark: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: 26,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
  },
  stateHint: { marginTop: spacing[2], textAlign: 'center' },

  /* 头像 */
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: {
    fontFamily: typography.fontFamily.rounded,
    fontWeight: typography.weight.heavy,
    color: '#FFFFFF',
  },

  /* 报名者头像堆叠 */
  stack: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  stackOverlap: { marginLeft: -11 },
  stackMore: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.glass.fillStrong,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.lift,
  },
  stackMoreText: {
    fontFamily: typography.fontFamily.numeral,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
  },
  rosterNames: {
    ...T.meta,
    marginTop: spacing[4],
    lineHeight: 22,
  },
  rosterNameSelf: {
    color: colors.seal.base,
    fontWeight: typography.weight.bold,
  },

  errorBox: {
    marginTop: spacing[4],
    backgroundColor: colors.seal.tint,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  errorText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.state.error,
  },
  colophon: {
    ...T.caption,
    textAlign: 'center',
    marginTop: spacing[10],
    letterSpacing: 0.6,
    lineHeight: 21,
  },
});

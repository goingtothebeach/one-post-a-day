import { Bookmark, Heart, ImagePlus, MoreHorizontal } from 'lucide-react-native';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAppInsets } from '@/hooks/use-app-insets';
import DS, { noOutline, text as T } from '@/constants/design-system';
import { Masthead, SealTag, SectionLabel, Seal } from '@/components/editorial';
import { Rule } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { formatCountdown } from '../lib/countdown';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, spacing, radius, typography } = DS;

type FeedItem = {
  id: number;
  title: string;
  content: string;
  mediaUrl?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  publishDate: string;
  // feed 是公开接口，后端不下发 phone
  author?: { id: number; name?: string | null; avatar?: string | null } | null;
  images?: { url: string; width?: number; height?: number; sort?: number }[];
  likes_count?: number;
  favorites_count?: number;
  is_liked?: boolean;
  is_favorited?: boolean;
};

type LotteryStatus = {
  draw_date: string;
  winner_user_id?: number | null;
  status: string;
} | null;

type LotteryResponse = {
  lottery: LotteryStatus;
  winner_deadline?: string | null;
  is_winner?: boolean;
  can_post?: boolean;
};

export default function HomeScreen() {
  const { token, user, hydrated, setAuth, logout } = useAuth();
  const insets = useAppInsets();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaWidth, setMediaWidth] = useState<number | undefined>(undefined);
  const [mediaHeight, setMediaHeight] = useState<number | undefined>(undefined);
  const [images, setImages] = useState<{ url: string; width?: number; height?: number; sort?: number }[]>([]);
  const [activeMap, setActiveMap] = useState<Record<number, number>>({});
  const [lottery, setLottery] = useState<LotteryStatus>(null);
  const [winnerDeadline, setWinnerDeadline] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [postCountdown, setPostCountdown] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedError, setFeedError] = useState('');

  // 登录相关状态
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const headers = useMemo<Record<string, string>>(
    () =>
      token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : ({ 'Content-Type': 'application/json' } as Record<string, string>),
    [token]
  );
  const authHeaders = useMemo<Record<string, string>>(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
    [token]
  );

  const loadFeed = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/post/feed`, { headers: authHeaders });
      if (res.status === 401) {
        await logout();
        router.replace('/');
        return;
      }
      if (!res.ok) {
        setFeedError('内容加载失败，下拉重试');
        return;
      }
      const data = await res.json();
      const normalized = (data.posts || []).map((p: any) => ({
        ...p,
        mediaUrl: p.mediaUrl || p.media_url,
        mediaWidth: p.media_width,
        mediaHeight: p.media_height,
        images: (p.images || []).map((img: any) => ({
          url: img.url,
          width: img.width,
          height: img.height,
          sort: img.sort,
        })),
        publishDate: p.publishDate || p.publish_date,
        author: p.author || p.user || { name: '' },
        likes_count: p.likes_count || 0,
        favorites_count: p.favorites_count || 0,
        is_liked: p.is_liked || false,
        is_favorited: p.is_favorited || false,
      }));
      setFeed(normalized);
      setFeedError('');
    } catch (e: any) {
      setFeedError(`网络错误：${e?.message || '请检查连接'}`);
    } finally {
      // finally 保证异常时也解除刷新态，否则下拉圈会一直转
      setRefreshing(false);
    }
  };

  const loadLottery = async () => {
    try {
      const res = await fetch(`${API_BASE}/lottery/today/status`, { headers: authHeaders });
      if (res.status === 401) {
        await logout();
        router.replace('/');
        return;
      }
      if (!res.ok) return;
      const data: LotteryResponse = await res.json();
      setLottery(data?.lottery || null);
      setWinnerDeadline(data?.winner_deadline || null);
      setCanPost(Boolean(data?.can_post));
    } catch {
      // 状态拉取失败不打断浏览，下一次 tick 会重试
    }
  };

  const refreshAll = () => {
    loadFeed();
    loadLottery();
  };

  useEffect(() => {
    if (!hydrated) return;
    refreshAll();
  }, [hydrated, token]);

  // can_post / winner_deadline 都是后端按当前时刻算的，会随 18:00 边界翻转。
  // 页面在浏览器里可能挂很久（放着过夜），必须定期重新拉状态【和】内容，
  // 否则会停留在上一轮：过了截止还显示可发，或当日帖子始终不出现。
  useEffect(() => {
    if (!hydrated) return;
    const timer = setInterval(refreshAll, 60000);
    return () => clearInterval(timer);
  }, [hydrated, token]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const validatePhone = (v: string) => /^1[3-9]\d{9}$/.test(v);

  const requestOtp = async () => {
    setLoginError('');
    if (!phone) return setLoginError('请输入手机号');
    if (!validatePhone(phone)) return setLoginError('请输入正确的手机号格式');
    if (countdown > 0) return;

    setSendingCode(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) setCountdown(60);
      else {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.detail || '发送失败，请稍后重试');
      }
    } catch {
      setLoginError('网络错误，请检查连接');
    } finally {
      setSendingCode(false);
    }
  };

  const verifyOtp = async () => {
    setLoginError('');
    if (!phone) return setLoginError('请输入手机号');
    if (!code) return setLoginError('请输入验证码');
    if (code.length !== 6) return setLoginError('验证码必须是 6 位数字');

    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) setAuth(data.token, data.user);
      else setLoginError(data.detail || '登录失败，请重试');
    } catch {
      setLoginError('网络错误，请检查连接');
    } finally {
      setLoggingIn(false);
    }
  };

  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 640) - spacing[5] * 2;

  const createPost = async () => {
    if (!token) return;
    if (publishing) return; // 防连点：一天只能有一帖，重复提交会撞后端唯一约束
    if (!title.trim() || !content.trim()) {
      Alert.alert('无法发布', '标题和内容都不能为空');
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`${API_BASE}/post`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, content, mediaUrl, mediaWidth, mediaHeight, images }),
      });
      if (res.ok) {
        setTitle('');
        setContent('');
        setMediaUrl('');
        setMediaWidth(undefined);
        setMediaHeight(undefined);
        setImages([]);
        await loadFeed();
        await loadLottery(); // 刷新 can_post，发完就收起表单
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('发布失败', `${res.status}: ${data.detail || '未知错误'}`);
      }
    } catch (e: any) {
      Alert.alert('发布失败', e?.message || '网络错误');
    } finally {
      setPublishing(false);
    }
  };

  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (res.canceled || !res.assets?.length) return;
    setUploading(true);
    try {
      const sts = await getSts(token || undefined);
      const uploads = await Promise.all(
        res.assets.slice(0, 6).map(async (asset, idx) => {
          const key = buildObjectKey(sts.key_prefix + `-${idx}`, asset.fileName || 'image');
          const isWeb = Platform.OS === 'web';
          const blob = isWeb
            ? await (await fetch(asset.uri)).blob()
            : { uri: asset.uri, type: 'image/jpeg', name: key.split('/').pop() || 'image.jpg' };
          const url = await uploadToOss(sts, key, blob as any);
          return { url, width: asset.width, height: asset.height, sort: idx };
        })
      );
      setMediaUrl(uploads[0]?.url || '');
      setMediaWidth(uploads[0]?.width);
      setMediaHeight(uploads[0]?.height);
      setImages(uploads);
    } catch (e: any) {
      setMediaUrl('');
      setMediaWidth(undefined);
      setMediaHeight(undefined);
      setImages([]);
      Alert.alert('图片上传失败', e?.message || '请重试');
    } finally {
      setUploading(false);
    }
  };

  // 能否发帖完全由后端 can_post 决定（它同时校验了中签、窗口未过、当轮还没人发过）。
  // 前端不要再自己算，否则两个 tab 会给出互相矛盾的结论。
  const canPostToday = canPost;

  useEffect(() => {
    if (!canPostToday || !winnerDeadline) {
      setPostCountdown('');
      return;
    }
    const tick = () => setPostCountdown(formatCountdown(winnerDeadline) || '');
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [canPostToday, winnerDeadline]);

  const todayDrawDate = lottery?.draw_date;
  const isTodayPost = (p: FeedItem) =>
    Boolean(todayDrawDate) &&
    dayjs(p.publishDate).startOf('day').isSame(dayjs(todayDrawDate).startOf('day'));

  if (!hydrated) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={T.dateline}>正在取回今日刊物…</Text>
      </View>
    );
  }

  /* ---------------------------- 登录：一封邀请函 ---------------------------- */
  if (!token) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar barStyle="dark-content" />
        <ScrollView
          contentContainerStyle={[styles.loginScroll, { paddingTop: insets.top + spacing[16] }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.loginInner}>
            <Text style={[T.masthead, { textAlign: 'center' }]}>ONE POST A DAY</Text>
            <View style={styles.loginRuleWrap}>
              <Rule tone="strong" />
            </View>
            <Text style={styles.loginLede}>
              每日仅一人执笔
            </Text>
            <Text style={[T.meta, styles.loginSub]}>
              每晚 18:00 抽签，中签者获得当日唯一的发表权
            </Text>

            <View style={styles.loginForm}>
              <Text style={T.label}>手机号</Text>
              <TextInput
                placeholder="11 位手机号"
                placeholderTextColor={colors.ink[400]}
                style={styles.fieldInput}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setLoginError('');
                }}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <Rule />

              <Text style={[T.label, { marginTop: spacing[5] }]}>验证码</Text>
              <View style={styles.codeRow}>
                <TextInput
                  placeholder="6 位验证码"
                  placeholderTextColor={colors.ink[400]}
                  style={[styles.fieldInput, { flex: 1 }]}
                  value={code}
                  onChangeText={(t) => {
                    setCode(t);
                    setLoginError('');
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity
                  onPress={requestOtp}
                  disabled={countdown > 0 || sendingCode || !phone}
                  style={styles.codeBtn}
                >
                  <Text
                    style={[
                      styles.codeBtnText,
                      (countdown > 0 || sendingCode || !phone) && { color: colors.ink[300] },
                    ]}
                  >
                    {sendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Rule />

              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryBtn, loggingIn && styles.primaryBtnDisabled]}
                onPress={verifyOtp}
                disabled={loggingIn}
              >
                <Text style={styles.primaryBtnText}>{loggingIn ? '登录中…' : '进 入'}</Text>
              </TouchableOpacity>

              <Text style={[T.caption, { textAlign: 'center', marginTop: spacing[4] }]}>
                登录即代表同意用户协议与隐私政策
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ------------------------------- 主界面 ------------------------------- */
  const renderPost = ({ item }: { item: FeedItem }) => {
    const today = isTodayPost(item);
    const canDelete = user?.id === (item.author?.id ?? (item as any).author_id);
    const imagesSorted = (item.images || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const activeIdx = activeMap[item.id] ?? 0;

    return (
      <View style={styles.article}>
        {today ? (
          <View style={styles.todayBadgeRow}>
            <SealTag>今日唯一发表</SealTag>
          </View>
        ) : null}

        <Text style={styles.articleTitle}>{item.title}</Text>

        <View style={styles.bylineRow}>
          {item.author?.avatar ? (
            <Image source={{ uri: item.author.avatar }} style={styles.byAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.byAvatar, styles.byAvatarEmpty]}>
              <Text style={styles.byAvatarInitial}>
                {(item.author?.name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.byName}>{item.author?.name || '匿名'}</Text>
          <Text style={styles.byDot}>·</Text>
          <Text style={T.meta}>{dayjs(item.publishDate).format('M月D日')}</Text>
          <View style={{ flex: 1 }} />
          {canDelete ? (
            <TouchableOpacity
              hitSlop={10}
              onPress={() => {
                const doDelete = () =>
                  fetch(`${API_BASE}/post/${item.id}`, {
                    method: 'DELETE',
                    headers: authHeaders,
                  }).then(refreshAll);
                if (Platform.OS === 'ios') {
                  ActionSheetIOS.showActionSheetWithOptions(
                    { options: ['取消', '删除'], destructiveButtonIndex: 1, cancelButtonIndex: 0 },
                    (i) => i === 1 && doDelete()
                  );
                } else {
                  Alert.alert('删除这篇？', '删除后无法恢复。', [
                    { text: '取消', style: 'cancel' },
                    { text: '删除', style: 'destructive', onPress: doDelete },
                  ]);
                }
              }}
            >
              <MoreHorizontal size={18} color={colors.ink[400]} strokeWidth={1.75} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.articleBody}>{item.content}</Text>

        {imagesSorted.length > 0 ? (
          <View style={styles.plateWrap}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / contentWidth);
                setActiveMap((prev) => ({ ...prev, [item.id]: idx }));
              }}
              scrollEventThrottle={16}
            >
              {imagesSorted.map((img, i) => (
                <TouchableOpacity
                  key={`${item.id}-${i}`}
                  activeOpacity={0.94}
                  onPress={() => router.push({ pathname: '/image', params: { uri: img.url } })}
                >
                  <Image
                    source={{ uri: img.url }}
                    style={{
                      width: contentWidth,
                      aspectRatio: img.width && img.height ? img.width / img.height : 4 / 5,
                      backgroundColor: colors.paper.sunken,
                    }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
            {imagesSorted.length > 1 ? (
              <Text style={styles.plateCounter}>
                {activeIdx + 1} / {imagesSorted.length}
              </Text>
            ) : null}
          </View>
        ) : item.mediaUrl ? (
          <TouchableOpacity
            activeOpacity={0.94}
            style={styles.plateWrap}
            onPress={() => router.push({ pathname: '/image', params: { uri: item.mediaUrl } })}
          >
            <Image
              source={{ uri: item.mediaUrl }}
              style={{
                width: contentWidth,
                aspectRatio:
                  item.mediaWidth && item.mediaHeight ? item.mediaWidth / item.mediaHeight : 4 / 5,
                backgroundColor: colors.paper.sunken,
              }}
              contentFit="cover"
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.action}
            onPress={async () => {
              try {
                await fetch(`${API_BASE}/post/${item.id}/like`, { method: 'POST', headers });
                await loadFeed();
              } catch {}
            }}
          >
            <Heart
              size={17}
              strokeWidth={1.75}
              color={item.is_liked ? colors.ink[900] : colors.ink[400]}
              fill={item.is_liked ? colors.ink[900] : 'transparent'}
            />
            <Text style={[styles.actionNum, item.is_liked && { color: colors.ink[900] }]}>
              {item.likes_count || 0}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.action}
            onPress={async () => {
              try {
                await fetch(`${API_BASE}/post/${item.id}/favorite`, { method: 'POST', headers });
                await loadFeed();
              } catch {}
            }}
          >
            <Bookmark
              size={17}
              strokeWidth={1.75}
              color={item.is_favorited ? colors.ink[900] : colors.ink[400]}
              fill={item.is_favorited ? colors.ink[900] : 'transparent'}
            />
            <Text style={[styles.actionNum, item.is_favorited && { color: colors.ink[900] }]}>
              {item.favorites_count || 0}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const composer = canPostToday ? (
    <View style={styles.composer}>
      <View style={styles.composerHead}>
        <Seal size={54} />
        <View style={{ flex: 1, marginLeft: spacing[4] }}>
          <Text style={T.title}>今日由你执笔</Text>
          <Text style={[T.meta, { marginTop: 2 }]}>
            {postCountdown === '已截止'
              ? '发表时间已过'
              : postCountdown
              ? `距截止还有 ${postCountdown}`
              : '　'}
          </Text>
        </View>
      </View>

      <Rule style={{ marginVertical: spacing[4] }} />

      <TextInput
        placeholder="标题"
        placeholderTextColor={colors.ink[400]}
        style={styles.composerTitle}
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <TextInput
        placeholder="今天想说的话…"
        placeholderTextColor={colors.ink[400]}
        style={styles.composerBody}
        multiline
        value={content}
        onChangeText={setContent}
        maxLength={2000}
      />

      <View style={styles.composerFoot}>
        <TouchableOpacity style={styles.attachBtn} onPress={pickImages} disabled={uploading}>
          <ImagePlus size={16} color={colors.ink[500]} strokeWidth={1.75} />
          <Text style={styles.attachText}>
            {uploading ? '上传中…' : images.length ? `已选 ${images.length} 张` : '配图（最多 6 张）'}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={T.caption}>{content.length}/2000</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, publishing && styles.primaryBtnDisabled]}
        onPress={createPost}
        disabled={publishing}
      >
        <Text style={styles.primaryBtnText}>{publishing ? '发表中…' : '发 表'}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={feed}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderPost}
        ItemSeparatorComponent={() => <Rule tone="base" style={{ marginVertical: spacing[7] }} />}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={colors.ink[400]}
          />
        }
        ListHeaderComponent={
          <View>
            <Masthead />
            {composer}
            {feedError ? <Text style={styles.errorText}>{feedError}</Text> : null}
            {feed.length > 0 ? (
              <SectionLabel style={{ marginTop: spacing[7], marginBottom: spacing[5] }}>
                往期
              </SectionLabel>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <View style={styles.empty}>
              <Text style={styles.emptyMark}>—</Text>
              <Text style={[T.body, { textAlign: 'center' }]}>今日还没有人执笔</Text>
              <Text style={[T.caption, { textAlign: 'center', marginTop: spacing[2] }]}>
                每晚十八时抽签，中签者可发表当日唯一一篇
              </Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper.base },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: spacing[5],
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },

  /* 登录 */
  loginScroll: { flexGrow: 1, paddingHorizontal: spacing[6], paddingBottom: spacing[10] },
  loginInner: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  loginRuleWrap: { marginTop: spacing[4], marginBottom: spacing[8] },
  loginLede: {
    ...T.display,
    textAlign: 'center',
    letterSpacing: 2,
  },
  loginSub: { textAlign: 'center', marginTop: spacing[3], lineHeight: 22 },
  loginForm: { marginTop: spacing[12] },
  fieldInput: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.bodyLg,
    color: colors.ink[900],
    paddingVertical: spacing[3],
    ...noOutline,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  codeBtn: { paddingVertical: spacing[3], paddingLeft: spacing[4] },
  codeBtnText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.seal.base,
    fontWeight: typography.weight.medium,
  },

  primaryBtn: {
    marginTop: spacing[8],
    backgroundColor: colors.ink[900],
    borderRadius: radius.sm,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.ink[300] },
  primaryBtnText: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.semibold,
    color: colors.paper.raised,
    letterSpacing: 4,
  },
  errorText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.state.error,
    marginTop: spacing[4],
    textAlign: 'center',
  },

  /* 发表器 */
  composer: {
    marginTop: spacing[6],
    backgroundColor: colors.paper.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
    borderRadius: radius.sm,
    padding: spacing[5],
  },
  composerHead: { flexDirection: 'row', alignItems: 'center' },
  composerTitle: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.title,
    fontWeight: typography.weight.semibold,
    color: colors.ink[900],
    paddingVertical: spacing[2],
    ...noOutline,
  },
  composerBody: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.body,
    lineHeight: typography.size.body * 1.7,
    color: colors.ink[700],
    minHeight: 96,
    paddingVertical: spacing[2],
    textAlignVertical: 'top',
    ...noOutline,
  },
  composerFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[3],
  },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  attachText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.ink[500],
  },

  /* 文章 */
  article: {},
  todayBadgeRow: { flexDirection: 'row', marginBottom: spacing[3] },
  articleTitle: {
    ...T.headline,
    lineHeight: typography.size.headline * 1.3,
  },
  bylineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[3],
    gap: spacing[2],
  },
  byAvatar: { width: 22, height: 22, borderRadius: radius.full },
  byAvatarEmpty: {
    backgroundColor: colors.paper.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  byAvatarInitial: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 11,
    color: colors.ink[500],
  },
  byName: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.medium,
    color: colors.ink[700],
  },
  byDot: { color: colors.ink[300] },
  articleBody: {
    ...T.bodyRelaxed,
    marginTop: spacing[4],
  },
  plateWrap: {
    marginTop: spacing[5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
  },
  plateCounter: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.micro,
    color: colors.ink[400],
    textAlign: 'center',
    paddingVertical: spacing[2],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[7],
    marginTop: spacing[5],
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  actionNum: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.footnote,
    color: colors.ink[500],
  },

  empty: { paddingVertical: spacing[16], alignItems: 'center' },
  emptyMark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 32,
    color: colors.rule.strong,
    marginBottom: spacing[4],
  },
});

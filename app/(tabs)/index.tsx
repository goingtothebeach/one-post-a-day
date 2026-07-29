// 按需导入：Metro 不做 tree-shaking，整包导入会把 1695 个图标全打进 bundle
import Bookmark from 'lucide-react-native/dist/esm/icons/bookmark.js';
import Heart from 'lucide-react-native/dist/esm/icons/heart.js';
import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus.js';
// MoreHorizontal 在 v1 里的真实文件名是 ellipsis
import MoreHorizontal from 'lucide-react-native/dist/esm/icons/ellipsis.js';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
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
import {
  GradientAvatar,
  GradientButton,
  Masthead,
  Seal,
  SectionLabel,
} from '@/components/editorial';
import { GlassCard, PageGradient } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { formatCountdown } from '../lib/countdown';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, gradient, spacing, radius, typography } = DS;

/** 卡片外圈留白：图片贴着这层白边，像照片放在相框里 */
const CARD_PAD = 6;
/** 图片圆角。比卡片圆角小一点，视觉上才是「嵌进去」的 */
const PLATE_RADIUS = 23;

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

/**
 * 把后端的 detail 字段转成一句人能看懂的话。
 *
 * FastAPI 的 422 里 detail 是一个数组（每个元素是 {loc, msg, type}），
 * 直接塞进模板字符串会显示成 [object Object]；而 403/400 的 detail 是普通字符串。
 * 两种都要能显示，否则用户拿到的提示等于没有。
 */
function describeDetail(detail: unknown): string {
  if (!detail) return '未知错误';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => {
        const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : undefined;
        return [field, d?.msg].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join('；');
  }
  return '未知错误';
}

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
  // 发帖/上传的错误必须显示在页面里，不能用 Alert.alert：
  // react-native-web 的 Alert 是空实现（`static alert() {}`），线上 bundle 里也确实是空的。
  // 之前中签者遇到 422/403/上传失败时，界面毫无反应，只看得见「发布按钮点了没用」。
  const [composerError, setComposerError] = useState('');

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
  // 图片在卡片内部，要扣掉卡片的 1px 描边和 CARD_PAD 的白边，
  // 否则横向 pagingEnabled 的翻页宽度会和图片宽度错开，轮播会停在半张图上。
  const plateWidth = contentWidth - CARD_PAD * 2 - 2;

  const createPost = async () => {
    if (!token) return;
    if (publishing) return; // 防连点：一天只能有一帖，重复提交会撞后端唯一约束
    setComposerError('');
    if (!title.trim() || !content.trim()) {
      setComposerError('标题和内容都不能为空');
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
        setComposerError(`发布失败（${res.status}）：${describeDetail(data.detail)}`);
      }
    } catch (e: any) {
      setComposerError(`发布失败：${e?.message || '网络错误'}`);
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
    setComposerError('');
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
      setComposerError(`图片上传失败：${e?.message || '请重试'}。可以先只发文字。`);
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
        <PageGradient />
        <Text style={T.dateline}>正在取回今日刊物…</Text>
      </View>
    );
  }

  /* ------------------------- 登录：柔光邀请卡 ------------------------- */
  if (!token) {
    const codeDisabled = countdown > 0 || sendingCode || !phone;
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PageGradient />
        <StatusBar barStyle="dark-content" />
        <ScrollView
          contentContainerStyle={[styles.loginScroll, { paddingTop: insets.top + spacing[16] }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.loginInner}>
            <Text style={[T.masthead, { textAlign: 'center' }]}>ONE POST A DAY</Text>
            <Text style={styles.loginLede}>每日仅一人执笔</Text>
            <Text style={[T.meta, styles.loginSub]}>
              每晚 18:00 抽签，中签者获得当日唯一的发表权
            </Text>

            <View style={styles.loginForm}>
              <GlassCard style={styles.field}>
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
              </GlassCard>

              <GlassCard style={styles.fieldSecond}>
                <Text style={T.label}>验证码</Text>
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
                    disabled={codeDisabled}
                    activeOpacity={0.85}
                    style={[styles.codePill, codeDisabled && styles.codePillDisabled]}
                  >
                    <Text style={[styles.codePillText, codeDisabled && { color: colors.ink[300] }]}>
                      {sendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>

              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

              <TouchableOpacity
                onPress={verifyOtp}
                disabled={loggingIn}
                activeOpacity={0.9}
                style={{ marginTop: spacing[8] }}
              >
                <GradientButton rich disabled={loggingIn} label={loggingIn ? '登录中…' : '进 入'} />
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
      <GlassCard style={styles.article}>
        {/* 图片区在最上方。没有图片时用渐变占位，卡片才不会因为纯文字塌成一块白 */}
        <View style={styles.plateWrap}>
          {imagesSorted.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / plateWidth);
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
                      width: plateWidth,
                      aspectRatio: img.width && img.height ? img.width / img.height : 4 / 5,
                      backgroundColor: colors.peach.tint,
                    }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : item.mediaUrl ? (
            <TouchableOpacity
              activeOpacity={0.94}
              onPress={() => router.push({ pathname: '/image', params: { uri: item.mediaUrl } })}
            >
              <Image
                source={{ uri: item.mediaUrl }}
                style={{
                  width: plateWidth,
                  aspectRatio:
                    item.mediaWidth && item.mediaHeight ? item.mediaWidth / item.mediaHeight : 4 / 5,
                  backgroundColor: colors.peach.tint,
                }}
                contentFit="cover"
              />
            </TouchableOpacity>
          ) : (
            // 纯文字帖：用一条比照片矮得多的渐变横幅占位。
            // 不用 4:3 —— 那样一块和真实照片同尺寸的彩色渐变容易被当成加载失败的图。
            <LinearGradient
              colors={gradient.photo}
              start={gradient.diagonal.start}
              end={gradient.diagonal.end}
              style={{ width: plateWidth, aspectRatio: 21 / 9 }}
            />
          )}

          {/* 图片底部压暗，保证浮在上面的白字/胶囊可读。
              只有真的有东西浮在上面时才铺，否则纯文字帖的矮横幅会白挂一条暗带。 */}
          {today || imagesSorted.length > 1 ? (
            <LinearGradient
              colors={gradient.photoScrim}
              start={gradient.down.start}
              end={gradient.down.end}
              style={styles.plateScrim}
              pointerEvents="none"
            />
          ) : null}
          {today ? (
            <View style={styles.plateSeal} pointerEvents="none">
              <Seal label="今日唯一" />
            </View>
          ) : null}

          {imagesSorted.length > 1 ? (
            <View style={styles.plateCounter} pointerEvents="none">
              <Text style={styles.plateCounterText}>
                {activeIdx + 1} / {imagesSorted.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.articleBodyWrap}>
          <View style={styles.bylineRow}>
            {item.author?.avatar ? (
              <Image source={{ uri: item.author.avatar }} style={styles.byAvatar} contentFit="cover" />
            ) : (
              <GradientAvatar size={38} />
            )}
            <View style={styles.byText}>
              <Text style={styles.byName}>{item.author?.name || '匿名'}</Text>
              <Text style={T.meta}>{dayjs(item.publishDate).format('M月D日')}</Text>
            </View>
            {canDelete ? (
              <TouchableOpacity
                hitSlop={10}
                style={styles.moreBtn}
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
                  } else if (Platform.OS === 'web') {
                    // Alert.alert 在 react-native-web 上是空实现，带按钮的确认框
                    // 根本不会弹——点「删除」会毫无反应。用浏览器原生 confirm 兜底，
                    // 删帖是不可逆操作，必须真的问一次。
                    const ok =
                      typeof window !== 'undefined' &&
                      window.confirm('删除这篇？删除后无法恢复。');
                    if (ok) doDelete();
                  } else {
                    Alert.alert('删除这篇？', '删除后无法恢复。', [
                      { text: '取消', style: 'cancel' },
                      { text: '删除', style: 'destructive', onPress: doDelete },
                    ]);
                  }
                }}
              >
                <MoreHorizontal size={18} color={colors.ink[400]} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.articleTitle}>{item.title}</Text>
          <Text style={styles.articleText}>{item.content}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={async () => {
                try {
                  await fetch(`${API_BASE}/post/${item.id}/like`, { method: 'POST', headers });
                  await loadFeed();
                } catch {}
              }}
            >
              <LinearGradient
                colors={gradient.primary}
                start={gradient.diagonal.start}
                end={gradient.diagonal.end}
                style={styles.actionPrimary}
              >
                <Heart
                  size={17}
                  strokeWidth={2.25}
                  color="#FFFFFF"
                  fill={item.is_liked ? '#FFFFFF' : 'transparent'}
                />
                <Text style={styles.actionPrimaryNum}>{item.likes_count || 0}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.actionGhost}
              onPress={async () => {
                try {
                  await fetch(`${API_BASE}/post/${item.id}/favorite`, { method: 'POST', headers });
                  await loadFeed();
                } catch {}
              }}
            >
              <Bookmark
                size={17}
                strokeWidth={2.25}
                color={colors.seal.base}
                fill={item.is_favorited ? colors.seal.base : 'transparent'}
              />
              <Text style={styles.actionGhostNum}>{item.favorites_count || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassCard>
    );
  };

  const composer = canPostToday ? (
    <GlassCard style={styles.composer}>
      <Seal label="今日唯一" />
      <Text style={[T.title, { marginTop: spacing[3] }]}>今日由你执笔</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>距离截止</Text>
        <Text style={styles.infoValue}>
          {postCountdown === '已截止' ? '发表时间已过' : postCountdown ? postCountdown : '—'}
        </Text>
      </View>

      <View style={styles.inputBlock}>
        <Text style={T.label}>标题</Text>
        <TextInput
          placeholder="给今天起个名字"
          placeholderTextColor={colors.ink[400]}
          style={styles.composerTitle}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
      </View>

      <View style={[styles.inputBlock, { marginTop: spacing[3] }]}>
        <Text style={T.label}>正文</Text>
        <TextInput
          placeholder="今天想说的话…"
          placeholderTextColor={colors.ink[400]}
          style={styles.composerBody}
          multiline
          value={content}
          onChangeText={setContent}
          maxLength={2000}
        />
        <Text style={styles.composerCount}>{content.length}/2000</Text>
      </View>

      <TouchableOpacity
        style={styles.attachBtn}
        onPress={pickImages}
        disabled={uploading}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={gradient.primary}
          start={gradient.diagonal.start}
          end={gradient.diagonal.end}
          style={styles.attachIcon}
        >
          <ImagePlus size={18} color="#FFFFFF" strokeWidth={2.25} />
        </LinearGradient>
        <Text style={styles.attachText}>
          {uploading ? '上传中…' : images.length ? `已选 ${images.length} 张` : '添加照片（最多 6 张）'}
        </Text>
      </TouchableOpacity>

      {composerError ? (
        <View style={styles.composerError}>
          <Text style={styles.composerErrorText}>{composerError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={createPost}
        disabled={publishing}
        activeOpacity={0.9}
        style={{ marginTop: spacing[5] }}
      >
        <GradientButton rich disabled={publishing} label={publishing ? '发表中…' : '发 表'} />
      </TouchableOpacity>
    </GlassCard>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PageGradient />
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={feed}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderPost}
        // 卡片自带边界，之间只留空气，不再用分隔线
        ItemSeparatorComponent={() => <View style={{ height: spacing[5] }} />}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={colors.seal.base}
          />
        }
        ListHeaderComponent={
          <View>
            <Masthead />
            {composer}
            {feedError ? <Text style={styles.errorText}>{feedError}</Text> : null}
            {feed.length > 0 ? (
              <SectionLabel style={{ marginTop: spacing[7], marginBottom: spacing[4] }}>
                往期
              </SectionLabel>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !refreshing ? (
            <GlassCard style={styles.empty}>
              <LinearGradient
                colors={gradient.photo}
                start={gradient.diagonal.start}
                end={gradient.diagonal.end}
                style={styles.emptyOrb}
              />
              <Text style={[T.title, { textAlign: 'center' }]}>今日还没有人执笔</Text>
              <Text style={[T.caption, { textAlign: 'center', marginTop: spacing[2] }]}>
                每晚十八时抽签，中签者可发表当日唯一一篇
              </Text>
            </GlassCard>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // 背景渐变铺在 PageGradient 里，这里的底色只是渐变没挂上时的兜底
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
  loginLede: {
    ...T.display,
    textAlign: 'center',
    marginTop: spacing[4],
  },
  loginSub: { textAlign: 'center', marginTop: spacing[3], lineHeight: 22 },
  loginForm: { marginTop: spacing[10] },
  field: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  // GlassCard 的 style 是单个 ViewStyle（不接数组），所以第二个输入框单独开一条
  fieldSecond: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    marginTop: spacing[4],
  },
  fieldInput: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.title,
    fontWeight: typography.weight.semibold,
    color: colors.ink[900],
    letterSpacing: 0.4,
    paddingVertical: spacing[2],
    ...noOutline,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  codePill: {
    backgroundColor: colors.seal.tint,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  codePillDisabled: {
    backgroundColor: colors.glass.fillSoft,
    borderColor: colors.glass.border,
  },
  codePillText: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.bold,
    color: colors.seal.deep,
    letterSpacing: 0.3,
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
    marginTop: spacing[5],
    padding: spacing[5],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[4],
    backgroundColor: colors.glass.fillSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  infoLabel: { ...T.caption },
  // 不用 ...T.numeralSm 展开：它带一个 readonly fontVariant 元组，
  // 展开进 StyleSheet.create 会让整张表的类型推断退化成 TextStyle|ViewStyle|ImageStyle，
  // 于是文件里每个 style={} 都开始报 TS2769。这里显式写字段。
  infoValue: {
    fontFamily: typography.fontFamily.numeral,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
    fontVariant: ['tabular-nums'] as const,
  },
  inputBlock: {
    marginTop: spacing[4],
    backgroundColor: colors.glass.fillSoft,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  composerTitle: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.ink[900],
    letterSpacing: typography.tracking.tight,
    paddingVertical: spacing[2],
    ...noOutline,
  },
  composerBody: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.body,
    lineHeight: typography.size.body * typography.leading.normal,
    color: colors.ink[700],
    minHeight: 104,
    paddingVertical: spacing[2],
    textAlignVertical: 'top',
    ...noOutline,
  },
  composerCount: { ...T.caption, textAlign: 'right' },
  // 不用 borderStyle:'dashed'：RN Web 上 dashed 和 borderRadius 同时用时各浏览器
  // 表现不一致（Safari 会在圆角处把虚线切断），而且虚线框是表单 dropzone 的语言，
  // 跟「层次靠柔光和大圆角」的调性冲突。改成半透明白实底 + 一圈浅粉实线。
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    backgroundColor: colors.glass.fillSoft,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  attachIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.elevation.lift,
  },
  composerError: {
    marginTop: spacing[4],
    backgroundColor: colors.seal.tint,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  composerErrorText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.state.error,
    lineHeight: typography.size.footnote * 1.55,
  },
  attachText: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.semibold,
    color: colors.seal.deep,
  },

  /* 帖子卡片 */
  article: { padding: CARD_PAD },
  plateWrap: {
    borderRadius: PLATE_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.peach.tint,
  },
  plateScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
  },
  plateSeal: {
    position: 'absolute',
    top: spacing[3],
    left: spacing[3],
  },
  plateCounter: {
    position: 'absolute',
    bottom: spacing[3],
    right: spacing[3],
    backgroundColor: 'rgba(62, 40, 48, 0.42)',
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
  },
  plateCounterText: {
    fontFamily: typography.fontFamily.numeral,
    fontSize: typography.size.micro,
    fontWeight: typography.weight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'] as const,
  },
  articleBodyWrap: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  bylineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  byAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  byText: { flex: 1 },
  byName: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    color: colors.ink[700],
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.glass.fillSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleTitle: {
    ...T.headline,
    marginTop: spacing[4],
  },
  articleText: {
    ...T.body,
    marginTop: spacing[2],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.full,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    ...DS.elevation.glowPink,
  },
  actionPrimaryNum: {
    fontFamily: typography.fontFamily.numeral,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.heavy,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'] as const,
  },
  actionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.glass.fillStrong,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    borderRadius: radius.full,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  actionGhostNum: {
    fontFamily: typography.fontFamily.numeral,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
    fontVariant: ['tabular-nums'] as const,
  },

  empty: {
    marginTop: spacing[4],
    paddingVertical: spacing[12],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
  },
  emptyOrb: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    marginBottom: spacing[5],
    ...DS.elevation.lift,
  },
});

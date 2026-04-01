import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DesignSystem } from '@/constants/design-system';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppInsets } from '@/hooks/use-app-insets';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, spacing, borderRadius, shadows, typography } = DesignSystem;

type FeedItem = {
  id: number;
  title: string;
  content: string;
  mediaUrl?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  publishDate: string;
  author?: { id: number; phone: string; name?: string | null } | null;
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
  const [postCountdown, setPostCountdown] = useState('');
  
  // 登录相关状态
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }), [token]);
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const loadFeed = async () => {
    setRefreshing(true);
    const res = await fetch(`${API_BASE}/post/feed`, { headers: authHeaders });
    if (res.status === 401) {
      await logout();
      router.replace('/');
      setRefreshing(false);
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
      author: p.author || p.user || { name: '', phone: '' },
      likes_count: p.likes_count || 0,
      favorites_count: p.favorites_count || 0,
      is_liked: p.is_liked || false,
      is_favorited: p.is_favorited || false,
    }));
    setFeed(normalized);
    setRefreshing(false);
  };

  const loadLottery = async () => {
    const res = await fetch(`${API_BASE}/lottery/today/status`, { headers: authHeaders });
    if (res.status === 401) {
      await logout();
      router.replace('/');
      return;
    }
    const data: LotteryResponse = await res.json();
    setLottery(data?.lottery || null);
    setWinnerDeadline(data?.winner_deadline || null);
  };

  useEffect(() => {
    if (!hydrated) return;
    loadFeed();
    loadLottery();
  }, [hydrated]);

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 手机号格式验证
  const validatePhone = (phone: string) => {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  const requestOtp = async () => {
    setLoginError('');
    
    if (!phone) {
      setLoginError('请输入手机号');
      return;
    }
    
    if (!validatePhone(phone)) {
      setLoginError('请输入正确的手机号格式');
      return;
    }

    if (countdown > 0) {
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      
      if (res.ok) {
        setCountdown(60);
      } else {
        const data = await res.json();
        setLoginError(data.detail || '发送失败，请稍后重试');
      }
    } catch (error) {
      setLoginError('网络错误，请检查连接');
    } finally {
      setSendingCode(false);
    }
  };

  const verifyOtp = async () => {
    setLoginError('');
    
    if (!phone) {
      setLoginError('请输入手机号');
      return;
    }
    
    if (!code) {
      setLoginError('请输入验证码');
      return;
    }
    
    if (code.length !== 6) {
      setLoginError('验证码必须是6位数字');
      return;
    }

    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          setAuth(data.token, data.user);
        }
      } else {
        const data = await res.json();
        setLoginError(data.detail === 'invalid code' ? '验证码错误或已过期' : '登录失败，请重试');
      }
    } catch (error) {
      setLoginError('网络错误，请检查连接');
    } finally {
      setLoggingIn(false);
    }
  };

  const screenWidth = Dimensions.get('window').width;

  const createPost = async () => {
    if (!token) return;
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
      loadFeed();
    }
  };

  const isWinnerToday = useMemo(() => {
    if (!lottery || !lottery.winner_user_id) return false;
    if (lottery.winner_user_id !== user?.id) return false;
    if (!winnerDeadline) return false;
    return dayjs().isBefore(dayjs(winnerDeadline));
  }, [lottery, user, winnerDeadline]);

  const canPostToday = isWinnerToday;
  const hasTodayPost = useMemo(() => {
    if (!lottery) return false;
    const drawDay = dayjs(lottery.draw_date).startOf('day');
    return feed.some((p) => dayjs(p.publishDate).startOf('day').isSame(drawDay));
  }, [feed, lottery]);

  useEffect(() => {
    if (!isWinnerToday || !winnerDeadline) {
      setPostCountdown('');
      return;
    }
    const deadline = dayjs(winnerDeadline);
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
  }, [isWinnerToday, winnerDeadline]);

  if (!hydrated) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText style={{ color: colors.neutral[400], fontSize: 14 }}>加载中...</ThemedText>
      </ThemedView>
    );
  }

  if (!token) {
    return (
      <View style={[styles.loginContainer, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.loginInner}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <ThemedText style={styles.logoEmoji}>📮</ThemedText>
            </View>
            <ThemedText style={styles.loginTitle}>One Post A Day</ThemedText>
            <ThemedText style={styles.loginSubtitle}>每天一个幸运儿，分享你的故事</ThemedText>
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.inputField}>
              <TextInput
                placeholder="请输入手机号"
                placeholderTextColor={colors.neutral[400]}
                style={styles.inputText}
                value={phone}
                onChangeText={(text) => { setPhone(text); setLoginError(''); }}
                keyboardType="phone-pad"
                maxLength={11}
              />
            </View>

            <View style={[styles.inputField, loginError && code ? styles.inputFieldError : null]}>
              <TextInput
                placeholder="请输入验证码"
                placeholderTextColor={colors.neutral[400]}
                style={[styles.inputText, { flex: 1 }]}
                value={code}
                onChangeText={(text) => { setCode(text); setLoginError(''); }}
                keyboardType="number-pad"
                maxLength={6}
              />
              <View style={styles.inputDivider} />
              <TouchableOpacity
                onPress={requestOtp}
                disabled={countdown > 0 || sendingCode || !phone}
                style={styles.inlineSendBtn}
              >
                <ThemedText style={[
                  styles.inlineSendText,
                  (countdown > 0 || sendingCode || !phone) && styles.inlineSendTextDisabled
                ]}>
                  {sendingCode ? '发送中' : countdown > 0 ? `${countdown}s` : '发送验证码'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {loginError ? (
              <ThemedText style={styles.errorText}>⚠️ {loginError}</ThemedText>
            ) : null}

            <TouchableOpacity
              style={[styles.loginButton, loggingIn && styles.loginButtonDisabled]}
              onPress={verifyOtp}
              disabled={loggingIn}
            >
              <LinearGradient
                colors={loggingIn ? [colors.neutral[300], colors.neutral[400]] : [colors.primary[400], colors.primary[600]]}
                style={styles.loginButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.loginButtonText}>
                  {loggingIn ? '登录中...' : '登录'}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>

            <ThemedText style={styles.loginHint}>
              登录即代表同意用户协议与隐私政策
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }

  // 主界面 - Feed流
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        
        {/* 发帖表单 */}
        {canPostToday && !hasTodayPost && (
          <View style={styles.postFormCard}>
            <View style={styles.postFormHeader}>
              <ThemedText style={styles.postFormTitle}>✨ 今日幸运发帖</ThemedText>
              <View style={styles.winnerBadge}>
                <ThemedText style={styles.winnerBadgeText}>Winner</ThemedText>
              </View>
            </View>

            {postCountdown ? (
              <View style={styles.postCountdownRow}>
                <ThemedText style={styles.postCountdownText}>
                  {postCountdown === '已截止' ? '⏰ 发帖已截止' : `⏳ 截止还剩 ${postCountdown}`}
                </ThemedText>
              </View>
            ) : null}

            <TextInput
              placeholder="给你的帖子起个标题..."
              placeholderTextColor={colors.neutral[400]}
              style={styles.postTitleInput}
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              placeholder="分享你的想法..."
              placeholderTextColor={colors.neutral[400]}
              style={styles.postContentInput}
              multiline
              value={content}
              onChangeText={setContent}
              maxLength={500}
            />

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={async () => {
                const res = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.8,
                  allowsMultipleSelection: true,
                  selectionLimit: 6,
                });
                if (!res.canceled && res.assets?.length) {
                  try {
                    const sts = await getSts(token || undefined);
                    const uploads = await Promise.all(
                      res.assets.slice(0, 6).map(async (asset, idx) => {
                        const key = buildObjectKey(sts.key_prefix + `-${idx}`, asset.fileName || 'image');
                        const uri = asset.uri;
                        const isWeb = Platform.OS === 'web';
                        const blob = isWeb
                          ? await (await fetch(uri)).blob()
                          : { uri, type: 'image/jpeg', name: key.split('/').pop() || 'image.jpg' };
                        const url = await uploadToOss(sts, key, blob as any);
                        return { url, width: asset.width, height: asset.height, sort: idx };
                      })
                    );
                    setMediaUrl(uploads[0]?.url || '');
                    setMediaWidth(uploads[0]?.width);
                    setMediaHeight(uploads[0]?.height);
                    setImages(uploads);
                  } catch (e) {
                    setMediaUrl('');
                    setMediaWidth(undefined);
                    setMediaHeight(undefined);
                    setImages([]);
                  }
                }
              }}
            >
              <ThemedText style={styles.uploadButtonText}>
                {images.length ? `📷 已选${images.length}张` : '📷 添加图片 (最多6张)'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.publishButton} onPress={createPost}>
              <LinearGradient
                colors={[colors.primary[500], colors.primary[600]]}
                style={styles.publishButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.publishButtonText}>发布</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Feed列表 */}
        <FlatList
          data={feed}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const isToday = dayjs(item.publishDate).isSame(dayjs(), 'day');
            const canDelete = token && user?.id === (item.author?.id || (item as any).author_id);
            const imagesSorted = (item.images || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
            const activeIdx = activeMap[item.id] ?? 0;
            
            return (
              <View style={styles.feedCard}>
                {/* 头部 */}
                <View style={styles.feedHeader}>
                  <View style={styles.feedHeaderLeft}>
                    <View style={styles.avatar}>
                      <ThemedText style={styles.avatarText}>
                        {(item.author?.name || item.author?.phone || '?')[0].toUpperCase()}
                      </ThemedText>
                    </View>
                    <View style={styles.feedHeaderInfo}>
                      <ThemedText style={styles.authorName}>
                        {item.author?.name || item.author?.phone || '匿名用户'}
                      </ThemedText>
                      <ThemedText style={styles.postTime}>
                        {isToday ? '今天' : dayjs(item.publishDate).format('MM/DD')}
                      </ThemedText>
                    </View>
                  </View>
                  
                  {canDelete && (
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          ActionSheetIOS.showActionSheetWithOptions(
                            {
                              options: ['取消', '删除'],
                              destructiveButtonIndex: 1,
                              cancelButtonIndex: 0,
                            },
                            (buttonIndex) => {
                              if (buttonIndex === 1) {
                                fetch(`${API_BASE}/post/${item.id}`, { method: 'DELETE', headers: authHeaders }).then(() => loadFeed());
                              }
                            }
                          );
                        } else {
                          Alert.alert('操作', '确认删除此帖子？', [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => fetch(`${API_BASE}/post/${item.id}`, { method: 'DELETE', headers: authHeaders }).then(() => loadFeed()),
                            },
                          ]);
                        }
                      }}
                      style={styles.moreButton}
                    >
                      <ThemedText style={styles.moreIcon}>⋯</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 内容 */}
                <ThemedText style={styles.feedTitle}>{item.title}</ThemedText>
                <ThemedText style={styles.feedContent} numberOfLines={3}>
                  {item.content}
                </ThemedText>

                {/* 图片 */}
                {imagesSorted.length > 0 ? (
                  <View style={styles.imageContainer}>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onScroll={(e) => {
                        const idx = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 32));
                        setActiveMap((prev) => ({ ...prev, [item.id]: idx }));
                      }}
                      scrollEventThrottle={16}
                    >
                      {imagesSorted.map((img, imgIdx) => (
                        <TouchableOpacity
                          key={`${item.id}-${imgIdx}`}
                          activeOpacity={0.9}
                          onPress={() => router.push({ pathname: '/image', params: { uri: img.url } })}
                        >
                          <Image
                            source={{ uri: img.url }}
                            style={[
                              styles.feedImage,
                              {
                                width: screenWidth - 32,
                                aspectRatio: img.width && img.height ? img.width / img.height : 4 / 5,
                              },
                            ]}
                            contentFit="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {imagesSorted.length > 1 && (
                      <View style={styles.dotsRow}>
                        {imagesSorted.map((_, dotIdx) => (
                          <View
                            key={dotIdx}
                            style={[styles.dot, dotIdx === activeIdx && styles.dotActive]}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ) : item.mediaUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => router.push({ pathname: '/image', params: { uri: item.mediaUrl } })}
                  >
                    <Image
                      source={{ uri: item.mediaUrl }}
                      style={[
                        styles.feedImage,
                        {
                          width: screenWidth - 32,
                          aspectRatio: item.mediaWidth && item.mediaHeight ? item.mediaWidth / item.mediaHeight : 4 / 5,
                        },
                      ]}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ) : null}

                {/* 互动区 */}
                <View style={styles.actionBar}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={async () => {
                      if (!token) return;
                      try {
                        await fetch(`${API_BASE}/post/${item.id}/like`, { method: 'POST', headers });
                        await loadFeed(); // 等待刷新完成
                      } catch (err) {
                        console.error('点赞失败:', err);
                      }
                    }}
                  >
                    <ThemedText style={styles.actionIcon}>{item.is_liked ? '❤️' : '🤍'}</ThemedText>
                    <ThemedText style={styles.actionText}>{item.likes_count || 0}</ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={async () => {
                      if (!token) return;
                      try {
                        await fetch(`${API_BASE}/post/${item.id}/favorite`, { method: 'POST', headers });
                        await loadFeed(); // 等待刷新完成
                      } catch (err) {
                        console.error('收藏失败:', err);
                      }
                    }}
                  >
                    <ThemedText style={styles.actionIcon}>{item.is_favorited ? '⭐' : '☆'}</ThemedText>
                    <ThemedText style={styles.actionText}>{item.favorites_count || 0}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadFeed} tintColor={colors.primary[500]} />}
          ListHeaderComponent={
            !hasTodayPost ? (
              <View style={styles.placeholderCard}>
                <View style={styles.placeholderIcon}>
                  <ThemedText style={styles.placeholderEmoji}>📝</ThemedText>
                </View>
                <ThemedText style={styles.placeholderTitle}>今日帖子尚未发布</ThemedText>
                <ThemedText style={styles.placeholderText}>每天18:00抽签，幸运儿可发布次日唯一帖子</ThemedText>
              </View>
            ) : null
          }
          contentContainerStyle={styles.feedList}
          showsVerticalScrollIndicator={false}
        />
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 登录界面样式
  loginContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loginInner: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing[10],
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  logoEmoji: {
    fontSize: 36,
  },
  loginTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[1],
  },
  loginSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
  },
  inputContainer: {
    gap: spacing[4],
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing[4],
    height: 52,
  },
  inputFieldError: {
    borderColor: colors.error,
    backgroundColor: '#fff5f5',
  },
  inputText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[900],
  },
  inputDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.neutral[200],
    marginHorizontal: spacing[3],
  },
  inlineSendBtn: {
    paddingVertical: spacing[1],
  },
  inlineSendText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[500],
  },
  inlineSendTextDisabled: {
    color: colors.neutral[400],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
  },
  loginButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonGradient: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },
  loginHint: {
    textAlign: 'center',
    fontSize: typography.fontSize.xs,
    color: colors.neutral[400],
  },

  // 发帖表单样式
  postFormCard: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    margin: spacing[4],
    marginBottom: spacing[3],
    ...shadows.md,
  },
  postFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  postFormTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
  },
  winnerBadge: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  winnerBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  postTitleInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[3],
  },
  postContentInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    fontSize: typography.fontSize.base,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing[3],
  },
  postCountdownRow: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  postCountdownText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  uploadButton: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing[4],
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderStyle: 'dashed',
    marginBottom: spacing[4],
  },
  uploadButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
  },
  publishButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  publishButtonGradient: {
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  publishButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },

  // Feed列表样式
  feedList: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[20],
    gap: spacing[4],
  },
  feedCard: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  feedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  feedHeaderInfo: {
    gap: spacing[1],
  },
  authorName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
  },
  postTime: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
  },
  moreButton: {
    padding: spacing[2],
  },
  moreIcon: {
    fontSize: typography.fontSize['2xl'],
    color: colors.neutral[400],
  },
  feedTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  feedContent: {
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * typography.lineHeight.relaxed,
    color: colors.neutral[700],
    marginBottom: spacing[3],
  },
  imageContainer: {
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  feedImage: {
    borderRadius: borderRadius.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral[300],
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary[500],
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing[6],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionIcon: {
    fontSize: 20,
  },
  actionText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    fontWeight: typography.fontWeight.medium,
  },

  // 占位卡片
  placeholderCard: {
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing[8],
    alignItems: 'center',
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  placeholderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  placeholderTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  placeholderText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
    textAlign: 'center',
  },
});

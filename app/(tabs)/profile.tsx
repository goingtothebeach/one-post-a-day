import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
// 按需导入：Metro 不做 tree-shaking，整包导入会把 1695 个图标全打进 bundle
import Bookmark from 'lucide-react-native/dist/esm/icons/bookmark.js';
import Camera from 'lucide-react-native/dist/esm/icons/camera.js';
import Heart from 'lucide-react-native/dist/esm/icons/heart.js';
import LogOut from 'lucide-react-native/dist/esm/icons/log-out.js';
import Settings from 'lucide-react-native/dist/esm/icons/settings.js';
import SquarePen from 'lucide-react-native/dist/esm/icons/square-pen.js';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useAppInsets } from '@/hooks/use-app-insets';
import DS, { noOutline, text as T } from '@/constants/design-system';
import { GradientAvatar, GradientButton, Masthead, SectionLabel } from '@/components/editorial';
import { GlassCard, PageGradient } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, gradient, spacing, radius, typography } = DS;

/** 头像直径。个人页的头像是这一屏的视觉主角，比列表里的头像大得多 */
const AVATAR = 94;

type TicketHistory = {
  id: number;
  draw_date: string;
  winner_user_id?: number | null;
  won?: boolean;
};

type Item = {
  id: number;
  title: string;
  media_url?: string | null;
  publish_date: string;
  images?: { url: string; width?: number; height?: number; sort?: number }[];
  likes_count: number;
  favorites_count: number;
  is_liked: boolean;
  is_favorited: boolean;
};

type TabKey = 'likes' | 'favorites';

export default function ProfileScreen() {
  const { user, token, setAuth, logout, hydrated } = useAuth();
  const insets = useAppInsets();

  useEffect(() => {
    if (hydrated && !token) router.replace('/');
  }, [hydrated, token]);

  const [tickets, setTickets] = useState<TicketHistory[]>([]);
  const [data, setData] = useState<{ likes: Item[]; favorites: Item[] }>({
    likes: [],
    favorites: [],
  });
  const [activeTab, setActiveTab] = useState<TabKey>('likes');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = useMemo<Record<string, string>>(
    () =>
      token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : ({} as Record<string, string>),
    [token]
  );

  const loadHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/profile/tickets`, { headers });
      if (!res.ok) return;
      const d = await res.json();
      setTickets(d.tickets || []);
    } catch {}
  };

  const loadContent = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/profile/content`, { headers });
      if (!res.ok) return;
      const d = await res.json();
      setData({ likes: d.likes || [], favorites: d.favorites || [] });
    } catch {}
  };

  useEffect(() => {
    loadHistory();
    loadContent();
  }, [token]);

  // 后端已下发 won 字段；兼容旧响应时回退到本地比较
  const wonCount = tickets.filter((t) => t.won ?? t.winner_user_id === user?.id).length;
  const listData = activeTab === 'likes' ? data.likes : data.favorites;
  const rate = tickets.length > 0 ? Math.round((wonCount / tickets.length) * 100) : 0;

  const updateProfile = async (payload: { name?: string; avatar?: string }) => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setAuth(token, d.user);
      } else {
        const d = await res.json().catch(() => ({}));
        Alert.alert('保存失败', d.detail || '请稍后重试');
      }
    } catch {
      Alert.alert('保存失败', '网络错误');
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const asset = res.assets[0];
      const sts = await getSts(token || undefined);
      const key = buildObjectKey(sts.key_prefix + '-avatar', asset.fileName || 'avatar.jpg');
      const blob =
        Platform.OS === 'web'
          ? await (await fetch(asset.uri)).blob()
          : ({ uri: asset.uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
      const url = await uploadToOss(sts, key, blob);
      await updateProfile({ avatar: url });
      setSettingsVisible(false);
    } catch {
      Alert.alert('上传失败', '请稍后重试');
    }
  };

  const saveNickname = async () => {
    if (!newName.trim()) return;
    await updateProfile({ name: newName.trim() });
    setEditNameVisible(false);
    setSettingsVisible(false);
  };

  const renderItem = ({ item }: { item: Item }) => {
    const cover = item.images?.[0]?.url || item.media_url;
    return (
      <GlassCard style={styles.entry}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.entryThumb} />
        ) : (
          <LinearGradient
            colors={gradient.photo}
            start={gradient.diagonal.start}
            end={gradient.diagonal.end}
            style={[styles.entryThumb, styles.entryThumbEmpty]}
          >
            <Text style={styles.entryThumbMark}>文</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1, marginLeft: spacing[4] }}>
          <Text style={styles.entryTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[T.caption, { marginTop: spacing[1] }]}>
            {dayjs(item.publish_date).format('YYYY年M月D日')}
          </Text>
          <View style={styles.entryStats}>
            <Heart
              size={14}
              strokeWidth={2}
              color={item.is_liked ? colors.seal.base : colors.ink[400]}
              fill={item.is_liked ? colors.seal.base : 'transparent'}
            />
            <Text style={styles.entryNum}>{item.likes_count}</Text>
            <Bookmark
              size={14}
              strokeWidth={2}
              color={item.is_favorited ? colors.seal.base : colors.ink[400]}
              fill={item.is_favorited ? colors.seal.base : 'transparent'}
            />
            <Text style={styles.entryNum}>{item.favorites_count}</Text>
          </View>
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={styles.screen}>
      <PageGradient />
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={listData}
        keyExtractor={(i) => `${activeTab}-${i.id}`}
        renderItem={renderItem}
        // 卡片之间用留白分层，不再用细线
        ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
        ]}
        ListHeaderComponent={
          <View>
            <Masthead
              heading="我的存档"
              subtitle="报名记录 · 赞过 · 收藏"
              right={
                <TouchableOpacity
                  onPress={() => setSettingsVisible(true)}
                  hitSlop={10}
                  activeOpacity={0.85}
                  style={styles.gearBtn}
                >
                  <Settings size={18} color={colors.seal.deep} strokeWidth={2} />
                </TouchableOpacity>
              }
            />

            {/* 身份牌：大头像 + 名字，居中浮在渐变上 */}
            <GlassCard style={styles.identity}>
              <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85} style={styles.avatarBox}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarPhoto} />
                ) : (
                  <>
                    <GradientAvatar size={AVATAR} />
                    <View style={styles.avatarInitialLayer} pointerEvents="none">
                      <Text style={styles.avatarInitial}>
                        {(user?.name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  </>
                )}
                {/* 相机角标只是外观提示，点击仍走整块头像的 pickAvatar */}
                <LinearGradient
                  colors={gradient.primary}
                  start={gradient.diagonal.start}
                  end={gradient.diagonal.end}
                  style={styles.avatarCamera}
                  pointerEvents="none"
                >
                  <Camera size={13} color="#FFFFFF" strokeWidth={2.25} />
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.identityName} numberOfLines={1}>
                {user?.name || '未命名'}
              </Text>
              <Text style={[T.caption, { marginTop: 3 }]}>读者编号 · {user?.id}</Text>
            </GlassCard>

            {/* 三联统计：三张独立的小卡片，数字是情绪点 */}
            <View style={styles.stats}>
              <Stat label="报名" value={String(tickets.length)} />
              <Stat label="中签" value={String(wonCount)} accent />
              <Stat label="中签率" value={`${rate}%`} />
            </View>

            <SectionLabel style={{ marginTop: spacing[8], marginBottom: spacing[3] }}>
              我的收录
            </SectionLabel>

            {/* 胶囊分段控件：当前 tab 是渐变实心 */}
            <View style={styles.tabs}>
              {(['likes', 'favorites'] as TabKey[]).map((k) => {
                const on = activeTab === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setActiveTab(k)}
                    style={styles.tab}
                    activeOpacity={0.9}
                  >
                    {on ? (
                      <LinearGradient
                        colors={gradient.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0.8 }}
                        style={[StyleSheet.absoluteFill, styles.tabFill]}
                      />
                    ) : null}
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>
                      {k === 'likes' ? '赞过' : '收藏'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <GlassCard tone="fillSoft" style={styles.empty}>
            <LinearGradient
              colors={gradient.avatar}
              start={gradient.diagonal.start}
              end={gradient.diagonal.end}
              style={styles.emptyDot}
            />
            <Text style={[T.meta, { marginTop: spacing[4] }]}>
              {activeTab === 'likes' ? '还没有赞过的文章' : '还没有收藏的文章'}
            </Text>
          </GlassCard>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* 设置 */}
      <Modal visible={settingsVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setSettingsVisible(false)}>
          <View style={styles.scrim}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <LinearGradient
                colors={gradient.page}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.sheet}
              >
                <Text style={[T.title, { textAlign: 'center' }]}>设置</Text>

                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={pickAvatar}
                  activeOpacity={0.85}
                >
                  <Camera size={17} color={colors.seal.deep} strokeWidth={2} />
                  <Text style={styles.sheetRowText}>更换头像</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    setNewName(user?.name || '');
                    setEditNameVisible(true);
                  }}
                >
                  <SquarePen size={17} color={colors.seal.deep} strokeWidth={2} />
                  <Text style={styles.sheetRowText}>修改昵称</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetRow, styles.sheetRowDanger]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSettingsVisible(false);
                    logout();
                    router.replace('/');
                  }}
                >
                  <LogOut size={17} color={colors.state.error} strokeWidth={2} />
                  <Text style={[styles.sheetRowText, { color: colors.state.error }]}>
                    退出登录
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => setSettingsVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={T.buttonGhost}>取消</Text>
                </TouchableOpacity>
              </LinearGradient>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 改昵称 */}
      <Modal visible={editNameVisible} transparent animationType="fade">
        <View style={styles.scrim}>
          <LinearGradient
            colors={gradient.page}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.dialog}
          >
            <Text style={[T.title, { textAlign: 'center' }]}>修改昵称</Text>

            {/* 输入框是毛玻璃卡片，不是下划线 */}
            <GlassCard tone="fillStrong" style={styles.dialogField}>
              <Text style={T.label}>昵称</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                maxLength={50}
                placeholder="输入新昵称"
                placeholderTextColor={colors.ink[400]}
                style={styles.dialogInput}
                autoFocus
              />
            </GlassCard>

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogCancel}
                onPress={() => setEditNameVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={T.buttonGhost}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={saveNickname}
                disabled={saving || !newName.trim()}
                activeOpacity={0.9}
              >
                <GradientButton
                  label={saving ? '保存中…' : '保存'}
                  disabled={saving || !newName.trim()}
                  rich
                />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <GlassCard tone={accent ? 'fillStrong' : 'fill'} style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[T.label, { marginTop: 2 }]}>{label}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // 背景交给 PageGradient，这里只留兜底底色
  screen: { flex: 1, backgroundColor: colors.paper.base },
  content: {
    paddingHorizontal: spacing[5],
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },

  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass.fillStrong,
    borderWidth: 1,
    borderColor: colors.glass.border,
    ...DS.elevation.lift,
  },

  identity: {
    alignItems: 'center',
    paddingTop: spacing[6],
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[5],
    marginTop: spacing[5],
  },
  avatarBox: {
    width: AVATAR,
    height: AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  avatarPhoto: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...DS.elevation.lift,
  },
  avatarInitialLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: 36,
    fontWeight: typography.weight.heavy,
    color: '#FFFFFF',
  },
  avatarCamera: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    ...DS.elevation.lift,
  },
  identityName: { ...T.display, fontSize: 26, textAlign: 'center' },

  stats: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderRadius: radius.xl,
  },
  // 注意：T.numeral/T.numeralSm 的 fontVariant 是 readonly 元组，直接展开进
  // StyleSheet.create 会让整张 styles 表的类型退化成联合类型（全文件报 TS2769）。
  // 展开后就地覆写成可变数组即可。
  statValue: {
    ...T.numeral,
    fontVariant: ['tabular-nums' as const],
    fontSize: 27,
    letterSpacing: -0.8,
  },

  tabs: {
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
    borderRadius: radius.full,
    backgroundColor: colors.glass.fillSoft,
    borderWidth: 1,
    borderColor: colors.glass.border,
    marginBottom: spacing[4],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  tabFill: { borderRadius: radius.full },
  tabText: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    color: colors.ink[400],
    letterSpacing: 1.2,
  },
  tabTextOn: { color: '#FFFFFF' },

  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing[4],
  },
  entryThumb: {
    width: 74,
    height: 74,
    borderRadius: 19,
    backgroundColor: colors.paper.sunken,
  },
  entryThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  entryThumbMark: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    color: 'rgba(255,255,255,0.92)',
  },
  entryTitle: {
    ...T.title,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink[900],
  },
  entryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 2,
    marginTop: spacing[2],
  },
  entryNum: {
    ...T.numeralSm,
    fontVariant: ['tabular-nums' as const],
    fontSize: 13.5,
    marginRight: spacing[3],
  },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing[12],
    marginTop: spacing[2],
  },
  emptyDot: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    opacity: 0.8,
  },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(62, 40, 48, 0.34)',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  sheet: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.glass.border,
    padding: spacing[5],
    maxWidth: 380,
    width: '100%',
    alignSelf: 'center',
    ...DS.elevation.overlay,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.glass.fillStrong,
    borderWidth: 1,
    borderColor: colors.glass.border,
    marginTop: spacing[3],
  },
  sheetRowDanger: { borderColor: colors.glass.borderPink },
  sheetRowText: {
    ...T.body,
    color: colors.ink[700],
    fontFamily: typography.fontFamily.rounded,
    fontWeight: typography.weight.semibold,
  },
  sheetCancel: { paddingTop: spacing[5], paddingBottom: spacing[1], alignItems: 'center' },

  dialog: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.glass.border,
    padding: spacing[5],
    maxWidth: 360,
    width: '100%',
    alignSelf: 'center',
    ...DS.elevation.overlay,
  },
  dialogField: {
    marginTop: spacing[5],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    borderRadius: radius.xl,
  },
  dialogInput: {
    fontFamily: typography.fontFamily.rounded,
    fontSize: typography.size.title,
    fontWeight: typography.weight.semibold,
    color: colors.ink[900],
    paddingVertical: spacing[2],
    ...noOutline,
  },
  dialogActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  dialogCancel: {
    paddingVertical: 17,
    paddingHorizontal: spacing[5],
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass.fillStrong,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
});

import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import { Bookmark, Heart, Settings } from 'lucide-react-native';
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
import { Masthead, SectionLabel } from '@/components/editorial';
import { Rule } from '@/components/paper';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, spacing, radius, typography } = DS;

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
      <View style={styles.entry}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.entryThumb} />
        ) : (
          <View style={[styles.entryThumb, styles.entryThumbEmpty]}>
            <Text style={styles.entryThumbMark}>文</Text>
          </View>
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
              size={13}
              strokeWidth={1.75}
              color={item.is_liked ? colors.ink[900] : colors.ink[400]}
              fill={item.is_liked ? colors.ink[900] : 'transparent'}
            />
            <Text style={styles.entryNum}>{item.likes_count}</Text>
            <Bookmark
              size={13}
              strokeWidth={1.75}
              color={item.is_favorited ? colors.ink[900] : colors.ink[400]}
              fill={item.is_favorited ? colors.ink[900] : 'transparent'}
            />
            <Text style={styles.entryNum}>{item.favorites_count}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={listData}
        keyExtractor={(i) => `${activeTab}-${i.id}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <Rule style={{ marginVertical: spacing[4] }} />}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing[4], paddingBottom: spacing[16] },
        ]}
        ListHeaderComponent={
          <View>
            <Masthead
              subtitle="存　档"
              right={
                <TouchableOpacity onPress={() => setSettingsVisible(true)} hitSlop={10}>
                  <Settings size={19} color={colors.ink[500]} strokeWidth={1.75} />
                </TouchableOpacity>
              }
            />

            {/* 身份牌 */}
            <View style={styles.identity}>
              <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarInitial}>
                      {(user?.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: spacing[5] }}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {user?.name || '未命名'}
                </Text>
                <Text style={[T.caption, { marginTop: 2 }]}>读者编号 · {user?.id}</Text>
              </View>
            </View>

            {/* 三联统计，用竖细线分隔，像报表 */}
            <View style={styles.stats}>
              <Stat label="报名" value={String(tickets.length)} />
              <View style={styles.statDivider} />
              <Stat label="中签" value={String(wonCount)} accent />
              <View style={styles.statDivider} />
              <Stat label="中签率" value={`${rate}%`} />
            </View>

            <SectionLabel style={{ marginTop: spacing[8], marginBottom: spacing[4] }}>
              我的收录
            </SectionLabel>

            <View style={styles.tabs}>
              {(['likes', 'favorites'] as TabKey[]).map((k) => {
                const on = activeTab === k;
                return (
                  <TouchableOpacity key={k} onPress={() => setActiveTab(k)} style={styles.tab}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>
                      {k === 'likes' ? '赞过' : '收藏'}
                    </Text>
                    <View style={[styles.tabMark, on && styles.tabMarkOn]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyMark}>—</Text>
            <Text style={T.meta}>
              {activeTab === 'likes' ? '还没有赞过的文章' : '还没有收藏的文章'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* 设置 */}
      <Modal visible={settingsVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setSettingsVisible(false)}>
          <View style={styles.scrim}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.sheet}>
                <Text style={[T.title, { textAlign: 'center' }]}>设置</Text>
                <Rule style={{ marginVertical: spacing[4] }} />
                <TouchableOpacity style={styles.sheetRow} onPress={pickAvatar}>
                  <Text style={T.body}>更换头像</Text>
                </TouchableOpacity>
                <Rule />
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => {
                    setNewName(user?.name || '');
                    setEditNameVisible(true);
                  }}
                >
                  <Text style={T.body}>修改昵称</Text>
                </TouchableOpacity>
                <Rule />
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => {
                    setSettingsVisible(false);
                    logout();
                    router.replace('/');
                  }}
                >
                  <Text style={[T.body, { color: colors.state.error }]}>退出登录</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => setSettingsVisible(false)}
                >
                  <Text style={T.meta}>取消</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 改昵称 */}
      <Modal visible={editNameVisible} transparent animationType="fade">
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={[T.title, { textAlign: 'center' }]}>修改昵称</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              maxLength={50}
              placeholder="输入新昵称"
              placeholderTextColor={colors.ink[400]}
              style={styles.dialogInput}
              autoFocus
            />
            <Rule />
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtn} onPress={() => setEditNameVisible(false)}>
                <Text style={T.meta}>取消</Text>
              </TouchableOpacity>
              <View style={styles.dialogBtnDivider} />
              <TouchableOpacity
                style={styles.dialogBtn}
                onPress={saveNickname}
                disabled={saving || !newName.trim()}
              >
                <Text
                  style={[
                    styles.dialogSave,
                    (saving || !newName.trim()) && { color: colors.ink[300] },
                  ]}
                >
                  {saving ? '保存中…' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.seal.base }]}>{value}</Text>
      <Text style={T.label}>{label}</Text>
    </View>
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

  identity: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[7] },
  avatar: { width: 66, height: 66, borderRadius: radius.full },
  avatarEmpty: {
    backgroundColor: colors.paper.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 26,
    color: colors.ink[500],
  },
  identityName: { ...T.headline, fontSize: 24 },

  stats: {
    flexDirection: 'row',
    marginTop: spacing[7],
    paddingVertical: spacing[5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule.base,
  },
  stat: { flex: 1, alignItems: 'center', gap: spacing[1] },
  statValue: {
    fontFamily: typography.fontFamily.mono,
    fontSize: 26,
    color: colors.ink[900],
  },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.rule.base },

  tabs: { flexDirection: 'row', gap: spacing[6] },
  tab: { alignItems: 'center' },
  tabText: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.bodyLg,
    color: colors.ink[400],
    letterSpacing: 1.5,
    paddingBottom: spacing[2],
  },
  tabTextOn: { color: colors.ink[900], fontWeight: '600' },
  tabMark: { height: 2, width: 24, backgroundColor: 'transparent' },
  tabMarkOn: { backgroundColor: colors.ink[900] },

  entry: { flexDirection: 'row', alignItems: 'flex-start' },
  entryThumb: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.paper.sunken,
  },
  entryThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
  },
  entryThumbMark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 20,
    color: colors.ink[300],
  },
  entryTitle: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.bodyLg,
    fontWeight: '600',
    color: colors.ink[900],
    lineHeight: 23,
  },
  entryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  entryNum: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.caption,
    color: colors.ink[500],
    marginRight: spacing[3],
  },

  empty: { alignItems: 'center', paddingVertical: spacing[16] },
  emptyMark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: 28,
    color: colors.rule.strong,
    marginBottom: spacing[3],
  },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(26,26,24,0.32)',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  sheet: {
    backgroundColor: colors.paper.raised,
    borderRadius: radius.sm,
    padding: spacing[5],
    maxWidth: 380,
    width: '100%',
    alignSelf: 'center',
    ...DS.elevation.overlay,
  },
  sheetRow: { paddingVertical: spacing[4] },
  sheetCancel: { paddingTop: spacing[5], alignItems: 'center' },

  dialog: {
    backgroundColor: colors.paper.raised,
    borderRadius: radius.sm,
    paddingTop: spacing[5],
    maxWidth: 340,
    width: '100%',
    alignSelf: 'center',
    ...DS.elevation.overlay,
  },
  dialogInput: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.bodyLg,
    color: colors.ink[900],
    textAlign: 'center',
    paddingVertical: spacing[5],
    marginHorizontal: spacing[5],
    ...noOutline,
  },
  dialogActions: { flexDirection: 'row' },
  dialogBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing[4] },
  dialogBtnDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.rule.base },
  dialogSave: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.bodyLg,
    fontWeight: '600',
    color: colors.seal.base,
  },
});

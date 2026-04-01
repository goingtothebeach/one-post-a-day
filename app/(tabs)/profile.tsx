import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { API_BASE } from './api';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppInsets } from '@/hooks/use-app-insets';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';
import { DesignSystem } from '@/constants/design-system';
import { buildObjectKey, getSts, uploadToOss } from '../lib/oss';

const { colors, spacing, borderRadius, shadows, typography } = DesignSystem;

type TicketHistory = {
  id: number;
  draw_date: string;
  winner_user_id?: number | null;
};

type Item = {
  id: number;
  title: string;
  cover?: string | null;
  date: string;
};

type ProfileData = {
  likes: Item[];
  favorites: Item[];
};

type TabKey = 'likes' | 'favorites';

export default function ProfileScreen() {
  const { user, token, setAuth, logout, hydrated } = useAuth();
  const insets = useAppInsets();

  useEffect(() => {
    if (hydrated && !token) {
      router.replace('/');
    }
  }, [hydrated, token]);

  const [tickets, setTickets] = useState<TicketHistory[]>([]);
  const [profileData, setProfileData] = useState<ProfileData>({ likes: [], favorites: [] });
  const [activeTab, setActiveTab] = useState<TabKey>('likes');

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};

  const loadHistory = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/profile/tickets`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets || []);
  };

  const loadProfileData = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/profile/content`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    setProfileData({ likes: data.likes || [], favorites: data.favorites || [] });
  };

  useEffect(() => {
    loadHistory();
    loadProfileData();
  }, [token]);

  const wonCount = tickets.filter((t) => t.winner_user_id === user?.id).length;
  const listData = activeTab === 'likes' ? profileData.likes : profileData.favorites;

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
        const data = await res.json();
        setAuth(token, data.user);
      }
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]) {
      try {
        const asset = res.assets[0];
        const sts = await getSts(token || undefined);
        const key = buildObjectKey(sts.key_prefix + '-avatar', asset.fileName || 'avatar.jpg');
        const uri = asset.uri;
        const blob =
          Platform.OS === 'web'
            ? await (await fetch(uri)).blob()
            : ({ uri, type: 'image/jpeg', name: key.split('/').pop() || 'avatar.jpg' } as any);
        const url = await uploadToOss(sts, key, blob);
        await updateProfile({ avatar: url });
        setSettingsVisible(false);
      } catch {
        Alert.alert('上传失败', '请稍后重试');
      }
    }
  };

  const saveNickname = async () => {
    if (!newName.trim()) return;
    await updateProfile({ name: newName.trim() });
    setEditNameVisible(false);
    setSettingsVisible(false);
  };

  if (!token) {
    return (
      <ThemedView style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <ThemedText style={styles.emptyEmoji}>🔒</ThemedText>
          </View>
          <ThemedText style={styles.emptyTitle}>请先登录</ThemedText>
          <ThemedText style={styles.emptyText}>登录后查看个人主页</ThemedText>
          <TouchableOpacity style={styles.loginPromptButton} onPress={() => router.push('/')}>
            <LinearGradient
              colors={[colors.primary[500], colors.primary[600]]}
              style={styles.loginPromptGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <ThemedText style={styles.loginPromptText}>去登录</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* 用户信息卡片 */}
      <View style={styles.profileCard}>
        <LinearGradient
          colors={[colors.primary[50], colors.secondary[50]]}
          style={styles.profileGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* 顶部：头像 + 信息 + 设置 */}
          <View style={styles.profileTop}>
            <LinearGradient
              colors={[colors.primary[400], colors.primary[600]]}
              style={styles.avatarGradientBorder}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.avatarInner}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
                ) : (
                  <ThemedText style={styles.avatarText}>
                    {(user?.name || user?.phone || '?')[0].toUpperCase()}
                  </ThemedText>
                )}
              </View>
            </LinearGradient>

            <View style={styles.profileInfo}>
              <ThemedText style={styles.userName} numberOfLines={1}>
                {user?.name || user?.phone}
              </ThemedText>
              <ThemedText style={styles.userId}>ID: {user?.id}</ThemedText>
            </View>

            <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
              <ThemedText style={styles.settingsIcon}>⚙️</ThemedText>
            </TouchableOpacity>
          </View>

          {/* 统计数据 */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{tickets.length}</ThemedText>
              <ThemedText style={styles.statLabel}>报名次数</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>{wonCount}</ThemedText>
              <ThemedText style={styles.statLabel}>中签次数</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText style={styles.statValue}>
                {wonCount > 0 ? ((wonCount / tickets.length) * 100).toFixed(0) : 0}%
              </ThemedText>
              <ThemedText style={styles.statLabel}>中签率</ThemedText>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* 内容区域 */}
      <View style={styles.contentSection}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'likes' && styles.tabActive]}
            onPress={() => setActiveTab('likes')}
          >
            <ThemedText style={[styles.tabText, activeTab === 'likes' && styles.tabTextActive]}>
              ❤️ 赞过
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
            onPress={() => setActiveTab('favorites')}
          >
            <ThemedText style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
              ⭐ 收藏
            </ThemedText>
          </TouchableOpacity>
        </View>

        {listData.length > 0 ? (
          <FlatList
            data={listData}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.contentCard}>
                {item.cover ? (
                  <Image source={{ uri: item.cover }} style={styles.contentImage} />
                ) : (
                  <View style={[styles.contentImage, styles.contentImagePlaceholder]}>
                    <ThemedText style={styles.placeholderIcon}>📷</ThemedText>
                  </View>
                )}
                <View style={styles.contentInfo}>
                  <ThemedText style={styles.contentTitle} numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText style={styles.contentDate}>
                    {dayjs(item.date).format('MM/DD')}
                  </ThemedText>
                </View>
              </View>
            )}
            numColumns={2}
            columnWrapperStyle={styles.contentRow}
            contentContainerStyle={styles.contentList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyContent}>
            <View style={styles.emptyContentIcon}>
              <ThemedText style={styles.emptyContentEmoji}>
                {activeTab === 'likes' ? '💔' : '📭'}
              </ThemedText>
            </View>
            <ThemedText style={styles.emptyContentText}>
              {activeTab === 'likes' ? '还没有点赞的内容' : '还没有收藏的内容'}
            </ThemedText>
          </View>
        )}
      </View>

      {/* 设置底部弹层 */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSettingsVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ThemedText style={styles.sheetTitle}>设置</ThemedText>

          <TouchableOpacity style={styles.sheetItem} onPress={pickAvatar}>
            <View style={styles.sheetItemIcon}>
              <ThemedText style={styles.sheetItemEmoji}>🖼️</ThemedText>
            </View>
            <ThemedText style={styles.sheetItemText}>修改头像</ThemedText>
            <ThemedText style={styles.sheetItemArrow}>›</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              setNewName(user?.name || '');
              setEditNameVisible(true);
            }}
          >
            <View style={styles.sheetItemIcon}>
              <ThemedText style={styles.sheetItemEmoji}>✏️</ThemedText>
            </View>
            <ThemedText style={styles.sheetItemText}>修改昵称</ThemedText>
            <ThemedText style={styles.sheetItemArrow}>›</ThemedText>
          </TouchableOpacity>

          <View style={styles.sheetDivider} />

          <TouchableOpacity
            style={styles.sheetItem}
            onPress={async () => {
              setSettingsVisible(false);
              await logout();
              router.replace('/');
            }}
          >
            <View style={styles.sheetItemIcon}>
              <ThemedText style={styles.sheetItemEmoji}>🚪</ThemedText>
            </View>
            <ThemedText style={[styles.sheetItemText, styles.logoutText]}>退出登录</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetCancel} onPress={() => setSettingsVisible(false)}>
            <ThemedText style={styles.sheetCancelText}>取消</ThemedText>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 修改昵称弹层 */}
      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setEditNameVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={styles.nameModal}>
          <ThemedText style={styles.nameModalTitle}>修改昵称</ThemedText>
          <TextInput
            style={styles.nameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="请输入新昵称"
            placeholderTextColor={colors.neutral[400]}
            maxLength={20}
            autoFocus
          />
          <View style={styles.nameModalActions}>
            <TouchableOpacity
              style={styles.nameModalCancel}
              onPress={() => setEditNameVisible(false)}
            >
              <ThemedText style={styles.nameModalCancelText}>取消</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nameModalConfirm, saving && { opacity: 0.6 }]}
              onPress={saveNickname}
              disabled={saving}
            >
              <LinearGradient
                colors={[colors.primary[500], colors.primary[600]]}
                style={styles.nameModalConfirmGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <ThemedText style={styles.nameModalConfirmText}>
                  {saving ? '保存中...' : '保存'}
                </ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
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

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing[8],
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
    marginBottom: spacing[8],
  },
  loginPromptButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    width: 200,
  },
  loginPromptGradient: {
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  loginPromptText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },

  profileCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[3],
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  profileGradient: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
  },
  settingsIcon: {
    fontSize: 16,
  },
  avatarGradientBorder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2.5,
    flexShrink: 0,
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing[4],
    justifyContent: 'center',
  },
  userName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[1],
  },
  userId: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
    fontWeight: typography.fontWeight.normal,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
    marginBottom: 2,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.neutral[200],
  },

  contentSection: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingTop: spacing[4],
    ...shadows.lg,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
  },
  tabActive: { backgroundColor: colors.primary[50] },
  tabText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.neutral[600],
  },
  tabTextActive: {
    color: colors.primary[600],
    fontWeight: typography.fontWeight.bold,
  },
  contentList: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[20],
  },
  contentRow: { gap: spacing[3], marginBottom: spacing[3] },
  contentCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  contentImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.neutral[100],
  },
  contentImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: { fontSize: 40 },
  contentInfo: { padding: spacing[3] },
  contentTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  contentDate: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[20],
  },
  emptyContentIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  emptyContentEmoji: { fontSize: 40 },
  emptyContentText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[500],
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[4],
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[300],
    alignSelf: 'center',
    marginTop: spacing[3],
    marginBottom: spacing[4],
  },
  sheetTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[2],
  },
  sheetItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[4],
  },
  sheetItemEmoji: { fontSize: 20 },
  sheetItemText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.neutral[900],
    fontWeight: typography.fontWeight.medium,
  },
  sheetItemArrow: {
    fontSize: 22,
    color: colors.neutral[400],
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginVertical: spacing[2],
  },
  logoutText: {
    color: colors.error,
  },
  sheetCancel: {
    marginTop: spacing[4],
    paddingVertical: spacing[4],
    backgroundColor: colors.neutral[100],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.neutral[700],
  },

  nameModal: {
    position: 'absolute',
    left: spacing[6],
    right: spacing[6],
    top: '35%',
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    ...shadows.xl,
  },
  nameModalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  nameInput: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    color: colors.neutral[900],
    marginBottom: spacing[5],
  },
  nameModalActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  nameModalCancel: {
    flex: 1,
    paddingVertical: spacing[3],
    backgroundColor: colors.neutral[100],
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  nameModalCancelText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[700],
    fontWeight: typography.fontWeight.medium,
  },
  nameModalConfirm: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  nameModalConfirmGradient: {
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  nameModalConfirmText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: '#ffffff',
  },
});

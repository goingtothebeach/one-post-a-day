import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { API_BASE } from './api';
import { useAuth } from '../context/AuthContext';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, TouchableOpacity, View, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import dayjs from 'dayjs';
import { DesignSystem } from '@/constants/design-system';

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
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (hydrated && !token) {
      router.replace('/');
    }
  }, [hydrated, token]);
  const [tickets, setTickets] = useState<TicketHistory[]>([]);
  const [profileData, setProfileData] = useState<ProfileData>({ likes: [], favorites: [] });
  const [activeTab, setActiveTab] = useState<TabKey>('likes');

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
          {/* 头像区域 */}
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={[colors.primary[400], colors.primary[600]]}
              style={styles.avatarGradientBorder}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.avatarInner}>
                <ThemedText style={styles.avatarText}>
                  {(user?.name || user?.phone || '?')[0].toUpperCase()}
                </ThemedText>
              </View>
            </LinearGradient>
          </View>

          {/* 用户信息 */}
          <ThemedText style={styles.userName}>{user?.name || user?.phone}</ThemedText>
          <ThemedText style={styles.userBio}>分享生活，记录美好瞬间 ✨</ThemedText>

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

          {/* 退出登录按钮 */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={async () => {
              await logout();
              router.replace('/');
            }}
          >
            <ThemedText style={styles.logoutText}>退出登录</ThemedText>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* 内容区域 */}
      <View style={styles.contentSection}>
        {/* Tab切换 */}
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

        {/* 内容列表 */}
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

  // 未登录状态
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
  emptyEmoji: {
    fontSize: 48,
  },
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

  // 个人信息卡片
  profileCard: {
    margin: spacing[4],
    marginBottom: spacing[5],
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  profileGradient: {
    padding: spacing[6],
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: spacing[4],
  },
  avatarGradientBorder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  userName: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  userBio: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
    marginBottom: spacing[6],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    width: '100%',
    marginBottom: spacing[5],
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
    marginBottom: spacing[1],
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[600],
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.neutral[200],
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  logoutText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[700],
    fontWeight: typography.fontWeight.medium,
  },

  // 内容区域
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
  tabActive: {
    backgroundColor: colors.primary[50],
  },
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
  contentRow: {
    gap: spacing[3],
    marginBottom: spacing[3],
  },
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
  placeholderIcon: {
    fontSize: 40,
  },
  contentInfo: {
    padding: spacing[3],
  },
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
  emptyContentEmoji: {
    fontSize: 40,
  },
  emptyContentText: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[500],
  },
});

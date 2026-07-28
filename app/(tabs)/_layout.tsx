import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import DS from '@/constants/design-system';

const { colors, typography } = DS;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // 朱红只留给「今日发言人」，导航选中态用墨色，避免强调色滥用
        tabBarActiveTintColor: colors.ink[900],
        tabBarInactiveTintColor: colors.ink[400],
        headerShown: false,
        // 纸的分层靠发丝细线，不靠毛玻璃和阴影
        tabBarStyle: {
          backgroundColor: colors.paper.base,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.rule.base,
          // 高度要给足：图标 22 + 文字 ~15 + 上下内边距，否则标签会被裁掉
          paddingTop: 9,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
          height: Platform.OS === 'ios' ? 92 : 76,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.serif,
          fontSize: 11,
          fontWeight: '600' as const,
          letterSpacing: 1.5,
          marginTop: 4,
          includeFontPadding: false,
        },
        tabBarBackground: () => <View style={styles.bg} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '今日',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '抽签',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="ticket.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '存档',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="person.crop.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen name="image" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="api" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.paper.base,
  },
});

import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import DS from '@/constants/design-system';

const { colors, gradient, typography, elevation } = DS;

type TabIconName = React.ComponentProps<typeof IconSymbol>['name'];

/**
 * Tab 图标。当前态是渐变填充的圆角方块（白色图标），非当前态是浅粉灰线性图标。
 *
 * 两种态都塞进同样 24×24 的盒子里，否则切 tab 时下面的文字会上下跳。
 * 图标继续走 IconSymbol（内部是 lucide 深层导入，不要改成整包导入）。
 */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) {
  if (focused) {
    return (
      <LinearGradient
        colors={gradient.primary}
        start={gradient.diagonal.start}
        end={gradient.diagonal.end}
        style={styles.iconActive}
      >
        <IconSymbol size={17} name={name} color="#FFFFFF" />
      </LinearGradient>
    );
  }
  return (
    <View style={styles.iconIdle}>
      <IconSymbol size={19} name={name} color={color} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // 当前态用玫粉（主强调色），非当前态用最浅的字色，靠对比而不是靠线做区分
        tabBarActiveTintColor: colors.seal.base,
        tabBarInactiveTintColor: colors.ink[400],
        headerShown: false,
        tabBarStyle: {
          // 底色由 tabBarBackground 提供（半透明白压在渐变上），这里必须保持透明
          backgroundColor: 'transparent',
          borderTopWidth: 1,
          borderTopColor: colors.rule.base,
          // 高度要给足：图标盒 24 + 文字 ~13 + 上下内边距，否则标签会被裁掉
          paddingTop: 9,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
          height: Platform.OS === 'ios' ? 92 : 76,
          // 系统默认阴影是灰的，会在毛玻璃上方压出一道脏边
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.rounded,
          fontSize: typography.size.micro,
          fontWeight: typography.weight.bold,
          letterSpacing: typography.tracking.wide,
          marginTop: 5,
          includeFontPadding: false,
        },
        // 页面内容不会延伸到 tab bar 后面，bar 背后是导航容器的白底，
        // 所以这里自己铺一层渐变再压半透明白，才能拿到和页面一致的毛玻璃感。
        //
        // 注意不要复用 PageGradient：它是整页尺寸的斜向渐变（右上→左下），
        // 压进 76px 高的横条里那条轴几乎退化成纯水平，左右两端色差明显、
        // 跟上方页面接不上。这里单独用一次近似垂直的取色，只取页面渐变
        // 最底部那两段（页面到底部时已经是偏粉的那一端）。
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[gradient.page[1], gradient.page[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.25, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.glass} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '今日',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="house.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '抽签',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="ticket.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '存档',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person.crop.circle.fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="image" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="api" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glass.fillStrong,
  },
  iconActive: {
    width: 24,
    height: 24,
    borderRadius: DS.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.lift,
  },
  iconIdle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

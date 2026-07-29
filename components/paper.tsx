import { View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DS from '@/constants/design-system';

const { colors, gradient, radius, elevation } = DS;

/**
 * 柔和分隔线。上一版靠它做主要分层；新语言主要靠留白和卡片，
 * 所以这里的线刻意做得很淡，只在列表项之间做轻微提示。
 */
export function Rule({
  style,
  tone = 'light',
  inset = 0,
}: {
  style?: ViewStyle;
  tone?: 'light' | 'base' | 'strong';
  inset?: number;
}) {
  return (
    <View
      style={[
        styles.rule,
        { backgroundColor: colors.rule[tone], marginHorizontal: inset },
        style,
      ]}
    />
  );
}

/**
 * 上一版刊头下的双线。新语言的刊头是居中柔光标题，不需要双线压边，
 * 这里退化成单条极淡的线。
 * @deprecated 新设计用留白代替，保留以兼容既有调用。
 */
export function DoubleRule({ style }: { style?: ViewStyle }) {
  return (
    <View style={style}>
      <View style={[styles.rule, { backgroundColor: colors.rule.light }]} />
    </View>
  );
}

/**
 * 上一版纸车票的撕裂黛孔。
 * @deprecated 新语言里抽签卡是毛玻璃卡片，没有票根，渲染成空。
 * 保留导出只为让仍在 import 的页面继续编译。
 */
export function Perforation({
  orientation = 'horizontal',
  color = colors.paper.base,
}: {
  orientation?: 'horizontal' | 'vertical';
  color?: string;
}) {
  return null;
}

/**
 * 毛玻璃卡片 —— 这套语言的主要容器。
 *
 * 注意：这里用半透明白底 + 描边 + 柔光阴影模拟毛玻璃，不用 expo-blur 的 BlurView。
 * 原因是 BlurView 在 RN Web 上要靠 backdrop-filter，Android 上开销明显，
 * 而背景本身是低频渐变，半透明白已经足够出效果，且到处都能用。
 */
export function GlassCard({
  children,
  style,
  tone = 'fill',
  padded = false,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
  /** fill=标准卡片，fillStrong=需要更实的（贴顶栏），fillSoft=次级区块 */
  tone?: 'fill' | 'fillStrong' | 'fillSoft';
  padded?: boolean;
}) {
  return (
    <View
      style={[
        styles.glass,
        { backgroundColor: colors.glass[tone] },
        padded && { padding: DS.spacing[4] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * 纸面容器。新语言里等同于毛玻璃卡片。
 * @deprecated 用 GlassCard，语义更准。
 */
export function Sheet({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return <GlassCard style={style}>{children}</GlassCard>;
}

/**
 * 页面背景渐变。铺在每个页面最底层（右上角洒光的那层暖粉）。
 * 用 absoluteFill，内容照常渲染在上面。
 */
export function PageGradient() {
  return (
    <LinearGradient
      colors={gradient.page}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  glass: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.glass.border,
    ...elevation.glow,
  },
});

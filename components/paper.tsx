import { View, StyleSheet, type ViewStyle } from 'react-native';
import DS from '@/constants/design-system';

const { colors, spacing, ticket } = DS;

/** 发丝细线。代替阴影做分隔——这套设计语言的主要分层手段。 */
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

/** 双线分隔（刊头下方那种），印刷品常见的强分节。 */
export function DoubleRule({ style }: { style?: ViewStyle }) {
  return (
    <View style={style}>
      <View style={[styles.rule, { backgroundColor: colors.rule.strong }]} />
      <View style={{ height: 2 }} />
      <View style={[styles.rule, { backgroundColor: colors.rule.light }]} />
    </View>
  );
}

/**
 * 纸车票的黛孔边（抽签页用）。
 * 用一排底色圆点压在票面边缘上模拟撕裂孔，比图片资源轻。
 */
export function Perforation({
  orientation = 'horizontal',
  color = colors.paper.base,
}: {
  orientation?: 'horizontal' | 'vertical';
  color?: string;
}) {
  const isH = orientation === 'horizontal';
  const dots = Array.from({ length: 40 });
  return (
    <View
      style={[
        styles.perfTrack,
        isH ? styles.perfTrackH : styles.perfTrackV,
      ]}
      pointerEvents="none"
    >
      {dots.map((_, i) => (
        <View
          key={i}
          style={{
            width: ticket.perforationSize,
            height: ticket.perforationSize,
            borderRadius: ticket.perforationSize / 2,
            backgroundColor: color,
            marginHorizontal: isH ? ticket.perforationGap / 2 : 0,
            marginVertical: isH ? 0 : ticket.perforationGap / 2,
          }}
        />
      ))}
    </View>
  );
}

/** 纸面容器：暖白底 + 细边，不用阴影。 */
export function Sheet({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.sheet, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  perfTrack: {
    position: 'absolute',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  perfTrackH: {
    left: -spacing[2],
    right: -spacing[2],
    justifyContent: 'center',
  },
  perfTrackV: {
    flexDirection: 'column',
    top: -spacing[2],
    bottom: -spacing[2],
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.paper.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paper.edge,
    borderRadius: DS.radius.sm,
  },
});

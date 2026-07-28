import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import DS, { text as T } from '@/constants/design-system';
import { DoubleRule } from './paper';

const { colors, spacing, radius } = DS;

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 把 2026-07-28 排成「二〇二六年七月二十八日」，日刊的日期行。 */
export function chineseDate(d: Date): string {
  const y = String(d.getFullYear())
    .split('')
    .map((c) => CN_DIGITS[Number(c)])
    .join('');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const cnNum = (n: number) => {
    if (n <= 10) return CN_DIGITS[n] === '〇' ? '十' : n === 10 ? '十' : CN_DIGITS[n];
    if (n < 20) return '十' + (n % 10 === 0 ? '' : CN_DIGITS[n % 10]);
    const tens = Math.floor(n / 10);
    return CN_DIGITS[tens] + '十' + (n % 10 === 0 ? '' : CN_DIGITS[n % 10]);
  };
  return `${y}年${cnNum(m)}月${cnNum(day)}日`;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * 刊头。每个页面顶部统一用它，是「日刊」调性最直接的载体。
 * 左侧报名 + 日期，右侧可放一个操作（如设置）。
 */
export function Masthead({
  title = 'ONE POST A DAY',
  subtitle,
  right,
  style,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const now = new Date();
  const line = subtitle ?? `${chineseDate(now)}　${WEEKDAYS[now.getDay()]}`;
  return (
    <View style={style}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={T.masthead}>{title}</Text>
          <Text style={[T.dateline, { marginTop: spacing[1] }]}>{line}</Text>
        </View>
        {right}
      </View>
      <DoubleRule style={{ marginTop: spacing[3] }} />
    </View>
  );
}

/**
 * 朱红圆印。全局唯一的强调色用在这里——「今日发言人」的身份标记。
 * 刻意做轻微旋转，像手工盖上去的。
 */
export function Seal({
  label = '今日发言',
  size = 62,
  style,
}: {
  label?: string;
  size?: number;
  style?: ViewStyle;
}) {
  const chars = label.split('');
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.sm,
          borderWidth: 2,
          borderColor: colors.seal.base,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-7deg' }],
          backgroundColor: colors.seal.tint,
        },
        style,
      ]}
    >
      <View style={styles.sealGrid}>
        {chars.map((c, i) => (
          <Text
            key={i}
            style={{
              fontFamily: DS.typography.fontFamily.serif,
              fontSize: size * 0.28,
              lineHeight: size * 0.34,
              fontWeight: '700',
              color: colors.seal.base,
              width: size * 0.34,
              textAlign: 'center',
            }}
          >
            {c}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** 小号朱红徽标，用于「唯一发帖人」这类行内标记。 */
export function SealTag({ children }: { children: string }) {
  return (
    <View style={styles.sealTag}>
      <Text style={styles.sealTagText}>{children}</Text>
    </View>
  );
}

/** 栏目标签，如「今日」「往期」。小号大写 + 细线，报刊栏目感。 */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionLabel, style]}>
      <Text style={T.label}>{children}</Text>
      <View style={styles.sectionLabelLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '72%',
    justifyContent: 'center',
  },
  sealTag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.seal.base,
    backgroundColor: colors.seal.tint,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  sealTagText: {
    fontFamily: DS.typography.fontFamily.sans,
    fontSize: DS.typography.size.micro,
    fontWeight: '600',
    color: colors.seal.deep,
    letterSpacing: 0.4,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  sectionLabelLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule.base,
  },
});

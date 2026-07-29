import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DS, { text as T } from '@/constants/design-system';

const { colors, gradient, spacing, radius, elevation } = DS;

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 把 2026-07-28 排成「二〇二六年七月二十八日」。 */
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

/** 「7月29日」这种短日期，新刊头用它，比中文全写更轻快。 */
function shortDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 页头。居中排布：小号刊名 + 大标题 + 副标题。
 *
 * 上一版是左对齐的报纸刊头（刊名+中文长日期+双线），
 * 新语言改成居中柔光标题——居中让页面更像「内容展示」而不是「文档」。
 */
export function Masthead({
  title = 'SPOTLIGHT',
  subtitle,
  /** 大标题。不传则用日期，保持与上一版「日期即标题」的行为一致 */
  heading,
  right,
  style,
}: {
  title?: string;
  subtitle?: string;
  heading?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const now = new Date();
  return (
    <View style={[styles.mastWrap, style]}>
      {right ? <View style={styles.mastRight}>{right}</View> : null}
      <Text style={[T.masthead, styles.mastCenter]}>{title}</Text>
      <Text style={[T.display, styles.mastHeading]}>
        {heading ?? `${shortDate(now)} · 今日发言人`}
      </Text>
      {subtitle ? (
        <Text style={[T.dateline, styles.mastCenter, { marginTop: spacing[1] }]}>
          {subtitle}
        </Text>
      ) : (
        <Text style={[T.dateline, styles.mastCenter, { marginTop: spacing[1] }]}>
          {WEEKDAYS[now.getDay()]} · 全网只有这一条
        </Text>
      )}
    </View>
  );
}

/**
 * 「今日唯一」渐变徽标。
 *
 * 上一版是朱红方印（手工盖章感）。新语言里身份标记改成柔光胶囊：
 * 左侧一个渐变小圆点 + 文字，浮在图片左上角或行内。
 */
export function Seal({
  label = '今日唯一',
  size = 62,
  style,
}: {
  label?: string;
  /** 上一版按边长渲染方印。新版是胶囊，size 仅用于换算字号 */
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sealPill, style]}>
      <LinearGradient
        colors={gradient.primary}
        start={gradient.diagonal.start}
        end={gradient.diagonal.end}
        style={styles.sealDot}
      />
      <Text style={styles.sealPillText}>{label}</Text>
    </View>
  );
}

/** 小号徽标，用于「今日唯一发表」这类行内标记。 */
export function SealTag({ children }: { children: string }) {
  return (
    <View style={styles.sealTag}>
      <Text style={styles.sealTagText}>{children}</Text>
    </View>
  );
}

/** 栏目标签，如「今日」「往期」。小号大写字，新语言里不再挂延伸线。 */
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
    </View>
  );
}

/**
 * 主操作按钮：渐变填充 + 粉色发光。
 * 这套语言里所有主 CTA 都走这里（报名、发布），不要用纯色块。
 */
export function GradientButton({
  label,
  onPress,
  disabled = false,
  rich = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** 三段渐变，用于页面最重要的那一个按钮 */
  rich?: boolean;
  style?: ViewStyle;
}) {
  if (disabled) {
    return (
      <View style={[styles.btnDisabled, style]}>
        <Text style={[T.button, { color: colors.ink[300] }]}>{label}</Text>
      </View>
    );
  }
  return (
    <LinearGradient
      colors={rich ? gradient.primaryRich : gradient.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.6 }}
      style={[styles.btn, style]}
    >
      <Text style={T.button}>{label}</Text>
    </LinearGradient>
  );
}

/** 渐变头像。没有图片时用它做占位，比灰色圆好看很多。 */
export function GradientAvatar({
  size = 38,
  style,
}: {
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={gradient.avatar}
      start={gradient.diagonal.start}
      end={gradient.diagonal.end}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2.5,
          borderColor: '#FFFFFF',
        },
        elevation.lift,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  mastWrap: {
    alignItems: 'center',
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
  },
  mastRight: {
    position: 'absolute',
    right: 0,
    top: spacing[2],
    zIndex: 2,
  },
  mastCenter: {
    textAlign: 'center',
  },
  mastHeading: {
    textAlign: 'center',
    marginTop: spacing[1],
  },
  sealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 1,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderRadius: radius.full,
    paddingLeft: 7,
    paddingRight: spacing[3],
    paddingVertical: 5,
    ...elevation.lift,
  },
  sealDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  sealPillText: {
    fontFamily: DS.typography.fontFamily.rounded,
    fontSize: DS.typography.size.micro,
    fontWeight: '700',
    color: colors.seal.base,
    letterSpacing: 0.4,
  },
  sealTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.seal.tint,
    borderWidth: 1,
    borderColor: colors.glass.borderPink,
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  sealTagText: {
    fontFamily: DS.typography.fontFamily.rounded,
    fontSize: DS.typography.size.micro,
    fontWeight: '700',
    color: colors.seal.deep,
    letterSpacing: 0.4,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[1],
  },
  btn: {
    borderRadius: radius.xxl,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.glowPink,
  },
  btnDisabled: {
    borderRadius: radius.xxl,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper.sunken,
    borderWidth: 1,
    borderColor: colors.paper.edge,
  },
});

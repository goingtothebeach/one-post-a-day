/**
 * 设计系统 —— 纸墨日刊 (Editorial Paper)
 *
 * 调性来源于产品本身的稀缺感：每天只有一个人能发声，18:00 抽签定人。
 * 所以整个视觉按「每日出刊的一份纸质日报 / 一封信」来组织：
 *   - 暖白纸底，不是纯白；文字是墨色，不是纯黑（降低屏幕上的刺眼对比）
 *   - 衬线体承担标题与日期，营造「印刷物」感
 *   - 朱红只用于「今日发言人」这一件事（印章色），是全局唯一的强调色
 *   - 分隔靠发丝细线和留白，不靠阴影和渐变
 *
 * 硬规则（改 UI 时请遵守，否则调性会立刻散掉）：
 *   1. 不用彩色渐变做背景或按钮。渐变在这套语言里只允许出现在图片蒙版。
 *   2. 阴影几乎不用。需要层次时用 rule（细线）或 paper 色阶。
 *   3. 朱红 (seal) 不做大面积填充，只做印章、小徽标、关键数字。
 *   4. 圆角一律小（≤ 4px）。纸和印刷品没有大圆角。
 *   5. 不用 emoji 当图标。图标用 lucide 线性图标，字重与文字一致。
 */

import { Platform } from 'react-native';

/** 衬线栈：web 用 CSS 字体栈；native 各挑一个系统衬线。 */
const serifStack =
  '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, "Times New Roman", serif';

/** 无衬线栈：正文与 UI 控件。 */
const sansStack =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif';

const fontFamily = {
  /** 标题、日期、刊头 */
  serif: Platform.select({
    web: serifStack,
    ios: 'Songti SC',
    android: 'serif',
    default: serifStack,
  }) as string,
  /** 正文、按钮、表单 */
  sans: Platform.select({
    web: sansStack,
    ios: 'System',
    android: 'sans-serif',
    default: sansStack,
  }) as string,
  /** 倒计时、ID、票号等需要对齐的数字 */
  mono: Platform.select({
    web: '"SF Mono", ui-monospace, "Roboto Mono", Menlo, monospace',
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }) as string,
};

const colors = {
  /** 纸 —— 背景层级，由浅到深 */
  paper: {
    base: '#FAF8F3',   // 主背景，暖白
    raised: '#FFFDF8', // 卡片/浮层，比背景更亮一点
    sunken: '#F2EFE7', // 输入框、次级区块
    edge: '#E6E1D6',   // 纸的边缘/描边
  },

  /** 墨 —— 文字层级，由深到浅 */
  ink: {
    900: '#1A1A18', // 大标题
    700: '#33322E', // 正文
    500: '#6B6961', // 次要信息
    400: '#918E84', // 占位符、弱提示
    300: '#B8B4A8', // 禁用态
  },

  /** 朱红印章色 —— 全局唯一强调色，只给「今日发言人」相关的东西 */
  seal: {
    base: '#C8452F',
    deep: '#A3341F',
    tint: '#F6E4DF', // 极浅底色，用于徽标背景
  },

  /** 发丝细线 —— 代替阴影做分隔 */
  rule: {
    light: '#EAE6DC',
    base: '#DCD6C8',
    strong: '#C4BCA8',
  },

  /** 功能色，压低饱和度以融入纸感 */
  state: {
    success: '#4F7A52',
    warning: '#B07C2E',
    error: '#B23B2C',
  },
};

const typography = {
  fontFamily,

  size: {
    /** 刊头小字、标签 */
    micro: 11,
    caption: 12,
    footnote: 13,
    body: 15,
    bodyLg: 16,
    /** 卡片标题 */
    title: 20,
    /** 帖子大标题 */
    headline: 26,
    /** 刊头 / 中签姓名 */
    display: 34,
  },

  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  /** 字距。中文标题收紧、西文刊头放宽（做「印刷」感的关键） */
  tracking: {
    tight: -0.4,
    normal: 0,
    wide: 1.2,
    /** 刊头 "ONE POST A DAY" 这种全大写小字 */
    masthead: 3.2,
  },

  leading: {
    tight: 1.25,
    normal: 1.6,
    relaxed: 1.85,
  },
};

/** 4px 基准栅格 */
const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
};

/** 纸和印刷品没有大圆角 */
const radius = {
  none: 0,
  sm: 2,
  md: 4,
  /** 仅头像等必须为圆的元素 */
  full: 9999,
};

/**
 * 阴影在这套语言里几乎不用。只保留一档极轻的，
 * 给必须浮起来的东西（弹窗、贴顶栏）。其余一律用 rule 线。
 */
const elevation = {
  none: {},
  lift: {
    shadowColor: '#2A2620',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  overlay: {
    shadowColor: '#2A2620',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
};

const motion = {
  duration: { fast: 140, normal: 240, slow: 420 },
};

/** 票据黛孔（抽签页那张纸车票的锯齿边）用到的尺寸 */
const ticket = {
  perforationSize: 7,
  perforationGap: 11,
};

export const DS = {
  colors,
  typography,
  spacing,
  radius,
  elevation,
  motion,
  ticket,
};

/** 常用文本样式预设，避免每个页面重复拼 fontFamily/size/weight。 */
export const text = {
  masthead: {
    fontFamily: fontFamily.serif,
    fontSize: typography.size.caption,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.tracking.masthead,
    color: colors.ink[900],
  },
  dateline: {
    fontFamily: fontFamily.serif,
    fontSize: typography.size.footnote,
    color: colors.ink[500],
    letterSpacing: 0.3,
  },
  display: {
    fontFamily: fontFamily.serif,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.ink[900],
    letterSpacing: typography.tracking.tight,
  },
  headline: {
    fontFamily: fontFamily.serif,
    fontSize: typography.size.headline,
    fontWeight: typography.weight.bold,
    color: colors.ink[900],
    letterSpacing: typography.tracking.tight,
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: typography.size.title,
    fontWeight: typography.weight.semibold,
    color: colors.ink[900],
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.body,
    color: colors.ink[700],
    lineHeight: typography.size.body * typography.leading.normal,
  },
  bodyRelaxed: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.bodyLg,
    color: colors.ink[700],
    lineHeight: typography.size.bodyLg * typography.leading.relaxed,
  },
  meta: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.ink[500],
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.caption,
    color: colors.ink[400],
  },
  label: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.micro,
    fontWeight: typography.weight.semibold,
    color: colors.ink[500],
    letterSpacing: 0.8,
  },
  numeral: {
    fontFamily: fontFamily.mono,
    fontSize: typography.size.body,
    color: colors.ink[900],
    fontVariant: ['tabular-nums'] as const,
  },
};

/** web 端去掉输入框默认 focus 描边（RN Web 需要这样注入） */
export const noOutline = { outline: 'none' } as any;

export default DS;

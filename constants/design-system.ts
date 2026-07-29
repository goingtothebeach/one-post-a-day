/**
 * 设计系统 —— 柔光甜美 (Soft Glow)
 *
 * 调性来源于产品的核心动机：中签者当天会被所有人看见，值得为这一次认真做一版。
 * 所以视觉要让人「想动手打扮自己的帖子」，而不是「读一份报纸」：
 *   - 奶油粉暖调渐变底，光是从右上角洒进来的
 *   - 卡片是半透明毛玻璃，浮在光上面，不是贴在纸上
 *   - 玫粉是主强调色，用在数字、主按钮、当前态；暖橘做渐变的另一端
 *   - 层次靠柔光阴影和大圆角，不靠细线
 *
 * 硬规则（改 UI 时请遵守，否则调性会立刻散掉）：
 *   1. 主操作一律用 gradient.primary 填充，不要用纯色块。
 *   2. 卡片一律毛玻璃（glass.*）+ glow 阴影，不要实心白底加细边。
 *   3. 圆角要大：卡片 ≥ 20，按钮 ≥ 16，图片 ≥ 18。小圆角会立刻回到「表单」感。
 *   4. 文字用圆润无衬线，数字加粗放大（倒计时和概率是情绪点，不是信息点）。
 *   5. 不用 emoji 当图标。图标用 lucide 线性图标，颜色跟随文字层级。
 *   6. 中文标题不要用衬线体——那是上一版「纸墨日刊」的语言，混用会显脏。
 */

import { Platform } from 'react-native';

/**
 * 圆润无衬线栈：这套语言的主字体，承担全部文字。
 * iOS 有 SF Pro Rounded（'SF Pro Rounded' 在 RN 里要用 system-ui 变体名拿不到，
 * 所以 native 侧退回 System，靠字重和字距做圆润感）。
 */
const roundedStack =
  '"SF Pro Rounded", "Arial Rounded MT Bold", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif';

const sansStack =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif';

const fontFamily = {
  /** 标题、刊头、按钮 —— 圆润感的来源 */
  rounded: Platform.select({
    web: roundedStack,
    ios: 'System',
    android: 'sans-serif-medium',
    default: roundedStack,
  }) as string,
  /** 正文 */
  sans: Platform.select({
    web: sansStack,
    ios: 'System',
    android: 'sans-serif',
    default: sansStack,
  }) as string,
  /**
   * 倒计时、概率、ID。
   * 注意不用等宽字体：这套语言里数字是情绪点，要圆要粗，
   * 对齐靠 fontVariant: tabular-nums 保证，不靠 monospace。
   */
  numeral: Platform.select({
    web: roundedStack,
    ios: 'System',
    android: 'sans-serif-medium',
    default: roundedStack,
  }) as string,
  /**
   * 兼容上一版：仍有组件按 serif/mono 取值。指向圆润栈，
   * 这样即使漏改一处也不会掉回衬线，只是少了点区分度。
   */
  serif: Platform.select({
    web: roundedStack,
    ios: 'System',
    android: 'sans-serif-medium',
    default: roundedStack,
  }) as string,
  mono: Platform.select({
    web: roundedStack,
    ios: 'System',
    android: 'sans-serif-medium',
    default: roundedStack,
  }) as string,
};

const colors = {
  /** 底 —— 页面背景与卡片层级，由浅到深 */
  paper: {
    base: '#FFF6F1',   // 主背景（渐变的起点）
    raised: '#FFFFFF', // 需要不透明白的地方
    sunken: '#FFEFE9', // 输入框、次级区块
    edge: '#FFE0D6',   // 描边
  },

  /** 字 —— 文字层级，由深到浅。是带红调的暖棕，不是灰 */
  ink: {
    900: '#3E2830', // 大标题
    700: '#4A3138', // 卡片标题
    500: '#8B6F79', // 正文、次要信息
    400: '#BC94A2', // 占位符、弱提示
    300: '#DCBCC6', // 禁用态
  },

  /** 玫粉 —— 主强调色。数字、主按钮、当前态 */
  seal: {
    base: '#E0648B',
    deep: '#C4657F',
    tint: '#FFE8EF', // 极浅底色，用于徽标背景
  },

  /** 暖橘 —— 渐变的另一端，不单独大面积使用 */
  peach: {
    base: '#FFAF9B',
    deep: '#FF8BA7',
    tint: '#FFEDE6',
  },

  /** 毛玻璃卡片的底色与描边（半透明，压在渐变背景上） */
  glass: {
    fill: 'rgba(255, 255, 255, 0.68)',
    fillStrong: 'rgba(255, 255, 255, 0.80)',
    fillSoft: 'rgba(255, 255, 255, 0.46)',
    border: 'rgba(255, 255, 255, 0.90)',
    borderPink: 'rgba(255, 190, 205, 0.60)',
  },

  /** 分隔线。这套语言里几乎不用，保留给必须的地方 */
  rule: {
    light: '#FFE8EF',
    base: '#FFD9E4',
    strong: '#FFC2D4',
  },

  /** 功能色，往暖调靠以融入整体 */
  state: {
    success: '#5BA37F',
    warning: '#E09B54',
    error: '#E0648B',
  },
};

/**
 * 渐变。这套语言的核心资产 —— 主按钮、头像、图片占位、当前态图标都用它。
 * 每个都是 expo-linear-gradient 的 colors 数组，配 start/end 走 120° 斜向。
 */
const gradient = {
  /** 页面背景：右上角洒光 */
  page: ['#FFF6F1', '#FFEDE6', '#FFDDE8'] as const,
  /** 主操作按钮 */
  primary: ['#FF8BA7', '#FFAF9B'] as const,
  /** 主操作按钮（三段，用于最重要的 CTA） */
  primaryRich: ['#FF8BA7', '#FFA898', '#FFC49B'] as const,
  /** 头像、小圆点 */
  avatar: ['#FFB8CB', '#FFD9BE'] as const,
  /** 图片占位 / 空态 */
  photo: ['#FFC9AF', '#FFA8C5', '#D9A9EC'] as const,
  /** 图片上方的压暗蒙版，保证白字可读 */
  photoScrim: ['transparent', 'rgba(90, 40, 60, 0.30)'] as const,
  /** 斜向渐变的方向，配合上面任一色组使用 */
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** 竖直向下（蒙版用） */
  down: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
};

const typography = {
  fontFamily,

  size: {
    micro: 10.5,
    caption: 12,
    footnote: 13,
    body: 14.5,
    bodyLg: 16,
    /** 卡片标题 */
    title: 19.5,
    /** 帖子大标题 */
    headline: 24,
    /** 刊头 / 中签姓名 */
    display: 30,
    /** 倒计时数字 */
    numeral: 32,
  },

  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    /** 数字和主按钮用 —— 圆润风格靠重字重立住 */
    heavy: '800' as const,
  },

  /** 字距。中文标题收紧，英文小字标签放宽 */
  tracking: {
    tight: -0.35,
    normal: 0,
    wide: 1.2,
    /** 刊头 "ONE POST A DAY" 这种全大写小字 */
    masthead: 4,
  },

  leading: {
    tight: 1.3,
    normal: 1.7,
    relaxed: 1.75,
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

/** 圆角要大。小圆角会立刻回到「表单」感 */
const radius = {
  none: 0,
  /** 极小元素（徽标内的小色块） */
  sm: 8,
  /** 输入框、小卡片 */
  md: 16,
  /** 按钮 */
  lg: 20,
  /** 卡片 */
  xl: 24,
  /** 大卡片、主 CTA */
  xxl: 28,
  /** 头像、胶囊按钮 */
  full: 9999,
};

/**
 * 阴影是这套语言的主要分层手段（上一版靠细线）。
 * 全部带粉调，让浮起来的东西看着是「发光」而不是「压了层灰」。
 */
const elevation = {
  none: {},
  /** 小元素：头像、徽标 */
  lift: {
    shadowColor: '#D88CA0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 3,
  },
  /** 卡片 */
  glow: {
    shadowColor: '#D88CA0',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20,
    shadowRadius: 34,
    elevation: 8,
  },
  /** 主按钮：粉色发光，比卡片更亮更实 */
  glowPink: {
    shadowColor: '#FF8BA7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  /** 弹窗、贴顶栏 */
  overlay: {
    shadowColor: '#B06A80',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 40,
    elevation: 16,
  },
};

const motion = {
  duration: { fast: 140, normal: 240, slow: 420 },
};

/**
 * 上一版纸车票黛孔的尺寸。新语言里抽签页不再用撕裂票根，
 * 保留常量只为让仍在 import 的旧代码继续编译。
 * @deprecated 新设计不用黛孔，改用毛玻璃卡片。
 */
const ticket = {
  perforationSize: 7,
  perforationGap: 11,
};

/** 毛玻璃模糊强度（expo-blur 的 intensity） */
const blur = {
  card: 18,
  bar: 20,
};

export const DS = {
  colors,
  gradient,
  typography,
  spacing,
  radius,
  elevation,
  motion,
  ticket,
  blur,
};

/** 常用文本样式预设，避免每个页面重复拼 fontFamily/size/weight。 */
export const text = {
  /** 刊头小字 "ONE POST A DAY" */
  masthead: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.micro,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.tracking.masthead,
    color: colors.ink[400],
  },
  /** 刊头下的日期行 */
  dateline: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.caption,
    color: colors.ink[400],
    letterSpacing: 0.2,
  },
  /** 页面主标题（「今晚，谁来发声？」） */
  display: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.ink[900],
    letterSpacing: typography.tracking.tight,
  },
  /** 帖子标题 */
  headline: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.headline,
    fontWeight: typography.weight.bold,
    color: colors.ink[900],
    letterSpacing: typography.tracking.tight,
    lineHeight: typography.size.headline * typography.leading.tight,
  },
  /** 卡片标题 */
  title: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.title,
    fontWeight: typography.weight.bold,
    color: colors.ink[700],
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.body,
    color: colors.ink[500],
    lineHeight: typography.size.body * typography.leading.normal,
  },
  bodyRelaxed: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.bodyLg,
    color: colors.ink[500],
    lineHeight: typography.size.bodyLg * typography.leading.relaxed,
  },
  meta: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.footnote,
    color: colors.ink[400],
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: typography.size.caption,
    color: colors.ink[400],
  },
  /** 小号大写标签（「选一个版式」「距离开奖」） */
  label: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.micro,
    fontWeight: typography.weight.bold,
    color: colors.ink[400],
    letterSpacing: 2.2,
  },
  /** 倒计时、概率等大数字 */
  numeral: {
    fontFamily: fontFamily.numeral,
    fontSize: typography.size.numeral,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'] as const,
  },
  /** 行内小数字（点赞数、人数） */
  numeralSm: {
    fontFamily: fontFamily.numeral,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.heavy,
    color: colors.seal.base,
    fontVariant: ['tabular-nums'] as const,
  },
  /** 主按钮文字 */
  button: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.bodyLg,
    fontWeight: typography.weight.heavy,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  /** 次级按钮文字 */
  buttonGhost: {
    fontFamily: fontFamily.rounded,
    fontSize: typography.size.body,
    fontWeight: typography.weight.bold,
    color: colors.seal.deep,
  },
};

/** web 端去掉输入框默认 focus 描边（RN Web 需要这样注入） */
export const noOutline = { outline: 'none' } as any;

export default DS;

import { Platform } from 'react-native';

const tintColorLight = '#ff4d6a';
const tintColorDark = '#ff99ab';

export const Colors = {
  light: {
    text: '#161616',
    background: '#f7f4f3',
    tint: tintColorLight,
    icon: '#7a7a7a',
    tabIconDefault: '#b5b5b5',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#f5f5f5',
    background: '#0f0f10',
    tint: tintColorDark,
    icon: '#c2c2c2',
    tabIconDefault: '#888',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

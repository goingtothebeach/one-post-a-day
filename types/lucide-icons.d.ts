/**
 * lucide-react-native 深层图标路径的类型声明。
 *
 * 为什么需要这个文件：
 * Metro（Expo 的打包器）不做 tree-shaking，所以
 *   import { Heart } from 'lucide-react-native'
 * 会把包里全部 1695 个图标打进 bundle —— 实测线上 bundle 里能搜到
 * Anchor / Umbrella / Wallet 等根本没用到的图标，未压缩 3.77 MB。
 *
 * 包的 `./icons` 子入口也是 barrel 文件（97 KB 的 re-export），同样全量。
 * 唯一能只引入单个图标的写法是直接指向 dist 里的具体文件，
 * 但包的 `exports` 字段只声明了 `.` 和 `./icons`，
 * 深层路径没有类型 —— 于是在这里补上。
 */
declare module 'lucide-react-native/dist/esm/icons/*.js' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export interface LucideProps extends SvgProps {
    size?: number | string;
    absoluteStrokeWidth?: boolean;
  }

  const Icon: ComponentType<LucideProps>;
  export default Icon;
}

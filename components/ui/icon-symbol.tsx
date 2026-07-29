// 按需导入：Metro 不做 tree-shaking，整包导入会把 1695 个图标全打进 bundle
// Home 在 v1 里的真实文件名是 house
import Home from 'lucide-react-native/dist/esm/icons/house.js';
import Ticket from 'lucide-react-native/dist/esm/icons/ticket.js';
import User from 'lucide-react-native/dist/esm/icons/user.js';
import { OpaqueColorValue, type StyleProp, type ViewStyle } from 'react-native';

type IconSymbolName = 'house.fill' | 'ticket.fill' | 'person.crop.circle.fill';

export function IconSymbol({
  name,
  size = 24,
  color,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: string;
}) {
  const props = { size, color: color as string, strokeWidth: 2 };
  if (name === 'house.fill') return <Home {...props} />;
  if (name === 'ticket.fill') return <Ticket {...props} />;
  if (name === 'person.crop.circle.fill') return <User {...props} />;
  return null;
}

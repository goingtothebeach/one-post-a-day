import { Home, Ticket, User } from 'lucide-react-native';
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

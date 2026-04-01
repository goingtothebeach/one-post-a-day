import { Platform } from 'react-native';
import { useSafeAreaInsets as useRNSafeAreaInsets } from 'react-native-safe-area-context';

const WEB_TOP_PADDING = 56;

export function useAppInsets() {
  const insets = useRNSafeAreaInsets();
  if (Platform.OS === 'web') {
    return { ...insets, top: WEB_TOP_PADDING };
  }
  return insets;
}

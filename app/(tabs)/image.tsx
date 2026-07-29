import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, Dimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import X from 'lucide-react-native/dist/esm/icons/x.js';

export default function ImageViewer() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const screen = Dimensions.get('window');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {Platform.OS === 'ios' && <StatusBar barStyle="light-content" />}
      
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()}>
        <Image
          source={{ uri: uri as string }}
          style={{ width: screen.width, height: screen.height }}
          contentFit="contain"
          transition={200}
        />
      </Pressable>
      
      {/* 关闭按钮 */}
      <Pressable 
        style={[styles.closeButton, { top: insets.top + 12 }]} 
        onPress={() => router.back()}
      >
        <X size={20} color="#FAF8F3" strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111110',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 26, 24, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});

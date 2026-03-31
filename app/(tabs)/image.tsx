import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, Dimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';

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
        <ThemedText style={styles.closeText}>✕</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
  },
});

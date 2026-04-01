import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '../context/AuthContext';
import { DesignSystem } from '@/constants/design-system';

const { colors } = DesignSystem;

export default function TabLayout() {
  const { token, user, hydrated } = useAuth();
  const authed = hydrated && Boolean(token && user?.id);

  const screenOptions = {
    tabBarActiveTintColor: colors.primary[600],
    tabBarInactiveTintColor: colors.neutral[400],
    headerShown: false,
    tabBarStyle: {
      position: 'absolute' as const,
      backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255, 255, 255, 0.95)',
      borderTopWidth: 0,
      paddingBottom: Platform.OS === 'ios' ? 20 : 8,
      paddingTop: 8,
      height: Platform.OS === 'ios' ? 88 : 70,
      elevation: 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600' as const,
      marginTop: 4,
    },
    tabBarBackground: () =>
      Platform.OS === 'ios' ? (
        <BlurView
          intensity={80}
          tint="light"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderTopWidth: 0.5,
            borderTopColor: colors.neutral[200],
          }}
        />
      ) : Platform.OS === 'web' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderTopWidth: 0.5,
            borderTopColor: colors.neutral[200],
          }}
        />
      ) : null,
  };

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 30 : 28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '抽签',
          href: authed ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 30 : 28} name="ticket.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          href: authed ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol size={focused ? 30 : 28} name="person.crop.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen name="image" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="api" options={{ href: null }} />
    </Tabs>
  );
}

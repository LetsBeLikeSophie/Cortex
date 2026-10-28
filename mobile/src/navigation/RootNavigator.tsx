import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, conceptOf, emToTracking, BODY_KR } from '../theme/themes';
import { DashedRule, VintageWallpaper } from '../components/Decor';
import { ArchiveIcon, PlusIcon, SearchIcon } from '../components/Icons';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import SaveSheetScreen from '../screens/SaveSheetScreen';
import ThemePickerScreen from '../screens/ThemePickerScreen';
import TabPickerScreen from '../screens/TabPickerScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TrashScreen from '../screens/TrashScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import AiConsentScreen from '../screens/AiConsentScreen';
import { onAiConsentRequired } from '../api/client';
import PaywallScreen from '../screens/PaywallScreen';
import ComposeScreen from '../screens/ComposeScreen';
import PinScreen from '../screens/PinScreen';
import TagCleanupScreen from '../screens/TagCleanupScreen';
import { registerPinOpener } from '../lock/memoLock';
import type { RootStackParamList, TabParamList } from './types';
import { strings } from '../i18n';

const S = strings({
  ko: { home: '보관함', search: '검색', add: '추가' },
  en: { home: 'Archive', search: 'Search', add: 'Add' },
  ja: { home: 'アーカイブ', search: '検索', add: '追加' },
  'zh-Hans': { home: '收藏', search: '搜索', add: '添加' },
  'zh-Hant': { home: '收藏', search: '搜尋', add: '新增' },
});

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// The "+" tab never renders a screen of its own — pressing it opens the
// Save-confirmation sheet as a modal over whatever tab is active, the way a
// real share-extension hand-off would land back in the app.
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Vintage's wallpaper runs on behind the tab bar too (instead of stopping
  // at its top edge), with a dashed perforation in place of the hairline
  // and the typewriter face for labels.
  const vintage = conceptOf(theme) === 'vintage';
  const tech = vintage;

  const items: { key: string; route: keyof TabParamList; label: string; Icon: typeof ArchiveIcon }[] = [
    { key: 'Home', route: 'Home', label: S.home, Icon: ArchiveIcon },
    { key: 'Search', route: 'Search', label: S.search, Icon: SearchIcon },
  ];

  const activeRouteName = state.routes[state.index].name;

  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: theme.line, borderTopWidth: vintage ? 0 : 1, backgroundColor: theme.bg, paddingBottom: 16 + insets.bottom },
      ]}
    >
      {vintage && <VintageWallpaper theme={theme} />}
      {vintage && <DashedRule color={theme.line} style={styles.perforation} />}
      {items.map((item) => {
        const on = activeRouteName === item.route;
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => navigation.navigate(item.route)}
          >
            <item.Icon size={18} color={on ? theme.ink : theme.sub} strokeWidth={1.3} />
            <Text
              style={{
                fontFamily: tech ? MONO : BODY_KR,
                fontSize: tech ? 10 : 12,
                letterSpacing: tech ? emToTracking(0.14, 10) : emToTracking(0.01, 12),
                color: on ? theme.ink : theme.sub,
                opacity: on ? 1 : 0.75,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.item} onPress={() => navigation.getParent()?.navigate('SaveSheet')}>
        <PlusIcon size={18} color={theme.sub} strokeWidth={1.3} />
        <Text
          style={{
            fontFamily: tech ? MONO : BODY_KR,
            fontSize: tech ? 10 : 12,
            letterSpacing: tech ? emToTracking(0.14, 10) : emToTracking(0.01, 12),
            color: theme.sub,
            opacity: 0.75,
          }}
        >
          {S.add}
        </Text>
      </Pressable>
    </View>
  );
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function RootNavigator() {
  const { theme } = useTheme();
  // Any AI call the server refuses for lack of consent opens the consent
  // sheet, wherever it came from.
  useEffect(() => {
    onAiConsentRequired(() => {
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== 'AiConsent') navigationRef.navigate('AiConsent');
    });
    // The memo-lock PIN pad opens from anywhere (see lock/memoLock.ts).
    registerPinOpener((mode) => {
      if (navigationRef.isReady()) navigationRef.navigate('Pin', { mode });
    });
    return () => onAiConsentRequired(null);
  }, []);
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Trash" component={TrashScreen} />
        <Stack.Group screenOptions={{ presentation: 'transparentModal', animation: 'fade', animationDuration: 180 }}>
          {/* A share while a sheet is open (its done card, half-typed, or still
              saving) opens a sheet of its own: the open one only read its
              params when it mounted, so updating them dropped the share. */}
          <Stack.Screen name="SaveSheet" component={SaveSheetScreen} getId={({ params }) => params?.shareId} />
          <Stack.Screen name="ThemePicker" component={ThemePickerScreen} />
          <Stack.Screen name="TabPicker" component={TabPickerScreen} />
          <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
          <Stack.Screen name="Paywall" component={PaywallScreen} />
          <Stack.Screen name="Compose" component={ComposeScreen} />
          <Stack.Screen name="AiConsent" component={AiConsentScreen} />
          <Stack.Screen name="Pin" component={PinScreen} />
          <Stack.Screen name="TagCleanup" component={TagCleanupScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, paddingTop: 16 },
  item: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 7 },
  perforation: { position: 'absolute', top: 0, left: 0, right: 0 },
});

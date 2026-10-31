import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, conceptOf, emToTracking, BODY_KR } from '../theme/themes';
import { Bubble, isLowOnUses } from '../components/Bubble';
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
import { fetchPlan, onAiConsentRequired, Plan } from '../api/client';
import PaywallScreen from '../screens/PaywallScreen';
import ComposeScreen from '../screens/ComposeScreen';
import PinScreen from '../screens/PinScreen';
import TagCleanupScreen from '../screens/TagCleanupScreen';
import { registerPinOpener } from '../lock/memoLock';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from './types';
import { strings } from '../i18n';

const S = strings({
  ko: { home: '보관함', search: '검색', add: '추가', addLeft: (n: number) => `AI 정리 ${n}번 남음`, addConsent: 'AI 동의하면 자동 정리돼요' },
  en: { home: 'Archive', search: 'Search', add: 'Add', addLeft: (n: number) => `${n} AI sort${n === 1 ? '' : 's'} left`, addConsent: 'Allow AI for auto-sorting' },
  ja: { home: 'アーカイブ', search: '検索', add: '追加', addLeft: (n: number) => `AI整理 残り${n}回`, addConsent: 'AI分析に同意すると自動で整理' },
  'zh-Hans': { home: '收藏', search: '搜索', add: '添加', addLeft: (n: number) => `AI 整理剩 ${n} 次`, addConsent: '同意 AI 即可自动整理' },
  'zh-Hant': { home: '收藏', search: '搜尋', add: '新增', addLeft: (n: number) => `AI 整理剩 ${n} 次`, addConsent: '同意 AI 即可自動整理' },
});

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// The "+" tab never renders a screen of its own — pressing it opens the
// Save-confirmation sheet as a modal over whatever tab is active, the way a
// real share-extension hand-off would land back in the app.
function TabBar({ state, navigation, onHeight }: BottomTabBarProps & { onHeight: (height: number) => void }) {
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
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
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

// Pointing at '+' from above the tab bar: what the next save does with AI.
// Without consent it's the way to agree, however many uses there are. It
// sits outside the bar because Android doesn't deliver touches outside a
// view's bounds.
function AddBubble({ plan, bottom, onPress }: { plan: Plan; bottom: number; onPress: (to: 'AiConsent' | 'Paywall') => void }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const left = Math.max(0, plan.classify.limit - plan.classify.used);
  const agreed = plan.aiConsent === 'agreed';
  if (agreed && !isLowOnUses(left)) return null;
  const gutter = 12;
  return (
    <Bubble
      theme={theme}
      label={agreed ? S.addLeft(left) : S.addConsent}
      tail="down"
      // '+' is centered in the last of the three tab slots.
      tailInset={width / 6 - gutter - 5}
      onPress={!agreed ? () => onPress('AiConsent') : left === 0 ? () => onPress('Paywall') : undefined}
      style={[styles.addBubble, { right: gutter, bottom: bottom + 8 }]}
    />
  );
}

// expo-iap is native-only; the web build must never load it.
const PurchaseRescue: typeof import('../billing/AndroidPurchase').PurchaseRescue | null =
  Platform.OS === 'android' ? require('../billing/AndroidPurchase').PurchaseRescue : null;

function Tabs({ navigation }: NativeStackScreenProps<RootStackParamList>) {
  const [barHeight, setBarHeight] = useState(0);
  const [onHome, setOnHome] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  // Again on coming back from a save or the consent sheet.
  useEffect(() => {
    const refresh = () =>
      fetchPlan()
        .then(setPlan)
        .catch(() => {});
    refresh();
    return navigation.addListener('focus', refresh);
  }, [navigation]);
  return (
    <View style={styles.tabs}>
      {PurchaseRescue && <PurchaseRescue plan={plan} onPlan={setPlan} />}
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} onHeight={setBarHeight} />}
        screenOptions={{ headerShown: false }}
        screenListeners={{
          state: (e) => {
            const s = e.data.state;
            setOnHome(s.routes[s.index].name === 'Home');
          },
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
      </Tab.Navigator>
      {onHome && plan && barHeight > 0 && (
        <AddBubble plan={plan} bottom={barHeight} onPress={(to) => (to === 'Paywall' ? navigation.navigate('Paywall', { reason: 'classify' }) : navigation.navigate('AiConsent'))} />
      )}
    </View>
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
  tabs: { flex: 1 },
  addBubble: { position: 'absolute', alignSelf: 'auto' },
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, paddingTop: 16 },
  item: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 7 },
  perforation: { position: 'absolute', top: 0, left: 0, right: 0 },
});

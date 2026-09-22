import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
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
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// The "+" tab never renders a screen of its own — pressing it opens the
// Save-confirmation sheet as a modal over whatever tab is active, the way a
// real share-extension hand-off would land back in the app.
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tech = theme.copy === 'tech';

  const items: { key: string; route: keyof TabParamList; label: string; Icon: typeof ArchiveIcon }[] = [
    { key: 'Home', route: 'Home', label: '보관함', Icon: ArchiveIcon },
    { key: 'Search', route: 'Search', label: '검색', Icon: SearchIcon },
  ];

  const activeRouteName = state.routes[state.index].name;

  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: theme.line, backgroundColor: theme.bg, paddingBottom: 16 + insets.bottom },
      ]}
    >
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
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
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
            fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
            fontSize: tech ? 10 : 12,
            letterSpacing: tech ? emToTracking(0.14, 10) : emToTracking(0.01, 12),
            color: theme.sub,
            opacity: 0.75,
          }}
        >
          추가
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

export default function RootNavigator() {
  const { theme } = useTheme();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Trash" component={TrashScreen} />
        <Stack.Group screenOptions={{ presentation: 'transparentModal', animation: 'fade', animationDuration: 180 }}>
          <Stack.Screen name="SaveSheet" component={SaveSheetScreen} />
          <Stack.Screen name="ThemePicker" component={ThemePickerScreen} />
          <Stack.Screen name="TabPicker" component={TabPickerScreen} />
          <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, paddingTop: 16 },
  item: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 7 },
});

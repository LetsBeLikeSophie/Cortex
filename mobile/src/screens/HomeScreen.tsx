import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor, RecentItem, RECENT_ITEMS, DEFAULT_TOTAL_SAVED } from '../data/content';
import { CategoryTab, loadHomeTabs } from '../data/tabs';
import { fetchRecentItems, ApiItem } from '../api/client';
import { toRecentItem } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { TabChip, TabAddChip } from '../components/Chips';
import { Pulse } from '../components/Pulse';
import { StatsIcon, ProfileIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

export default function HomeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [customTabs, setCustomTabs] = useState<CategoryTab[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryTab | null>(null);
  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);

  const load = React.useCallback(() => {
    setLoading(true);
    fetchRecentItems()
      .then((res) => {
        setRawItems(res.items);
        setTotal(res.total);
        setOffline(false);
      })
      // No backend reachable (e.g. this build is deployed standalone with no
      // live API behind it) -- fall back to the design's demo data instead
      // of an error/empty screen.
      .catch(() => setOffline(true))
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever Home regains focus (e.g. after saving a new item, or
  // coming back from the tab picker) rather than just once on mount.
  useFocusEffect(
    React.useCallback(() => {
      load();
      loadHomeTabs().then((tabs) => {
        setCustomTabs(tabs);
        // A tab the user just removed in the picker can't stay selected.
        setActiveCategory((current) => (current && !tabs.includes(current) ? null : current));
      });
    }, [load])
  );

  const filtered = activeCategory ? rawItems.filter((it) => it.category === activeCategory) : rawItems;
  const items: RecentItem[] = offline ? RECENT_ITEMS : filtered.map(toRecentItem);
  const displayTotal = offline ? DEFAULT_TOTAL_SAVED : total;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.headPad, { paddingHorizontal: card ? 24 : 26, paddingTop: card ? 26 : 30 }]}>
        <View style={styles.brandRow}>
          <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: emToTracking(0.26, 11), color: theme.accent }}>
            CORTEX
          </Text>
          <View style={styles.brandRowActions}>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <ProfileIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Stats')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <StatsIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('ThemePicker')}
              style={[styles.themeButton, { borderColor: theme.line }]}
            >
              <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
              <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {theme.label}
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.heroBox,
            card
              ? {
                  backgroundColor: theme.surface,
                  borderWidth: theme.surfaceEdge ? 1 : 0,
                  borderColor: theme.surfaceEdge ?? undefined,
                  borderRadius: theme.cardRadius + 6,
                  padding: 22,
                  paddingTop: 24,
                  paddingBottom: 20,
                  ...(theme.dark ? null : styles.heroShadow),
                }
              : { marginTop: 22 },
          ]}
        >
          {theme.pulse && (
            <Svg width={150} height={150} style={styles.heroGlow} pointerEvents="none">
              <Defs>
                <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={theme.accent} stopOpacity={0.16} />
                  <Stop offset="65%" stopColor={theme.accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={75} cy={75} r={75} fill="url(#glow)" />
            </Svg>
          )}

          <Text
            style={{
              fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
              fontSize: tech ? 10.5 : 13.5,
              letterSpacing: tech ? emToTracking(0.22, 10.5) : emToTracking(0.01, 13.5),
              color: theme.sub,
            }}
          >
            {txt.heroLabel}
          </Text>

          <View style={styles.numRow}>
            <Text
              style={{
                fontFamily: theme.headFamily,
                fontWeight: theme.headWeight,
                fontSize: theme.numSize,
                lineHeight: theme.numSize * 0.86,
                letterSpacing: emToTracking(theme.numTrackEm, theme.numSize),
                color: theme.ink,
              }}
            >
              {displayTotal}
            </Text>
            <Text style={[styles.numSuffix, { color: theme.sub }]}>{txt.heroSuffix}</Text>
          </View>

          <View style={styles.heroFoot}>
            <Pulse color={theme.accent} active={theme.pulse} />
            <Text
              style={{
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: tech ? 11 : 12.5,
                letterSpacing: tech ? emToTracking(0.1, 11) : emToTracking(0.01, 12.5),
                color: theme.accent,
              }}
            >
              {txt.heroFoot}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.tabs,
          {
            // Underline tabs top-align their label (padding only sits below
            // it, for the active-state border); centering the add chip's
            // fixed height against that box would land it a few px below
            // the label. Pill tabs are symmetric top/bottom, so centering
            // there is correct as-is.
            alignItems: card ? 'center' : 'flex-start',
            gap: card ? 8 : 18,
            paddingHorizontal: card ? 24 : 26,
            paddingTop: card ? 20 : 28,
            paddingBottom: card ? 12 : 0,
            borderBottomWidth: card ? 0 : 1,
            borderBottomColor: theme.line,
          },
        ]}
      >
        <TabChip label="모두" active={activeCategory === null} theme={theme} onPress={() => setActiveCategory(null)} />
        {customTabs.map((cat) => (
          <TabChip key={cat} label={cat} active={activeCategory === cat} theme={theme} onPress={() => setActiveCategory(cat)} />
        ))}
        <TabAddChip theme={theme} onPress={() => navigation.navigate('TabPicker')} />
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={{ color: theme.sub, textAlign: 'center', marginTop: 40, fontFamily: 'IBMPlexSansKR_400Regular' }}>
          아직 저장된 기억이 없어요.
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => item.no + i}
          renderItem={({ item, index }) => (
            <RecentRow
              item={item}
              theme={theme}
              tech={tech}
              onPress={offline ? undefined : () => navigation.navigate('ItemDetail', { item: filtered[index] })}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headPad: {},
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  themeDot: { width: 8, height: 8, borderRadius: 4 },
  heroBox: { position: 'relative', overflow: 'hidden' },
  heroShadow: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  heroGlow: { position: 'absolute', top: -40, right: -30 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  numSuffix: { fontSize: 14, lineHeight: 21, paddingBottom: 9, fontFamily: 'IBMPlexSansKR_400Regular' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  list: { flex: 1 },
});

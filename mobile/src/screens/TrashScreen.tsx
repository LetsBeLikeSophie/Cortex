import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ApiItem, fetchTrash, permanentlyDeleteItem, restoreItem } from '../api/client';
import { relativeTime } from '../api/format';
import { RestoreIcon, TrashIcon } from '../components/Icons';
import { AsyncStateView } from '../components/AsyncStateView';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';

type RowAction = 'idle' | 'restoring' | 'confirmingPermanent' | 'deletingPermanent';

function TrashRow({ item, theme, onRemoved }: { item: ApiItem; theme: ReturnType<typeof useTheme>['theme']; onRemoved: (id: string) => void }) {
  const card = theme.list === 'card';
  const [action, setAction] = useState<RowAction>('idle');
  const [error, setError] = useState('');

  const restore = async () => {
    setAction('restoring');
    try {
      await restoreItem(item.id);
      onRemoved(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAction('idle');
    }
  };

  const permanentlyDelete = async () => {
    setAction('deletingPermanent');
    try {
      await permanentlyDeleteItem(item.id);
      onRemoved(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAction('confirmingPermanent');
    }
  };

  return (
    <View
      style={[
        styles.row,
        card
          ? { backgroundColor: theme.surface, borderRadius: theme.cardRadius, padding: 15 }
          : { borderBottomWidth: 1, borderBottomColor: theme.line, paddingVertical: 16 },
      ]}
    >
      <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
        {item.title ?? item.raw_text?.slice(0, 40) ?? '(제목 없음)'}
      </Text>
      <Text style={[styles.meta, { color: theme.sub }]}>{relativeTime(item.shared_at)} 저장됨</Text>

      {error !== '' && <Text style={[styles.error, { color: theme.accent }]}>실패: {error}</Text>}

      {action === 'confirmingPermanent' || action === 'deletingPermanent' ? (
        <View style={styles.confirmRow}>
          <Text style={[styles.confirmText, { color: theme.ink }]}>영구 삭제할까요? 되돌릴 수 없어요.</Text>
          <View style={styles.actionRow}>
            <Pressable onPress={() => setAction('idle')} style={[styles.smallGhostButton, { borderColor: theme.line }]}>
              <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>취소</Text>
            </Pressable>
            <Pressable onPress={permanentlyDelete} disabled={action === 'deletingPermanent'} style={styles.smallDeleteButton}>
              {action === 'deletingPermanent' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>영구 삭제</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable onPress={restore} disabled={action === 'restoring'} style={[styles.iconTextButton, { borderColor: theme.line }]}>
            {action === 'restoring' ? (
              <ActivityIndicator color={theme.ink} size="small" />
            ) : (
              <>
                <RestoreIcon size={13} color={theme.ink} strokeWidth={1.3} />
                <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>복원</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={() => setAction('confirmingPermanent')} style={[styles.iconTextButton, { borderColor: theme.line }]}>
            <TrashIcon size={13} color={theme.sub} strokeWidth={1.3} />
            <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>영구 삭제</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function TrashScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const card = theme.list === 'card';
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchTrash()
      .then((res) => {
        setItems(res.items);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const removeFromList = (id: string) => setItems((current) => current.filter((it) => it.id !== id));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScreenHeader title="휴지통" theme={theme} onBack={() => navigation.goBack()} />

      <AsyncStateView
        theme={theme}
        loading={loading}
        error={error}
        onRetry={load}
        empty={items.length === 0}
        emptyText="휴지통이 비어있어요."
        topOffset={60}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24, gap: card ? 10 : 0 }}
        >
          {items.map((item) => (
            <TrashRow key={item.id} item={item} theme={theme} onRemoved={removeFromList} />
          ))}
        </ScrollView>
      </AsyncStateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { gap: 6 },
  title: { fontSize: 15, lineHeight: 21, fontFamily: 'IBMPlexSansKR_500Medium' },
  meta: { fontSize: 12, fontFamily: 'IBMPlexSansKR_400Regular' },
  error: { fontSize: 12, fontFamily: 'IBMPlexSansKR_400Regular' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  iconTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmRow: { marginTop: 4, gap: 8 },
  confirmText: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium' },
  smallGhostButton: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  smallDeleteButton: { flex: 1, backgroundColor: '#c0392b', borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
});

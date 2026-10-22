import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ApiItem, fetchTrash, permanentlyDeleteItem, restoreItem, friendlyError } from '../api/client';
import { relativeTime, itemTitle } from '../api/format';
import { RestoreIcon, TrashIcon } from '../components/Icons';
import { AsyncStateView } from '../components/AsyncStateView';
import { Card, isBoxed, screenGutter } from '../components/Card';
import { showToast } from '../native/toast';
import { ConfirmCard } from '../components/ConfirmCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { VintageWallpaper } from '../components/Decor';
import type { RootStackParamList } from '../navigation/types';

type RowAction = 'idle' | 'restoring' | 'confirmingPermanent' | 'deletingPermanent';

// "10월 3일" -- the day it was saved, which is where it returns to in the
// (newest-first) list when restored.
function savedDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function TrashRow({ item, theme, onRemoved }: { item: ApiItem; theme: ReturnType<typeof useTheme>['theme']; onRemoved: (id: string) => void }) {
  const [action, setAction] = useState<RowAction>('idle');
  const [error, setError] = useState('');

  const restore = async () => {
    setAction('restoring');
    try {
      await restoreItem(item.id);
      onRemoved(item.id);
      showToast(`복원했어요 · ${savedDay(item.shared_at)} 저장한 자리로 돌아갔어요`);
    } catch (err) {
      setError(friendlyError(err));
      setAction('idle');
    }
  };

  const permanentlyDelete = async () => {
    setAction('deletingPermanent');
    try {
      await permanentlyDeleteItem(item.id);
      onRemoved(item.id);
    } catch (err) {
      setError(friendlyError(err));
      setAction('confirmingPermanent');
    }
  };

  return (
    <Card theme={theme} style={styles.row}>
      <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
        {itemTitle(item)}
      </Text>
      <Text style={[styles.meta, { color: theme.sub }]}>
        {item.deleted_at ? `${relativeTime(item.deleted_at)} 삭제 · ` : ''}
        {savedDay(item.shared_at)} 저장
      </Text>

      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>실패: {error}</Text>}

      {action === 'confirmingPermanent' || action === 'deletingPermanent' ? (
        <ConfirmCard
          theme={theme}
          bare
          title="영구 삭제할까요? 되돌릴 수 없어요."
          confirmLabel="영구 삭제"
          busy={action === 'deletingPermanent'}
          onCancel={() => setAction('idle')}
          onConfirm={permanentlyDelete}
        />
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
    </Card>
  );
}

export default function TrashScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
      .catch((err) => setError(friendlyError(err)))
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
      <VintageWallpaper theme={theme} />
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
          contentContainerStyle={{ paddingHorizontal: screenGutter(theme), paddingTop: isBoxed(theme) ? 12 : 0, paddingBottom: 24 }}
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
});

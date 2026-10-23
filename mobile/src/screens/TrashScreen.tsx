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
import { strings } from '../i18n';
import { TIME } from '../i18n/common';

const S = strings({
  ko: {
    restored: '복원했어요',
    deletedAgo: (rel: string) => `${rel} 삭제 · `,
    savedOn: (day: string) => `${day} 저장`,
    failed: (e: string) => `실패: ${e}`,
    open: '열기',
    confirmPermanent: '영구 삭제할까요? 되돌릴 수 없어요.',
    permanentDelete: '영구 삭제',
    restore: '복원',
    title: '휴지통',
    empty: '휴지통이 비어있어요.',
  },
  en: {
    restored: 'Restored',
    deletedAgo: (rel: string) => `Deleted ${rel} · `,
    savedOn: (day: string) => `Saved ${day}`,
    failed: (e: string) => `Failed: ${e}`,
    open: 'Open',
    confirmPermanent: "Delete forever? This can't be undone.",
    permanentDelete: 'Delete forever',
    restore: 'Restore',
    title: 'Trash',
    empty: 'Trash is empty.',
  },
  ja: {
    restored: '復元しました',
    deletedAgo: (rel: string) => `${rel}に削除 · `,
    savedOn: (day: string) => `${day}に保存`,
    failed: (e: string) => `失敗: ${e}`,
    open: '開く',
    confirmPermanent: '完全に削除しますか？元に戻せません。',
    permanentDelete: '完全に削除',
    restore: '復元',
    title: 'ゴミ箱',
    empty: 'ゴミ箱は空です。',
  },
  'zh-Hans': {
    restored: '已恢复',
    deletedAgo: (rel: string) => `${rel}删除 · `,
    savedOn: (day: string) => `${day}保存`,
    failed: (e: string) => `失败：${e}`,
    open: '打开',
    confirmPermanent: '永久删除？此操作无法撤销。',
    permanentDelete: '永久删除',
    restore: '恢复',
    title: '回收站',
    empty: '回收站是空的。',
  },
  'zh-Hant': {
    restored: '已復原',
    deletedAgo: (rel: string) => `${rel}刪除 · `,
    savedOn: (day: string) => `${day}儲存`,
    failed: (e: string) => `失敗：${e}`,
    open: '開啟',
    confirmPermanent: '要永久刪除嗎？此操作無法復原。',
    permanentDelete: '永久刪除',
    restore: '復原',
    title: '垃圾桶',
    empty: '垃圾桶是空的。',
  },
});

type RowAction = 'idle' | 'restoring' | 'restored' | 'confirmingPermanent' | 'deletingPermanent';

// "10월 3일" -- the day it was saved, which is where it returns to in the
// (newest-first) list when restored.
function savedDay(iso: string): string {
  const d = new Date(iso);
  return TIME.monthDay(d.getMonth() + 1, d.getDate());
}

function TrashRow({
  item,
  theme,
  onRemoved,
  onOpen,
}: {
  item: ApiItem;
  theme: ReturnType<typeof useTheme>['theme'];
  onRemoved: (id: string) => void;
  onOpen: (item: ApiItem) => void;
}) {
  const [action, setAction] = useState<RowAction>('idle');
  const [error, setError] = useState('');

  const restore = async () => {
    setAction('restoring');
    try {
      await restoreItem(item.id);
      // The row stays as a way in: home only lists the latest 50, so an
      // older item "back in its place" was nowhere to be found from here.
      setAction('restored');
      showToast(S.restored);
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
        {item.deleted_at ? S.deletedAgo(relativeTime(item.deleted_at)) : ''}
        {S.savedOn(savedDay(item.shared_at))}
      </Text>

      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{S.failed(error)}</Text>}

      {action === 'restored' ? (
        <View style={styles.actionRow}>
          <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13 }}>{S.restored}</Text>
          <Pressable onPress={() => onOpen({ ...item, deleted_at: null })} hitSlop={6}>
            <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13, textDecorationLine: 'underline' }}>{S.open}</Text>
          </Pressable>
        </View>
      ) : action === 'confirmingPermanent' || action === 'deletingPermanent' ? (
        <ConfirmCard
          theme={theme}
          bare
          title={S.confirmPermanent}
          confirmLabel={S.permanentDelete}
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
                <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>{S.restore}</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={() => setAction('confirmingPermanent')} style={[styles.iconTextButton, { borderColor: theme.line }]}>
            <TrashIcon size={13} color={theme.sub} strokeWidth={1.3} />
            <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13 }}>{S.permanentDelete}</Text>
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
      <ScreenHeader title={S.title} theme={theme} onBack={() => navigation.goBack()} />

      <AsyncStateView
        theme={theme}
        loading={loading}
        error={error}
        onRetry={load}
        empty={items.length === 0}
        emptyText={S.empty}
        topOffset={60}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: screenGutter(theme), paddingTop: isBoxed(theme) ? 12 : 0, paddingBottom: 24 }}
        >
          {items.map((item) => (
            <TrashRow key={item.id} item={item} theme={theme} onRemoved={removeFromList} onOpen={(it) => navigation.navigate('ItemDetail', { item: it })} />
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

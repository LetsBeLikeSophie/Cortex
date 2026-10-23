import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import {
  ApiError,
  asQuotaError,
  composeDraft,
  ComposeDraft,
  fetchItemsWithTag,
  fetchPlan,
  friendlyError,
  Plan,
  saveComposeDraft,
} from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { fieldStyle, pickStyle, pickTextStyle } from '../components/Fields';
import { TagChip } from '../components/Chips';
import { SparkleIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// "모아서 만들기": a tag's items (or the ones picked in the tag tab) become
// one memo. The AI picks the shape unless the person says what they want;
// the chips are just quick ways to say it. Previewed before saving; one
// remake per run is free.
const EXAMPLES = ['코스·동선', '비교표', '체크리스트', '일정표', '요약'];

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, itemIds, tagChoices } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [pickedTag, setPickedTag] = useState(tagChoices?.[0] ?? tag);
  const [tagCount, setTagCount] = useState<number | null>(count ?? null);
  const [ask, setAsk] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The previewed result, and whether remaking it in another shape is free.
  const [draft, setDraft] = useState<{ draft: ComposeDraft; sourceCount: number; freeRetry: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const refreshPlan = () =>
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  useEffect(() => {
    refreshPlan();
  }, []);

  // Opened from a detail or search (no count): ask how many the tag has.
  useEffect(() => {
    if (itemIds || (count !== undefined && pickedTag === tag)) return;
    setTagCount(null);
    let cancelled = false;
    fetchItemsWithTag(pickedTag, 50)
      .then((res) => {
        if (!cancelled) setTagCount(res.items.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pickedTag, itemIds, count, tag]);

  const close = () => navigation.goBack();
  const left = plan?.compose ? Math.max(0, plan.compose.limit - plan.compose.used) : null;
  const retryFree = !!draft?.freeRetry;
  const materials = itemIds ? itemIds.length : tagCount;

  const make = async () => {
    if (!retryFree && left === 0) {
      navigation.replace('Paywall', { reason: 'compose' });
      return;
    }
    setError('');
    setWorking(true);
    try {
      const res = await composeDraft(pickedTag, 'auto', { itemIds, retryOf: draft?.draft.id, instruction: ask.trim() || undefined });
      setDraft(res);
      setPreviewing(true);
      refreshPlan();
    } catch (err) {
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      if (err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'too_few') {
        setError('메모가 2개 이상 있어야 해요');
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setError('');
    setSaving(true);
    try {
      const { item, sourceCount } = await saveComposeDraft(draft.draft.id);
      navigation.replace('ItemDetail', { item, composedFrom: { tag: pickedTag, count: sourceCount, left: left ?? undefined } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError('시간이 지나 결과가 사라졌어요. 다시 만들어 주세요.');
        setDraft(null);
        setPreviewing(false);
      } else {
        setError(friendlyError(err));
      }
      setSaving(false);
    }
  };

  const busy = working || saving;

  if (previewing && draft) {
    return (
      <ModalSheet theme={theme} onClose={busy ? () => {} : close} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
        <View style={styles.titleRow}>
          <SparkleIcon color={theme.accent} size={18} strokeWidth={1.5} />
          <Text style={[styles.previewLabel, { color: theme.sub }]}>{`미리보기 · 메모 ${draft.sourceCount}개로 만들었어요`}</Text>
        </View>
        <ScrollView style={styles.flexShrink} showsVerticalScrollIndicator={false}>
          <Heading theme={theme} size={21} style={styles.previewTitle}>
            {draft.draft.title}
          </Heading>
          <Text style={[styles.previewBody, { color: theme.ink }]}>{draft.draft.body}</Text>
        </ScrollView>
        <Pressable onPress={() => setPreviewing(false)} disabled={busy} hitSlop={6} style={styles.retryLink}>
          <Text style={[styles.link, { color: theme.ink }]}>
            {retryFree ? '다른 모양으로 다시 · 무료' : `다른 모양으로 다시 · 1회${left !== null ? ` (${left}회 남음)` : ''}`}
          </Text>
        </Pressable>
        <Text style={[styles.sub, { color: theme.sub }]}>저장해야 남아요</Text>
        {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
        <ButtonRow theme={theme} style={styles.buttons}>
          <GhostButton label="버리기" theme={theme} onPress={close} disabled={busy} />
          <SolidButton label="저장" theme={theme} onPress={save} loading={saving} />
        </ButtonRow>
      </ModalSheet>
    );
  }

  return (
    <ModalSheet theme={theme} onClose={busy ? () => {} : close} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
      <View style={styles.titleRow}>
        <SparkleIcon color={theme.accent} size={18} strokeWidth={1.5} />
        <Heading theme={theme} size={22}>
          {itemIds ? `고른 ${itemIds.length}개 모아서 만들기` : `'${pickedTag}' 모아서 만들기`}
        </Heading>
      </View>
      <ScrollView style={styles.flexShrink} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Opened from a detail: which of the item's tags to gather. */}
        {tagChoices && tagChoices.length > 1 && (
          <View style={styles.tagChoices}>
            {tagChoices.map((t) => (
              <Pressable key={t} onPress={() => setPickedTag(t)} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: t === pickedTag }}>
                <View pointerEvents="none" style={t === pickedTag ? null : styles.dim}>
                  <TagChip label={t} theme={theme} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={[styles.sub, { color: theme.sub }]}>
          {materials !== null ? `메모 ${Math.min(materials, 50)}개를 한 메모로 정리해요` : '메모를 한 메모로 정리해요'}
          {/* Retrying: the first run already took this month's 1 -- say
              so, or the drop in the count reads as the retry's cost. */}
          {draft ? (retryFree ? ' · 처음 만들 때 1회 썼고, 이번엔 무료' : left !== null ? ` · 1회 (${left}회 남음)` : '') : left !== null ? ` · 이번 달 ${left}회 남음` : ''}
        </Text>

        <Text style={[styles.askLabel, { color: theme.ink }]}>원하는 모양 (선택)</Text>
        <View style={styles.examples}>
          {EXAMPLES.map((ex) => (
            <Pressable key={ex} onPress={() => setAsk(ex)} disabled={busy} style={[styles.example, pickStyle(theme)]}>
              <Text style={pickTextStyle(theme)}>{ex}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={ask}
          onChangeText={setAsk}
          editable={!busy}
          maxLength={100}
          placeholder="비우면 AI가 알아서 · 예: 20명 갈 수 있는 곳만, 가격순"
          placeholderTextColor={theme.sub}
          style={[styles.askInput, fieldStyle(theme), { color: theme.ink, outlineWidth: 0 }]}
        />
      </ScrollView>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>정리하는 중 · 10~20초</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={draft ? '미리보기로' : '취소'} theme={theme} onPress={draft ? () => setPreviewing(true) : close} disabled={busy} />
        <SolidButton
          label={draft ? (retryFree ? '다시 만들기 · 무료' : '다시 만들기 · 1회') : left === 0 ? 'Pro로 만들기' : '만들기 · 1회'}
          theme={theme}
          onPress={make}
          loading={working}
        />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  tagChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  dim: { opacity: 0.45 },
  askLabel: { fontSize: 14, marginTop: 18, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_500Medium' },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  example: { paddingHorizontal: 12, paddingVertical: 6 },
  askInput: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
  previewLabel: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium' },
  previewTitle: { marginTop: 12, paddingHorizontal: 4 },
  previewBody: { fontSize: 14.5, lineHeight: 23, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  retryLink: { marginTop: 14, paddingHorizontal: 4 },
  link: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});

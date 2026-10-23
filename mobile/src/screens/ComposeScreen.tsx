import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { allEdges } from '../theme/themes';
import {
  ApiError,
  asQuotaError,
  composeDraft,
  ComposeDraft,
  ComposeFormat,
  fetchItemsWithTag,
  fetchPlan,
  friendlyError,
  Plan,
  saveComposeDraft,
} from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { frameStyle } from '../components/Card';
import { TagChip } from '../components/Chips';
import { SparkleIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// "모아서 만들기": everything under one tag (or the items picked in the
// tag tab) becomes one new memo, in the shape picked here -- or the one the
// AI thinks fits. The result is previewed first and saved only on 저장;
// one "다른 형식으로 다시" per run is free (decision Q6, 2026-10-23).
const FORMATS: { key: ComposeFormat; label: string; note: string }[] = [
  { key: 'auto', label: 'AI가 알아서', note: '묶음을 보고 코스·목록·요약 중 맞는 형식으로 정리해요' },
  { key: 'course', label: '코스·동선', note: '가볼 곳을 지역별로 묶고 순서를 짜요' },
  { key: 'list', label: '목록·비교', note: '항목마다 가격·장소·내 메모를 한 줄로 정리해요' },
  { key: 'summary', label: '요약 노트', note: '전체 내용을 요점만 모아 정리해요' },
];

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, suggested, itemIds, tagChoices } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [pickedTag, setPickedTag] = useState(tagChoices?.[0] ?? tag);
  const [tagCount, setTagCount] = useState<number | null>(count ?? null);
  const [format, setFormat] = useState<ComposeFormat>('auto');
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
      const res = await composeDraft(pickedTag, format, { itemIds, retryOf: draft?.draft.id });
      setDraft(res);
      setPreviewing(true);
      refreshPlan();
    } catch (err) {
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      if (err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'too_few') {
        setError('모아서 만들 메모가 2개 이상 있어야 해요. 이미 모아서 만든 메모는 재료에서 빠져요.');
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
            {retryFree ? '다른 형식으로 다시 만들기 · 1회 무료' : `다른 형식으로 다시 만들기 · 1회 사용${left !== null ? ` (${left}회 남음)` : ''}`}
          </Text>
        </Pressable>
        <Text style={[styles.sub, { color: theme.sub }]}>저장하지 않고 닫으면 이 결과는 사라져요.</Text>
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
          {materials !== null ? `저장한 ${Math.min(materials, 50)}개를` : '저장한 메모를'}
          {' AI가 한 메모로 정리해요. 저장된 내용 안에서만 쓰고, 없는 정보는 지어내지 않아요. 저장 전에 미리 보여 드려요.'}
          {draft ? (retryFree ? ' · 이번 다시 만들기는 무료' : '') : left !== null ? ` · 이번 달 ${left}회 남음` : ''}
        </Text>

        <View style={styles.options}>
          {FORMATS.map((f) => {
            const active = format === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFormat(f.key)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.option, { backgroundColor: theme.surface }, frameStyle(theme), active && allEdges(2, theme.ink), { borderRadius: theme.cardRadius }]}
              >
                <Text style={[styles.optionLabel, { color: theme.ink }]}>
                  {f.label}
                  {f.key === suggested ? <Text style={{ color: theme.accent }}>  추천</Text> : null}
                </Text>
                <Text style={[styles.optionNote, { color: theme.sub }]}>{f.note}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>AI가 정리하고 있어요. 10~20초쯤 걸려요.</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={draft ? '미리보기로' : '취소'} theme={theme} onPress={draft ? () => setPreviewing(true) : close} disabled={busy} />
        <SolidButton
          label={draft ? (retryFree ? '다시 만들기 (무료)' : '다시 만들기') : left === 0 ? 'Pro로 만들기' : '만들기'}
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
  options: { gap: 8, marginTop: 16 },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  optionLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  optionNote: { fontSize: 12.5, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
  previewLabel: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium' },
  previewTitle: { marginTop: 12, paddingHorizontal: 4 },
  previewBody: { fontSize: 14.5, lineHeight: 23, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  retryLink: { marginTop: 14, paddingHorizontal: 4 },
  link: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});

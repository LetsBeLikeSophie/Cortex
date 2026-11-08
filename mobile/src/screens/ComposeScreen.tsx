import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ApiError, asQuotaError, composeMemo, fetchItemsWithTag, fetchPlan, friendlyError, isAlreadyRunning, isTimeout, Plan, usesLeft } from '../api/client';
import { showToast } from '../native/toast';
import { ModalSheet } from '../components/ModalSheet';
import { SheetTitle } from '../components/Typography';
import { composeMaterials } from '../api/format';
import { composeEnded, composeStarted } from '../compose/running';
import { Bubble, isLowOnUses } from '../components/Bubble';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { FieldRow, fieldTextStyle } from '../components/FieldRow';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { OUTLINE, allEdges, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { TagChip } from '../components/Chips';
import { SparkleIcon } from '../components/Icons';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import type { RootStackParamList } from '../navigation/types';
import { COMMON, USES } from '../i18n/common';
import { S } from './ComposeScreen.strings';

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, lockedOut, composedOut, itemIds, overFifty: pickedOverFifty, pickedCount, tagChoices, retryOf, freeRemake, remakeBefore } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [pickedTag, setPickedTag] = useState(tagChoices?.[0] ?? tag);
  const [tagCount, setTagCount] = useState<number | null>(count ?? null);
  const [lockedCount, setLockedCount] = useState(lockedOut ?? 0);
  const [shape, setShape] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  // Dictation appends to what's typed rather than replacing it.
  const askBase = useRef('');
  const askFocused = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  // Closing the sheet mid-way doesn't cancel the server's work; when it
  // finishes after that, say so with a toast instead of navigating.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const refreshPlan = () =>
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  // Again on coming back from the consent sheet, so the button follows.
  useEffect(() => {
    refreshPlan();
    return navigation.addListener('focus', refreshPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // No AI consent: making would only be refused -- the button leads to the
  // consent sheet instead (rule 2026-10-26).
  const noAiConsent = !!plan && plan.aiConsent !== 'agreed';

  // A whole tag: count it the way the server will use it -- its newest 50,
  // minus locked and earlier composed memos. One past 50 is asked for only
  // to know whether older ones are left out (decision C3: say so).
  const [overFifty, setOverFifty] = useState(!!pickedOverFifty);
  // Earlier 모아서 만들기 results under this tag, left out like locked ones.
  const [tagComposed, setTagComposed] = useState(0);
  useEffect(() => {
    if (itemIds || retryOf) return;
    if (pickedTag !== tag || count === undefined) {
      setTagCount(null);
      setLockedCount(0);
      setTagComposed(0);
    }
    let cancelled = false;
    fetchItemsWithTag(pickedTag, 51)
      .then((res) => {
        if (cancelled) return;
        const m = composeMaterials(res.items.slice(0, 50));
        setTagCount(m.usable.length);
        setLockedCount(m.locked);
        setTagComposed(m.composed);
        setOverFifty(res.items.length > 50);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pickedTag, itemIds, count, tag, retryOf]);

  const close = () => navigation.goBack();
  const left = usesLeft(plan, 'compose');
  const remakeFree = !!retryOf && !!freeRemake;
  const materials = itemIds && count === undefined ? itemIds.length : tagCount;
  // Fewer than 2 usable memos: the server would refuse, so don't offer it.
  const tooFew = materials !== null && materials < 2;
  // Tag mode counts its own (the tab may have been changed here); a fixed
  // pick keeps what the caller counted.
  const composedShown = itemIds || retryOf ? composedOut : tagCount !== null ? tagComposed : pickedTag === tag ? composedOut : 0;

  const make = async () => {
    if (!remakeFree && left === 0) {
      navigation.replace('Paywall', { reason: 'compose' });
      return;
    }
    setError('');
    setWorking(true);
    composeStarted(pickedTag);
    // The memo lives under its tag -- make sure that tag is a home tab,
    // once there is a memo (a too_few refusal adds no tab).
    const keepTab = async () => {
      const tabs = await loadHomeTabs();
      if (!tabs.includes(pickedTag)) await saveHomeTabs([...tabs, pickedTag]);
    };
    try {
      const res = await composeMemo(pickedTag, 'auto', { itemIds, retryOf, instruction: [shape, ask.trim()].filter(Boolean).join(' · ') || undefined });
      await keepTab().catch(() => {});
      if (!mounted.current) {
        showToast(S.doneToast(pickedTag));
        return;
      }
      navigation.replace('ItemDetail', {
        item: res.item,
        composedFrom: { tag: pickedTag, count: res.sourceCount, freeRemake: res.freeRemake },
        remadeFrom: retryOf && remakeBefore ? { title: remakeBefore.title, rawText: remakeBefore.rawText } : undefined,
      });
    } catch (err) {
      if (!mounted.current) {
        // The sheet promised to keep going after closing -- so a failure
        // after that is said too. A timeout may still finish on the server.
        const timedOut = isTimeout(err) || isAlreadyRunning(err);
        showToast(asQuotaError(err) ? S.quotaToast : timedOut ? S.slowToast(pickedTag) : S.failedToast(pickedTag));
        return;
      }
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      if (code === 'too_few') {
        setError(S.tooFew);
      } else if (code === 'ai_consent') {
        // Not a failure: the consent sheet is opening.
        refreshPlan();
      } else if (isTimeout(err) || isAlreadyRunning(err)) {
        // Timed out here (or a run is already going), but the server likely still finishes (and counts
        // it): pressing 만들기 again would make a second memo. Same as after
        // closing -- a toast to check the tab later, and the sheet goes.
        showToast(S.slowToast(pickedTag));
        close();
        return;
      } else {
        setError(friendlyError(err));
      }
      setWorking(false);
    } finally {
      composeEnded(pickedTag);
    }
  };

  const busy = working;

  const description = [
    // A remake replaces this very memo -- say so, and that hand edits go too.
    retryOf ? S.replaces + (remakeBefore?.edited ? S.editsToo : '') + ' · ' : '',
    tooFew ? S.needTwo(materials) : materials !== null ? S.summarizeN(Math.min(materials, 50)) : S.summarize,
    lockedCount > 0 ? S.lockedOut(lockedCount) : '',
    overFifty ? S.recentFifty : '',
    composedShown ? S.composedOut(composedShown) : '',
    // Retrying: the first run already took this month's 1 -- say so, or the
    // drop in the count reads as the retry's cost.
    remakeFree ? S.retryFreeNote : '',
    noAiConsent ? S.consentNote : '',
  ].join('');

  // The field is at the bottom of what scrolls: once the keyboard has shrunk
  // the sheet, or typing has grown the field, keep it in view.
  const keepFieldInView = () => {
    if (askFocused.current) scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <ModalSheet theme={theme} onClose={close} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9} liftForKeyboard>
      <SheetTitle
        theme={theme}
        icon={<SparkleIcon color={theme.accent} size={18} />}
        title={retryOf ? S.remakeTitle : itemIds ? S.titlePicked(pickedCount ?? itemIds.length) : S.titleTag(pickedTag)}
        sub={description}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.flexShrink}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={keepFieldInView}
        onContentSizeChange={keepFieldInView}
      >
        {/* Opened from a detail: which of the item's tags to gather. */}
        {!retryOf && tagChoices && tagChoices.length > 1 && (
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
        <Text style={[styles.askLabel, { color: theme.ink }]}>{S.askLabel}</Text>
        <View style={styles.radios} accessibilityRole="radiogroup">
          {[null, ...S.examples].map((ex) => {
            const active = shape === ex;
            return (
              <Pressable
                key={ex ?? 'auto'}
                onPress={() => setShape(ex)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={styles.radioRow}
                hitSlop={4}
              >
                <View style={[styles.radioRing, allEdges(OUTLINE, active ? theme.ink : theme.sub)]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: theme.ink }]} />}
                </View>
                <Text style={[styles.radioText, { color: theme.ink }]}>{ex ?? S.autoShape}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.askLabel, { color: theme.ink }]}>{S.requestLabel}</Text>
        <FieldRow
          theme={theme}
          style={styles.askField}
          mic={
            <VoiceInputButton
              theme={theme}
              size={16}
              onStart={() => {
                askBase.current = ask.trim() ? `${ask.trimEnd()} ` : '';
              }}
              onResult={(spoken) => setAsk((askBase.current + spoken).slice(0, 100))}
            />
          }
        >
          <TextInput
            value={ask}
            onChangeText={setAsk}
            onFocus={() => {
              askFocused.current = true;
            }}
            onBlur={() => {
              askFocused.current = false;
            }}
            editable={!busy}
            maxLength={100}
            multiline
            placeholder={S.placeholder}
            placeholderTextColor={theme.sub}
            style={[fieldTextStyle, { color: theme.ink, outlineWidth: 0 }]}
          />
        </FieldRow>
      </ScrollView>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>{S.working}</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      {!noAiConsent && !remakeFree && isLowOnUses(left) && <Bubble theme={theme} label={USES.left(left)} tail="down" tailInset={40} style={styles.bubble} />}
      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={COMMON.cancel} theme={theme} onPress={close} />
        <SolidButton
          label={noAiConsent ? S.agreeAndMake : retryOf ? (remakeFree ? S.remakeFree : S.remakePaid) : left === 0 ? S.makePro : S.make}
          theme={theme}
          onPress={noAiConsent ? () => navigation.navigate('AiConsent') : make}
          loading={working}
          disabled={tooFew}
        />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  // Doesn't shrink: the keyboard taking the room squashed it flat.
  bubble: { alignSelf: 'flex-end', flexShrink: 0, marginTop: 12, marginBottom: -6 },
  flexShrink: { flexShrink: 1 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4, fontFamily: BODY_KR },
  tagChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  dim: { opacity: 0.45 },
  askLabel: { fontSize: 14, marginTop: 18, paddingHorizontal: 4, fontFamily: BODY_KR_MEDIUM },
  radios: { gap: 2, marginTop: 8, paddingHorizontal: 4 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  radioRing: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  radioText: { fontSize: 14.5, fontFamily: BODY_KR },
  askField: { marginTop: 8 },
  previewLabel: { fontSize: 13, fontFamily: BODY_KR_MEDIUM },
  previewTitle: { marginTop: 12, paddingHorizontal: 4 },
  previewBodyBox: { marginTop: 10, paddingHorizontal: 4 },
  previewBody: { fontSize: 14.5, lineHeight: 23, fontFamily: BODY_KR },
  retryLink: { marginTop: 14, paddingHorizontal: 4 },
  link: { fontSize: 13.5, fontFamily: BODY_KR_MEDIUM, textDecorationLine: 'underline' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: BODY_KR },
  buttons: { marginTop: 18 },
});

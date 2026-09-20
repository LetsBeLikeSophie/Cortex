import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { addTag, deleteItem, getScreenshotUrl, removeTag as removeTagApi } from '../api/client';
import { relativeTime, sourceLabel } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { GhostButton, SolidButton } from '../components/Buttons';
import { TrashIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

const SHEET_TRAVEL = Dimensions.get('window').height;

type DeleteState = 'idle' | 'confirming' | 'deleting';

export default function ItemDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const { item } = route.params;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // item.tags (AI-assigned) never changes here -- there's no API path that
  // can touch it. Only user_tags is locally editable.
  const [userTags, setUserTags] = useState(item.user_tags);
  const [tagError, setTagError] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');

  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (item.capture_type !== 'screenshot') return;
    let cancelled = false;
    getScreenshotUrl(item.id)
      .then(({ url }) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.capture_type]);

  // On web there's no native animation driver (RN Web always falls back to
  // JS-driven Animated regardless of useNativeDriver), so a shorter duration
  // here reads as noticeably snappier than the 360ms native apps can get
  // away with.
  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const close = () => navigation.goBack();

  // Optimistic: the tag chip disappears/appears immediately, and rolls back
  // if the server call fails rather than leaving the UI ahead of reality.
  const removeTag = (tag: string) => {
    setUserTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeTagApi(item.id, tag).catch((err) => {
      setUserTags((current) => [...current, tag]);
      setTagError(err instanceof Error ? err.message : String(err));
    });
  };

  const submitNewTag = () => {
    const trimmed = newTag.trim();
    setAddingTag(false);
    setNewTag('');
    if (!trimmed || item.tags.includes(trimmed) || userTags.includes(trimmed)) return;
    setUserTags((current) => [...current, trimmed]);
    setTagError('');
    addTag(item.id, trimmed).catch((err) => {
      setUserTags((current) => current.filter((t) => t !== trimmed));
      setTagError(err instanceof Error ? err.message : String(err));
    });
  };

  const confirmDelete = async () => {
    setDeleteState('deleting');
    try {
      await deleteItem(item.id);
      close();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleteState('confirming');
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <BlurView
          intensity={18}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]}
        />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bg,
            borderTopWidth: theme.dark ? 1 : 0,
            borderColor: theme.line,
            borderTopLeftRadius: card ? 30 : 26,
            borderTopRightRadius: card ? 30 : 26,
            paddingBottom: 24 + insets.bottom,
            maxHeight: SHEET_TRAVEL * 0.82,
            transform: [{ translateY }],
            shadowOpacity: theme.dark ? 0.45 : 0.14,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.sub }]} />

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.metaRow}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
              {sourceLabel(item.source, tech)}
            </Text>
            <View style={styles.metaRowRight}>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
                {item.category}
              </Text>
              <Pressable
                onPress={() => setDeleteState('confirming')}
                hitSlop={8}
                style={[styles.trashButton, { borderColor: theme.line }]}
              >
                <TrashIcon size={13.5} color={theme.sub} strokeWidth={1.3} />
              </Pressable>
            </View>
          </View>

          {deleteState !== 'idle' && (
            <View style={[styles.deleteConfirmCard, { borderColor: theme.line }]}>
              <Text style={[styles.deleteConfirmText, { color: theme.ink }]}>휴지통으로 이동할까요? 나중에 복원할 수 있어요.</Text>
              {deleteError !== '' && (
                <Text style={[styles.errorText, { color: theme.accent }]}>삭제 실패: {deleteError}</Text>
              )}
              <View style={styles.deleteConfirmButtons}>
                <Pressable
                  onPress={() => setDeleteState('idle')}
                  disabled={deleteState === 'deleting'}
                  style={[styles.smallGhostButton, { borderColor: theme.line }]}
                >
                  <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  disabled={deleteState === 'deleting'}
                  style={[styles.smallDeleteButton, { opacity: deleteState === 'deleting' ? 0.7 : 1 }]}
                >
                  {deleteState === 'deleting' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>삭제</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <Text
            style={{
              fontFamily: theme.headFamily,
              fontWeight: theme.headWeight,
              fontSize: theme.headSize - 4,
              lineHeight: (theme.headSize - 4) * 1.15,
              letterSpacing: emToTracking(-0.02, theme.headSize - 4),
              color: theme.ink,
              marginTop: 10,
            }}
          >
            {item.title ?? item.raw_text?.slice(0, 40) ?? '(제목 없음)'}
          </Text>

          {item.capture_type === 'screenshot' && (
            <View style={[styles.imageBox, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              {imageError ? (
                <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', padding: 24 }}>
                  이미지를 불러오지 못했어요.
                </Text>
              ) : imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
              ) : (
                <ActivityIndicator color={theme.accent} style={{ padding: 40 }} />
              )}
            </View>
          )}

          {item.capture_type === 'link' && item.thumbnail_url && (
            // Already a public URL the site published for its own link
            // previews -- no signed-URL fetch needed, unlike screenshots.
            <View style={[styles.imageBox, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              <Image source={{ uri: item.thumbnail_url }} style={styles.image} resizeMode="cover" />
            </View>
          )}

          {item.snippet && <Text style={[styles.body, { color: theme.sub }]}>{item.snippet}</Text>}

          {item.capture_type === 'text' && item.raw_text && (
            <Text style={[styles.body, { color: theme.ink }]}>{item.raw_text}</Text>
          )}

          {item.raw_url && (
            <Pressable onPress={() => Linking.openURL(item.raw_url!)} style={styles.linkRow}>
              <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }} numberOfLines={1}>
                {item.raw_url}
              </Text>
            </Pressable>
          )}

          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <TagChip key={tag} label={tag} theme={theme} />
            ))}
            {userTags.map((tag) => (
              <TagChip key={tag} label={tag} theme={theme} onRemove={() => removeTag(tag)} />
            ))}
            {addingTag ? (
              <View style={[styles.newTagBox, { borderColor: theme.line }]}>
                <TextInput
                  value={newTag}
                  onChangeText={setNewTag}
                  autoFocus
                  onSubmitEditing={submitNewTag}
                  onBlur={submitNewTag}
                  placeholder="새 태그"
                  placeholderTextColor={theme.sub}
                  style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13, padding: 0, minWidth: 60, outlineWidth: 0 }}
                />
              </View>
            ) : (
              <TagAddChip label="+ 태그" theme={theme} onPress={() => setAddingTag(true)} />
            )}
          </View>
          {tagError !== '' && <Text style={[styles.errorText, { color: theme.accent }]}>태그 저장 실패: {tagError}</Text>}

          <Text style={[styles.timestamp, { color: theme.sub }]}>{relativeTime(item.shared_at)} 저장됨</Text>
        </ScrollView>

        <View style={styles.buttonRow}>
          {item.raw_url ? (
            <>
              <GhostButton label="닫기" theme={theme} onPress={close} />
              <SolidButton label="링크 열기" theme={theme} onPress={() => Linking.openURL(item.raw_url!)} />
            </>
          ) : (
            <SolidButton label="닫기" theme={theme} onPress={close} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 16,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trashButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  imageBox: { marginTop: 16, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1 },
  body: { fontSize: 14.5, lineHeight: 22.5, marginTop: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
  linkRow: { marginTop: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, alignItems: 'center' },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  errorText: { fontSize: 12.5, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  timestamp: { fontSize: 12.5, marginTop: 18, marginBottom: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  deleteConfirmCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14 },
  deleteConfirmText: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  deleteConfirmButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  smallGhostButton: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  smallDeleteButton: { flex: 1, backgroundColor: '#c0392b', borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
});

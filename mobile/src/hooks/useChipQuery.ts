import { useEffect, useRef, useState } from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { looksLikeSentenceWord } from '../data/sentenceDetect';

export type QueryMode = 'sentence' | 'tag';

export interface QueryChip {
  id: number;
  text: string;
  excluded: boolean;
}

const MODE_KEY = 'cortex.searchMode';

// Drives the search box. Two explicit modes, switched only by the user
// (the toggle, or accepting the "문장처럼 보여요" suggestion) -- never
// flipped automatically mid-typing:
// - 'sentence' (default): free text, sent whole to the LLM search on Enter.
// - 'tag': Enter turns what was typed into a chip (spaces stay inside it,
//   so "성수동 팝업" is one tag); tapping a chip toggles include/exclude,
//   its × removes it, "-word" creates an excluded chip directly.
// The last-used mode is remembered across visits.
export function useChipQuery() {
  const [chips, setChips] = useState<QueryChip[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setModeState] = useState<QueryMode>('sentence');
  const nextId = useRef(1);
  const touched = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((saved) => {
        if (!touched.current && (saved === 'sentence' || saved === 'tag')) setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const addChip = (raw: string) => {
    const tok = raw.trim();
    const excluded = tok.startsWith('-') && tok.length > 1;
    const text = (excluded ? tok.slice(1) : tok).trim();
    if (!text) return;
    setChips((current) => (current.some((c) => c.text === text) ? current : [...current, { id: nextId.current++, text, excluded }]));
  };

  // Tags carry over into the sentence (joined), since that's the
  // "문장으로 찾기" suggestion's whole point. The other way a sentence is
  // almost never a usable tag as-is, so tag mode just starts empty.
  const setMode = (next: QueryMode) => {
    touched.current = true;
    if (next === mode) return;
    if (next === 'sentence') {
      setDraft([...chips.map((c) => c.text), draft.trim()].filter(Boolean).join(' '));
      setChips([]);
    } else {
      setDraft('');
    }
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  };

  const onChangeText = (text: string) => setDraft(text);

  const commitDraft = () => {
    if (mode !== 'tag') return;
    addChip(draft);
    setDraft('');
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (mode === 'tag' && e.nativeEvent.key === 'Backspace' && draft === '' && chips.length > 0) {
      setChips((current) => current.slice(0, -1));
    }
  };

  const toggleChip = (id: number) => {
    setChips((current) => current.map((c) => (c.id === id ? { ...c, excluded: !c.excluded } : c)));
  };
  const removeChip = (id: number) => {
    setChips((current) => current.filter((c) => c.id !== id));
  };

  // Tag mode only: the typed text reads like a sentence ("지난달에", "봤던")
  // -- surfaced as a one-tap suggestion to switch, not acted on.
  const suggestSentence = mode === 'tag' && draft.split(/\s+/).some(looksLikeSentenceWord);

  const includeChips = chips.filter((c) => !c.excluded);
  const excludeChips = chips.filter((c) => c.excluded);

  return {
    mode,
    setMode,
    suggestSentence,
    chips,
    draft,
    includeChips,
    excludeChips,
    addChip,
    onChangeText,
    commitDraft,
    onKeyPress,
    toggleChip,
    removeChip,
  };
}

import { useRef, useState } from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

export interface QueryChip {
  id: number;
  text: string;
  excluded: boolean;
}

// The search screen's tag filter -- the second layer under the instant
// search box (opened with "# 태그로 좁히기"). Enter turns what was typed into
// a chip (spaces stay inside it, so "성수동 팝업" is one tag); tapping a chip
// toggles include/exclude, its × removes it, and "-word" makes an excluded
// chip directly. Backspace on an empty input drops the last chip.
export function useChipQuery() {
  const [chips, setChips] = useState<QueryChip[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);

  const addChip = (raw: string) => {
    const tok = raw.trim();
    const excluded = tok.startsWith('-') && tok.length > 1;
    const text = (excluded ? tok.slice(1) : tok).trim();
    if (!text) return;
    setChips((current) => (current.some((c) => c.text === text) ? current : [...current, { id: nextId.current++, text, excluded }]));
  };

  const commitDraft = () => {
    addChip(draft);
    setDraft('');
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && draft === '' && chips.length > 0) {
      setChips((current) => current.slice(0, -1));
    }
  };

  const toggleChip = (id: number) => {
    setChips((current) => current.map((c) => (c.id === id ? { ...c, excluded: !c.excluded } : c)));
  };
  const removeChip = (id: number) => {
    setChips((current) => current.filter((c) => c.id !== id));
  };
  const clearChips = () => setChips([]);

  return {
    chips,
    draft,
    setDraft,
    includeChips: chips.filter((c) => !c.excluded),
    excludeChips: chips.filter((c) => c.excluded),
    addChip,
    commitDraft,
    onKeyPress,
    toggleChip,
    removeChip,
    clearChips,
  };
}

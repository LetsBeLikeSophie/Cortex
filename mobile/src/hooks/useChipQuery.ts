import { useRef, useState } from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

export interface QueryChip {
  id: number;
  text: string;
  excluded: boolean;
}

// Drives the search screen's tag-chip input: a space or Enter turns whatever
// was just typed into a chip, tapping a chip's text toggles it between
// "must include" and "must exclude", and its × removes it outright. Kept as
// its own hook (rather than inline screen state) since the space/enter
// commit + "-word" exclude-prefix parsing is a self-contained interaction,
// not search-specific plumbing -- anywhere else that wants the same
// "type a word, it becomes a removable/toggleable tag" input can reuse it.
export function useChipQuery() {
  const [chips, setChips] = useState<QueryChip[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);

  const addTokens = (tokens: string[]) => {
    setChips((current) => {
      const seen = new Set(current.map((c) => c.text));
      const added: QueryChip[] = [];
      tokens.forEach((tok) => {
        // Typing "-word" creates an excluded chip directly, same as tapping
        // one to exclude it after the fact.
        const excluded = tok.startsWith('-') && tok.length > 1;
        const text = excluded ? tok.slice(1) : tok;
        if (!text || seen.has(text)) return;
        seen.add(text);
        added.push({ id: nextId.current++, text, excluded });
      });
      return added.length ? [...current, ...added] : current;
    });
  };

  // A space (or Enter, below) is what turns whatever was just typed into a
  // chip -- the text itself stays plain until that moment.
  const onChangeText = (text: string) => {
    if (!/\s/.test(text)) {
      setDraft(text);
      return;
    }
    const parts = text.split(/\s+/);
    const rest = parts.pop() ?? '';
    addTokens(parts.filter(Boolean));
    setDraft(rest);
  };

  const commitDraft = () => {
    const v = draft.trim();
    if (!v) return;
    addTokens([v]);
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

  const includeChips = chips.filter((c) => !c.excluded);
  const excludeChips = chips.filter((c) => c.excluded);

  return {
    chips,
    draft,
    includeChips,
    excludeChips,
    onChangeText,
    commitDraft,
    onKeyPress,
    toggleChip,
    removeChip,
  };
}

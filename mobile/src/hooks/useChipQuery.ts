import { useRef, useState } from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { looksLikeSentenceWord } from '../data/sentenceDetect';

export type QueryMode = 'keyword' | 'sentence';

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
  // 'sentence' stops the space-to-chip split so a whole half-remembered
  // sentence can be typed and sent to the LLM search instead. Switched on
  // automatically (see looksLikeSentenceWord) or by hand; once the user
  // switches back to keywords by hand, auto-detection stays off until the
  // box is cleared, so it doesn't keep flipping against their choice.
  const [mode, setMode] = useState<QueryMode>('keyword');
  const keywordPinned = useRef(false);

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
    if (mode === 'sentence') {
      setDraft(text);
      if (!text.trim() && chips.length === 0) {
        setMode('keyword');
        keywordPinned.current = false;
      }
      return;
    }
    if (!text && chips.length === 0) keywordPinned.current = false;
    if (!/\s/.test(text)) {
      setDraft(text);
      return;
    }
    const parts = text.split(/\s+/);
    const rest = parts.pop() ?? '';
    const tokens = parts.filter(Boolean);
    // Any committed word reading as sentence-ish ("지난달", "인스타에서",
    // "봤던") flips the whole query -- chips typed before it included --
    // back into one plain sentence.
    if (!keywordPinned.current && tokens.some(looksLikeSentenceWord)) {
      const before = chips.map((c) => c.text).join(' ');
      setChips([]);
      setDraft(before ? `${before} ${text}` : text);
      setMode('sentence');
      return;
    }
    addTokens(tokens);
    setDraft(rest);
  };

  const toSentenceMode = () => {
    const joined = [...chips.map((c) => c.text), draft.trim()].filter(Boolean).join(' ');
    setChips([]);
    setDraft(joined);
    setMode('sentence');
    keywordPinned.current = false;
  };

  const toKeywordMode = () => {
    const tokens = draft.split(/\s+/).filter(Boolean);
    setDraft('');
    addTokens(tokens);
    setMode('keyword');
    keywordPinned.current = true;
  };

  const commitDraft = () => {
    if (mode === 'sentence') return;
    const v = draft.trim();
    if (!v) return;
    addTokens([v]);
    setDraft('');
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (mode === 'keyword' && e.nativeEvent.key === 'Backspace' && draft === '' && chips.length > 0) {
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
    mode,
    toSentenceMode,
    toKeywordMode,
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

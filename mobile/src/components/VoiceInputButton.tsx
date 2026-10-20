import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { MicIcon } from './Icons';
import { Theme } from '../theme/themes';
import { addChipShell } from './Chips';
import { permissionToast } from '../native/toast';

// One mic button shared by every place that can take spoken input instead
// of typing (save-sheet memo, tag correction, search). Speech recognition
// is a single global native session -- only one of these can actually be
// recording at a time, which matches how it's used in practice (one
// screen, one input, visible at a time).
//
// `onResult` fires on every partial transcript while speaking (so the
// caller can show live-updating text the same way the keyboard's own mic
// button does) and once more with `isFinal: true` when recognition ends.
// What happens with the final transcript (used as-is for a free-form note,
// or cleaned up through an LLM call into a tag) is entirely up to the
// caller -- this component only runs the mic.
export function VoiceInputButton({
  theme,
  onResult,
  onStart,
  lang = 'ko-KR',
  size = 18,
  variant = 'inField',
}: {
  theme: Theme;
  onResult: (text: string, isFinal: boolean) => void;
  // Fires once a recording actually begins -- lets a caller snapshot
  // what's already in its input so the transcript appends instead of replacing.
  onStart?: () => void;
  lang?: string;
  size?: number;
  // inField: a bare icon tucked into the corner of a text field (the field
  // is the frame -- a second outlined circle beside it read as a stray
  // control). chip: the dashed add-chip shape, next to "+ 태그".
  variant?: 'inField' | 'chip';
}) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);

  useSpeechRecognitionEvent('start', () => {
    setStarting(false);
    setRecording(true);
    onStart?.();
  });
  useSpeechRecognitionEvent('end', () => setRecording(false));
  useSpeechRecognitionEvent('error', () => {
    setStarting(false);
    setRecording(false);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript !== undefined) onResult(transcript, event.isFinal);
  });

  const toggle = async () => {
    if (recording) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setStarting(true);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setStarting(false);
      // Silently doing nothing read as "the mic button is broken" -- a
      // short toast says why (tapping again re-prompts while Android still
      // allows it).
      permissionToast('마이크', perm.canAskAgain);
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityLabel={recording ? '음성 입력 멈추기' : '음성으로 입력'}
      style={[
        styles.button,
        variant === 'chip'
          ? { ...addChipShell(theme), paddingVertical: 0, height: 31, paddingHorizontal: 11 }
          : { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, borderWidth: 0 },
        // Recording is a status, so it takes the accent (see themes.ts roles).
        recording && { backgroundColor: theme.accent + '1f', borderColor: theme.accent, borderStyle: 'solid' },
      ]}
    >
      {starting ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <MicIcon size={size} color={recording ? theme.accent : theme.sub} strokeWidth={1.4} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});

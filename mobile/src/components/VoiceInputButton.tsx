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
import { DEVICE_LOCALE, strings } from '../i18n';

const S = strings({
  ko: { mic: '마이크', stop: '음성 입력 멈추기', start: '음성으로 입력' },
  en: { mic: 'Microphone', stop: 'Stop voice input', start: 'Voice input' },
  ja: { mic: 'マイク', stop: '音声入力を停止', start: '音声で入力' },
  'zh-Hans': { mic: '麦克风', stop: '停止语音输入', start: '语音输入' },
  'zh-Hant': { mic: '麥克風', stop: '停止語音輸入', start: '語音輸入' },
});

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
  lang = DEVICE_LOCALE,
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
      permissionToast(S.mic, perm.canAskAgain);
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityLabel={recording ? S.stop : S.start}
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

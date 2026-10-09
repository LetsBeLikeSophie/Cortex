import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { MicIcon } from './Icons';
import { Theme } from '../theme/themes';

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
  lang = 'ko-KR',
  size = 18,
}: {
  theme: Theme;
  onResult: (text: string, isFinal: boolean) => void;
  lang?: string;
  size?: number;
}) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);

  useSpeechRecognitionEvent('start', () => {
    setStarting(false);
    setRecording(true);
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
      // Silently doing nothing read as "the mic button is broken" -- say
      // why, and once Android stops showing the prompt (denied twice /
      // "don't ask again"), point at the app's settings page instead.
      Alert.alert(
        '마이크 권한이 필요해요',
        perm.canAskAgain
          ? '음성으로 입력하려면 마이크와 음성 인식 권한을 허용해 주세요.'
          : '설정 > 권한에서 마이크를 허용하면 음성으로 입력할 수 있어요.',
        perm.canAskAgain
          ? [{ text: '확인' }]
          : [
              { text: '닫기', style: 'cancel' },
              { text: '설정 열기', onPress: () => Linking.openSettings() },
            ]
      );
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={[
        styles.button,
        {
          width: size + 18,
          height: size + 18,
          borderRadius: (size + 18) / 2,
          borderColor: recording ? theme.accent : theme.line,
          backgroundColor: recording ? theme.accent + '1f' : 'transparent',
        },
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
  button: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

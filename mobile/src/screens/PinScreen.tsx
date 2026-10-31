import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { ModalSheet } from '../components/ModalSheet';
import { Heading, SHEET_TITLE_SIZE } from '../components/Typography';
import { allEdges, OUTLINE, BODY_KR } from '../theme/themes';
import { strings } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { checkPin, confirmDeviceOwner, finishPin, setPin } from '../lock/memoLock';

const S = strings({
  ko: {
    check: '메모 잠금 비밀번호',
    setNew: '새 비밀번호 (숫자 4자리)',
    again: '한 번 더 입력해 주세요',
    wrong: '비밀번호가 맞지 않아요',
    mismatch: '두 번 입력한 숫자가 달라요. 처음부터 다시 입력해 주세요.',
    forgot: '비밀번호를 잊었어요',
    owner: '휴대폰 잠금으로 본인 확인',
    noScreenLock: '휴대폰에 화면 잠금이 없어 재설정할 수 없어요.',
    delete: '지우기',
    close: '닫기',
  },
  en: {
    check: 'Memo lock PIN',
    setNew: 'New PIN (4 digits)',
    again: 'Enter it once more',
    wrong: "That PIN isn't right",
    mismatch: "The two PINs didn't match. Please start again.",
    forgot: 'I forgot my PIN',
    owner: "Confirm with your phone's screen lock",
    noScreenLock: "This phone has no screen lock, so the PIN can't be reset.",
    delete: 'Delete',
    close: 'Close',
  },
  ja: {
    check: 'メモロックの暗証番号',
    setNew: '新しい暗証番号(数字4桁)',
    again: 'もう一度入力してください',
    wrong: '暗証番号が違います',
    mismatch: '2回の入力が一致しません。最初から入力してください。',
    forgot: '暗証番号を忘れた',
    owner: '端末の画面ロックで本人確認',
    noScreenLock: '端末に画面ロックがないため再設定できません。',
    delete: '削除',
    close: '閉じる',
  },
  'zh-Hans': {
    check: '笔记锁密码',
    setNew: '新密码（4 位数字）',
    again: '请再输入一次',
    wrong: '密码不正确',
    mismatch: '两次输入不一致，请重新输入。',
    forgot: '忘记密码',
    owner: '用手机锁屏验证身份',
    noScreenLock: '手机未设置锁屏，无法重设密码。',
    delete: '删除',
    close: '关闭',
  },
  'zh-Hant': {
    check: '筆記鎖密碼',
    setNew: '新密碼（4 位數字）',
    again: '請再輸入一次',
    wrong: '密碼不正確',
    mismatch: '兩次輸入不一致，請重新輸入。',
    forgot: '忘記密碼',
    owner: '用手機螢幕鎖驗證身分',
    noScreenLock: '手機未設定螢幕鎖，無法重設密碼。',
    delete: '刪除',
    close: '關閉',
  },
});

const LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// The memo-lock PIN pad. 'check' opens a locked memo (with a way back in
// through the phone's own screen lock); 'set' makes a new PIN, typed twice.
export default function PinScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Pin'>>();
  const [mode, setMode] = useState(route.params.mode);
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const done = useRef(false);

  const close = (ok: boolean) => {
    if (done.current) return;
    done.current = true;
    finishPin(ok);
    navigation.goBack();
  };
  // Leaving by back gesture or a tap outside counts as "not opened".
  useEffect(() => navigation.addListener('beforeRemove', () => {
    if (!done.current) {
      done.current = true;
      finishPin(false);
    }
  }), [navigation]);

  const submit = async (pin: string) => {
    if (mode === 'check') {
      if (await checkPin(pin)) return close(true);
      setMessage(S.wrong);
      setDigits('');
      return;
    }
    if (first === null) {
      setFirst(pin);
      setDigits('');
      setMessage('');
      return;
    }
    if (first !== pin) {
      setFirst(null);
      setDigits('');
      setMessage(S.mismatch);
      return;
    }
    await setPin(pin);
    close(true);
  };

  const press = (key: string) => {
    if (key === 'del') return setDigits((d) => d.slice(0, -1));
    if (!key || digits.length >= LENGTH) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === LENGTH) submit(next);
  };

  const forgot = async () => {
    if (await confirmDeviceOwner(S.owner)) {
      setMode('set');
      setFirst(null);
      setDigits('');
      setMessage('');
    } else {
      setMessage(S.noScreenLock);
    }
  };

  const title = mode === 'check' ? S.check : first === null ? S.setNew : S.again;
  return (
    <ModalSheet theme={theme} onClose={() => close(false)} paddingBottom={24} paddingHorizontal={20}>
      <Heading theme={theme} size={SHEET_TITLE_SIZE} style={styles.center}>
        {title}
      </Heading>
      <View style={styles.dots}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, allEdges(OUTLINE, theme.ink), { backgroundColor: i < digits.length ? theme.ink : 'transparent' }]}
          />
        ))}
      </View>
      <Text style={[styles.message, { color: theme.danger }]}>{message}</Text>
      <View style={styles.pad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            onPress={() => press(key)}
            disabled={!key}
            accessibilityLabel={key === 'del' ? S.delete : key || undefined}
            style={({ pressed }) => [styles.key, { opacity: pressed && key ? 0.5 : 1 }]}
          >
            <Text style={[styles.keyText, { color: theme.ink }]}>{key === 'del' ? '⌫' : key}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'check' && (
        <Pressable onPress={forgot} hitSlop={8} style={styles.forgot}>
          <Text style={[styles.forgotText, { color: theme.sub }]}>{S.forgot}</Text>
        </Pressable>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 22 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  message: { textAlign: 'center', minHeight: 20, marginTop: 12, fontSize: 12.5, fontFamily: BODY_KR },
  pad: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  key: { width: '33.33%', height: 58, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontFamily: BODY_KR },
  forgot: { alignSelf: 'center', marginTop: 8, paddingVertical: 6 },
  forgotText: { fontSize: 13, fontFamily: BODY_KR, textDecorationLine: 'underline' },
});

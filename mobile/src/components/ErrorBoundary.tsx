import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Theme } from '../theme/themes';
import { SolidButton } from './Buttons';
import { Heading, SHEET_TITLE_SIZE } from './Typography';
import { strings } from '../i18n';
import { reportError } from '../errors/report';

const S = strings({
  ko: { title: '문제가 생겼어요', reopen: '다시 열기' },
  en: { title: 'Something went wrong', reopen: 'Reopen' },
  ja: { title: '問題が発生しました', reopen: '開き直す' },
  'zh-Hans': { title: '出了点问题', reopen: '重新打开' },
  'zh-Hant': { title: '出了點問題', reopen: '重新開啟' },
});

// One bad memo's data used to take the whole app down. This keeps the app up:
// '다시 열기' mounts everything below it from scratch.
export class ErrorBoundary extends React.Component<{ theme: Theme; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { theme } = this.props;
    return (
      <View style={styles.wrap}>
        <Heading theme={theme} size={SHEET_TITLE_SIZE} style={styles.title}>
          {S.title}
        </Heading>
        <SolidButton label={S.reopen} theme={theme} flex={0} onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title: { textAlign: 'center', marginBottom: 20 },
});

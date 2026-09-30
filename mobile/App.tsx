import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Deep per-weight imports, not the package's own root index -- that root
// file does an unconditional require() of every weight's .ttf (so Metro's
// web bundler ships the whole family, sibling weights included, no matter
// which named export is actually read). This is the same trick as the
// weight-only useFonts() call below, just needed one layer earlier: without
// it, this file was pulling ~19MB of unused IBM Plex Sans KR weights alone.
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { IBMPlexSansKR_400Regular } from '@expo-google-fonts/ibm-plex-sans-kr/400Regular';
import { IBMPlexSansKR_500Medium } from '@expo-google-fonts/ibm-plex-sans-kr/500Medium';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import LoginScreen from './src/screens/LoginScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  const { theme } = useTheme();
  const { session, loading } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      {loading ? (
        // This is the window where the Kakao redirect-back is exchanging its
        // code for a session (a few sequential network calls -- Kakao's own
        // APIs plus Supabase admin calls -- so it's routinely a full second
        // or more). Rendering nothing here made that look frozen: a reload
        // "fixed" it only because the second mount re-read an
        // already-completed session from storage instead of actually being
        // faster.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : session ? (
        <RootNavigator />
      ) : (
        <LoginScreen />
      )}
    </View>
  );
}

export default function App() {
  // Only the weights actually referenced anywhere in src/ (checked via
  // grep) -- IBM Plex Sans KR's full Korean glyph set makes each unused
  // weight here a multi-megabyte dead download that blocks first paint
  // (see the `!fontsLoaded` gate below) for nothing.
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    IBMPlexSansKR_400Regular,
    IBMPlexSansKR_500Medium,
    IBMPlexMono_400Regular,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import {
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bindQueryLifecycle, queryClient } from '@/core/api/query-client';
import { useMarketStore } from '@/core/stream/market-store';
import { useAuthStore } from '@/features/auth/auth-store';
import { useSessionLifecycle } from '@/features/auth/use-session-lifecycle';
import { useRecoverPairsMetaOnReconnect } from '@/features/markets/use-pairs-meta';
import { ErrorScreen } from '@/ui/error-screen';
import { colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Catches render errors anywhere below the root layout. By the time this shows,
 * the layout has unmounted, so the stream, settings sync and query cache are
 * already torn down; retrying mounts them again from a clean state.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ErrorScreen
      error={error}
      onRetry={() => {
        useMarketStore.getState().reset();
        void retry();
      }}
    />
  );
}

function AppServices() {
  useSessionLifecycle();
  useRecoverPairsMetaOnReconnect();
  useEffect(bindQueryLifecycle, []);
  return null;
}

function Navigation({ fontsReady }: { fontsReady: boolean }) {
  const status = useAuthStore((state) => state.status);
  const ready = fontsReady && status !== 'restoring';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    Inter_400Regular,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <AppServices />
        <StatusBar style="light" />
        <Navigation fontsReady={fontsLoaded || fontError !== null} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

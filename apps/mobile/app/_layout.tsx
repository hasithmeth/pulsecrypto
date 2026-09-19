import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk';
import { Inter_400Regular } from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { bindQueryLifecycle, queryClient } from '@/core/api/query-client';
import { useStreamLifecycle } from '@/core/stream/use-stream-lifecycle';
import { useRecoverPairsMetaOnReconnect } from '@/features/markets/use-pairs-meta';
import { useRestoreStreamInterval } from '@/features/telemetry/use-stream-interval';
import { colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

function AppServices() {
  useStreamLifecycle();
  useRecoverPairsMetaOnReconnect();
  useRestoreStreamInterval();
  useEffect(bindQueryLifecycle, []);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_400Regular,
    Inter_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AppServices />
      <StatusBar style="light" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </QueryClientProvider>
  );
}

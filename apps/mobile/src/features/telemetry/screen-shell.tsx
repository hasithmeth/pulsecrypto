import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { usePairMeta } from '@/features/markets/use-pairs-meta';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { AppHeader } from '@/ui/app-header';
import { colors, spacing } from '@/ui/theme';

/** Header and scrolling card column shared by the Settings and Telemetry tabs. */
export function ScreenShell({ children }: { children: ReactNode }) {
  const symbol = useUserSettingsStore((state) => state.selectedPair);
  const pair = usePairMeta(symbol);

  return (
    <View style={styles.screen}>
      <AppHeader variant="pill" title={pair ? `${pair.base}/${pair.quote}` : symbol} />
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundDeep },
  content: { padding: spacing.lg, paddingBottom: 42, gap: spacing.xl },
});

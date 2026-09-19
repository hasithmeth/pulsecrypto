import { StyleSheet, View } from 'react-native';
import { AppText } from '@/ui/app-text';
import { spacing } from '@/ui/theme';
import { MicroCards } from './micro-cards';
import { PerformanceCard } from './performance-card';
import { ScreenShell } from './screen-shell';
import { ThrottlingCard } from './throttling-card';
import { useTelemetry } from './use-telemetry';

export function SettingsScreen() {
  const { sample, reset } = useTelemetry();

  return (
    <ScreenShell>
      <View style={styles.intro}>
        <AppText variant="screenTitle" accessibilityRole="header">
          System Settings & Telemetry
        </AppText>
        <AppText color="textSecondary">
          Real-time performance monitoring and data ingestion controls.
        </AppText>
      </View>
      <ThrottlingCard />
      <PerformanceCard sample={sample} onReset={reset} />
      <MicroCards sample={sample} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
});

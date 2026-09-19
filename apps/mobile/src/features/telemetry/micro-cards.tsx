import { StyleSheet, View } from 'react-native';
import { AppText } from '@/ui/app-text';
import { Card } from '@/ui/card';
import { Icon, type IconName } from '@/ui/icon';
import { colors, radius, spacing, withAlpha, type ColorToken } from '@/ui/theme';
import type { TelemetrySample } from './use-telemetry';

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

/**
 * The design's three cards, with its titles, icons and colours. The detail
 * lines report what this app really does instead of the mockup's web-only copy.
 */
export function MicroCards({ sample }: { sample: TelemetrySample }) {
  return (
    <>
      <MicroCard
        icon="bolt"
        tone="positive"
        title="GPU ACCELERATION"
        detail="UI Thread Render Pipeline: Active"
      />
      <MicroCard
        icon="shield"
        tone="accent"
        title="API LATENCY"
        detail={`Avg Ping: ${sample.averagePingMs === null ? '--' : `${sample.averagePingMs}ms`} (Gateway)`}
      />
      <MicroCard
        icon="database"
        tone="textSecondary"
        title="STORAGE CACHE"
        detail={`AsyncStorage: ${sample.storageBytes === null ? '--' : formatBytes(sample.storageBytes)} utilized`}
      />
    </>
  );
}

interface MicroCardProps {
  readonly icon: IconName;
  readonly tone: ColorToken;
  readonly title: string;
  readonly detail: string;
}

function MicroCard({ icon, tone, title, detail }: MicroCardProps) {
  return (
    <Card style={styles.card}>
      <View style={[styles.tile, { backgroundColor: withAlpha(colors[tone], 0.1) }]}>
        <Icon name={icon} color={tone} />
      </View>
      <View style={styles.text}>
        <View style={styles.title}>
          <AppText variant="label" color={tone}>
            {title}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  tile: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  text: { flexShrink: 1 },
  title: { marginBottom: -1 },
});

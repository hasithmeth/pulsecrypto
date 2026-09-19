import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { gateway } from '@/core/config/gateway';
import { useConnectionStore } from '@/core/stream/connection-store';
import { AppText } from '@/ui/app-text';
import { Card } from '@/ui/card';
import { ConnectionBanner } from '@/ui/connection-banner';
import { ConnectionIndicator } from '@/ui/connection-indicator';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, radius, spacing, withAlpha, type ColorToken } from '@/ui/theme';
import { FpsGauge } from './fps-gauge';
import { IntervalControl } from './interval-control';
import { useTelemetry, type TelemetrySample } from './use-telemetry';

const TARGET_FPS = 60;

const HEALTHY_COALESCED_SHARE = 0.2;
const SATURATED_COALESCED_SHARE = 0.6;

/**
 * Health asks whether the UI keeps up with the stream: the share of received
 * frames that had to be merged before React could apply them. Unlike frame rate
 * or timer lag, which mostly describe the device (an idle emulator scores badly
 * on both), this describes the app, and the slider above is the remedy.
 */
function assessHealth({ commitsPerSecond, coalescedPerSecond }: TelemetrySample): {
  label: string;
  tone: ColorToken;
} {
  const frames = commitsPerSecond + coalescedPerSecond;
  if (frames === 0) return { label: 'IDLE', tone: 'textSecondary' };
  const coalescedShare = coalescedPerSecond / frames;
  if (coalescedShare <= HEALTHY_COALESCED_SHARE) return { label: 'HEALTHY', tone: 'positive' };
  if (coalescedShare <= SATURATED_COALESCED_SHARE) return { label: 'CONFLATING', tone: 'accent' };
  return { label: 'SATURATED', tone: 'negative' };
}

export function TelemetryScreen() {
  const { sample, reset } = useTelemetry();
  const connection = useConnectionStore();
  const health = assessHealth(sample);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Telemetry" trailing={<ConnectionIndicator variant="pill" />} />
      <ConnectionBanner />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title">System Settings & Telemetry</AppText>
          <AppText color="textSecondary">
            Real-time performance monitoring and data ingestion controls.
          </AppText>
        </View>

        <Card>
          <CardHeading
            eyebrow="NETWORK CONTROL"
            eyebrowTone="positive"
            title="Data Throttling Configurator"
          />
          <IntervalControl />
          <AppText variant="caption" color="textSecondary">
            The gateway conflates the exchange feed and emits the latest state to this device at the
            chosen interval. The value shown is the one the gateway acknowledged.
          </AppText>
        </Card>

        <Card>
          <View style={styles.dashboardHeading}>
            <CardHeading
              eyebrow="SYSTEM TELEMETRY"
              eyebrowTone="accent"
              title="Performance Dashboard"
            />
            <View style={styles.actions}>
              <Pressable onPress={reset} accessibilityRole="button" style={styles.reset}>
                <AppText variant="label">RESET</AppText>
              </Pressable>
              <View
                style={[
                  styles.badge,
                  {
                    borderColor: colors[health.tone],
                    backgroundColor: withAlpha(colors[health.tone], 0.1),
                  },
                ]}
              >
                <AppText variant="label" color={health.tone}>
                  {health.label}
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <FpsGauge fps={sample.fps} target={TARGET_FPS} tone="positive" />
            <AppText>JS Thread Frame Rate</AppText>
            <AppText variant="caption" color="textSecondary">
              Lowest since reset: {sample.lowestFps ?? '--'} FPS
            </AppText>
          </View>

          <View style={styles.panel}>
            <MaterialCommunityIcons name="swap-vertical-bold" size={28} color={colors.accent} />
            <AppText variant="monoDisplay">{sample.messagesPerSecond}</AppText>
            <AppText variant="label" color="textSecondary">
              msgs/sec
            </AppText>
            <AppText>WS Message Ingestion Rate</AppText>
          </View>

          <View style={styles.grid}>
            <Metric label="EVENT LOOP LAG" value={`${sample.eventLoopLagMs} ms`} />
            <Metric label="STORE COMMITS" value={`${sample.commitsPerSecond}/s`} />
            <Metric label="FRAMES COALESCED" value={`${sample.coalescedPerSecond}/s`} />
            <Metric label="THROUGHPUT" value={`${sample.kilobytesPerSecond} KB/s`} />
            <Metric
              label="ROUND TRIP"
              value={connection.latencyMs === null ? '--' : `${connection.latencyMs} ms`}
            />
            <Metric
              label="JS HEAP"
              value={
                sample.heapMegabytes === null ? 'n/a' : `${sample.heapMegabytes.toFixed(1)} MB`
              }
            />
          </View>
        </Card>

        <MicroCard icon="lan-connect" tone="positive" title="GATEWAY" detail={gateway.origin} />
        <MicroCard
          icon="swap-horizontal-bold"
          tone="accent"
          title="CONNECTION"
          detail={`App to gateway: ${connection.phase}`}
        />
        <MicroCard
          icon="database-outline"
          tone="textSecondary"
          title="EXCHANGE FEED"
          detail={`Gateway to Binance: ${connection.upstream ?? 'unknown'}`}
        />
      </ScrollView>
    </View>
  );
}

function CardHeading({
  eyebrow,
  eyebrowTone,
  title,
}: {
  eyebrow: string;
  eyebrowTone: ColorToken;
  title: string;
}) {
  return (
    <View style={styles.cardHeading}>
      <AppText variant="label" color={eyebrowTone}>
        {eyebrow}
      </AppText>
      <AppText variant="heading">{title}</AppText>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="mono">{value}</AppText>
    </View>
  );
}

interface MicroCardProps {
  readonly icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  readonly tone: ColorToken;
  readonly title: string;
  readonly detail: string;
}

function MicroCard({ icon, tone, title, detail }: MicroCardProps) {
  return (
    <Card style={styles.microCard}>
      <View style={[styles.microIcon, { backgroundColor: withAlpha(colors[tone], 0.1) }]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors[tone]} />
      </View>
      <View style={styles.microText}>
        <AppText variant="label" color={tone}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundDeep },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  intro: { gap: spacing.sm },
  cardHeading: { gap: spacing.xs, flexShrink: 1 },
  dashboardHeading: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  reset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceBright,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  panel: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  metric: { width: '50%', gap: 2 },
  microCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  microIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  microText: { flex: 1, gap: 2 },
});

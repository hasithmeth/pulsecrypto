import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/ui/app-text';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { colors, radius, spacing, typography, withAlpha, type ColorToken } from '@/ui/theme';
import { MemoryGraph } from './memory-graph';
import type { TelemetrySample } from './use-telemetry';

const TARGET_FPS = 60;
const RING_SIZE = 128;
const RING_STROKE = 10.24;
const RING_RADIUS = 57.6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const HEALTHY_COALESCED_SHARE = 0.2;
const SATURATED_COALESCED_SHARE = 0.6;

/**
 * Health asks whether the UI keeps up with the stream: the share of received
 * frames that had to be merged before React could apply them. Frame rate mostly
 * describes the device (an idle emulator scores badly); this describes the app,
 * and the throttling controls are the remedy.
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

interface PerformanceCardProps {
  readonly sample: TelemetrySample;
  readonly onReset: () => void;
}

export function PerformanceCard({ sample, onReset }: PerformanceCardProps) {
  const health = assessHealth(sample);
  const progress = Math.min(1, sample.fps / TARGET_FPS);

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.titles}>
          <AppText variant="label" color="accent">
            SYSTEM TELEMETRY
          </AppText>
          <AppText variant="cardTitle">{'Performance\nDashboard'}</AppText>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reset telemetry"
            style={styles.reset}
          >
            <AppText variant="label">RESET</AppText>
          </Pressable>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: withAlpha(colors[health.tone], 0.1),
                borderColor: withAlpha(colors[health.tone], 0.2),
              },
            ]}
          >
            <AppText variant="label" color={health.tone}>
              {health.label}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.panels}>
        <View style={[styles.panel, styles.gaugePanel]}>
          <View
            style={styles.ring}
            accessibilityRole="progressbar"
            accessibilityLabel="JavaScript thread frame rate"
            accessibilityValue={{ min: 0, max: TARGET_FPS, now: sample.fps }}
          >
            <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={colors.surfaceBright}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={colors.positive}
                strokeWidth={RING_STROKE}
                strokeDasharray={`${RING_CIRCUMFERENCE * progress} ${RING_CIRCUMFERENCE}`}
                fill="none"
              />
            </Svg>
            <AppText variant="monoDisplay" style={styles.gaugeValue}>
              {sample.fps}
            </AppText>
            <AppText variant="label" color="textSecondary">
              FPS
            </AppText>
          </View>
          <AppText>JS Thread Frame Rate</AppText>
        </View>

        <View style={[styles.panel, styles.counterPanel]}>
          <Icon name="feed" color="accent" />
          <View style={styles.counterValue}>
            <AppText variant="monoDisplay">{sample.messagesPerSecond}</AppText>
            <AppText variant="label" color="textSecondary">
              msgs/sec
            </AppText>
          </View>
          <AppText>WS Message Ingestion Rate</AppText>
        </View>
      </View>

      <View style={[styles.panel, styles.memoryPanel]}>
        <View style={styles.memoryHeading}>
          <AppText>Memory Footprint Tracker</AppText>
          <AppText variant="mono" color="accent">
            {sample.heapMegabytes === null ? 'n/a' : `${sample.heapMegabytes.toFixed(1)} MB`}
          </AppText>
        </View>
        <MemoryGraph history={sample.heapHistory} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xxl },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titles: { gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reset: {
    paddingHorizontal: 12,
    paddingTop: 4.5,
    paddingBottom: 5.5,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceBright,
  },
  badge: { paddingHorizontal: 13, paddingVertical: 5, borderRadius: radius.xs, borderWidth: 1 },
  panels: { gap: spacing.xxl },
  panel: { borderRadius: radius.sm, backgroundColor: colors.surface },
  gaugePanel: { alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  gaugeValue: { lineHeight: typography.monoDisplay.fontSize },
  counterPanel: { height: 158, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  counterValue: { alignItems: 'center' },
  memoryPanel: { padding: spacing.lg, gap: spacing.lg },
  memoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

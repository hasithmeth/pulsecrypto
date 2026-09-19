import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/ui/app-text';
import { colors, spacing } from '@/ui/theme';
import { useStreamInterval } from './use-stream-interval';

const STEP_MS = 10;
const SCALE_MARK_MS = 100;

/**
 * The slider is a request, not a local setting: the gateway clamps and snaps the
 * value, then acknowledges it, and the acknowledged figure is what is shown.
 */
export function IntervalControl() {
  const { intervalMs, limits, request } = useStreamInterval();
  const [dragging, setDragging] = useState<number | null>(null);
  const midpoint =
    Math.round((limits.minIntervalMs + limits.maxIntervalMs) / 2 / SCALE_MARK_MS) * SCALE_MARK_MS;

  return (
    <View style={styles.control}>
      <View style={styles.heading}>
        <AppText variant="caption" color="textSecondary">
          Update Frequency
        </AppText>
        <AppText variant="monoLg" color="positive">
          {dragging ?? intervalMs}ms
        </AppText>
      </View>

      <Slider
        value={intervalMs}
        minimumValue={limits.minIntervalMs}
        maximumValue={limits.maxIntervalMs}
        step={STEP_MS}
        onValueChange={setDragging}
        onSlidingComplete={(value) => {
          setDragging(null);
          request(value);
        }}
        minimumTrackTintColor={colors.positive}
        maximumTrackTintColor={colors.surfaceBright}
        thumbTintColor={colors.positive}
        accessibilityLabel="Update frequency in milliseconds"
      />

      <View style={styles.scale}>
        {[limits.minIntervalMs, midpoint, limits.maxIntervalMs].map((mark) => (
          <AppText key={mark} variant="monoSm" color="textMuted">
            {mark}ms
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: { gap: spacing.sm },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});

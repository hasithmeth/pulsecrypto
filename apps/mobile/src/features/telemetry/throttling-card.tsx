import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { AppText } from '@/ui/app-text';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { Slider } from '@/ui/slider';
import { colors, spacing } from '@/ui/theme';
import { Toggle } from '@/ui/toggle';
import { useStreamInterval } from './use-stream-interval';

const STEP_MS = 10;
const MIDPOINT_MS = 500;

export function ThrottlingCard() {
  const { effectiveMs, chosenMs, limits, choose } = useStreamInterval();
  const [dragging, setDragging] = useState<number | null>(null);
  const binaryProtocol = useUserSettingsStore((state) => state.binaryProtocol);
  const adaptivePolling = useUserSettingsStore((state) => state.adaptivePolling);
  const setBinaryProtocol = useUserSettingsStore((state) => state.setBinaryProtocol);
  const setAdaptivePolling = useUserSettingsStore((state) => state.setAdaptivePolling);

  return (
    <Card>
      <View style={styles.heading}>
        <View style={styles.titles}>
          <AppText variant="label" color="positive">
            NETWORK CONTROL
          </AppText>
          <AppText variant="cardTitle">Data Throttling Configurator</AppText>
        </View>
        <Icon name="speed" color="textSecondary" />
      </View>

      <View style={styles.frequency}>
        <View style={styles.frequencyHeading}>
          <AppText variant="caption" color="textSecondary">
            Update Frequency
          </AppText>
          <AppText variant="monoLg" color="positive">
            {dragging ?? effectiveMs}ms
          </AppText>
        </View>
        <Slider
          value={chosenMs}
          minimum={limits.minIntervalMs}
          maximum={limits.maxIntervalMs}
          step={STEP_MS}
          label="Update frequency in milliseconds"
          onChange={setDragging}
          onCommit={(value) => {
            setDragging(null);
            choose(value);
          }}
        />
        <View style={styles.scale}>
          {[limits.minIntervalMs, MIDPOINT_MS, limits.maxIntervalMs].map((mark) => (
            <AppText key={mark} variant="monoSm" color="textMuted">
              {mark}ms
            </AppText>
          ))}
        </View>
      </View>

      <View style={styles.options}>
        <Option
          label="Binary Protocol Compression"
          value={binaryProtocol}
          onChange={setBinaryProtocol}
        />
        <Option
          label="Adaptive Polling Strategy"
          value={adaptivePolling}
          onChange={setAdaptivePolling}
        />
      </View>
    </Card>
  );
}

interface OptionProps {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}

function Option({ label, value, onChange }: OptionProps) {
  return (
    <View style={styles.option}>
      <AppText>{label}</AppText>
      <Toggle label={label} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titles: { gap: spacing.xs, flexShrink: 1 },
  frequency: { gap: 2 },
  frequencyHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  // The slider's touch area is taller than the 4pt track the design measures from.
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  options: {
    gap: spacing.lg,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

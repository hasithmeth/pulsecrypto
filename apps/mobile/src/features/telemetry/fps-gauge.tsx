import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/ui/app-text';
import { colors, type ColorToken } from '@/ui/theme';

const SIZE = 128;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface FpsGaugeProps {
  readonly fps: number;
  readonly target: number;
  readonly tone: ColorToken;
}

export function FpsGauge({ fps, target, tone }: FpsGaugeProps) {
  const progress = Math.min(1, fps / target);
  return (
    <View
      style={styles.gauge}
      accessibilityRole="progressbar"
      accessibilityLabel="JavaScript thread frame rate"
      accessibilityValue={{ min: 0, max: target, now: fps }}
    >
      <Svg width={SIZE} height={SIZE} style={styles.ring}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.surfaceBright}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors[tone]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`}
          fill="none"
        />
      </Svg>
      <AppText variant="monoDisplay">{fps}</AppText>
      <AppText variant="label" color="textSecondary">
        FPS
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
});

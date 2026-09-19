import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, withAlpha } from '@/ui/theme';

const HEIGHT = 96;
const TOP_INSET = 19;
const FADE_WIDTH = 64;
const STROKE_WIDTH = 1.65;

/** Straight segments between samples, a 10% fill and a left-edge fade, as drawn in the design. */
export function MemoryGraph({ history }: { history: readonly number[] }) {
  const [width, setWidth] = useState(0);
  const line = buildLine(history, width);

  return (
    <View
      style={styles.graph}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      accessibilityLabel="Memory usage over the last few seconds"
    >
      {line && width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface} stopOpacity={1} />
              <Stop offset="0.5" stopColor={colors.surface} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.surface} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${line} V ${HEIGHT} H 0 Z`} fill={withAlpha(colors.accent, 0.1)} />
          <Path d={line} stroke={colors.accent} strokeWidth={STROKE_WIDTH} fill="none" />
          <Rect width={FADE_WIDTH} height={HEIGHT} fill="url(#fade)" />
        </Svg>
      ) : null}
    </View>
  );
}

function buildLine(history: readonly number[], width: number): string | null {
  if (history.length < 2 || width === 0) return null;
  const low = Math.min(...history);
  const high = Math.max(...history);
  const range = high - low || 1;
  const step = width / (history.length - 1);
  return history
    .map((value, index) => {
      const y = HEIGHT - TOP_INSET - ((value - low) / range) * (HEIGHT - TOP_INSET * 2);
      return `${index === 0 ? 'M' : 'L'} ${(index * step).toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

const styles = StyleSheet.create({
  graph: { height: HEIGHT, overflow: 'hidden' },
});

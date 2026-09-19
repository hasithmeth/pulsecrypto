import type { PairMeta } from '@pulsecrypto/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useBook } from '@/core/stream/market-store';
import { formatCompact } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { colors, radius, spacing, withAlpha } from '@/ui/theme';
import { buildDepthGeometry } from './depth-path';

const CHART_HEIGHT = 180;

export function DepthChart({ pair }: { pair: PairMeta }) {
  const book = useBook(pair.symbol);
  const [width, setWidth] = useState(0);
  const geometry =
    book && width > 0 ? buildDepthGeometry(book.bids, book.asks, width, CHART_HEIGHT) : null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <AppText variant="label" color="textSecondary">
          MARKET DEPTH
        </AppText>
        <View style={styles.legend}>
          <LegendItem
            color={colors.positive}
            text={`Bids: ${geometry ? formatCompact(geometry.bidVolume) : '--'} ${pair.base}`}
          />
          <LegendItem
            color={colors.negative}
            text={`Asks: ${geometry ? formatCompact(geometry.askVolume) : '--'} ${pair.base}`}
          />
        </View>
      </View>

      <View
        style={styles.chart}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        accessibilityLabel="Cumulative market depth chart"
      >
        {geometry ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Path
              d={geometry.bidPath}
              fill={withAlpha(colors.positive, 0.25)}
              stroke={colors.positive}
              strokeWidth={1}
            />
            <Path
              d={geometry.askPath}
              fill={withAlpha(colors.negative, 0.25)}
              stroke={colors.negative}
              strokeWidth={1}
            />
            <Line
              x1={geometry.midX}
              x2={geometry.midX}
              y1={0}
              y2={CHART_HEIGHT}
              stroke={colors.outline}
              strokeWidth={1}
            />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

function LegendItem({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <AppText variant="caption">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surfaceRaised, paddingTop: spacing.lg },
  header: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  legend: { flexDirection: 'row', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill },
  chart: { height: CHART_HEIGHT, marginTop: spacing.sm },
});

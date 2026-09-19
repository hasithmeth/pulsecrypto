import type { Book, PairMeta } from '@pulsecrypto/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useBook } from '@/core/stream/market-store';
import { formatCompact } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { colors, radius, spacing, withAlpha, type ColorToken } from '@/ui/theme';
import { buildDepthGeometry } from './depth-path';

const CHART_HEIGHT = 300;
const BALANCED_BAND = 5;

interface Reading {
  readonly text: string;
  readonly tone: ColorToken;
}

/** Spread as a share of price. Liquid pairs sit far below the first threshold. */
function describeLiquidityGap(book: Book | undefined): Reading {
  if (!book) return { text: '--', tone: 'textMuted' };
  const percent =
    book.spreadPct >= 0.01 ? book.spreadPct.toFixed(2) : book.spreadPct.toPrecision(1);
  if (book.spreadPct < 0.05) return { text: `Low (${percent}%)`, tone: 'positive' };
  if (book.spreadPct < 0.25) return { text: `Medium (${percent}%)`, tone: 'accent' };
  return { text: `High (${percent}%)`, tone: 'negative' };
}

function describePressure(book: Book | undefined): Reading {
  if (!book) return { text: '--', tone: 'textMuted' };
  if (book.buyPressure > 50 + BALANCED_BAND) return { text: 'Buy Heavy', tone: 'positive' };
  if (book.buyPressure < 50 - BALANCED_BAND) return { text: 'Sell Heavy', tone: 'negative' };
  return { text: 'Balanced', tone: 'textPrimary' };
}

export function DepthChart({ pair }: { pair: PairMeta }) {
  const book = useBook(pair.symbol);
  const [width, setWidth] = useState(0);
  const geometry =
    book && width > 0 ? buildDepthGeometry(book.bids, book.asks, width, CHART_HEIGHT) : null;
  const volume = (value: number | undefined): string =>
    value === undefined ? '--' : `${formatCompact(value)} ${pair.base}`;

  return (
    <View
      style={styles.section}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {geometry ? (
        <Svg
          width={width}
          height={CHART_HEIGHT}
          style={styles.chart}
          accessibilityLabel="Cumulative market depth"
        >
          <Path d={geometry.bidPath} fill={withAlpha(colors.positive, 0.28)} />
          <Path d={geometry.askPath} fill={withAlpha(colors.negative, 0.3)} />
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

      <View style={styles.legend}>
        <AppText variant="label" color="textSecondary">
          MARKET DEPTH
        </AppText>
        <View style={styles.legendRow}>
          <LegendItem color={colors.positive} text={`Bids: ${volume(geometry?.bidVolume)}`} />
          <LegendItem color={colors.negative} text={`Asks: ${volume(geometry?.askVolume)}`} />
        </View>
      </View>

      <View style={styles.overlay}>
        <OverlayReading label="LIQUIDITY GAP" reading={describeLiquidityGap(book)} />
        <View style={styles.divider} />
        <OverlayReading label="PRESSURE" reading={describePressure(book)} />
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

function OverlayReading({ label, reading }: { label: string; reading: Reading }) {
  return (
    <View>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="mono" color={reading.tone} numberOfLines={1}>
        {reading.text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { height: CHART_HEIGHT, backgroundColor: colors.surfaceRaised },
  chart: { position: 'absolute', top: 0, left: 0 },
  legend: { position: 'absolute', top: spacing.lg, left: spacing.lg, gap: spacing.xs },
  legendRow: { flexDirection: 'row', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: radius.lg },
  overlay: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: withAlpha(colors.surfaceBright, 0.8),
  },
  divider: { width: 1, height: 32, backgroundColor: colors.outline },
});

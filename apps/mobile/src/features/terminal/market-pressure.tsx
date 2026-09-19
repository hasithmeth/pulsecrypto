import type { PairMeta } from '@pulsecrypto/contracts';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useBook } from '@/core/stream/market-store';
import { formatClock, formatDecimal, formatSpreadPercent } from '@/lib/format';
import { AppText } from '@/ui/app-text';
import { colors, radius, spacing, type ColorToken } from '@/ui/theme';

const BALANCED_BAND = 5;

function describePressure(buyPressure: number | undefined): { label: string; tone: ColorToken } {
  if (buyPressure === undefined) return { label: '--', tone: 'textMuted' };
  if (buyPressure > 50 + BALANCED_BAND) return { label: 'Buy Heavy', tone: 'positive' };
  if (buyPressure < 50 - BALANCED_BAND) return { label: 'Sell Heavy', tone: 'negative' };
  return { label: 'Balanced', tone: 'textPrimary' };
}

export function MarketPressure({ pair }: { pair: PairMeta }) {
  const book = useBook(pair.symbol);
  const buyShare = useSharedValue(0.5);
  const pressure = describePressure(book?.buyPressure);

  useEffect(() => {
    if (book) buyShare.set(withTiming(book.buyPressure / 100, { duration: 200 }));
  }, [book, buyShare]);

  const buyStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: buyShare.get() }] }));

  return (
    <View style={styles.section}>
      <View style={styles.stats}>
        <Stat
          label="SPREAD"
          value={
            book
              ? `${formatDecimal(book.spread, pair.priceDecimals)} (${formatSpreadPercent(book.spreadPct)})`
              : '--'
          }
        />
        <Stat label="PRESSURE" value={pressure.label} tone={pressure.tone} />
        <Stat label="UPDATED" value={book ? formatClock(book.ts, true) : '--'} align="flex-end" />
      </View>

      <View style={styles.legend}>
        <AppText variant="mono" color="positive">
          BUY {book ? `${book.buyPressure.toFixed(1)}%` : '--'}
        </AppText>
        <AppText variant="mono" color="negative">
          {book ? `${book.sellPressure.toFixed(1)}%` : '--'} SELL
        </AppText>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Buy pressure"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(book?.buyPressure ?? 50) }}
      >
        <Animated.View style={[styles.buy, buyStyle]} />
      </View>
    </View>
  );
}

interface StatProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: ColorToken;
  readonly align?: 'flex-start' | 'flex-end';
}

function Stat({ label, value, tone = 'textPrimary', align = 'flex-start' }: StatProps) {
  return (
    <View style={{ alignItems: align }}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="mono" color={tone} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outline,
  },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  track: {
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.negative,
    overflow: 'hidden',
  },
  buy: {
    position: 'absolute',
    inset: 0,
    backgroundColor: colors.positive,
    transformOrigin: 'left',
  },
});
